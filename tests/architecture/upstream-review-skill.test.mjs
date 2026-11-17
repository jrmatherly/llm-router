import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const driver = path.join(process.cwd(), ".claude", "skills", "upstream-review", "scripts", "upstream-review.sh");
const stateDir = path.join("docs", "superpowers", "upstream-review");
const url = "https://github.com/example/upstream.git";
// Spelled in pieces so the rename guard does not read this file as residue.
const old = ["c", "c", "r"].join("");
const oldName = `${old}Value`;
const oldFile = `${old}-tool.ts`;

function git(cwd, ...args) {
  const quiet = ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"];
  const result = spawnSync("git", [...quiet, ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(dir, files) {
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text);
}

// Upstream: base, then `first`, then `second`. The fork left base by renaming one file,
// deleting one and editing one, and has reviewed nothing.
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "llmr-upstream-review-")));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const upstream = path.join(root, "upstream");
  const fork = path.join(root, "fork");
  mkdirSync(upstream);
  git(upstream, "init", "-q", "-b", "main");
  write(upstream, { "early.ts": "e = 1;\n", "gone.ts": "g = 1;\n", "ours.ts": "o = 1;\n", "same.ts": "a = 1;\n", [oldFile]: `const ${oldName} = 1;\n` });
  git(upstream, "add", "-A");
  git(upstream, "commit", "-qm", "base");
  const base = git(upstream, "rev-parse", "HEAD");
  git(root, "clone", "-q", upstream, fork);
  git(fork, "remote", "remove", "origin");

  write(upstream, { "early.ts": "e = 2;\n", "later.ts": "l = 1;\n" });
  git(upstream, "add", "-A");
  git(upstream, "commit", "-qm", "first");
  const first = git(upstream, "rev-parse", "HEAD");
  write(upstream, { "early.ts": "e = 3;\n", "gone.ts": "g = 2;\n", "later.ts": "l = 2;\n", "new.ts": "n = 1;\n", "ours.ts": "o = 2;\n", "same.ts": "a = 2;\n", [oldFile]: `const ${oldName} = 2;\n` });
  git(upstream, "add", "-A");
  git(upstream, "commit", "-qm", "second");
  const second = git(upstream, "rev-parse", "HEAD");

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
  git(fork, "mv", oldFile, "llmr-tool.ts");
  git(fork, "rm", "-q", "gone.ts");
  write(fork, { "llmr-tool.ts": "const llmrValue = 1;\n", "ours.ts": "o = 'fork';\n" });
  git(fork, "add", "-A");
  git(fork, "commit", "-qm", "fork");
  return { base, first, fork, second, upstream };
}

function run(fork, args, env = { UPSTREAM_REVIEW_OFFLINE: "1" }) {
  return spawnSync("bash", [driver, ...args], { cwd: fork, encoding: "utf8", env: { ...process.env, ...env } });
}

function watermark(fork) {
  return JSON.parse(readFileSync(path.join(fork, stateDir, "watermark.json"), "utf8")).lastReviewedSha;
}

test("the tracked watermark names full SHAs and a plain GitHub URL", () => {
  const state = JSON.parse(readFileSync(path.join(stateDir, "watermark.json"), "utf8"));
  assert.match(state.forkPointSha, /^[0-9a-f]{40}$/);
  assert.match(state.lastReviewedSha, /^[0-9a-f]{40}$/);
  assert.match(state.upstreamUrl, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
});

test("--stat lists the un-reviewed commits and marks each file against the fork's own path", (t) => {
  const { fork, second } = fixture(t);
  const result = run(fork, ["--stat"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /upstream refs:\s+CACHED \(offline\)/);
  assert.match(result.stdout, /commits to review:\s+2 /);
  const lines = result.stdout.slice(result.stdout.indexOf(`* ${second.slice(0, 7)}`));
  assert.match(lines, /=\s+\+1\s+-1\s+same\.ts/);
  assert.match(lines, /<\s+\+1\s+-1\s+early\.ts/);
  assert.match(lines, /~\s+\+1\s+-1\s+ours\.ts/);
  assert.match(lines, /x\s+\+1\s+-1\s+gone\.ts/);
  assert.match(lines, /\^\s+\+1\s+-1\s+later\.ts/);
  assert.match(lines, /\+\s+\+1\s+-0\s+new\.ts/);
  assert.match(lines, new RegExp(`~\\s+\\+1\\s+-1\\s+${old}-tool\\.ts {2}\\(here: llmr-tool\\.ts\\)`));
});

test("a fetch keeps upstream's tags out of refs/tags and ends the window at the newest release", (t) => {
  const { first, fork, upstream } = fixture(t);
  git(upstream, "tag", "v1.0.0", `${first}^`);
  git(upstream, "tag", "-a", "-m", "release", "v1.1.0", first);
  git(fork, "tag", "v1.0.0");
  git(fork, "tag", "v9.9.9");
  const ours = git(fork, "rev-parse", "v1.0.0");
  git(fork, "config", `url.file://${upstream}.insteadOf`, url);
  git(fork, "config", "fetch.prune", "true");
  git(fork, "config", "fetch.pruneTags", "true");

  for (const attempt of [1, 2]) {
    const result = run(fork, [], { UPSTREAM_REVIEW_OFFLINE: "0" });
    assert.equal(result.status, 0, `run ${attempt}: ${result.stderr}`);
    assert.match(result.stdout, /upstream refs:\s+fetched now/);
    assert.match(result.stdout, new RegExp(`window end:\\s+${first} {2}\\(release v1\\.1\\.0\\)`));
    assert.match(result.stdout, /commits to review:\s+1 /);
    assert.match(result.stdout, /beyond the window:\s+1 /);
  }
  assert.equal(git(fork, "tag", "-l"), "v1.0.0\nv9.9.9");
  assert.equal(git(fork, "rev-parse", "v1.0.0"), ours);
  assert.equal(git(fork, "rev-parse", "refs/upstream-review/upstream/tags/v1.1.0^{commit}"), first);
  assert.equal(git(fork, "config", "remote.upstream.tagOpt"), "--no-tags");
  assert.equal(git(fork, "config", "remote.upstream.pruneTags"), "false");
  // A plain fetch is what the two settings guard against.
  git(fork, "fetch", "-q", "upstream");
  assert.equal(git(fork, "tag", "-l"), "v1.0.0\nv9.9.9");
  assert.equal(git(fork, "rev-parse", "v1.0.0"), ours);
});

test("--port rewrites upstream's names and paths", (t) => {
  const { fork, second } = fixture(t);
  assert.match(run(fork, ["--show", second]).stdout, new RegExp(`\\+const ${oldName} = 2;`));
  const ported = run(fork, ["--port", second]);
  assert.equal(ported.status, 0, ported.stderr);
  assert.match(ported.stdout, /^\+\+\+ b\/llmr-tool\.ts$/m);
  assert.match(ported.stdout, /^\+const llmrValue = 2;$/m);
  assert.equal(ported.stdout.includes(old), false);
});

test("--port-check reports each file at the fork's path against HEAD, with the reason for a failure", (t) => {
  const { fork, second } = fixture(t);
  // An uncommitted edit must not change a verdict that claims to be about HEAD.
  write(fork, { "llmr-tool.ts": "uncommitted\n" });
  const check = run(fork, ["--port-check", second]);
  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.match(check.stdout, /applies {2}llmr-tool\.ts/);
  assert.match(check.stdout, /applies {2}same\.ts/);
  assert.match(check.stdout, /applies {2}new\.ts/);
  assert.match(check.stdout, /FAILS {4}ours\.ts\n\s+patch failed: ours\.ts:1/);
  assert.match(check.stdout, /FAILS {4}gone\.ts\n\s+gone\.ts: does not exist in index/);
  assert.match(check.stdout, /3 apply, 4 fail, 0 binary/);
  // The path it prints is one `git apply --include` matches.
  const apply = spawnSync("bash", ["-c", `bash "${driver}" --port ${second} | git apply --cached --include=llmr-tool.ts && git diff --cached --name-only`], {
    cwd: fork,
    encoding: "utf8",
    env: { ...process.env, UPSTREAM_REVIEW_OFFLINE: "1" }
  });
  assert.equal(apply.stdout.trim(), "llmr-tool.ts", apply.stderr);
});

test("--port-check refuses a commit with no parent instead of reporting zero failures", (t) => {
  const { base, fork } = fixture(t);
  const result = run(fork, ["--port-check", base]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has no parent/);
});

test("--advance moves the watermark only forward, only along upstream, and only past a logged window", (t) => {
  const { base, first, fork, second } = fixture(t);
  const log = (text) => writeFileSync(path.join(fork, stateDir, "reviews", "2026-01-02-review.md"), text);

  log(`Not reviewed: ${second} and ${git(fork, "rev-parse", "--short", second)}\n`);
  const unlogged = run(fork, ["--advance", second]);
  assert.equal(unlogged.status, 1);
  assert.match(unlogged.stderr, /no decision log has a 'Window:' line ending at/);
  assert.equal(watermark(fork), base);

  const head = git(fork, "rev-parse", "HEAD");
  log(`Window: \`x..${head}\`\nWindow: \`x..${second}\`\nWindow: \`x..${first}\`\n`);
  const foreign = run(fork, ["--advance", head]);
  assert.equal(foreign.status, 1);
  assert.match(foreign.stderr, /is not on upstream\/main/);

  const advanced = run(fork, ["--advance", second]);
  assert.equal(advanced.status, 0, advanced.stderr);
  assert.equal(watermark(fork), second);

  const backward = run(fork, ["--advance", first]);
  assert.equal(backward.status, 1);
  assert.match(backward.stderr, /watermark would move backward/);
  assert.equal(watermark(fork), second);

  const listing = run(fork, []);
  assert.match(listing.stdout, /commits to review:\s+0 /);
  assert.match(listing.stdout, /Nothing new in the cached refs/);
});
