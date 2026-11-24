import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderCredentialDraft,
  createProviderDraft,
  isClaudeLoginProviderDraft,
  isLocalAgentLoginDraft,
  localAgentProviderApiKey,
  providerSetupStepIds,
  providerSetupStepsForDraft
} from "@llmr/ui/pages/home/shared/providers";

test("local agent login draft skips credentials", () => {
  const draft = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey };
  assert.equal(isLocalAgentLoginDraft(draft), true);
  assert.deepEqual(providerSetupStepsForDraft(draft), ["provider", "models", "verify"]);
});

test("credential pool draft with the marker skips credentials", () => {
  const draft = {
    ...createProviderDraft([]),
    credentialMode: "pool" as const,
    credentials: [{ ...createProviderCredentialDraft(), apiKey: localAgentProviderApiKey, enabled: true }]
  };
  assert.deepEqual(providerSetupStepsForDraft(draft), ["provider", "models", "verify"]);
});

test("api key and empty drafts keep all four steps", () => {
  const draft = { ...createProviderDraft([]), apiKey: "sk-test" };
  assert.equal(isLocalAgentLoginDraft(draft), false);
  assert.deepEqual(providerSetupStepsForDraft(draft), ["provider", "credentials", "models", "verify"]);
  assert.deepEqual(providerSetupStepsForDraft({ ...draft, apiKey: "" }), providerSetupStepIds);
});

test("a Claude login draft is told apart from other local-login drafts", () => {
  const marked = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey, name: "Claude Code API" };
  const template = { key: "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-code-oauth", providerName: "__LLMR_PROVIDER_NAME__" };
  const saved = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
  assert.equal(isClaudeLoginProviderDraft({ ...marked, providerPlugins: [template] }, []), true);
  assert.equal(isClaudeLoginProviderDraft(marked, saved), true);
  assert.equal(isClaudeLoginProviderDraft(marked, [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Claude Code API" }]), false);
  assert.equal(isClaudeLoginProviderDraft({ ...marked, apiKey: "sk-test" }, saved), false);
});
