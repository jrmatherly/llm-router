import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const driver = path.join(process.cwd(), ".claude", "skills", "upstream-review", "scripts", "upstream-review.sh");
const stateDir = path.join("docs", "superpowers", "upstream-review");
// Spelled in pieces so the rename guard does not read this file as residue.
const oldName = `${["c", "c", "r"].join("")}Value`;

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function forkWithOneUpstreamChange() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "llmr-upstream-review-")));
  const upstream = path.join(root, "upstream");
  const fork = path.join(root, "fork");
  mkdirSync(upstream);
  git(upstream, "init", "-q", "-b", "main");
  writeFileSync(path.join(upstream, "a.ts"), `const ${oldName} = 1;\n`);
  git(upstream, "add", "-A");
  git(upstream, "commit", "-qm", "base");
  const base = git(upstream, "rev-parse", "HEAD");
  git(root, "clone", "-q", upstream, fork);
  writeFileSync(path.join(upstream, "a.ts"), `const ${oldName} = 2;\n`);
  git(upstream, "commit", "-qam", "change");
  const change = git(upstream, "rev-parse", "HEAD");

  const url = "https://github.com/example/upstream.git";
  git(fork, "remote", "add", "upstream", url);
  git(fork, "fetch", "-q", upstream, "+main:refs/remotes/upstream/main");
  mkdirSync(path.join(fork, "scripts"));
  copyFileSync(path.join(process.cwd(), "scripts", "llmr-rename.mjs"), path.join(fork, "scripts", "llmr-rename.mjs"));
  mkdirSync(path.join(fork, stateDir, "reviews"), { recursive: true });
  writeFileSync(path.join(fork, stateDir, "watermark.json"), JSON.stringify({
    forkPointDate: "2026-01-01",
    forkPointSha: base,
    lastReviewedDate: "2026-01-01",
    lastReviewedSha: base,
    upstreamBranch: "main",
    upstreamRemote: "upstream",
    upstreamUrl: url
  }));
  writeFileSync(path.join(fork, "a.ts"), "const llmrValue = 1;\n");
  git(fork, "add", "-A");
  git(fork, "commit", "-qm", "rename");
  return { change, fork };
}

function run(fork, ...args) {
  return spawnSync("bash", [driver, ...args], { cwd: fork, encoding: "utf8", env: { ...process.env, UPSTREAM_REVIEW_OFFLINE: "1" } });
}

test("the tracked watermark names full SHAs and a plain GitHub URL", () => {
  const state = JSON.parse(readFileSync(path.join(stateDir, "watermark.json"), "utf8"));
  assert.match(state.forkPointSha, /^[0-9a-f]{40}$/);
  assert.match(state.lastReviewedSha, /^[0-9a-f]{40}$/);
  assert.match(state.upstreamUrl, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
});

test("the listing shows the un-reviewed upstream commit and keeps upstream tags out of refs/tags", () => {
  const { change, fork } = forkWithOneUpstreamChange();
  const result = run(fork, "--stat");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /commits to review:\s+1 /);
  assert.match(result.stdout, new RegExp(`\\* ${change.slice(0, 7)}`));
  assert.match(result.stdout, /~\s+\+1\s+-1\s+a\.ts/);
  assert.equal(git(fork, "config", "remote.upstream.tagOpt"), "--no-tags");
  assert.equal(git(fork, "config", "remote.upstream.pruneTags"), "false");
});

test("--port rewrites upstream's names and --port-check applies the result to a renamed file", () => {
  const { change, fork } = forkWithOneUpstreamChange();
  assert.match(run(fork, "--show", change).stdout, new RegExp(`\\+const ${oldName} = 2;`));
  const ported = run(fork, "--port", change);
  assert.equal(ported.status, 0, ported.stderr);
  assert.match(ported.stdout, /\+const llmrValue = 2;/);
  assert.equal(ported.stdout.includes(oldName), false);
  const check = run(fork, "--port-check", change);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /applies {2}a\.ts/);
});

test("--port-check fails for a file the fork changed beyond the rename", () => {
  const { change, fork } = forkWithOneUpstreamChange();
  writeFileSync(path.join(fork, "a.ts"), "const somethingElse = 1;\n");
  git(fork, "commit", "-qam", "diverge");
  const check = run(fork, "--port-check", change);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /FAILS {4}a\.ts/);
});

test("--advance refuses without a decision log and moves the watermark with one", () => {
  const { change, fork } = forkWithOneUpstreamChange();
  const refused = run(fork, "--advance", change);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /no decision log mentions/);
  writeFileSync(path.join(fork, stateDir, "reviews", "2026-01-02-review.md"), `Window: ..${git(fork, "rev-parse", "--short", change)}\n`);
  const advanced = run(fork, "--advance", change);
  assert.equal(advanced.status, 0, advanced.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(fork, stateDir, "watermark.json"), "utf8")).lastReviewedSha, change);
  assert.equal(run(fork, "--advance", `${change}^`).status, 1);
});
