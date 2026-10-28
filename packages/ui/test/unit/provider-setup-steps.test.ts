import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderCredentialDraft,
  createProviderDraft,
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
