import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isolateTestHome } from "../../../../build/test-home.mjs";

const cliRuntime = path.join(process.cwd(), ".test-dist", "cli", "runtime", "cli.js");
const rootPackageVersion = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version;

test("built CLI exposes package-owned help", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /llmr serve/);
  assert.match(result.stdout, /llmr <profile-name-or-id>/);
});

test("built CLI rejects invalid ports before starting services", () => {
  const result = runCli(["serve", "--port", "invalid", "--no-open", "--no-gateway"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid port: invalid/);
});

test("every service command exposes its package-owned command help", () => {
  for (const [command, usage] of [
    ["start", /llmr start/],
    ["ui", /llmr ui/],
    ["serve", /llmr serve/],
    ["stop", /llmr stop/]
  ]) {
    const result = runCli([command, "--help"]);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.match(result.stdout, usage, command);
  }
});

test("built CLI accepts --daemon on service commands", () => {
  for (const args of [
    ["start", "--daemon", "--help"],
    ["ui", "--daemon", "--help"],
    ["serve", "--daemon", "--help"]
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stdout, /--daemon/, args.join(" "));
  }
});

test("built CLI rejects missing, out-of-range, and unknown service options", () => {
  const cases = [
    [["serve", "--host"], /--host requires a value/],
    [["serve", "--host="], /--host requires a value/],
    [["serve", "--port", "0"], /Invalid port: 0/],
    [["serve", "--port=65536"], /Invalid port: 65536/],
    [["ui", "--unknown"], /Unknown web option: --unknown/],
    [["stop", "--force"], /Unknown stop option: --force/]
  ];

  for (const [args, error] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 1, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stderr, error, args.join(" "));
  }
});

test("built CLI requires a profile reference when no command is supplied", () => {
  const result = runCli([]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /llmr <profile-name-or-id>/);
});

test("--version prints the release version and touches no config", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-cli-version-"));
  try {
    for (const flag of ["--version", "-v"]) {
      const result = runCli([flag], { env: isolateTestHome(home, {}) });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), `llmr ${rootPackageVersion}`);
    }
    assert.deepEqual(readdirSync(home), []);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

for (const [name, args, error] of [
  ["an unknown profile", ["no-such-profile"], /not found/i],
  ["agent arguments for a Claude App profile", ["Claude Code", "app", "--", "--model", "x"], /Claude App profiles do not support agent arguments/]
]) {
  test(`${name} fails before any agent config is written`, () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "llmr-cli-bad-args-"));
    try {
      mkdirSync(path.join(home, ".llm-router"), { recursive: true });
      writeFileSync(path.join(home, ".llm-router", "config.json"), `${JSON.stringify({
        Providers: [{
          api_base_url: "https://example.test/v1",
          api_key: "provider-key",
          models: ["model"],
          name: "Provider"
        }],
        profile: {
          profiles: [{
            agent: "claude-code",
            enabled: true,
            id: "default-claude-code",
            model: "Provider/model",
            name: "Claude Code",
            scope: "global",
            smallFastModel: "",
            surface: "auto"
          }]
        }
      }, null, 2)}\n`);

      const result = runCli(args, { env: isolateTestHome(home, {}) });

      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, error);
      for (const dir of [".claude", ".codex"]) {
        assert.equal(existsSync(path.join(home, dir)), false, dir);
      }
    } finally {
      rmSync(home, { force: true, recursive: true });
    }
  });
}

function runCli(args, { env = {} } = {}) {
  return spawnSync(process.execPath, [cliRuntime, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      LLMR_CLI_COMMAND_NAME: "",
      ...env
    }
  });
}
