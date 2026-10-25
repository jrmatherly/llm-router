import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const hooksDir = path.join(process.cwd(), ".claude", "hooks");
const run = (script, payload, env = {}) => spawnSync(process.execPath, [path.join(hooksDir, script)], {
  encoding: "utf8",
  env: { ...process.env, ...env },
  input: JSON.stringify(payload)
});
const tempRepo = () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ccr-gate-")));
  mkdirSync(path.join(dir, "node_modules"));
  return dir;
};
const pass = JSON.stringify([[process.execPath, ["-e", "process.exit(0)"]]]);

test("protect blocks the model catalog and names the generator", () => {
  const r = run("protect-generated.mjs", { tool_name: "Edit", tool_input: { file_path: "/repo/packages/core/models.json" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run models:build/);
});
test("protect blocks a Serena edit by relative path", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_content", tool_input: { relative_path: "packages/ui/src/generated/claude-code-config-options.json" } }).status, 2);
});
test("protect blocks a project-wide Serena replace_in_files", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_in_files", tool_input: { needle: "a", repl: "b", mode: "literal" } }).status, 2);
});
test("protect allows a scoped Serena replace_in_files", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_in_files", tool_input: { relative_path: "packages/core/src/routing", needle: "a", repl: "b", mode: "literal" } }).status, 0);
});
test("protect blocks relative dist paths but not node_modules dist", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "Write", tool_input: { file_path: "dist/main/x.js" } }).status, 2);
  assert.equal(run("protect-generated.mjs", { tool_name: "Write", tool_input: { file_path: "/repo/node_modules/x/dist/y.js" } }).status, 0);
});
test("protect allows ordinary source and ignores payloads with no path", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "Edit", tool_input: { file_path: "/repo/packages/core/src/x.ts" } }).status, 0);
  assert.equal(run("protect-generated.mjs", { tool_name: "Edit", tool_input: {} }).status, 0);
});
test("gate passes through non-commit git commands without running checks", () => {
  assert.equal(run("gate-commit.mjs", { cwd: "/nonexistent", tool_name: "Bash", tool_input: { command: "git status" } }).status, 0);
  assert.equal(run("gate-commit.mjs", { cwd: "/nonexistent", tool_name: "Bash", tool_input: { command: "git log --oneline" } }).status, 0);
});
test("gate recognizes every commit spelling", () => {
  for (const command of ["git commit -m x", "git -C sub commit", "git -c a=b commit -m x", "rtk git commit -m x", "npm test && git commit -m x"]) {
    const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "Bash", tool_input: { command } }, { CCR_GATE_COMMANDS: pass });
    assert.equal(r.status, 0, command);
  }
});
test("gate treats the Jean commit tool as a commit", () => {
  const fail = JSON.stringify([[process.execPath, ["-e", "console.log('tsc says no'); process.exit(1)"]]]);
  const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "mcp__jean__create_commit", tool_input: { message: "x" } }, { CCR_GATE_COMMANDS: fail });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsc says no/);
});
test("gate blocks when a check fails and reports its output", () => {
  const fail = JSON.stringify([[process.execPath, ["-e", "console.log('tsc says no'); process.exit(1)"]]]);
  const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: fail });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsc says no/);
});
test("gate blocks a tree without node_modules", () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ccr-gate-bare-")));
  const r = run("gate-commit.mjs", { cwd: dir, tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: pass });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm ci/);
});
test("gate runs in the hook input cwd, not CLAUDE_PROJECT_DIR", () => {
  const dir = tempRepo();
  const record = JSON.stringify([[process.execPath, ["-e", "require('fs').writeFileSync('ran-here', process.cwd())"]]]);
  const r = run("gate-commit.mjs", { cwd: dir, tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: record, CLAUDE_PROJECT_DIR: "/nonexistent" });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(path.join(dir, "ran-here"), "utf8"), dir);
});
