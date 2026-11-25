import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isolateTestHome } from "../../build/test-home-env.mjs";

// The bundle is CommonJS, so import.meta.url is empty; both runners start in the repo root.
const projectRoot = process.cwd();
const guard = path.join(projectRoot, "build", "test-home.mjs");
const proxyNames = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"];

function homeSeenBy(env) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    await import(${JSON.stringify(guard)});
    const os = await import("node:os");
    const proxies = ${JSON.stringify(proxyNames)}.filter((name) => process.env[name] !== undefined);
    console.log(JSON.stringify({ codexHome: process.env.CODEX_HOME, home: process.env.HOME, homedir: os.homedir(), internal: process.env.LLMR_INTERNAL_HOME_DIR, proxies }));
  `], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("a compiled test run outside run-tests gets a temporary HOME", () => {
  const realHome = mkdtempSync(path.join(os.tmpdir(), "llmr-real-home-"));
  try {
    const env = { ...process.env, CODEX_HOME: path.join(realHome, ".codex"), HOME: realHome };
    for (const name of proxyNames) {
      env[name] = "http://127.0.0.1:9";
    }
    delete env.LLMR_TEST_HOME;
    delete env.LLMR_INTERNAL_HOME_DIR;
    const seen = homeSeenBy(env);
    assert.notEqual(seen.home, realHome);
    assert.equal(seen.codexHome, undefined, "a developer's CODEX_HOME would send the tests' Codex writes to their real config");
    assert.deepEqual(seen.proxies, [], "a proxy from the developer's shell would carry a test's request past the network guard");
    assert.equal(seen.homedir, seen.home, "os.homedir follows the isolated HOME");
    assert.equal(seen.internal, seen.home);
    assert.ok(seen.home.startsWith(os.tmpdir()), seen.home);
    assert.equal(existsSync(seen.home), false, "a process that made its own home removes it at exit");
  } finally {
    rmSync(realHome, { force: true, recursive: true });
  }
});

test("each test process takes a home of its own inside the one run-tests isolated", () => {
  const testHome = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-home-"));
  try {
    const env = isolateTestHome(testHome, { ...process.env });
    const first = homeSeenBy(env);
    const second = homeSeenBy(env);
    for (const seen of [first, second]) {
      assert.equal(path.dirname(seen.home), testHome);
      assert.equal(seen.internal, seen.home);
      assert.equal(seen.homedir, seen.home);
      assert.equal(existsSync(seen.home), true, "a home inside a home someone else set is theirs to remove");
    }
    assert.notEqual(first.home, second.home, "test files run at the same time and must not share persisted keys or config");
  } finally {
    rmSync(testHome, { force: true, recursive: true });
  }
});

test("a test file that throws still removes its home", () => {
  const env = { ...process.env };
  delete env.LLMR_TEST_HOME;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    await import(${JSON.stringify(guard)});
    console.log(process.env.HOME);
    throw new Error("planted");
  `], { encoding: "utf8", env });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(existsSync(result.stdout.trim()), false);
});

test("a test that points HOME elsewhere removes only the home it was given", () => {
  const other = mkdtempSync(path.join(os.tmpdir(), "llmr-other-home-"));
  try {
    const env = { ...process.env };
    delete env.LLMR_TEST_HOME;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      await import(${JSON.stringify(guard)});
      console.log(process.env.HOME);
      process.env.HOME = ${JSON.stringify(other)};
    `], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(result.stdout.trim()), false, "the home the guard made is removed");
    assert.equal(existsSync(other), true, "the folder HOME points at last is not the guard's to remove");
  } finally {
    rmSync(other, { force: true, recursive: true });
  }
});

test("a test file under the runner logs its refusal to the runner's log, under its own name", () => {
  const testHome = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-home-"));
  try {
    const log = path.join(testHome, "network-refused.log");
    const env = { ...isolateTestHome(testHome, { ...process.env }), LLMR_TEST_FILE: "made/up.test.js", LLMR_TEST_NETWORK_LOG: log };
    delete env.NODE_OPTIONS;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      await import(${JSON.stringify(guard)});
      try { await fetch("https://outside.invalid/"); } catch {}
    `], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(log, "utf8"), "outside.invalid:443\tmade/up.test.js\n");
  } finally {
    rmSync(testHome, { force: true, recursive: true });
  }
});

test("build/test.mjs bundles the guard into tests that never import it", () => {
  const compiled = path.join(projectRoot, ".test-dist", "architecture", "test", "build-output-swap.test.js");
  assert.match(readFileSync(compiled, "utf8"), /llmr-test-home-/, `${compiled} lacks the guard; rebuild with node build/test.mjs architecture`);
  assert.match(readFileSync(compiled, "utf8"), /test network guard: refused/);
});

test("the test runner leaves no folder in the temp directory", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-temp-"));
  try {
    const env = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
    delete env.LLMR_TEST_HOME;
    const result = spawnSync(process.execPath, [path.join(projectRoot, "build", "run-tests.mjs"), "zz-no-such-project"], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown test project: zz-no-such-project/);
    assert.deepEqual(readdirSync(temp), []);
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
});
