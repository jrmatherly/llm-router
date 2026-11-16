import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { nextVersion, parseReleaseArgs, run, testsRunFailure } from "../../scripts/release.mjs";

test("nextVersion bumps by keyword or accepts a higher explicit version", () => {
  assert.equal(nextVersion("4.2.0", "major"), "5.0.0");
  assert.equal(nextVersion("4.2.0", "minor"), "4.3.0");
  assert.equal(nextVersion("4.2.0", "patch"), "4.2.1");
  assert.equal(nextVersion("4.2.0", "4.3.0"), "4.3.0");
  assert.throws(() => nextVersion("4.2.0", "4.2.0"), /not above/);
  assert.throws(() => nextVersion("4.2.0", "4.1.9"), /not above/);
  assert.throws(() => nextVersion("4.2.0", "v4.3.0"), /not major, minor, patch/);
  assert.throws(() => nextVersion("4.2.0", "04.3.0"), /not major, minor, patch/);
  assert.throws(() => nextVersion("4.2", "patch"), /not x\.y\.z/);
});

test("parseReleaseArgs needs exactly one version spec and knows its flags", () => {
  assert.deepEqual(parseReleaseArgs(["minor"]), { dryRun: false, skipChecks: false, spec: "minor" });
  assert.deepEqual(parseReleaseArgs(["4.3.0", "--dry-run", "--skip-checks"]), { dryRun: true, skipChecks: true, spec: "4.3.0" });
  assert.throws(() => parseReleaseArgs([]), /usage/);
  assert.throws(() => parseReleaseArgs(["minor", "patch"]), /usage/);
  assert.throws(() => parseReleaseArgs(["minor", "--bogus"]), /--bogus/);
});

test("run returns trimmed stdout, and an empty string when stdout is inherited", () => {
  assert.equal(run("node", ["-p", "' ok '"]), "ok");
  assert.equal(run("node", ["-e", ""], { stdio: "inherit" }), "");
  assert.throws(() => run("node", ["-e", "process.exit(3)"]), /3/);
});

test("testsRunFailure accepts a completed, successful Tests run", () => {
  assert.equal(testsRunFailure([{ conclusion: "success", status: "completed", url: "u" }]), undefined);
});

test("testsRunFailure names a missing, pending or failed Tests run", () => {
  assert.equal(testsRunFailure([]), "no Tests run for HEAD");
  assert.equal(testsRunFailure([{ conclusion: "", status: "in_progress", url: "u" }]), "Tests run for HEAD is in_progress: u");
  assert.equal(testsRunFailure([{ conclusion: "failure", status: "completed", url: "u" }]), "Tests run for HEAD concluded failure: u");
  assert.equal(testsRunFailure([{ conclusion: "cancelled", status: "completed", url: "u" }]), "Tests run for HEAD concluded cancelled: u");
  assert.equal(testsRunFailure([{ conclusion: "skipped", status: "completed", url: "u" }]), "Tests run for HEAD concluded skipped: u");
});

test("the release preflight reads the Tests run from origin, refuses a red one and accepts a green one", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-release-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const repo = path.join(dir, "repo");
  const bin = path.join(dir, "bin");
  const origin = path.join(dir, "origin.git");
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo, stdio: "ignore" });
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  mkdirSync(bin);
  copyFileSync("scripts/release.mjs", path.join(repo, "scripts", "release.mjs"));
  writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(path.join(bin, "gh"), `#!/bin/sh\ncase "$*" in *"--repo ${origin} "*) printf '%s' "$GH_STUB" ;; *) echo "gh stub: wrong repo: $*" >&2; exit 9 ;; esac\n`);
  chmodSync(path.join(bin, "gh"), 0o755);
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch", "main", origin]);
  git("init", "--quiet", "--initial-branch", "main");
  git("add", ".");
  git("commit", "--quiet", "-m", "files");
  git("remote", "add", "origin", origin);
  git("push", "--quiet", "origin", "main");
  const release = (runs) => spawnSync(process.execPath, ["scripts/release.mjs", "patch", "--dry-run"], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GH_STUB: JSON.stringify(runs), PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  const red = release([{ conclusion: "failure", status: "completed", url: "u" }]);
  assert.equal(red.status, 1);
  assert.match(red.stderr, /release preflight failed: Tests run for HEAD concluded failure: u/);
  const green = release([{ conclusion: "success", status: "completed", url: "u" }]);
  assert.equal(green.status, 0, green.stderr);
});
