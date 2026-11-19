import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isolateTestHome } from "../../../../build/test-home.mjs";

const cliRuntime = path.join(process.cwd(), ".test-dist", "cli", "runtime", "cli.js");
const token = "daemon-test-token-0123456789-0123456789";

test("a background service is started, reused and stopped without printing a supplied token", async (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-cli-daemon-"));
  const env = isolateTestHome(home, {
    ...process.env,
    LLMR_CLI_COMMAND_NAME: "",
    LLMR_MODEL_CATALOG_PATH: path.join(process.cwd(), "packages", "core", "models.json"),
    LLMR_WEB_AUTH_TOKEN: token
  });
  const run = (args) => spawnSync(process.execPath, [cliRuntime, ...args], { encoding: "utf8", env, timeout: 60_000 });
  const stateFile = path.join(home, ".llm-router", "service.json");
  t.after(() => {
    run(["stop"]);
    try {
      process.kill(JSON.parse(readFileSync(stateFile, "utf8")).pid);
    } catch {
      // Already stopped.
    }
    rmSync(home, { force: true, recursive: true });
  });
  const port = await freePort();

  const started = run(["start", "--port", String(port), "--no-open", "--no-gateway"]);
  assert.equal(started.status, 0, started.stderr);
  assert.ok(!`${started.stdout}${started.stderr}`.includes(token), "start must not print a supplied token");

  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(state.authToken, token);
  assert.equal(state.tokenGenerated, false);
  assert.doesNotMatch(state.url, /[?#]/);
  if (process.platform !== "win32") {
    assert.equal(statSync(stateFile).mode & 0o777, 0o600);
  }

  const reused = run(["ui", "--no-open", "--no-gateway"]);
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /already running/, "the saved token must authenticate against the running service");
  assert.ok(!reused.stdout.includes(token), "ui must not print a supplied token");

  const stopped = run(["stop"]);
  assert.equal(stopped.status, 0, stopped.stderr);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), "the port is closed after stop");
});

test("--allow-remote reaches the background service", async (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-cli-daemon-"));
  const env = isolateTestHome(home, {
    ...process.env,
    LLMR_CLI_COMMAND_NAME: "",
    LLMR_MODEL_CATALOG_PATH: path.join(process.cwd(), "packages", "core", "models.json"),
    LLMR_WEB_AUTH_TOKEN: token
  });
  delete env.LLMR_WEB_ALLOW_REMOTE;
  const run = (args) => spawnSync(process.execPath, [cliRuntime, ...args], { encoding: "utf8", env, timeout: 60_000 });
  const stateFile = path.join(home, ".llm-router", "service.json");
  t.after(() => {
    run(["stop"]);
    try {
      process.kill(JSON.parse(readFileSync(stateFile, "utf8")).pid);
    } catch {
      // Already stopped.
    }
    rmSync(home, { force: true, recursive: true });
  });

  const started = run(["start", "--host", "0.0.0.0", "--allow-remote", "--port", String(await freePort()), "--no-open", "--no-gateway"]);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(new URL(JSON.parse(readFileSync(stateFile, "utf8")).url).hostname, "0.0.0.0");
  assert.equal(run(["stop"]).status, 0);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
