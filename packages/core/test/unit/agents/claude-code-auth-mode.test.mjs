import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import { resolveClaudeCodeGatewayAuthMode } from "@llmr/core/agents/claude-code/auth-mode.ts";

const inheritedAuthMode = process.env.LLMR_CLAUDE_CODE_AUTH_MODE;
delete process.env.LLMR_CLAUDE_CODE_AUTH_MODE;
test.after(() => {
  if (inheritedAuthMode !== undefined) process.env.LLMR_CLAUDE_CODE_AUTH_MODE = inheritedAuthMode;
});

test("#1779 auto auth does not infer working federation from a CLI version", (t) => {
  const probe = t.mock.method(childProcess, "spawnSync", () => ({ stdout: "2.1.235 (Claude Code)", status: 0 }));
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { LLMR_CLAUDE_CODE_AUTH_MODE: "auto" } }), "api-key-helper");
  assert.equal(probe.mock.callCount(), 0);
});

test("#1779 explicit federation and helper preferences remain available", () => {
  for (const mode of ["wif", "api-key-helper"]) {
    assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { LLMR_CLAUDE_CODE_AUTH_MODE: mode } }), mode);
  }
});

test("a profile that names claude-login resolves to it, and nothing else does", (t) => {
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" } }), "claude-login");
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: { LLMR_CLAUDE_CODE_AUTH_MODE: "login" } }), "claude-login");
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: {} }), "api-key-helper");

  t.after(() => { delete process.env.LLMR_CLAUDE_CODE_AUTH_MODE; });
  process.env.LLMR_CLAUDE_CODE_AUTH_MODE = "claude-login";
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: {} }), "api-key-helper", "one process variable must not move every profile");
  process.env.LLMR_CLAUDE_CODE_AUTH_MODE = "wif";
  assert.equal(resolveClaudeCodeGatewayAuthMode({ env: {} }), "wif", "the process fallback still serves the other modes");
});
