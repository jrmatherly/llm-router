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
  "a five-quote closing run inside an array, before a multi-line string": `a = ["""x""""", "y"]\nnote = """\n${llmrLikeLines}\n"""\n`,
  "an escaped quote in a one-line string, before a multi-line string": `args = ["a\\"b"]\nnote = """\n${llmrLikeLines}\n"""\n`,
  "a literal string that ends in a backslash, before a multi-line string": `roots = ['C:\\']\nnote = """\n${llmrLikeLines}\n"""\n`,
  "a multi-line string in a table": `[mcp_servers.mine]\ncommand = "my-server"\nnote = """\n${llmrLikeLines}\n"""\nargs = ["x"]\n`,
  "a multi-line array whose lines start with a bracket": "extra_matrix = [\n  [\"a\", \"b\"],\n  [\"c\"],\n]\nsandbox_mode = \"read-only\"\n",
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
  const user = "extra_matrix = [\n  [\"a\", \"b\"],\n]\n";
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

test("a value left open by a typo does not hide LLMR's lines from the strip", () => {
  const table = "[mcp_servers.mine]\ncommand = \"x\"\n";
  for (const broken of ["description = \"\"\"oops\n", "description = '''oops\n", "args = [\"a\",\n", "env = { A = \"1\"\n"]) {
    const stripped = strip(managed(`${table}${broken}`));
    assert.equal(stripped, `${table}${broken}`, broken);
  }
});

test("a value left open inside LLMR's table does not take the user's tables with it", () => {
  const user = "[mcp_servers.mine]\ncommand = \"me\"\n";
  assert.equal(strip(`[model_providers.llm-router]\nexperimental_bearer_token = "llmr-profile-TEST"\nextra = [\n\n${user}`), user);
});

test("a comment at the end of LLMR's table goes with the table", () => {
  const user = "[mcp_servers.mine]\ncommand = \"me\"\n";
  assert.equal(strip(`[model_providers.llm-router]\nname = "LLM Router"\n# experimental_bearer_token = "llmr-profile-TEST"\n${user}`), user);
  assert.equal(strip(`[model_providers.llm-router]\nname = "LLM Router"\n\n# mine\n\n${user}`), `# mine\n\n${user}`);
});

test("a root key after an array that holds an inline table is still LLMR's to remove", () => {
  const user = "x = [{ a = 1 },\n  [\"b\"],\n]\n";
  assert.equal(strip(`${user}model_provider = "llm-router"\n${providerBlock}`), user);
});

test("removing LLMR's tables from between the user's keeps their spacing and their comments", () => {
  const content = [
    "[a]", "k = 1", "",
    "[model_providers.llm-router]", "# llmr", "x = 1", "", "# mine", "",
    "[b]", "k = 2", "",
    "[mcp_servers.llmr-toolhub]", "y = 1", "", "# end", ""
  ].join("\n");
  assert.equal(strip(content), "[a]\nk = 1\n\n# mine\n\n[b]\nk = 2\n\n# end\n");
});
