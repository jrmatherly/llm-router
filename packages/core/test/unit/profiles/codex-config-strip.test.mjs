import assert from "node:assert/strict";
import test from "node:test";
import {
  managedProviderEnd,
  managedProviderStart,
  managedRootEnd,
  managedRootStart,
  removeTablesOutsideValues,
  scanTomlLines,
  stripManagedCodexConfigContent
} from "@llmr/core/profiles/codex-config-strip.ts";

const rootBlock = [
  managedRootStart,
  "model_provider = \"llm-router\"",
  "model = \"Provider/model\"",
  "model_catalog_json = \"/tmp/codex-home/llmr-model-catalog.json\"",
  "# LLMR configured model = \"Provider/model\"",
  managedRootEnd,
  ""
].join("\n");

const providerBlock = [
  managedProviderStart,
  "[model_providers.llm-router]",
  "name = \"LLM Router\"",
  "base_url = \"http://127.0.0.1:3456/v1\"",
  "experimental_bearer_token = \"llmr-profile-TEST\"",
  "wire_api = \"responses\"",
  managedProviderEnd,
  ""
].join("\n");

const strip = (content) => stripManagedCodexConfigContent(content, ["llm-router"]);
const managed = (user) => `${rootBlock}${user}${providerBlock}`;

const llmrLikeLines = [
  "See [docs](https://example.com)",
  "[model_providers.llm-router]",
  "# END LLMR managed Codex provider",
  "model_provider = \"llm-router\""
].join("\n");

const userFiles = {
  "a basic multi-line string": `developer_instructions = """\n${llmrLikeLines}\n"""\n\n[mcp_servers.mine]\ncommand = "my-server"\n`,
  "a literal multi-line string": `developer_instructions = '''\n${llmrLikeLines}\n'''\n\n[mcp_servers.mine]\ncommand = "my-server"\n`,
  "a multi-line string that ends in five quotes": `developer_instructions = """\n${llmrLikeLines}\nshe said ""hi"""""\nsandbox_mode = "read-only"\n`,
  "a multi-line string in a table": `[mcp_servers.mine]\ncommand = "my-server"\nnote = """\n${llmrLikeLines}\n"""\nargs = ["x"]\n`,
  "a multi-line array whose lines start with a bracket": "notify = [\n  [\"a\", \"b\"],\n  [\"c\"],\n]\nsandbox_mode = \"read-only\"\n",
  "a one-line string that holds three quotes": "note = 'has \"\"\" inside'\nsandbox_mode = \"read-only\"\n",
  "a header that holds a bracket and a hash in a quoted key": "[projects.\"/tmp/a]#b\"] # mine\ntrust_level = \"trusted\"\n"
};

for (const [name, user] of Object.entries(userFiles)) {
  test(`stripping keeps ${name} byte for byte`, () => {
    assert.equal(strip(managed(user)), user);
    assert.equal(strip(user), undefined);
  });
}

test("a root key after a multi-line array is still LLMR's to remove", () => {
  const user = "notify = [\n  [\"a\", \"b\"],\n]\n";
  assert.equal(strip(`${user}model_provider = "llm-router"\n${providerBlock}`), user);
});

test("a root key after a one-line string that holds three quotes is still LLMR's to remove", () => {
  const user = "note = 'has \"\"\" inside'\n";
  assert.equal(strip(`${user}model_provider = "llm-router"\n${providerBlock}`), user);
});

test("LLMR's tables are removed however their header is written", () => {
  const user = "[mcp_servers.mine]\ncommand = \"my-server\"\n";
  for (const header of [
    "[model_providers.llm-router]",
    "[model_providers.\"llm-router\"]",
    "[model_providers.llm-router] # added by LLMR",
    "[mcp_servers.llmr-toolhub]",
    "[mcp_servers.llmr-toolhub.env]",
    "[mcp_servers.\"llmr-context-archive\".http_headers]"
  ]) {
    assert.equal(strip(`${user}\n${header}\nkey = "value"\n`), user, header);
  }
});

test("a removed table ends at an array-of-tables header and keeps the comment above it", () => {
  const rest = "# my fallbacks\n[[fallbacks]]\nname = \"one\"\n";
  assert.equal(strip(`[model_providers.llm-router]\nname = "LLM Router"\n\n${rest}`), rest);
});

test("scanTomlLines reports which lines start inside a value", () => {
  const content = "a = \"\"\"\nx\n\"\"\"\nb = [\n  1,\n]\n[t] # c\nd = '''\ny'''\ne = \"#\" # f\n";
  assert.deepEqual([...scanTomlLines(content)].map(({ inValue }) => inValue), [false, true, true, false, true, true, false, false, true, false]);
  assert.equal([...scanTomlLines(content)].map(({ line }) => line).join(""), content);
});

test("removeTablesOutsideValues hands the predicate the header without its comment", () => {
  const seen = [];
  removeTablesOutsideValues("[a.\"b]#\"] # c\nx = 1\n[[d]]\n", (header) => {
    seen.push(header);
    return false;
  });
  assert.deepEqual(seen, ["[a.\"b]#\"]", "[[d]]"]);
});

test("scanTomlLines ends a multi-line string at its closing run, not at an escaped quote or one quote early", () => {
  const inValue = (content) => [...scanTomlLines(content)].map((entry) => entry.inValue);
  assert.deepEqual(inValue("a = \"\"\"\nx \\\"\"\"\n[model_providers.llm-router]\n\"\"\"\nb = 1\n"), [false, true, true, true, false]);
  assert.deepEqual(inValue("a = [\"\"\"x\"\"\"\", \"y\"]\nb = 1\n"), [false, false]);
});
