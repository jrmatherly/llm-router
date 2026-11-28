import assert from "node:assert/strict";
import { createServer } from "node:http";
import net from "node:net";
import test from "node:test";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { fetchWithSystemProxy } from "@llmr/core/proxy/system-proxy-fetch.ts";

test("a request to an outside host goes through the configured upstream proxy", async (t) => {
  const seen = [];
  // One loopback server is both the proxy and, through a CONNECT tunnel back to itself, the outside host.
  const proxy = createServer((req, res) => {
    seen.push(`${req.method} ${req.headers.host} ${req.url}`);
    res.end(`via proxy ${req.headers.host}`);
  });
  proxy.on("connect", (req, client, head) => {
    seen.push(`CONNECT ${req.url}`);
    const tunnel = net.connect(proxy.address().port, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      tunnel.write(head);
      tunnel.pipe(client);
      client.pipe(tunnel);
    });
    tunnel.on("error", () => client.destroy());
    client.on("error", () => tunnel.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => proxy.close(resolve)));
  proxy.unref();

  const config = await loadAppConfig();
  await replacePersistedAppConfig({
    ...config,
    proxy: { ...config.proxy, upstream: { custom: { password: "", port: proxy.address().port, server: "127.0.0.1", username: "" }, mode: "custom" } }
  });

  // A documentation address (RFC 5737). undici 8 names a hostname target in net.connect, and the test network guard refuses it.
  const response = await fetchWithSystemProxy("http://192.0.2.1/models");

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "via proxy 192.0.2.1");
  assert.ok(seen.some((line) => line.includes("192.0.2.1")), seen.join("\n"));
});
