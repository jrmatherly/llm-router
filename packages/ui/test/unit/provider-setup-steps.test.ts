import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderCredentialDraft,
  createProviderDraft,
  createProviderDraftFromProvider,
  hasLocalAgentLoginKey,
  isClaudeLoginProviderDraft,
  isLocalAgentLoginDraft,
  localAgentProviderApiKey,
  providerSetupStepIds,
  providerSetupStepsForDraft,
  savedLoginAddressChanged,
  savedLoginAddressChangedMessage
} from "@llmr/ui/pages/home/shared/providers";

const loginPlugins = [{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }];
const savedLogin = { api_base_url: "http://127.0.0.1:8799/v1", api_key: localAgentProviderApiKey, id: "stand-in-login", models: ["stand-in-model"], name: "Stand-in login", type: "openai_chat_completions" as const };

test("the placeholder key is recognized in a single key and in a pool", () => {
  assert.equal(hasLocalAgentLoginKey({ ...createProviderDraft([]), apiKey: localAgentProviderApiKey }), true);
  assert.equal(hasLocalAgentLoginKey({
    ...createProviderDraft([]),
    credentialMode: "pool" as const,
    credentials: [{ ...createProviderCredentialDraft(), apiKey: localAgentProviderApiKey, enabled: true }]
  }), true);
  assert.equal(hasLocalAgentLoginKey({ ...createProviderDraft([]), apiKey: "sk-stand-in-0001" }), false);
});

test("a placeholder key is a local login only with a login behind it", () => {
  const typed = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey, baseUrl: "http://127.0.0.1:8799/v1", name: "Typed by hand" };
  assert.equal(isLocalAgentLoginDraft(typed, loginPlugins), false);
  assert.deepEqual(providerSetupStepsForDraft(typed, loginPlugins), providerSetupStepIds);
  const edit = createProviderDraftFromProvider(savedLogin);
  assert.equal(isLocalAgentLoginDraft(edit, loginPlugins, savedLogin), true);
  assert.deepEqual(providerSetupStepsForDraft(edit, loginPlugins, savedLogin), ["provider", "models", "verify"]);
  assert.equal(isLocalAgentLoginDraft({ ...edit, name: "Renamed" }, loginPlugins, savedLogin), true);
  assert.equal(isLocalAgentLoginDraft(edit, [], savedLogin), false);
  assert.equal(isLocalAgentLoginDraft({ ...typed, baseUrl: "https://chatgpt.com/backend-api/codex" }, []), true);
  assert.equal(isLocalAgentLoginDraft({ ...typed, providerPlugins: loginPlugins }, []), true);
  assert.equal(isLocalAgentLoginDraft({ ...edit, apiKey: "sk-stand-in-0001" }, loginPlugins, savedLogin), false);
});

test("api key and empty drafts keep all four steps", () => {
  const draft = { ...createProviderDraft([]), apiKey: "sk-test" };
  assert.equal(isLocalAgentLoginDraft(draft, []), false);
  assert.deepEqual(providerSetupStepsForDraft(draft, []), ["provider", "credentials", "models", "verify"]);
  assert.deepEqual(providerSetupStepsForDraft({ ...draft, apiKey: "" }, []), providerSetupStepIds);
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

test("the saved login is used only while the draft keeps the saved address", () => {
  const saved = { api_base_url: "http://127.0.0.1:8799/v1", api_key: localAgentProviderApiKey, id: "stand-in-login", models: ["stand-in-model"], name: "Stand-in login", type: "openai_chat_completions" as const };
  const plugins = [{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }];
  const draft = createProviderDraftFromProvider(saved);
  const moved = { ...draft, baseUrl: "http://127.0.0.1:8800/v1" };
  assert.equal(savedLoginAddressChanged(draft, plugins, saved), false);
  assert.equal(savedLoginAddressChanged({ ...draft, baseUrl: "  http://127.0.0.1:8799/v1  " }, plugins, saved), false);
  assert.equal(savedLoginAddressChanged(moved, plugins, saved), true);
  assert.equal(savedLoginAddressChanged({ ...moved, name: "Renamed" }, plugins, saved), true);
  assert.equal(savedLoginAddressChanged(moved, [], saved), false);
  assert.equal(savedLoginAddressChanged({ ...moved, apiKey: "sk-stand-in-0001" }, plugins, saved), false);
  assert.equal(savedLoginAddressChanged(moved, plugins, undefined), false);
  assert.equal(savedLoginAddressChanged({ ...moved, providerPlugins: plugins }, [], saved), false);
  assert.equal(savedLoginAddressChangedMessage, "Save the new address to check it with your local login.");
});
