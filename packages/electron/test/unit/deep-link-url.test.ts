import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "@llmr/core/contracts/app";
import { parsePluginDeepLinkRequest, resolveGatewayPluginAppUrl } from "@llmr/electron/main/deep-link-url.ts";

const gateway = (host: string) => ({ gateway: { host, port: 3456 } }) as AppConfig;

test("parsePluginDeepLinkRequest parses host and path forms", () => {
  assert.deepEqual(parsePluginDeepLinkRequest("llmr://plugin/foo/open"), { pluginId: "foo", rawUrl: "llmr://plugin/foo/open" });
  assert.deepEqual(parsePluginDeepLinkRequest("llmr:///plugin/foo?app=bar"), { appId: "bar", pluginId: "foo", rawUrl: "llmr:///plugin/foo?app=bar" });
});

test("parsePluginDeepLinkRequest rejects bad actions and ids", () => {
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin/foo/delete"), /Unsupported plugin link action: delete/);
  assert.throws(() => parsePluginDeepLinkRequest(`llmr://plugin/${"a".repeat(121)}/open`), /Invalid plugin id/);
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin/..%2F/open"), /Invalid plugin id/);
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin"), /Plugin id is required/);
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin/foo?app=..%2Fx"), /Invalid plugin id/);
});

test("parsePluginDeepLinkRequest ignores links that are not plugin links", () => {
  assert.equal(parsePluginDeepLinkRequest("llmr://provider?name=x"), undefined);
  assert.equal(parsePluginDeepLinkRequest("https://plugin/foo/open"), undefined);
});

test("resolveGatewayPluginAppUrl resolves gateway paths and rejects other schemes", () => {
  assert.equal(resolveGatewayPluginAppUrl(gateway("0.0.0.0"), "/apps/x"), "http://127.0.0.1:3456/apps/x");
  assert.equal(resolveGatewayPluginAppUrl(gateway("::1"), "apps/x"), "http://[::1]:3456/apps/x");
  assert.equal(resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "https://example.com/a"), "https://example.com/a");
  assert.throws(() => resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "//evil.com"), /protocol-relative/);
  assert.throws(() => resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "javascript:alert(1)"), /http\(s\) URL or an LLMR gateway path/);
});
