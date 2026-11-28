import assert from "node:assert/strict";
import { createServer } from "node:http";
import http2 from "node:http2";
import net from "node:net";
import test from "node:test";
import tls from "node:tls";
import forge from "node-forge";
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

test("an https request to an outside host tunnels through the proxy and stays on HTTP/1.1", async (t) => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 3_600_000);
  cert.setSubject([{ name: "commonName", value: "192.0.2.1" }]);
  cert.setIssuer([{ name: "commonName", value: "192.0.2.1" }]);
  cert.setExtensions([{ altNames: [{ ip: "192.0.2.1", type: 7 }], name: "subjectAltName" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  // Trust the self-signed certificate for this test only, with verification still on.
  const defaultCas = tls.getCACertificates("default");
  tls.setDefaultCACertificates([...defaultCas, certPem]);
  t.after(() => tls.setDefaultCACertificates(defaultCas));

  const httpVersions = [];
  const target = http2.createSecureServer({ allowHTTP1: true, cert: certPem, key: forge.pki.privateKeyToPem(keys.privateKey) }, (req, res) => {
    httpVersions.push(req.httpVersion);
    res.end(`tls ${req.headers.host ?? req.headers[":authority"]} ${req.url}`);
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => target.close(resolve)));
  target.unref();

  const seen = [];
  const proxy = createServer();
  proxy.on("connect", (req, client, head) => {
    seen.push(`CONNECT ${req.url}`);
    const tunnel = net.connect(target.address().port, "127.0.0.1", () => {
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

  const response = await fetchWithSystemProxy("https://192.0.2.1/models");

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "tls 192.0.2.1 /models");
  assert.deepEqual(seen, ["CONNECT 192.0.2.1:443"]);
  assert.deepEqual(httpVersions, ["1.1"]);
});
