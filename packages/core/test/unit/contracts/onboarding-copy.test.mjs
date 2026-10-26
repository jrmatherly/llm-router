import assert from "node:assert/strict";
import test from "node:test";

test("the no-models startup error names LLMR in both languages", async () => {
  const { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } = await import("@ccr/core/contracts/app.ts");
  const { translateErrorMessage } = await import("@ccr/core/contracts/i18n.ts");
  assert.equal(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "No available models. Configure at least one provider with a model before starting LLMR Gateway or opening an agent through LLMR.");
  const zh = translateErrorMessage("zh", NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
  assert.notEqual(zh, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "the Chinese table is keyed by the new English message");
  assert.match(zh, /LLMR 网关/);
});

test("launch errors renamed to LLMR still match their Chinese translations", async () => {
  const { translateErrorMessage } = await import("@ccr/core/contracts/i18n.ts");
  for (const message of [
    "Profile launcher was not found: /tmp/launch. Open LLMR once or re-save the profile.",
    "LLMR CLI runtime was not found. Rebuild or reinstall LLMR and try again.",
    "LLMR config was not found: /tmp/config.json",
    "LLMR config has no profiles: /tmp/config.json",
    "Codex does not support stopping APP from LLMR.",
    "No LLMR API key was found for profile \"work\". Re-save the profile and try again.",
    "LLMR gateway did not start for Codex."
  ]) {
    assert.notEqual(translateErrorMessage("zh", message), message, message);
  }
});
