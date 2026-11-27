import assert from "node:assert/strict";
import test from "node:test";
import { formatLogTokenSummary, logRequestModel, logResponseModel } from "@llmr/ui/pages/home/shared/logs.ts";
import {
  formatCompactNumber,
  formatCost,
  formatPercentFixed,
  formatTotalCost,
  formatUsdCost as formatHomeUsdCost,
  priceSourceLabel,
  totalCostCaption
} from "@llmr/ui/pages/home/shared/usage.ts";
import { formatUsdCost as formatTrayUsdCost } from "@llmr/ui/pages/tray/shared.tsx";
import type { RequestLogEntry } from "@llmr/core/contracts/app.ts";

test("formatCompactNumber formats large counts in compact notation", () => {
  assert.equal(formatCompactNumber(123456, "en-US"), "123.5K");
});

test("formatUsdCost formats large values without conflicting fraction digits", () => {
  assert.doesNotThrow(() => formatHomeUsdCost(100));
  assert.doesNotThrow(() => formatTrayUsdCost(100));
  assert.doesNotMatch(formatHomeUsdCost(123.45), /[.,]45/);
  assert.doesNotMatch(formatTrayUsdCost(123.45), /[.,]45/);
});

test("formatPercentFixed keeps two decimal places for ratios", () => {
  assert.equal(formatPercentFixed(0.375), "37.50%");
  assert.equal(formatPercentFixed(0), "0.00%");
  assert.equal(formatPercentFixed(1), "100.00%");
});

test("formatLogTokenSummary uses the provided locale for token counts", () => {
  const entry: RequestLogEntry = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    client: "test",
    costUsd: 0,
    createdAt: "2026-06-30T00:00:00.000Z",
    credentialChain: [],
    credentialSaturated: false,
    durationMs: 10,
    id: 1,
    inputTokens: 123456,
    isStream: false,
    method: "POST",
    model: "test-model",
    ok: true,
    outputTokens: 12000,
    path: "/v1/messages",
    provider: "test-provider",
    reasoningTokens: 0,
    requestBody: { encoding: "utf8", sizeBytes: 0, text: "", truncated: false },
    requestHeaders: {},
    requestId: "req_test",
    retryAttempts: [],
    routeAttemptCount: 0,
    routeHopCount: 0,
    routeTraceTruncated: false,
    responseHeaders: {},
    statusCode: 200,
    totalTokens: 135456,
    url: "https://example.test/v1/messages"
  };

  assert.equal(formatLogTokenSummary(entry, "en-US"), "123.5K in  12K out");
  assert.equal(formatLogTokenSummary(entry, "de-DE"), "123.456 in  12.000 out");
});

test("request log model summaries stay stable without list body text", () => {
  const entry: RequestLogEntry = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    client: "test",
    createdAt: "2026-07-20T00:00:00.000Z",
    credentialChain: [],
    credentialSaturated: false,
    durationMs: 10,
    id: 1,
    inputTokens: 0,
    isStream: true,
    method: "POST",
    model: "legacy-model",
    ok: true,
    outputTokens: 0,
    path: "/v1/messages",
    provider: "test-provider",
    reasoningTokens: 0,
    requestedModel: "request-model",
    requestBody: { encoding: "utf8", sizeBytes: 128, text: "", truncated: false },
    requestHeaders: {},
    requestId: "req_models",
    resolvedModel: "resolved-model",
    responseHeaders: {},
    responseModel: "response-model",
    retryAttempts: [],
    routeAttemptCount: 0,
    routeHopCount: 0,
    routeTraceTruncated: false,
    statusCode: 200,
    totalTokens: 0,
    url: "https://example.test/v1/messages"
  };

  assert.equal(logRequestModel(entry), "request-model");
  assert.equal(logResponseModel(entry), "response-model");
  assert.equal(logResponseModel({ ...entry, responseModel: "" }), "resolved-model");
});

test("a single cost shows a tilde for an estimate, a dash for an unknown, and a user price of zero as zero", () => {
  assert.equal(formatCost(0.000016, "listed"), "$0.000016");
  assert.equal(formatCost(0.000016, "estimate"), "~$0.000016");
  assert.equal(formatCost(undefined, "unknown"), "-");
  assert.equal(formatCost(0, "user"), "$0.00");
  assert.equal(formatCost(undefined, undefined), "-");
});

test("a total shows a tilde when part of it is approximate or missing, and a dash when nothing is priced", () => {
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0, pricedRequestCount: 2, unpricedRequestCount: 0 }), "$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0.003, pricedRequestCount: 2, unpricedRequestCount: 0 }), "~$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0, pricedRequestCount: 2, unpricedRequestCount: 1 }), "~$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 3 }), "-");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 1 }), "~$0.00");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 0 }), "$0.00");
});

test("a total's caption states the approximate part and the requests without a price, and is absent when both are zero", () => {
  assert.equal(totalCostCaption({ estimatedCostUsd: 0.003, unpricedRequestCount: 3 }), "~$0.003000 approximate · 3 requests without a price");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0.003, unpricedRequestCount: 0 }), "~$0.003000 approximate");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0, unpricedRequestCount: 1 }), "1 request without a price");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0, unpricedRequestCount: 0 }), undefined);
});

test("a price source reads as words for every stored value", () => {
  assert.equal(priceSourceLabel("custom", "user"), "Your price");
  assert.equal(priceSourceLabel("models.dev", "listed"), "models.dev list price");
  assert.equal(priceSourceLabel("models.dev-median", "estimate"), "Median of reseller prices on models.dev");
  assert.equal(priceSourceLabel("gateway_billing", "estimate"), "Calculated by the gateway from its billing rates");
  assert.equal(priceSourceLabel("unpriced", "unknown"), "No price found");
  assert.equal(priceSourceLabel("", "unknown"), "Not priced yet");
  assert.equal(priceSourceLabel("", "estimate"), "Not recorded");
});
