import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("an rc file with the Claude Code Router PATH block ends up with one LLM Router block", async () => {
  const { ensureShellRcPathBlock } = await import("@ccr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "ccr-rc-")), ".zshrc");
  writeFileSync(rc, "export A=1\n# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n");
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  const text = readFileSync(rc, "utf8");
  assert.equal((text.match(/>>> .* CLI >>>/g) ?? []).length, 1);
  assert.match(text, /# >>> LLM Router CLI >>>/);
  assert.doesNotMatch(text, /Claude Code Router CLI/);
  assert.match(text, /\.llm-router\/bin/);
  assert.doesNotMatch(text, /claude-code-router/);
  assert.match(text, /^export A=1$/m);
});
