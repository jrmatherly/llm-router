import assert from "node:assert/strict";
import test from "node:test";
import { testProviderAccountConnector } from "@llmr/core/providers/account-service.ts";
import { findProviderPreset, findProviderPresetByBaseUrl } from "@llmr/core/providers/presets/index.ts";

const zaiQuotaPayload = {
  code: 200,
  data: {
    limits: [
      { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 28000, currentValue: 1869, remaining: 26130, percentage: 6, nextResetTime: 1793137319966 },
      { type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 140000, currentValue: 93649, remaining: 46350, percentage: 66, nextResetTime: 1793273259984 }
    ],
    level: "max"
  },
  msg: "Operation successful",
  success: true
};

const zaiLegacyQuotaPayload = {
  ...zaiQuotaPayload,
  data: {
    ...zaiQuotaPayload.data,
    limits: zaiQuotaPayload.data.limits.map((limit) => ({ ...limit, type: "TOKENS_LIMIT" }))
  }
};

const minimaxQuotaPayload = {
  model_remains: [
    {
      start_time: 1793059200000,
      end_time: 1793145600000,
      model_name: "video",
      current_interval_remaining_percent: 100,
      current_weekly_remaining_percent: 100,
      weekly_end_time: 1793577600000
    },
    {
      start_time: 1793095200000,
      end_time: 1793113200000,
      model_name: "general",
      current_interval_remaining_percent: 75,
      current_weekly_remaining_percent: 54,
      weekly_end_time: 1793577600000
    }
  ],
  base_resp: { status_code: 0, status_msg: "success" }
};

function stubJsonFetch(t, payload, capture) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    capture.url = String(url);
    capture.authorization = options?.headers?.authorization ?? options?.headers?.Authorization;
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
}

function assertMeter(meters, id, expected) {
  const meter = meters.find((candidate) => candidate.id === id);
  assert.deepEqual(
    { limit: meter?.limit, remaining: meter?.remaining, resetAt: meter?.resetAt, unit: meter?.unit, used: meter?.used, window: meter?.window },
    { limit: 100, unit: "%", ...expected }
  );
}

const glmPresets = [
  { baseUrl: "https://api.z.ai/api/anthropic", endpoint: "https://api.z.ai/api/monitor/usage/quota/limit", id: "zai-global-coding" },
  { baseUrl: "https://api.z.ai/api/paas/v4", endpoint: "https://api.z.ai/api/monitor/usage/quota/limit", id: "zai-global-general" },
  { baseUrl: "https://open.bigmodel.cn/api/anthropic", endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit", id: "zhipu-cn-coding" },
  { baseUrl: "https://open.bigmodel.cn/api/paas/v4", endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit", id: "zhipu-cn-general" }
];

for (const { baseUrl, endpoint, id } of glmPresets) {
  for (const [typeName, payload] of [["CREDIT_LIMIT", zaiQuotaPayload], ["TOKENS_LIMIT", zaiLegacyQuotaPayload]]) {
    test(`${id} maps the 5h and weekly windows when limits are typed ${typeName}`, async (t) => {
      const preset = findProviderPreset(id);
      const connector = preset?.account?.connectors?.[0];
      assert.equal(connector?.type, "http-json");
      assert.equal(connector.endpoint, endpoint);
      assert.equal(connector.auth, "provider-api-key-raw");

      const capture = {};
      stubJsonFetch(t, payload, capture);
      const result = await testProviderAccountConnector({ apiKey: "glm-key", baseUrl, connector, providerName: preset.name });

      assert.equal(capture.url, endpoint);
      assert.equal(capture.authorization, "glm-key");
      assertMeter(result.meters, "five_hour_quota", { remaining: 94, resetAt: "2026-10-27T21:41:59.966Z", used: 6, window: "5h" });
      assertMeter(result.meters, "weekly_quota", { remaining: 34, resetAt: "2026-10-29T11:27:39.984Z", used: 66, window: "weekly" });
    });
  }
}

test("minimax-global maps the 5h and weekly windows of the general model, not the video one listed first", async (t) => {
  const preset = findProviderPreset("minimax-global");
  const connector = preset?.account?.connectors?.[0];
  assert.equal(connector?.type, "http-json");
  assert.equal(connector.endpoint, "https://www.minimax.io/v1/token_plan/remains");
  assert.equal(connector.auth, "provider-api-key");

  const capture = {};
  stubJsonFetch(t, minimaxQuotaPayload, capture);
  const result = await testProviderAccountConnector({
    apiKey: "minimax-key",
    baseUrl: "https://api.minimax.io/anthropic/v1",
    connector,
    providerName: preset.name
  });

  assert.equal(capture.authorization, "Bearer minimax-key");
  assertMeter(result.meters, "five_hour_quota", { remaining: 75, resetAt: "2026-10-27T15:00:00.000Z", used: 25, window: "5h" });
  assertMeter(result.meters, "weekly_quota", { remaining: 54, resetAt: "2026-11-02T00:00:00.000Z", used: 46, window: "weekly" });
});

test("a provider resolved by base URL gets the quota connector", () => {
  for (const [baseUrl, id] of [
    ["https://api.minimax.io/v1", "minimax-global"],
    ["https://api.minimax.io/anthropic/v1", "minimax-global"],
    ["https://api.z.ai/api/anthropic", "zai-global-coding"],
    ["https://open.bigmodel.cn/api/anthropic", "zhipu-cn-coding"]
  ]) {
    const preset = findProviderPresetByBaseUrl(baseUrl);
    assert.equal(preset?.id, id, baseUrl);
    assert.equal(preset.account?.connectors?.[0]?.type, "http-json", baseUrl);
  }
});
