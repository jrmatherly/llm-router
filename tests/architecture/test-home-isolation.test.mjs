import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isolateTestHome } from "../../build/test-home.mjs";

// The bundle is CommonJS, so import.meta.url is empty; both runners start in the repo root.
const projectRoot = process.cwd();
const guard = path.join(projectRoot, "build", "test-home.mjs");

function homeSeenBy(env) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    await import(${JSON.stringify(guard)});
    const os = await import("node:os");
    console.log(JSON.stringify({ home: process.env.HOME, homedir: os.homedir(), internal: process.env.LLMR_INTERNAL_HOME_DIR }));
  `], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("a compiled test run outside run-tests gets a temporary HOME", () => {
  const realHome = mkdtempSync(path.join(os.tmpdir(), "llmr-real-home-"));
  try {
    const env = { ...process.env, HOME: realHome };
    delete env.LLMR_TEST_HOME;
    delete env.LLMR_INTERNAL_HOME_DIR;
    const seen = homeSeenBy(env);
    assert.notEqual(seen.home, realHome);
    assert.equal(seen.homedir, seen.home, "os.homedir follows the isolated HOME");
    assert.equal(seen.internal, seen.home);
    assert.ok(seen.home.startsWith(os.tmpdir()), seen.home);
  } finally {
    rmSync(realHome, { force: true, recursive: true });
  }
});

test("the guard leaves the home run-tests already isolated", () => {
  const testHome = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-home-"));
  try {
    const seen = homeSeenBy(isolateTestHome(testHome, { ...process.env }));
    assert.equal(seen.home, testHome);
    assert.equal(seen.internal, testHome);
  } finally {
    rmSync(testHome, { force: true, recursive: true });
  }
});

test("build/test.mjs bundles the guard into tests that never import it", () => {
  const compiled = path.join(projectRoot, ".test-dist", "architecture", "test", "build-output-swap.test.js");
  assert.match(readFileSync(compiled, "utf8"), /llmr-test-home-/, `${compiled} lacks the guard; rebuild with node build/test.mjs architecture`);
});
