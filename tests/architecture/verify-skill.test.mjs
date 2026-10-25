import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.join(process.cwd(), ".claude", "skills", "verify", "scripts", "verify.mjs");
const modelsFile = path.join("packages", "core", "models.json");
const nodeCommand = (source) => [process.execPath, ["-e", source]];

function throwawayRepo() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ccr-verify-")));
  const git = (...args) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, encoding: "utf8" });
  mkdirSync(path.join(dir, "packages", "core"), { recursive: true });
  mkdirSync(path.join(dir, "packages", "ui", "src", "generated"), { recursive: true });
  mkdirSync(path.join(dir, "node_modules"));
  writeFileSync(path.join(dir, modelsFile), "{}\n");
  writeFileSync(path.join(dir, "packages", "ui", "src", "generated", "claude-code-config-options.json"), "{}\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "init");
  const sidecar = path.join(dir, "fake-sidecar.node");
  writeFileSync(sidecar, "");
  return { dir, git, sidecar };
}

function runVerify(repo, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repo.dir,
    encoding: "utf8",
    env: { ...process.env, CCR_VERIFY_SIDECAR: repo.sidecar, ...env }
  });
}

test("verify stops at the first failing suite and reports one PASS and one FAIL", () => {
  const repo = throwawayRepo();
  const marker = path.join(repo.dir, "third-ran");
  const commands = JSON.stringify([
    nodeCommand("process.exit(0)"),
    nodeCommand("process.exit(1)"),
    nodeCommand(`require('fs').writeFileSync(${JSON.stringify(marker)}, '')`)
  ]);
  const result = runVerify(repo, [], { CCR_VERIFY_COMMANDS: commands });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.split("\n").filter((line) => line.startsWith("PASS ")).length, 1);
  assert.equal(result.stdout.split("\n").filter((line) => line.startsWith("FAIL ")).length, 1);
  assert.equal(existsSync(marker), false);
});

test("verify --e2e restores generated files that were clean before the run", () => {
  const repo = throwawayRepo();
  const e2e = JSON.stringify(nodeCommand(`require('fs').writeFileSync(${JSON.stringify(modelsFile)}, 'rewritten')`));
  const result = runVerify(repo, ["--e2e"], { CCR_VERIFY_COMMANDS: "[]", CCR_VERIFY_E2E_COMMAND: e2e });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RESTORED generated files/);
  assert.equal(repo.git("status", "--short", "--", "packages").stdout, "");
});

test("verify --e2e keeps prior edits to generated files when it skips the restore", () => {
  const repo = throwawayRepo();
  writeFileSync(path.join(repo.dir, modelsFile), "intended edit\n");
  const e2e = JSON.stringify(nodeCommand("process.exit(1)"));
  const result = runVerify(repo, ["--e2e"], { CCR_VERIFY_COMMANDS: "[]", CCR_VERIFY_E2E_COMMAND: e2e });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /SKIPPED restore/);
  assert.equal(readFileSync(path.join(repo.dir, modelsFile), "utf8"), "intended edit\n");
});
