import assert from "node:assert/strict";
import test from "node:test";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } from "@llmr/core/contracts/app.ts";
import { fallbackGatewayStatus } from "@llmr/ui/pages/home/shared/fallbacks.ts";
import { gatewayServiceMessage } from "@llmr/ui/pages/home/shared/services.tsx";

test("Start on a gateway with no provider model shows why it stayed stopped", () => {
  const status = { ...fallbackGatewayStatus, lastError: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, state: "stopped" as const };
  assert.equal(gatewayServiceMessage(status, false), NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
});
