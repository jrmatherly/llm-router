import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const environmentFile = "packages/core/src/agents/claude-code/environment.ts";
// The cleanup list: names LLMR strips from users' Claude settings and never reads or writes.
const cleanupOnly = [
  `${environmentFile}: CODEXL_BOT_`,
  `${environmentFile}: CODEXL_CLAUDE_CODE_MCP_CONFIG`,
  `${environmentFile}: CODEXL_CLAUDE_CODE_MODEL`
];

test("CODEXL_ appears in package sources only in the settings cleanup list", () => {
  const found = execFileSync("git", ["ls-files", "-z", "packages"], { encoding: "utf8" })
    .split("\0")
    .filter((file) => /^packages\/[^/]+\/src\//.test(file))
    .map((file) => ({ file, bytes: readFileSync(file) }))
    .filter(({ bytes }) => !bytes.includes(0))
    .flatMap(({ file, bytes }) => (bytes.toString("utf8").match(/CODEXL_[A-Z0-9_]*/g) ?? []).map((name) => `${file}: ${name}`))
    .sort();
  assert.deepEqual(found, cleanupOnly, "CODEXL_ names are gone (spec D-5). Use an LLMR_ name. Only a key that must be stripped from users' settings belongs in STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS, and then in this list.");
});
