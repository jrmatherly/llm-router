import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeCodeManagedSettingsDir, claudeCodeManagedSettingsFiles, readClaudeCodeGatewayLoginPolicy } from "@ccr/core/agents/claude-code/gateway-login-policy.ts";

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gateway-login-policy-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

test("forceLoginMethod gateway in managed settings pins the machine", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "managed-settings.json");
    writeFileSync(file, JSON.stringify({ forceLoginGatewayUrl: "https://gw.internal", forceLoginMethod: "gateway" }));
    assert.deepEqual(readClaudeCodeGatewayLoginPolicy([file]), { file, key: "forceLoginMethod" });
  });
});

test("allowedProviders containing gateway pins the machine", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "managed-settings.json");
    writeFileSync(file, JSON.stringify({ allowedProviders: ["gateway"] }));
    assert.deepEqual(readClaudeCodeGatewayLoginPolicy([file]), { file, key: "allowedProviders" });
  });
});

test("a drop-in file in managed-settings.d is read after managed-settings.json", () => {
  withTempDir((dir) => {
    writeFileSync(path.join(dir, "managed-settings.json"), "{}");
    mkdirSync(path.join(dir, "managed-settings.d"));
    writeFileSync(path.join(dir, "managed-settings.d", "10-login.json"), JSON.stringify({ forceLoginMethod: "gateway" }));
    writeFileSync(path.join(dir, "managed-settings.d", "notes.txt"), "ignored");
    const files = claudeCodeManagedSettingsFiles(dir);
    assert.deepEqual(files, [path.join(dir, "managed-settings.json"), path.join(dir, "managed-settings.d", "10-login.json")]);
    assert.equal(readClaudeCodeGatewayLoginPolicy(files)?.key, "forceLoginMethod");
  });
});

test("missing, invalid JSON and non-gateway settings are no policy", () => {
  withTempDir((dir) => {
    const invalid = path.join(dir, "invalid.json");
    const other = path.join(dir, "other.json");
    writeFileSync(invalid, "{");
    writeFileSync(other, JSON.stringify({ allowedProviders: ["anthropic"], forceLoginMethod: "console" }));
    assert.equal(readClaudeCodeGatewayLoginPolicy([path.join(dir, "absent.json"), invalid, other]), undefined);
  });
});

test("managed settings directory follows the platform", () => {
  withTempDir((dir) => {
    assert.equal(claudeCodeManagedSettingsDir("darwin"), "/Library/Application Support/ClaudeCode");
    assert.equal(claudeCodeManagedSettingsDir("linux"), "/etc/claude-code");
    assert.equal(claudeCodeManagedSettingsDir("win32"), "C:\\Program Files\\ClaudeCode");
    assert.equal(claudeCodeManagedSettingsFiles(path.join(dir, "absent")).length, 0);
  });
});
