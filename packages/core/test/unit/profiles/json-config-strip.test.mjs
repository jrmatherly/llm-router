import assert from "node:assert/strict";
import test from "node:test";
import {
  isEmptyPiModelsContent,
  isEmptyProviderJsonContent,
  isEmptyZcodeConfigContent,
  isEmptyZcodeModelCacheContent,
  stripManagedPiModelsContent,
  stripManagedProviderJsonContent as strip,
  stripManagedZcodeConfigContent,
  stripManagedZcodeModelCacheContent,
  zcodeManagedProviderIds
} from "@llmr/core/profiles/json-config-strip.ts";

const options = { client: "opencode", providerIds: ["llm-router"], schema: "https://opencode.ai/config.json" };
const llmrProvider = { models: {}, name: "LLM Router", npm: "@ai-sdk/openai-compatible", options: { apiKey: "llmr-profile-TEST", baseURL: "http://127.0.0.1:3456/v1", headers: { "x-llmr-client": "opencode", "x-llmr-profile": "p" } } };
const applied = { $schema: options.schema, mcp: { mine: { command: ["my-server"], type: "local" } }, model: "llm-router/m", provider: { "llm-router": llmrProvider, other: { name: "Other" } }, small_model: "llm-router/m" };
const stripped = { $schema: options.schema, mcp: applied.mcp, provider: { other: { name: "Other" } } };
const llmr = (headers) => ({ name: "LLM Router", options: { apiKey: "llmr-profile-TEST", headers } });

test("it removes LLM Router's provider and model refs and keeps the rest", () => {
  assert.deepEqual(JSON.parse(strip(JSON.stringify(applied), options)), stripped);
});

test("it puts back what the original held under the same keys", () => {
  const result = JSON.parse(strip(JSON.stringify(applied), options, JSON.stringify({ model: "other/x", small_model: "other/y" })));
  assert.equal(result.model, "other/x");
  assert.equal(result.small_model, "other/y");
});

test("a provider of the user's own under LLM Router's id survives a restore", () => {
  assert.equal(strip(JSON.stringify({ model: "llm-router/mine", provider: { "llm-router": { name: "Mine" } } }), options), undefined);
});

test("a model the user chose during the takeover stays", () => {
  assert.equal(JSON.parse(strip(JSON.stringify({ ...applied, model: "other/x" }), options)).model, "other/x");
});

test("it reads a file with comments and a trailing comma", () => {
  const content = `// mine\n${JSON.stringify(applied, null, 2).replace(/\n}$/, ",\n}")}`;
  assert.deepEqual(JSON.parse(strip(content, options)), stripped);
});

test("a second strip changes nothing", () => {
  assert.equal(strip(strip(JSON.stringify(applied), options), options), undefined);
});

test("content that does not parse is left alone", () => {
  assert.equal(strip("{ \"provider\": ", options), undefined);
});

test("nothing left means only LLM Router's schema and an empty provider map", () => {
  assert.equal(isEmptyProviderJsonContent("{}", options.schema), true);
  assert.equal(isEmptyProviderJsonContent(JSON.stringify({ $schema: options.schema, provider: {} }), options.schema), true);
  assert.equal(isEmptyProviderJsonContent(JSON.stringify({ $schema: "https://example.test/x.json" }), options.schema), false);
  assert.equal(isEmptyProviderJsonContent(JSON.stringify({ mcp: {} }), options.schema), false);
  assert.equal(isEmptyProviderJsonContent("{ \"mcp\": ", options.schema), false);
});

test("a strip that removes the last provider leaves no empty provider map behind", () => {
  assert.deepEqual(JSON.parse(strip(JSON.stringify({ mcp: {}, provider: { "llm-router": llmr({ "x-llmr-client": "opencode" }) } }), options)), { mcp: {} });
});

test("a strip recognises LLM Router's header in either spelling the apply's own check accepts", () => {
  assert.deepEqual(JSON.parse(strip(JSON.stringify({ provider: { "llm-router": llmr({ "X-LLMR-Client": "opencode" }) } }), options)), {});
});

test("a strip leaves a provider whose header names the other client", () => {
  assert.equal(strip(JSON.stringify({ provider: { "llm-router": llmr({ "x-llmr-client": "kilo" }) } }), options), undefined);
});

const llmrPiProvider = { apiKey: "llmr-profile-TEST", headers: { "x-llmr-client": "pi" } };
const userPiProvider = { baseUrl: "http://localhost:11434" };

test("it removes LLM Router's Pi provider and keeps the others", () => {
  const content = JSON.stringify({ providers: { "llm-router": llmrPiProvider, "my-ollama": userPiProvider } });
  assert.deepEqual(JSON.parse(stripManagedPiModelsContent(content, ["llm-router"])), { providers: { "my-ollama": userPiProvider } });
});

test("a Pi provider of the user's own under LLM Router's id stays", () => {
  assert.equal(stripManagedPiModelsContent(JSON.stringify({ providers: { "llm-router": userPiProvider } }), ["llm-router"]), undefined);
});

test("it puts the user's own provider back under the same id", () => {
  const content = JSON.stringify({ providers: { "llm-router": llmrPiProvider, "my-ollama": userPiProvider } });
  const snapshot = JSON.stringify({ providers: { "llm-router": { baseUrl: "http://localhost:9999" } } });
  assert.deepEqual(JSON.parse(stripManagedPiModelsContent(content, ["llm-router"], snapshot)).providers, {
    "llm-router": { baseUrl: "http://localhost:9999" },
    "my-ollama": userPiProvider
  });
});

const zcodeSchema = "https://opencode.ai/config.json";
const zcodeLlmrProvider = { kind: "anthropic", name: "LLM Router", options: { apiKey: "llmr-profile-TEST", apiKeyRequired: true, baseURL: "http://127.0.0.1:3456" } };
const zcodeApplied = { $schema: zcodeSchema, model: { fast: "other/f", main: "llm-router/m" }, provider: { "llm-router": zcodeLlmrProvider, other: { name: "Other" } }, theme: "dark" };
const zcodeRef = (providerId) => ({ modelId: "m", providerId });
const zcodeCache = {
  defaultModel: zcodeRef("llm-router"),
  lastUsed: zcodeRef("llm-router"),
  lastUsedModel: zcodeRef("llm-router"),
  providers: [{ apiKey: "__zcode_cached_api_key_present__", id: "llm-router" }, { id: "other" }],
  revision: 3,
  updatedAt: 1,
  version: 2
};

test("it finds the ZCode providers that carry LLM Router's key", () => {
  assert.deepEqual(zcodeManagedProviderIds(JSON.stringify(zcodeApplied), ["llm-router", "other"]), ["llm-router"]);
  const local = { provider: { "llm-router": { options: { apiKey: "llmr-local" } } } };
  assert.deepEqual(zcodeManagedProviderIds(JSON.stringify(local), ["llm-router"]), ["llm-router"]);
});

test("it removes LLM Router's ZCode provider and main model and keeps the rest", () => {
  assert.deepEqual(JSON.parse(stripManagedZcodeConfigContent(JSON.stringify(zcodeApplied), ["llm-router"])), {
    $schema: zcodeSchema,
    model: { fast: "other/f" },
    provider: { other: { name: "Other" } },
    theme: "dark"
  });
});

test("it puts the ZCode provider and main model of the original back", () => {
  const snapshot = JSON.stringify({ model: { main: "builtin:zai/glm-5" }, provider: { "llm-router": { name: "Mine" } } });
  const result = JSON.parse(stripManagedZcodeConfigContent(JSON.stringify(zcodeApplied), ["llm-router"], snapshot));
  assert.deepEqual(result.model, { fast: "other/f", main: "builtin:zai/glm-5" });
  assert.deepEqual(result.provider["llm-router"], { name: "Mine" });
});

test("a ZCode provider under LLM Router's id with the user's own key stays", () => {
  const content = JSON.stringify({ ...zcodeApplied, provider: { "llm-router": { options: { apiKey: "sk-user" } } } });
  assert.equal(stripManagedZcodeConfigContent(content, ["llm-router"]), undefined);
});

test("it removes LLM Router's entry and model refs from the ZCode model cache", () => {
  assert.deepEqual(JSON.parse(stripManagedZcodeModelCacheContent(JSON.stringify(zcodeCache), ["llm-router"])), {
    providers: [{ id: "other" }],
    revision: 3,
    updatedAt: 1,
    version: 2
  });
  assert.equal(stripManagedZcodeModelCacheContent(JSON.stringify(zcodeCache), []), undefined);
});

test("it puts the model cache's refs of the original back", () => {
  const snapshot = JSON.stringify({ defaultModel: zcodeRef("other"), providers: [{ id: "other" }] });
  const result = JSON.parse(stripManagedZcodeModelCacheContent(JSON.stringify(zcodeCache), ["llm-router"], snapshot));
  assert.deepEqual(result.defaultModel, zcodeRef("other"));
  assert.equal(Object.hasOwn(result, "lastUsed"), false);
});

test("nothing left in a ZCode config means only its schema and empty maps", () => {
  assert.equal(isEmptyZcodeConfigContent("{}"), true);
  assert.equal(isEmptyZcodeConfigContent(JSON.stringify({ $schema: zcodeSchema, model: {}, provider: {} })), true);
  assert.equal(isEmptyZcodeConfigContent(JSON.stringify({ $schema: zcodeSchema, theme: "dark" })), false);
  assert.equal(isEmptyZcodeConfigContent(JSON.stringify({ model: { fast: "other/f" } })), false);
});

test("nothing left in a ZCode model cache means no provider entry", () => {
  assert.equal(isEmptyZcodeModelCacheContent(JSON.stringify({ providers: [], revision: 2, updatedAt: 1, version: 2 })), true);
  assert.equal(isEmptyZcodeModelCacheContent(JSON.stringify({ providers: [{ id: "other" }], revision: 2 })), false);
  assert.equal(isEmptyZcodeModelCacheContent(JSON.stringify({ providers: [], theme: "dark" })), false);
});

test("nothing left means no provider", () => {
  assert.equal(isEmptyPiModelsContent("{}"), true);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ providers: {} })), true);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ providers: { a: {} } })), false);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ theme: "x" })), false);
});
