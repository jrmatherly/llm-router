import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { kept, renameText, residue } from "../../scripts/llmr-rename.mjs";

test("each case form of ccr maps to the same case form of llmr", () => {
  assert.equal(renameText("ccrPlugin CcrApi CCR_HOME \"CCR app\"", ["rest"]), "llmrPlugin LlmrApi LLMR_HOME \"LLMR app\"");
});

test("a class renames only its own identifiers", () => {
  const source = "import { a } from \"@ccr/core/a\";\nheaders[\"x-ccr-route\"] = env.CCR_HOME;\nwindow.ccr.profiles; fetch(\"/api/ccr/rpc\");";
  assert.equal(renameText(source, ["alias"]), source.replace("@ccr/", "@llmr/"));
  assert.equal(renameText(source, ["env"]), source.replace("CCR_HOME", "LLMR_HOME"));
  assert.equal(
    renameText(source, ["wire"]),
    "import { a } from \"@ccr/core/a\";\nheaders[\"x-llmr-route\"] = env.CCR_HOME;\nwindow.llmr.profiles; fetch(\"/api/llmr/rpc\");"
  );
});

test("alias also covers the escaped form in resolver regexes", () => {
  assert.equal(renameText("build.onResolve({ filter: /^@ccr\\/core\\// })", ["alias"]), "build.onResolve({ filter: /^@llmr\\/core\\// })");
});

test("wire covers the gateway paths, the preload bridge and the IPC channel prefix", () => {
  const source = "\"/__ccr/runtime\"; contextBridge.exposeInMainWorld(\"ccr\", api); type A = Window[\"ccr\"]; const c = \"ccr:app:get-config\";";
  assert.equal(
    renameText(source, ["wire"]),
    "\"/__llmr/runtime\"; contextBridge.exposeInMainWorld(\"llmr\", api); type A = Window[\"llmr\"]; const c = \"llmr:app:get-config\";"
  );
});

test("wire also covers escaped regex forms, header case, unquoted bridge keys, and leaves the old scheme alone", () => {
  const source = "/\\/api\\/ccr\\/rpc/; /window\\.ccr/; \"X-CCR-Route\": 1; const w = { ccr: { a } }; \"ccr://provider\"";
  assert.equal(
    renameText(source, ["wire"]),
    "/\\/api\\/llmr\\/rpc/; /window\\.llmr/; \"X-LLMR-Route\": 1; const w = { llmr: { a } }; \"ccr://provider\""
  );
});

test("hosts we do not own and the pre-5.0 cleanup names survive", () => {
  assert.equal(renameText("\"https://claude-design.ccrdesk.top/design?aff=ccr\"", ["rest"]), "\"https://claude-design.ccrdesk.top/design?aff=ccr\"");
  const legacy = "[\"ccr\", \"ccr.cmd\", \"ccr-app\", \"ccr-app.cmd\", x]; source.includes(\"CCR_NODE_BIN\"); env.CCR_NODE_BIN";
  assert.equal(
    renameText(legacy, ["env", "rest"], "packages/core/src/profiles/launch-service.ts"),
    "[\"ccr\", \"ccr.cmd\", \"ccr-app\", \"ccr-app.cmd\", x]; source.includes(\"CCR_NODE_BIN\"); env.LLMR_NODE_BIN"
  );
  assert.equal(renameText(legacy, ["rest"], "packages/core/src/other.ts").includes("ccr"), false);
});

test("the indefinite article follows the new name", () => {
  assert.equal(renameText("\"a CCR gateway. A CCR window.\"", ["rest"]), "\"an LLMR gateway. An LLMR window.\"");
});

test("a second run changes nothing", () => {
  const once = renameText("x-ccr-a @ccr/b CCR_C window.ccr ccrD", ["alias", "wire", "env", "rest"]);
  assert.equal(renameText(once, ["alias", "wire", "env", "rest"]), once);
});

test("residue names each line a class still matches and skips kept text", () => {
  assert.deepEqual(residue("ok\nx-ccr-route\nccrdesk.top", ["rest"], "f.ts"), ["f.ts:2: x-ccr-route"]);
});

test("every kept entry still matches text in the repo, so a reformat cannot silently rename it", () => {
  for (const entry of kept) {
    const found = entry.path
      ? readFileSync(entry.path, "utf8").includes(entry.text)
      : spawnSync("git", ["grep", "-qF", entry.text]).status === 0;
    assert.ok(found, `kept text not found: ${entry.text}`);
  }
});
