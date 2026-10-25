import assert from "node:assert/strict";
import test from "node:test";
import { rebrandText } from "../../scripts/rebrand-ccr.mjs";

test("whole-word CCR becomes LLMR inside string literals", () => {
  assert.equal(rebrandText("\"Open CCR Desktop or the CCR app via CCR.\"", "ts"), "\"Open LLMR Desktop or the LLMR app via LLMR.\"");
});

test("protocol identifiers, env names, commands and code identifiers survive", () => {
  const source = [
    "const CCR_HOME = env.CCR_INTERNAL_HOME_DIR;",
    "headers[\"x-ccr-route\"] = ccrRouterHttpRouteKey;",
    "const url = \"ccr://open?app=1\" + \"/__ccr/runtime\";",
    "const msg = \"Make sure the CCR app or ccr ui command is running.\";",
    "const dir = \"~/.claude-code-router\";"
  ].join("\n");
  const out = rebrandText(source, "ts");
  assert.match(out, /CCR_HOME = env\.CCR_INTERNAL_HOME_DIR/);
  assert.match(out, /x-ccr-route/);
  assert.match(out, /ccr:\/\/open/);
  assert.match(out, /\/__ccr\/runtime/);
  assert.match(out, /the LLMR app or ccr ui command/);
  assert.match(out, /\.claude-code-router/);
});

test("identifiers outside strings are untouched even when they spell CCR", () => {
  assert.equal(rebrandText("type CCR = string; const x: CCR = \"CCR app\";", "ts"), "type CCR = string; const x: CCR = \"LLMR app\";");
});

test("a literal that is exactly CCR is an identifier, not copy, and stays", () => {
  assert.equal(rebrandText("const client = { name: \"CCR\" };\nreturn \"CCR\";", "ts"), "const client = { name: \"CCR\" };\nreturn \"CCR\";");
});

test("comments with apostrophes, regex literals and template substitutions do not derail the rewrite", () => {
  const source = "// don't\nconst re = /CCR/;\nconst s = `CCR ${name} runs CCR`;\nconst t = \"CCR ui\";";
  assert.equal(rebrandText(source, "ts"), "// don't\nconst re = /CCR/;\nconst s = `LLMR ${name} runs LLMR`;\nconst t = \"LLMR ui\";");
});

test("json mode rewrites string values and keeps formatting", () => {
  const json = "{\n  \"id\": \"claude-design\",\n  \"description\": \"Open it in a dedicated CCR Electron window.\"\n}\n";
  assert.equal(rebrandText(json, "json"), "{\n  \"id\": \"claude-design\",\n  \"description\": \"Open it in a dedicated LLMR Electron window.\"\n}\n");
});

test("js mode handles a CommonJS bundle", () => {
  assert.equal(rebrandText("module.exports = { appDescription: 'Open in a CCR window.' };", "js"), "module.exports = { appDescription: 'Open in a LLMR window.' };");
});

test("markdown leaves code fences and inline code alone", () => {
  const md = "CCR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting CCR.";
  assert.equal(rebrandText(md, "md"), "LLMR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting LLMR.");
});

test("chinese copy is rewritten", () => {
  assert.equal(rebrandText("\"再启动 CCR 网关或通过 CCR 打开 Agent。\"", "ts"), "\"再启动 LLMR 网关或通过 LLMR 打开 Agent。\"");
});
