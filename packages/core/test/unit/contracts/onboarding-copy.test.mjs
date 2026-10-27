import assert from "node:assert/strict";
import test from "node:test";

test("the no-models startup error names LLMR", async () => {
  const { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } = await import("@ccr/core/contracts/app.ts");
  const { formatErrorMessage } = await import("@ccr/core/contracts/error-message.ts");
  assert.equal(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "No available models. Configure at least one provider with a model before starting LLMR Gateway or opening an agent through LLMR.");
  assert.equal(formatErrorMessage(new Error(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE)), NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
});

test("formatErrorMessage strips the IPC prefix and the checked paths", async () => {
  const { formatErrorMessage } = await import("@ccr/core/contracts/error-message.ts");
  const message = "LLMR CLI runtime was not found. Rebuild or reinstall LLMR and try again.";
  assert.equal(formatErrorMessage(new Error(`${message} Checked: /a, /b`)), message);
  assert.equal(formatErrorMessage(`Error invoking remote method 'app:launch': Error: ${message} Checked: /a`), message);
  assert.equal(formatErrorMessage(`Error invoking remote method 'app:launch': ${message}`), message);
  assert.equal(formatErrorMessage("  Proxy is stopped.  "), "Proxy is stopped.");
});
