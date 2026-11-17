import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { isLoopbackAddress } from "@llmr/core/net/loopback.ts";
import { pluginService } from "@llmr/core/plugins/service.ts";
import { proxyService } from "@llmr/core/proxy/service.ts";
import { systemProxyManager } from "@llmr/core/proxy/system-proxy.ts";

test("isLoopbackAddress accepts only loopback peers", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopbackAddress(address), true, address);
  for (const address of ["192.168.1.20", "::ffff:10.0.0.5", "", undefined]) assert.equal(isLoopbackAddress(address), false, String(address));
});

function spoofPeer(socket, address) {
  if (address) {
    Object.defineProperty(socket, "remoteAddress", { configurable: true, value: address });
  }
}

async function listenLocal(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function withProxy(peerAddress, run) {
  const upstreamRequests = [];
  const upstream = http.createServer((request, response) => {
    upstreamRequests.push(request.headers);
    response.end("ok");
  });
  const upstreamPort = await listenLocal(upstream);

  const config = createDefaultAppConfig();
  config.APIKEY = "sk-test-proxy-peer";
  config.gateway.host = "0.0.0.0";
  config.gateway.port = upstreamPort;
  config.proxy.enabled = true;
  config.proxy.mode = "gateway";
  config.proxy.targets = [{ host: "api.example.test" }];
  proxyService.updateConfig(config);

  const front = http.createServer((request, response) => {
    spoofPeer(request.socket, peerAddress);
    void proxyService.handleHttpRequest(request, response);
  });
  front.on("connect", (request, socket, head) => {
    spoofPeer(socket, peerAddress);
    void proxyService.handleConnect(request, socket, head).catch(() => socket.destroy());
  });
  const frontPort = await listenLocal(front);

  try {
    await run({ frontPort, upstreamRequests });
  } finally {
    front.closeAllConnections();
    upstream.closeAllConnections();
    front.close();
    upstream.close();
  }
}

function proxyGet(frontPort, url = "http://api.example.test/v1/messages") {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", path: url, port: frontPort });
    request.once("error", reject);
    request.once("response", (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.end();
  });
}

test("a loopback absolute-URL request reaches the gateway with the API key", async () => {
  await withProxy(undefined, async ({ frontPort, upstreamRequests }) => {
    assert.equal(await proxyGet(frontPort), 200);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].authorization, "Bearer sk-test-proxy-peer");
  });
});

test("a non-loopback absolute-URL request gets 403 and no forwarded API key", async () => {
  await withProxy("192.168.1.20", async ({ frontPort, upstreamRequests }) => {
    assert.equal(await proxyGet(frontPort), 403);
    assert.equal(upstreamRequests.length, 0);
  });
});

test("a non-loopback CONNECT gets 403 and the socket is closed", async (t) => {
  let mitmCalls = 0;
  t.mock.method(proxyService, "getMitmServer", async () => {
    mitmCalls += 1;
    throw new Error("getMitmServer must not run for a non-loopback peer");
  });
  await withProxy("192.168.1.20", async ({ frontPort }) => {
    const socket = net.connect(frontPort, "127.0.0.1");
    socket.setEncoding("utf8");
    let received = "";
    socket.on("data", (chunk) => {
      received += chunk;
    });
    socket.write("CONNECT api.example.test:443 HTTP/1.1\r\nHost: api.example.test:443\r\n\r\n");
    await once(socket, "close");
    assert.equal(received, "HTTP/1.1 403 Forbidden\r\n\r\n");
    assert.equal(mitmCalls, 0);
  });
});

test("network capture stores query-string credentials redacted", async () => {
  await withProxy(undefined, async ({ frontPort }) => {
    proxyService.setNetworkCaptureEnabled(true);
    try {
      assert.equal(await proxyGet(frontPort, "http://api.example.test/v1/messages?key=sk-secret&x=1"), 200);
      const item = proxyService.getNetworkCaptures().items[0];
      assert.equal(item.url, "http://api.example.test/v1/messages?key=%5Bredacted%5D&x=1");
      assert.equal(item.path, "/v1/messages?key=%5Bredacted%5D&x=1");
      assert.doesNotMatch(JSON.stringify(item), /sk-secret/);

      await proxyGet(frontPort, `http://127.0.0.1:${proxyService.config.gateway.port}//bad%20host/x?key=sk-secret`);
      const slashes = proxyService.getNetworkCaptures().items[0];
      assert.equal(slashes.path, "//bad%20host/x?key=%5Bredacted%5D");
      assert.doesNotMatch(JSON.stringify(slashes), /sk-secret/);
    } finally {
      proxyService.setNetworkCaptureEnabled(false);
      proxyService.clearNetworkCaptures();
    }
  });
});

function connectThrough(frontPort, authority) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(frontPort, "127.0.0.1");
    let received = Buffer.alloc(0);
    const onData = (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.indexOf("\r\n\r\n") === -1) {
        return;
      }
      socket.off("data", onData);
      resolve({ socket, statusLine: received.subarray(0, received.indexOf("\r\n")).toString() });
    };
    socket.on("data", onData);
    socket.once("error", reject);
    socket.once("connect", () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
  });
}

async function echoServer(t, host = "127.0.0.1") {
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.pipe(socket);
  });
  server.listen(0, host);
  await Promise.race([once(server, "listening"), once(server, "error").then(([error]) => Promise.reject(error))]);
  t.after(() => server.close());
  return server.address().port;
}

async function mockMitm(t) {
  const sinkPort = await echoServer(t);
  const calls = [];
  t.mock.method(proxyService, "getMitmServer", async (host) => {
    calls.push(host);
    return { host, port: sinkPort };
  });
  return calls;
}

async function fakeUpstreamProxy(t, reply) {
  const seen = [];
  const server = http.createServer();
  server.on("connect", (request, socket) => {
    seen.push({ authorization: request.headers["proxy-authorization"], url: request.url });
    socket.on("error", () => {});
    socket.write(reply);
    socket.pipe(socket);
  });
  const port = await listenLocal(server);
  proxyService.upstreamProxy = { https: { host: "127.0.0.1", password: "p", port, protocol: "http", username: "u" } };
  t.after(() => {
    proxyService.upstreamProxy = undefined;
    server.closeAllConnections();
    server.close();
  });
  return seen;
}

async function assertEchoes(socket) {
  socket.write("ping");
  assert.equal(String((await once(socket, "data"))[0]), "ping");
}

test("CONNECT to a host that matches no target is tunnelled without MITM", async (t) => {
  const mitmCalls = await mockMitm(t);
  const echoPort = await echoServer(t);
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket, statusLine } = await connectThrough(frontPort, `127.0.0.1:${echoPort}`);
    try {
      assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
      await assertEchoes(socket);
      assert.equal(mitmCalls.length, 0);
    } finally {
      socket.destroy();
    }
  });
});

test("CONNECT to a proxy target host is intercepted", async (t) => {
  const mitmCalls = await mockMitm(t);
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket, statusLine } = await connectThrough(frontPort, "api.example.test:443");
    socket.destroy();
    assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
    assert.deepEqual(mitmCalls, ["api.example.test"]);
  });
});

test("CONNECT to a plugin proxy route host is intercepted", async (t) => {
  const mitmCalls = await mockMitm(t);
  t.mock.method(pluginService, "getProxyRouteHosts", () => ["plugin.example.test"]);
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket } = await connectThrough(frontPort, "plugin.example.test:443");
    socket.destroy();
    assert.deepEqual(mitmCalls, ["plugin.example.test"]);
  });
});

test("with capture on, CONNECT to any host is intercepted", async (t) => {
  const mitmCalls = await mockMitm(t);
  const echoPort = await echoServer(t);
  await withProxy(undefined, async ({ frontPort }) => {
    proxyService.setNetworkCaptureEnabled(true);
    try {
      const { socket } = await connectThrough(frontPort, `127.0.0.1:${echoPort}`);
      socket.destroy();
      assert.deepEqual(mitmCalls, ["127.0.0.1"]);
    } finally {
      proxyService.setNetworkCaptureEnabled(false);
    }
  });
});

test("a tunnelled CONNECT goes through the upstream proxy", async (t) => {
  const mitmCalls = await mockMitm(t);
  const seen = await fakeUpstreamProxy(t, "HTTP/1.1 200 OK\r\n\r\n");
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket, statusLine } = await connectThrough(frontPort, "tunnel.example.test:443");
    try {
      assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
      assert.deepEqual(seen, [{ authorization: `Basic ${Buffer.from("u:p").toString("base64")}`, url: "tunnel.example.test:443" }]);
      await assertEchoes(socket);
      assert.equal(mitmCalls.length, 0);
    } finally {
      socket.destroy();
    }
  });
});

test("an upstream proxy that refuses the CONNECT yields 502", async (t) => {
  await mockMitm(t);
  const seen = await fakeUpstreamProxy(t, "HTTP/1.1 403 Forbidden\r\n\r\n");
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket, statusLine } = await connectThrough(frontPort, "tunnel.example.test:443");
    socket.destroy();
    assert.equal(statusLine, "HTTP/1.1 502 Bad Gateway");
    assert.equal(seen.length, 1);
  });
});

test("CONNECT to an IPv6 literal is tunnelled directly, past a configured upstream proxy", async (t) => {
  const mitmCalls = await mockMitm(t);
  let echoPort;
  try {
    echoPort = await echoServer(t, "::1");
  } catch {
    t.skip("IPv6 loopback is unavailable");
    return;
  }
  const seen = await fakeUpstreamProxy(t, "HTTP/1.1 200 OK\r\n\r\n");
  await withProxy(undefined, async ({ frontPort }) => {
    const { socket, statusLine } = await connectThrough(frontPort, `[::1]:${echoPort}`);
    try {
      assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
      await assertEchoes(socket);
      assert.equal(mitmCalls.length, 0);
      assert.equal(seen.length, 0);
    } finally {
      socket.destroy();
    }
  });
});

test("the MITM cache evicts the least recently used server past its cap", async (t) => {
  const closed = [];
  const closedAll = [];
  let created = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  t.mock.method(systemProxyManager, "restore", async () => ({ state: "inactive" }));
  t.mock.method(proxyService, "createMitmServer", async (hostname) => {
    created += 1;
    return {
      host: hostname,
      port: 0,
      server: { close: () => closed.push(hostname), closeAllConnections: () => closedAll.push(hostname), closeIdleConnections: () => {} }
    };
  });
  t.after(() => proxyService.secureServers.clear());

  for (let i = 0; i < 128; i++) await proxyService.getMitmServer(`h${i}.test`);
  await proxyService.getMitmServer("h0.test");
  await proxyService.getMitmServer("h128.test");
  await settle();
  t.mock.timers.tick(60_000);
  assert.deepEqual(closed, ["h1.test"]);
  assert.deepEqual(closedAll, []);
  assert.equal(created, 129);

  let stopped = false;
  const stopping = proxyService.stop().then(() => {
    stopped = true;
  });
  while (!stopped) {
    await settle();
    t.mock.timers.tick(1_000);
  }
  await stopping;
  assert.equal(closedAll.includes("h1.test"), true);
});
