import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("a quoted CCR literal nested in an embedded script template stays while the copy around it changes", () => {
  const source = "const script = `const name = env.NAME || \"CCR\"; log('[CCR remote] ' + text); const d = 'CCR model';`;";
  assert.equal(rebrandText(source, "ts"), "const script = `const name = env.NAME || \"CCR\"; log('[LLMR remote] ' + text); const d = 'LLMR model';`;");
});

test("marker comments written into user config files keep their CCR text", () => {
  const source = "const start = \"# BEGIN CCR managed profile\";\nconst prefix = \"# CCR configured model = \";\nconst copy = \"CCR managed profile\";";
  assert.equal(rebrandText(source, "ts"), "const start = \"# BEGIN CCR managed profile\";\nconst prefix = \"# CCR configured model = \";\nconst copy = \"LLMR managed profile\";");
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
  assert.equal(rebrandText("module.exports = { appDescription: 'Open in a CCR window.' };", "js"), "module.exports = { appDescription: 'Open in an LLMR window.' };");
});

test("markdown leaves code fences and inline code alone", () => {
  const md = "CCR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting CCR.";
  assert.equal(rebrandText(md, "md"), "LLMR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting LLMR.");
});

test("hyphenated copy is rewritten while hyphenated identifiers stay", () => {
  const source = "\"a non-CCR service and a CCR-managed profile\"; \"<CCR-SUBAGENT-MODEL>\"; \"Proxy-agent: CCR-MITM\"";
  assert.equal(rebrandText(source, "ts"), "\"a non-LLMR service and an LLMR-managed profile\"; \"<CCR-SUBAGENT-MODEL>\"; \"Proxy-agent: CCR-MITM\"");
});

test("the indefinite article follows the new name", () => {
  assert.equal(rebrandText("\"a CCR gateway path. A CCR window.\"", "ts"), "\"an LLMR gateway path. An LLMR window.\"");
  assert.equal(rebrandText("a CCR-managed profile", "md"), "an LLMR-managed profile");
});

test("the proxy CA organizational unit keeps the literal the rebrand script protects", () => {
  assert.deepEqual(gitGrepFiles(["--fixed-strings", "LLMR MITM Proxy", "--", "packages"]), []);
});

test("only the CA module and the uninstall script name the pre-rename proxy CA, so every keychain cleanup removes it", () => {
  assert.deepEqual(gitGrepFiles(["--fixed-strings", "Claude Code Router CA", "--", ":(glob)packages/*/src/**", "scripts"]), ["packages/core/src/proxy/certificates.ts", "scripts/uninstall-macos.mjs"]);
});

test("the proxy CA organizational unit stays part of the kept CA subject", () => {
  assert.equal(rebrandText("{ shortName: \"OU\", value: \"CCR MITM Proxy\" }", "ts"), "{ shortName: \"OU\", value: \"CCR MITM Proxy\" }");
});

test("the legacy compaction footer the read-both check looks for stays", () => {
  assert.equal(rebrandText("text.includes(\"CCR ARCHIVED HISTORY ACCESS\") || text.includes(\"CCR archived history\")", "ts"), "text.includes(\"CCR ARCHIVED HISTORY ACCESS\") || text.includes(\"LLMR archived history\")");
});

test("ui copy is rewritten", () => {
  assert.equal(rebrandText("\"Start the CCR gateway or open an Agent through CCR.\"", "ts"), "\"Start the LLMR gateway or open an Agent through LLMR.\"");
});

function gitGrepFiles(args) {
  try {
    return execFileSync("git", ["grep", "-l", ...args], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

test("the docs site no longer carries bare CCR or the upstream author's path", () => {
  const ccr = gitGrepFiles(["-P", "(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])", "--", "docs/src"]);
  assert.deepEqual(ccr, []);
  const paths = gitGrepFiles(["/Volumes/Data/Products/claude-code-router", "--", "docs/src"]);
  assert.deepEqual(paths, []);
});

test("renderer HTML pages no longer carry bare CCR", () => {
  assert.deepEqual(gitGrepFiles(["-P", "(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])", "--", "packages/ui/src/**/*.html"]), []);
});

test("nothing points at the old data directory", () => {
  const paths = [
    "packages/core/src", "packages/ui/src", "packages/cli/src", "packages/electron/src", "packages/electron/bundled-plugins",
    "packages/core/test", "packages/ui/test", "packages/cli/test", "packages/electron/test", "tests/e2e", "tests/system",
    "docker", "docs/src", "README.md"
  ];
  assert.deepEqual(gitGrepFiles(["-E", "\\.claude-code-router|Claude Code Router\"\\)|appData, \"claude-code-router\"", "--", ...paths]), []);
});
