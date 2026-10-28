import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { claudeCodeManagedSettingsDir, claudeCodeManagedSettingsFiles, readClaudeCodeGatewayLoginPolicy } from "@llmr/core/agents/claude-code/gateway-login-policy.ts";

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-gateway-login-policy-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

for (const [key, settings] of [
  ["forceLoginMethod", { forceLoginGatewayUrl: "https://gw.internal", forceLoginMethod: "gateway" }],
  ["allowedProviders", { allowedProviders: ["gateway"] }]
]) {
  test(`${key} gateway in managed settings pins the machine`, () => {
    withTempDir((dir) => {
      const file = path.join(dir, "managed-settings.json");
      writeFileSync(file, JSON.stringify(settings));
      assert.deepEqual(readClaudeCodeGatewayLoginPolicy([file]), { file, key });
    });
  });
}

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

test("missing, invalid JSON, non-object and non-gateway settings are no policy, and only the unparsable file warns", () => {
  withTempDir((dir) => {
    const invalid = path.join(dir, "invalid.json");
    const list = path.join(dir, "list.json");
    const other = path.join(dir, "other.json");
    writeFileSync(invalid, "{");
    writeFileSync(list, JSON.stringify(["gateway"]));
    writeFileSync(other, JSON.stringify({ allowedProviders: ["anthropic"], forceLoginMethod: "console" }));
    const warn = mock.method(console, "warn", () => {});
    try {
      assert.equal(readClaudeCodeGatewayLoginPolicy([path.join(dir, "absent.json"), invalid, list, other]), undefined);
      assert.equal(warn.mock.callCount(), 1);
      assert.match(String(warn.mock.calls[0].arguments[0]), new RegExp(invalid.replaceAll("\\", "\\\\")));
    } finally {
      warn.mock.restore();
    }
  });
});

test("the managed settings directory can be overridden for tests", () => {
  withTempDir((dir) => {
    const previous = process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR;
    process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR = dir;
    try {
      writeFileSync(path.join(dir, "managed-settings.json"), JSON.stringify({ forceLoginMethod: "gateway" }));
      assert.equal(claudeCodeManagedSettingsDir(), dir);
      assert.deepEqual(claudeCodeManagedSettingsFiles(), [path.join(dir, "managed-settings.json")]);
    } finally {
      if (previous === undefined) {
        delete process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR;
      } else {
        process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR = previous;
      }
    }
  });
});

test("managed settings directory follows the platform", () => {
  assert.equal(claudeCodeManagedSettingsDir("darwin"), "/Library/Application Support/ClaudeCode");
  assert.equal(claudeCodeManagedSettingsDir("linux"), "/etc/claude-code");
  assert.equal(claudeCodeManagedSettingsDir("win32"), "C:\\Program Files\\ClaudeCode");
  assert.deepEqual(claudeCodeManagedSettingsFiles(path.join(os.tmpdir(), "llmr-gateway-login-policy-absent")), []);
});

test("an unreadable managed-settings.d is no policy and warns", { skip: process.getuid?.() === 0 }, () => {
  withTempDir((dir) => {
    const dropInDir = path.join(dir, "managed-settings.d");
    mkdirSync(dropInDir);
    chmodSync(dropInDir, 0o000);
    const warn = mock.method(console, "warn", () => {});
    try {
      assert.deepEqual(claudeCodeManagedSettingsFiles(dir), []);
      assert.equal(warn.mock.callCount(), 1);
      assert.match(String(warn.mock.calls[0].arguments[0]), /managed-settings\.d/);
    } finally {
      warn.mock.restore();
      chmodSync(dropInDir, 0o700);
    }
  });
});
