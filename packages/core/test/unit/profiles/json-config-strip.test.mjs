import assert from "node:assert/strict";
import test from "node:test";
import { isEmptyPiModelsContent, isEmptyProviderJsonContent, stripManagedPiModelsContent, stripManagedProviderJsonContent as strip } from "@llmr/core/profiles/json-config-strip.ts";

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

test("nothing left means no provider", () => {
  assert.equal(isEmptyPiModelsContent("{}"), true);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ providers: {} })), true);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ providers: { a: {} } })), false);
  assert.equal(isEmptyPiModelsContent(JSON.stringify({ theme: "x" })), false);
});
