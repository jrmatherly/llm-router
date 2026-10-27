import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { isLoopbackAddress } from "@ccr/core/net/loopback.ts";
import { proxyService } from "@ccr/core/proxy/service.ts";

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

function proxyGet(frontPort) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", path: "http://api.example.test/v1/messages", port: frontPort });
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
