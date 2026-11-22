import assert from "node:assert/strict";
import test from "node:test";
import {
  decideCodexRootLines,
  isRootKeyInsideManagedBlock,
  managedProviderEnd,
  managedProviderStart,
  managedRootEnd,
  managedRootStart,
  readCodexDisplacedConfig,
  removeTablesOutsideValues,
  removeTomlTable,
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

const ours = "model = \"Provider/model\"";
const decide = (input) => decideCodexRootLines({ configuredModel: "Provider/model", showAllSessions: false, ...input });

test("the first apply to a file with no model line writes LLMR's and records it", () => {
  assert.deepEqual(decide({}), { modelLine: ours, written: { modelLine: ours } });
});

test("a re-apply with nothing changed keeps LLMR's model line as LLMR's", () => {
  const result = decide({ currentModelLine: ours, previous: { modelLine: ours }, previousConfiguredModel: "\"Provider/model\"" });
  assert.deepEqual(result, { modelLine: ours, written: { modelLine: ours } });
});

test("a changed profile model replaces the model line and records the new one", () => {
  const next = "model = \"Provider/other\"";
  const result = decide({ configuredModel: "Provider/other", currentModelLine: ours, previous: { modelLine: ours }, previousConfiguredModel: "\"Provider/model\"" });
  assert.deepEqual(result, { modelLine: next, written: { modelLine: next } });
});

test("a model line the user put in place of LLMR's stays theirs", () => {
  const mine = "model = \"my-own\"";
  const result = decide({ currentModelLine: mine, previous: { modelLine: ours }, previousConfiguredModel: "\"Provider/model\"" });
  assert.deepEqual(result, { modelLine: mine, written: {} });
});

test("a user's model line that equals LLMR's stays theirs when the record says so", () => {
  const result = decide({ currentModelLine: ours, previous: {}, previousConfiguredModel: "\"Provider/model\"" });
  assert.deepEqual(result, { modelLine: ours, written: {} });
});

test("after Codex dropped the configured-model comment the record still names LLMR's model line", () => {
  assert.deepEqual(decide({ currentModelLine: ours, previous: { modelLine: ours } }), { modelLine: ours, written: { modelLine: ours } });
  const next = "model = \"Provider/other\"";
  assert.deepEqual(
    decide({ configuredModel: "Provider/other", currentModelLine: ours, previous: { modelLine: ours } }),
    { modelLine: next, written: { modelLine: next } }
  );
});

test("the user's own model line is kept until the profile's model changes", () => {
  const mine = "model = \"X\"";
  assert.deepEqual(decide({ currentModelLine: mine }), { modelLine: mine, written: {} });
  const next = "model = \"Provider/other\"";
  assert.deepEqual(
    decide({ configuredModel: "Provider/other", currentModelLine: mine, previous: {}, previousConfiguredModel: "\"Provider/model\"" }),
    { modelLine: next, written: { modelLine: next } }
  );
});

test("with no record a model line that equals the configured-model comment is LLMR's", () => {
  assert.deepEqual(decide({ currentModelLine: ours, previousConfiguredModel: "\"Provider/model\"" }), { modelLine: ours, written: { modelLine: ours } });
  assert.deepEqual(decide({ currentModelLine: "model = \"X\"", previousConfiguredModel: "\"Provider/model\"" }), { modelLine: "model = \"X\"", written: {} });
});

test("show_all_sessions is LLMR's only while it is the line LLMR recorded", () => {
  const on = "show_all_sessions = true";
  assert.deepEqual(decide({ currentModelLine: ours, previous: { modelLine: ours }, showAllSessions: true }).written, { modelLine: ours, showAllSessionsLine: on });
  const switchedOff = decide({ currentModelLine: ours, currentShowAllSessionsLine: on, previous: { modelLine: ours, showAllSessionsLine: on } });
  assert.equal(switchedOff.showAllSessionsLine, undefined);
  assert.deepEqual(switchedOff.written, { modelLine: ours });
  const usersOwn = decide({ currentModelLine: ours, currentShowAllSessionsLine: "show_all_sessions = false", previous: { modelLine: ours }, showAllSessions: true });
  assert.equal(usersOwn.showAllSessionsLine, "show_all_sessions = false");
  assert.deepEqual(usersOwn.written, { modelLine: ours });
  const usersTrue = decide({ currentModelLine: ours, currentShowAllSessionsLine: on, previous: { modelLine: ours } });
  assert.equal(usersTrue.showAllSessionsLine, on);
  assert.deepEqual(usersTrue.written, { modelLine: ours });
});

// What codex-cli 0.171.0 leaves after `codex mcp add` on a re-applied file: the configured-model comment and the root END marker are gone.
const afterCodexMcpAdd = [
  managedRootStart,
  "model_provider = \"llm-router\"",
  ours,
  "model_catalog_json = \"/tmp/codex-home/llmr-model-catalog.json\"",
  "",
  "[mcp_servers.mine]",
  "command = \"my-server\"",
  "",
  "[mcp_servers.other]",
  "command = \"other-cmd\"",
  "",
  providerBlock
].join("\n");
const usersTables = "[mcp_servers.mine]\ncommand = \"my-server\"\n\n[mcp_servers.other]\ncommand = \"other-cmd\"\n";

test("with the record LLMR's model line goes even after Codex dropped the comment that named it", () => {
  assert.equal(stripManagedCodexConfigContent(afterCodexMcpAdd, ["llm-router"], { modelLine: ours }), usersTables);
  assert.equal(strip(afterCodexMcpAdd), `${ours}\n\n${usersTables}`);
});

test("with the record a model line the user changed or owns stays", () => {
  const changed = afterCodexMcpAdd.replace(ours, "model = \"my-own\"");
  assert.equal(stripManagedCodexConfigContent(changed, ["llm-router"], { modelLine: ours }), `model = "my-own"\n\n${usersTables}`);
  const withComment = managed("");
  assert.equal(stripManagedCodexConfigContent(withComment, ["llm-router"], {}), `${ours}\n`);
  assert.equal(strip(withComment), "");
});

test("with the record a show_all_sessions line inside LLMR's root block stays unless LLMR wrote it", () => {
  const withUsersLine = managed("").replace(managedRootEnd, `show_all_sessions = false\n${managedRootEnd}`);
  assert.equal(stripManagedCodexConfigContent(withUsersLine, ["llm-router"], { modelLine: ours }), "show_all_sessions = false\n");
  assert.equal(stripManagedCodexConfigContent(withUsersLine, ["llm-router"], { modelLine: ours, showAllSessionsLine: "show_all_sessions = true" }), "show_all_sessions = false\n");
  const withOurLine = managed("").replace(managedRootEnd, `show_all_sessions = true\n${managedRootEnd}`);
  assert.equal(stripManagedCodexConfigContent(withOurLine, ["llm-router"], { modelLine: ours, showAllSessionsLine: "show_all_sessions = true" }), "");
});

test("a file LLMR already had, with no record, has its model line claimed when it holds the configured model", () => {
  assert.deepEqual(decide({ currentModelLine: ours, managedWithoutRecord: true }), { modelLine: ours, written: { modelLine: ours } });
  assert.deepEqual(decide({ currentModelLine: "model = \"my-own\"", managedWithoutRecord: true }), { modelLine: "model = \"my-own\"", written: {} });
  assert.deepEqual(decide({ currentModelLine: ours }), { modelLine: ours, written: {} });
});

test("a recorded line is matched by its value, so realigning it or adding a comment does not make it the user's", () => {
  for (const reformatted of ["model  =  \"Provider/model\"", "model = \"Provider/model\"  # mine", "model=\"Provider/model\""]) {
    const content = afterCodexMcpAdd.replace(ours, reformatted);
    assert.equal(stripManagedCodexConfigContent(content, ["llm-router"], { modelLine: ours }), usersTables, reformatted);
    assert.deepEqual(decide({ currentModelLine: reformatted, previous: { modelLine: ours } }).written, { modelLine: ours }, reformatted);
  }
  const realignedShow = managed("").replace(managedRootEnd, `show_all_sessions  =  true\n${managedRootEnd}`);
  assert.equal(stripManagedCodexConfigContent(realignedShow, ["llm-router"], { modelLine: ours, showAllSessionsLine: "show_all_sessions = true" }), "");
});

test("a file LLMR already had, with no record, has a show_all_sessions line in LLMR's root block claimed", () => {
  const on = "show_all_sessions = true";
  const claimed = decide({ currentModelLine: ours, currentShowAllSessionsLine: on, managedWithoutRecord: true, showAllSessions: true, showAllSessionsInManagedBlock: true });
  assert.deepEqual(claimed.written, { modelLine: ours, showAllSessionsLine: on });
  const switchedOff = decide({ currentModelLine: ours, currentShowAllSessionsLine: on, managedWithoutRecord: true, showAllSessionsInManagedBlock: true });
  assert.equal(switchedOff.showAllSessionsLine, undefined);
  const below = decide({ currentModelLine: ours, currentShowAllSessionsLine: on, managedWithoutRecord: true, showAllSessions: true });
  assert.deepEqual(below.written, { modelLine: ours });
  const fresh = decide({ currentShowAllSessionsLine: on, showAllSessions: true, showAllSessionsInManagedBlock: true });
  assert.deepEqual(fresh.written, { modelLine: ours });
});

test("isRootKeyInsideManagedBlock finds a root key only between LLMR's root markers", () => {
  const inside = managed("").replace(managedRootEnd, `show_all_sessions = true\n${managedRootEnd}`);
  assert.equal(isRootKeyInsideManagedBlock(inside, "show_all_sessions"), true);
  assert.equal(isRootKeyInsideManagedBlock(managed("show_all_sessions = true\n"), "show_all_sessions"), false);
  assert.equal(isRootKeyInsideManagedBlock(afterCodexMcpAdd.replace(ours, `${ours}\nshow_all_sessions = true`), "show_all_sessions"), true);
  assert.equal(isRootKeyInsideManagedBlock(`${managedRootStart}\n[t]\nshow_all_sessions = true\n`, "show_all_sessions"), false);
  assert.equal(isRootKeyInsideManagedBlock(`${managedRootStart}\nnote = """\nshow_all_sessions = true\n"""\n`, "show_all_sessions"), false);
});

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

test("a strip with the record keeps every line of the user's and none of LLMR's, over 600 generated files", () => {
  const random = seededRandom(20261121);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const chance = (probability) => random() < probability;
  const rootKeys = ["approval_policy = \"on-request\"", "sandbox_mode = \"read-only\"", "model_reasoning_effort = \"high\"", "show_all_sessions = false", "file_opener = \"vscode\""];
  const multiLine = [`developer_instructions = """\n${llmrLikeLines}\n"""`, `notes = '''\n${llmrLikeLines}\n'''`, "extra_matrix = [\n  [\"a\", \"b\"],\n  [\"c\"],\n]"];
  const table = (index) => [
    ...(chance(0.3) ? [`# about table ${index}`] : []),
    `[${pick(["mcp_servers", "projects", "profiles"])}.user${index}]${chance(0.2) ? " # mine" : ""}`,
    `command = "cmd-${index}"`,
    ...(chance(0.3) ? ["args = [\"a\\\"b\", 'C:\\']"] : []),
    ...(chance(0.25) ? [`note = """\n${llmrLikeLines}\n"""`] : [])
  ].join("\n");

  for (let index = 0; index < 600; index += 1) {
    const usersModel = chance(0.3) ? pick([ours, "model = \"my-own\""]) : undefined;
    const ourShow = !usersModel && chance(0.2) ? "show_all_sessions = true" : undefined;
    const written = { ...(usersModel ? {} : { modelLine: ours }), ...(ourShow ? { showAllSessionsLine: ourShow } : {}) };
    const codexKeptTheComment = chance(0.5);
    const usable = (key) => !(ourShow && key.startsWith("show_all_sessions"));
    const insideRootBlock = rootKeys.filter((key) => usable(key) && chance(0.2));
    const belowRootBlock = [...rootKeys.filter((key) => usable(key) && !insideRootBlock.includes(key) && chance(0.2)), ...multiLine.filter(() => chance(0.2))];
    const tables = Array.from({ length: Math.floor(random() * 4) }, (_, tableIndex) => table(tableIndex));
    const insideProviderBlock = chance(0.3) ? [`[mcp_servers.added${index}]\ncommand = "added"`] : [];
    const user = [usersModel, ...insideRootBlock, ...belowRootBlock, ...tables, ...insideProviderBlock].filter((part) => part !== undefined);

    const content = [
      managedRootStart,
      "model_provider = \"llm-router\"",
      usersModel ?? ours,
      "model_catalog_json = \"/tmp/codex-home/llmr-model-catalog.json\"",
      ...(codexKeptTheComment ? ["# LLMR configured model = \"Provider/model\""] : []),
      ...(ourShow ? [ourShow] : []),
      ...insideRootBlock,
      ...(codexKeptTheComment ? [managedRootEnd] : []),
      ...belowRootBlock,
      "",
      ...tables.flatMap((part) => [part, ""]),
      managedProviderStart,
      "[model_providers.llm-router]",
      "name = \"LLM Router\"",
      "experimental_bearer_token = \"llmr-profile-TEST\"",
      ...insideProviderBlock.flatMap((part) => ["", part]),
      managedProviderEnd,
      ...(index % 3 === 0 ? ["", "# BEGIN LLMR managed ToolHub MCP", "[mcp_servers.llmr-toolhub]", "command = \"node\"", "", "[mcp_servers.llmr-toolhub.env]", "LLMR_TOKEN = \"llmr-profile-TEST\"", "# END LLMR managed ToolHub MCP"] : []),
      ""
    ].join("\n");

    const stripped = stripManagedCodexConfigContent(content, ["llm-router"], written) ?? content;
    const lines = (text) => text.split("\n").filter((line) => line.trim() !== "");
    assert.deepEqual(lines(stripped), lines(user.join("\n")), `case ${index}\n${content}`);
    assert.equal(stripManagedCodexConfigContent(stripped, ["llm-router"], written), undefined, `second strip, case ${index}`);
  }
});

const usersOriginal = [
  "# mine",
  "model = \"gpt-mine\"",
  "  model_provider = \"openai\" # default",
  "model_catalog_json = \"/tmp/mine.json\"",
  "show_all_sessions = false",
  "",
  "[profiles.other]",
  "model = \"x\"",
  "",
  "[profiles.llm-router]",
  "model = \"profile-model\"",
  "",
  "# about the next table",
  "[mcp_servers.mine]",
  "model_provider = \"not-a-root-key\"",
  ""
].join("\n");
const usersDisplaced = {
  model: "model = \"gpt-mine\"",
  modelCatalogJson: "model_catalog_json = \"/tmp/mine.json\"",
  modelProvider: "  model_provider = \"openai\" # default",
  profileTables: ["[profiles.llm-router]\nmodel = \"profile-model\"\n\n# about the next table\n"],
  showAllSessions: "show_all_sessions = false"
};

test("readCodexDisplacedConfig reads the root lines and the provider's profile table as the user wrote them", () => {
  assert.deepEqual(readCodexDisplacedConfig(usersOriginal, ["llm-router"]), usersDisplaced);
  assert.deepEqual(readCodexDisplacedConfig("[mcp_servers.mine]\nmodel = \"in a table\"\n", ["llm-router"]), {});
  assert.deepEqual(
    readCodexDisplacedConfig("[profiles.a]\nx = 1\n[profiles.\"b.c\"]\ny = 2\n", ["a", "b.c"]).profileTables,
    ["[profiles.a]\nx = 1\n", "[profiles.\"b.c\"]\ny = 2\n"]
  );
});

test("a strip puts each displaced root line back in place of the line of LLMR's that replaced it", () => {
  const written = { modelLine: "model = \"Provider/model\"" };
  const stripped = stripManagedCodexConfigContent(managed("[mcp_servers.mine]\ncommand = \"x\"\n\n"), ["llm-router"], written, usersDisplaced);
  assert.equal(stripped, [
    "  model_provider = \"openai\" # default",
    "model = \"gpt-mine\"",
    "model_catalog_json = \"/tmp/mine.json\"",
    "[mcp_servers.mine]",
    "command = \"x\"",
    "",
    "[profiles.llm-router]",
    "model = \"profile-model\"",
    "",
    "# about the next table",
    ""
  ].join("\n"));
});

test("readCodexDisplacedConfig ends the profile table at a child table and at an indented header", () => {
  const table = "[profiles.llm-router]\nmodel = \"p\"\n";
  for (const next of ["[profiles.llm-router.features]\nx = true\n", "  [projects.x]\ntrust_level = \"trusted\"\n"]) {
    assert.deepEqual(readCodexDisplacedConfig(`${table}${next}`, ["llm-router"]).profileTables, [table], next);
  }
});

test("a displaced profile table is appended to a file left with nothing else, with no blank lines above it", () => {
  const table = "[profiles.llm-router]\nmodel = \"p\"\n";
  assert.equal(stripManagedCodexConfigContent(managed(""), ["llm-router"], { modelLine: "model = \"Provider/model\"" }, { profileTables: [table] }), table);
});

test("a profile table header inside a multi-line string does not count as the table being there", () => {
  const table = "[profiles.llm-router]\nmodel = \"p\"\n";
  const notes = "notes = \"\"\"\n[profiles.llm-router]\n\"\"\"\n";
  const stripped = stripManagedCodexConfigContent(managed(notes), ["llm-router"], { modelLine: "model = \"Provider/model\"" }, { profileTables: [table] });
  assert.equal(stripped, `${notes}\n${table}`);
});

test("a displaced line stays out where the user wrote their own line of that key beside LLMR's", () => {
  const written = { modelLine: "model = \"Provider/model\"" };
  for (const before of [true, false]) {
    const own = "model_provider = \"azure\"\nmodel_catalog_json = \"/tmp/own.json\"\n";
    const edited = before ? `${own}${managed("")}` : managed("").replace("# END LLMR managed profile\n", `# END LLMR managed profile\n${own}`);
    assert.notEqual(edited, managed(""));
    const stripped = stripManagedCodexConfigContent(edited, ["llm-router"], written, usersDisplaced);
    const lines = stripped.slice(0, stripped.indexOf("[")).split("\n");
    assert.deepEqual(lines.filter((line) => /^\s*model_provider\s*=/.test(line)), ["model_provider = \"azure\""], `before: ${before}`);
    assert.deepEqual(lines.filter((line) => /^\s*model_catalog_json\s*=/.test(line)), ["model_catalog_json = \"/tmp/own.json\""], `before: ${before}`);
    assert.deepEqual(lines.filter((line) => /^\s*model\s*=/.test(line)), ["model = \"gpt-mine\""], `before: ${before}`);
  }
});

test("a displaced line stays out where the user removed or replaced LLMR's line, or already has the table", () => {
  const edited = managed("[profiles.llm-router]\nmodel = \"newer\"\n\n")
    .replace("model_provider = \"llm-router\"\n", "model_provider = \"azure\"\n")
    .replace("model = \"Provider/model\"\n", "model = \"my-new-model\"\n")
    .replace(/^model_catalog_json = .*\n/m, "");
  assert.equal(
    stripManagedCodexConfigContent(edited, ["llm-router"], { modelLine: "model = \"Provider/model\"" }, usersDisplaced),
    "model_provider = \"azure\"\nmodel = \"my-new-model\"\n[profiles.llm-router]\nmodel = \"newer\"\n"
  );
});

test("a displaced model line stays out while the model line in the file is the user's own", () => {
  const stripped = stripManagedCodexConfigContent(managed("").replace("model = \"Provider/model\"", "model = \"gpt-mine\""), ["llm-router"], {}, { model: "model = \"gpt-mine\"" });
  assert.equal(stripped, "model = \"gpt-mine\"\n");
});

test("a displaced line is put back once however many of LLMR's lines the file holds", () => {
  const doubled = managed("").replace("model_provider = \"llm-router\"\n", "model_provider = \"llm-router\"\nmodel_provider = 'llm-router'\n");
  assert.equal(
    stripManagedCodexConfigContent(doubled, ["llm-router"], { modelLine: "model = \"Provider/model\"" }, { modelProvider: "model_provider = \"openai\"" }),
    "model_provider = \"openai\"\n"
  );
});

test("a displaced profile table alone is no reason to rewrite a file with nothing of LLMR's in it", () => {
  assert.equal(stripManagedCodexConfigContent("[mcp_servers.mine]\ncommand = \"x\"\n", ["llm-router"], undefined, usersDisplaced), undefined);
});

test("removeTomlTable takes a table whole and leaves a header that is only text inside a value", () => {
  const quotes = "\"".repeat(3);
  const inString = `notes = ${quotes}\n[profiles.llm-router]\nkeep = 1\n${quotes}\nafter = 2\n`;
  assert.equal(removeTomlTable(inString, "profiles", "llm-router"), inString);
  const nested = `before = 1\n\n[profiles.llm-router]\nx = [\n  [1, 2],\n]\ny = 3\n\n[mcp_servers.after]\ncommand = "after"\n`;
  assert.equal(removeTomlTable(nested, "profiles", "llm-router"), "before = 1\n\n[mcp_servers.after]\ncommand = \"after\"\n");
});
