import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("an rc file with the Claude Code Router PATH block ends up with one LLM Router block", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, "export A=1\n# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n");
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  const text = readFileSync(rc, "utf8");
  assert.equal((text.match(/>>> .* CLI >>>/g) ?? []).length, 1);
  assert.match(text, /# >>> LLM Router CLI >>>/);
  assert.doesNotMatch(text, /Claude Code Router CLI/);
  assert.match(text, /\.llm-router\/bin/);
  assert.match(text, /^export A=1$/m);
});

test("a fish config with the Claude Code Router PATH block ends up with one LLM Router block", async () => {
  const { ensureFishPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-fish-")), "llmr.fish");
  writeFileSync(file, "set -g A 1\n# >>> Claude Code Router CLI >>>\nset -l llmr_bin old\n# <<< Claude Code Router CLI <<<\n");
  ensureFishPathBlock(file, "/opt/llm-router/bin");
  const text = readFileSync(file, "utf8");
  assert.equal((text.match(/>>> .* CLI >>>/g) ?? []).length, 1);
  assert.match(text, /# >>> LLM Router CLI >>>/);
  assert.match(text, /^set -g A 1$/m);
});

test("an rc file that already adds the LLM Router bin dir loses the Claude Code Router PATH block instead of gaining a new one", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, "# zsh/path.zsh adds $HOME/.llm-router/bin\nexport A=1\n# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n");
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  assert.equal(readFileSync(rc, "utf8"), "# zsh/path.zsh adds $HOME/.llm-router/bin\nexport A=1\n");
});

const legacyBlock = "# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n";

test("an rc file's own leading blank lines survive", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, `\n\nexport A=1\n${legacyBlock}`);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  assert.ok(readFileSync(rc, "utf8").startsWith("\n\nexport A=1\n# >>> LLM Router CLI >>>\n"));
});

test("a managed block at the top of an rc file gains no leading blank line", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, `${legacyBlock}export A=1\n`);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  const text = readFileSync(rc, "utf8");
  assert.ok(text.startsWith("# >>> LLM Router CLI >>>\n"));
  assert.match(text, /^export A=1$/m);
});

test("a symlinked rc file stays a symlink", { skip: process.platform === "win32" }, async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-rc-"));
  const real = path.join(dir, "dotfiles-zshrc");
  const rc = path.join(dir, ".zshrc");
  writeFileSync(real, "export A=1\n");
  symlinkSync(real, rc);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  assert.equal(lstatSync(rc).isSymbolicLink(), true);
  assert.match(readFileSync(real, "utf8"), /# >>> LLM Router CLI >>>/);
  assert.deepEqual(readdirSync(dir).sort(), [".zshrc", "dotfiles-zshrc"]);
});
