import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { createGatewayPlugin } from "@llmr/core/gateway/core-runtime/router-plugin.ts";

const body = { safeguards: { strict: true }, messages: [{ role: "user", content: "hi" }], tools: [
  { name: "t", defer_loading: true, input_schema: { type: "object", properties: { defer_loading: { type: "boolean" } } } },
  { type: "function", function: { name: "f", defer_loading: false, parameters: { type: "object" } } },
  { type: "namespace", name: "nested", tools: [{ name: "inner", defer_loading: true, input_schema: { type: "object" } }] },
  { type: "mcp_toolset", mcp_server_name: "db", default_config: { defer_loading: true, enabled: true }, configs: { query: { defer_loading: false }, list: { enabled: false } } }
] };

async function deferredToolHook() {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "old", name: "Old", type: "anthropic_messages", models: ["m"], supportsDeferredTools: false },
    { id: "new", name: "New", type: "anthropic_messages", models: ["m"] }];
  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  return plugin.providerHooks.find(hook => hook.key === "llmr-deferred-tool-compatibility");
}

test("#1912 deferred-tool compatibility edits only the selected attempt and preserves schemas", async () => {
  const hook = await deferredToolHook();
  const upstreamRequest = { method: "POST", url: "https://test.invalid/messages", body: structuredClone(body), bodyEncoding: "json" };
  const result = hook.transformRequest({ upstreamRequest, targetProviderConfig: { name: "old::anthropic_messages::cred:key" } });
  assert.equal(result.ok, true);
  const clean = result.value.body;
  assert.deepEqual(clean.tools, [
    { name: "t", input_schema: body.tools[0].input_schema },
    { type: "function", function: { name: "f", parameters: { type: "object" } } },
    { type: "namespace", name: "nested", tools: [{ name: "inner", input_schema: { type: "object" } }] },
    { type: "mcp_toolset", mcp_server_name: "db", default_config: { enabled: true }, configs: { query: {}, list: { enabled: false } } }
  ]);
  assert.deepEqual(clean.safeguards, body.safeguards);
  assert.deepEqual(upstreamRequest.body, body, "the attempt's input is not mutated");
  const next = hook.transformRequest({ upstreamRequest, targetProviderConfig: { name: "new" } });
  assert.equal(next.value, upstreamRequest, "a later compatible fallback provider receives the original flags");
});

test("#1912 deferred-tool compatibility leaves bodies it cannot or need not change untouched", async () => {
  const hook = await deferredToolHook();
  const unchanged = [
    { body: { messages: [] } },
    { body: { tools: [{ name: "t", input_schema: { type: "object" } }, { type: "namespace", tools: [{ name: "inner" }] },
      { type: "mcp_toolset", default_config: { enabled: true }, configs: { list: { enabled: false } } }] } },
    { body: JSON.stringify(body), bodyEncoding: "text" },
    { body: Buffer.from(JSON.stringify(body)), bodyEncoding: "bytes" },
    { bodyEncoding: "none" }
  ];
  for (const request of unchanged) {
    const upstreamRequest = { method: "POST", url: "https://test.invalid/messages", ...request };
    assert.equal(hook.transformRequest({ upstreamRequest, targetProviderConfig: { name: "old" } }).value, upstreamRequest, JSON.stringify(request));
  }
});

test("#1912 provider config keeps only a JSON false for deferred tool support and names a value it ignores", async t => {
  const { parseProvidersForTest } = await import("@llmr/core/config/config.ts");
  const warn = t.mock.method(console, "warn", () => {});
  const providers = parseProvidersForTest([
    { baseUrl: "https://a.example/v1", models: ["a"], name: "Camel", supportsDeferredTools: false },
    { baseUrl: "https://a.example/v1", models: ["a"], name: "Snake", supports_deferred_tools: false },
    { baseUrl: "https://a.example/v1", models: ["a"], name: "String", supportsDeferredTools: "false" },
    { baseUrl: "https://a.example/v1", models: ["a"], name: "Unset" }
  ]);
  assert.deepEqual(providers.map(provider => provider.supportsDeferredTools), [false, false, undefined, undefined]);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments[0]),
    ['[config] Provider String: supportsDeferredTools must be true or false; ignoring "false".']);
});
