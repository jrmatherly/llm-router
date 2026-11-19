import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR || os.tmpdir(), `coding-plan-quota-${process.pid}`);
process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
let accountApi;
let presetsApi;
before(async () => {
  configApi = await import("@llmr/core/config/config.ts");
  accountApi = await import("@llmr/core/providers/account-service.ts");
  presetsApi = await import("@llmr/core/providers/presets/index.ts");
});

const zaiQuotaPayload = {
  code: 200,
  data: {
    limits: [
      { type: "TIME_LIMIT", unit: 5, number: 1, usage: 1000, currentValue: 999, remaining: 1, percentage: 99, nextResetTime: 1793000000000 },
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
    limits: zaiQuotaPayload.data.limits.map((limit) => limit.unit === 5 ? limit : { ...limit, type: "TOKENS_LIMIT" })
  }
};

const minimaxGeneralRow = {
  start_time: 1793095200000,
  end_time: 1793113200000,
  model_name: "general",
  current_interval_remaining_percent: 75,
  current_weekly_remaining_percent: 54,
  weekly_end_time: 1793577600000
};

const minimaxVideoRow = {
  start_time: 1793059200000,
  end_time: 1793145600000,
  model_name: "video",
  current_interval_remaining_percent: 100,
  current_weekly_remaining_percent: 100,
  weekly_end_time: 1793577600000
};

function minimaxQuotaPayload(rows) {
  return { model_remains: rows, base_resp: { status_code: 0, status_msg: "success" } };
}

function stubJsonFetch(t, payload, capture = {}) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    capture.url = String(url);
    capture.authorization = options?.headers?.authorization ?? options?.headers?.Authorization;
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  return capture;
}

async function snapshotForStandardProvider(t, { baseUrl, name, payload, type }) {
  const capture = stubJsonFetch(t, payload);
  const config = await configApi.loadAppConfig();
  await configApi.saveAppConfig({
    ...config,
    Providers: [
      ...config.Providers,
      {
        account: { connectors: [{ auth: "provider-api-key", type: "standard" }], enabled: true },
        api_base_url: baseUrl,
        api_key: `${name}-key`,
        models: ["quota-model"],
        name,
        type
      }
    ]
  });
  accountApi.invalidateProviderAccountSnapshotCache(name);
  const [snapshot] = await accountApi.getProviderAccountSnapshots(name, { forceRefresh: true });
  return { capture, snapshot };
}

function assertMeter(meters, id, expected) {
  const meter = meters.find((candidate) => candidate.id === id);
  assert.deepEqual(
    { limit: meter?.limit, remaining: meter?.remaining, resetAt: meter?.resetAt, unit: meter?.unit, used: meter?.used, window: meter?.window },
    { limit: 100, unit: "%", ...expected }
  );
}

function assertEveryMeterHasAReading(meters) {
  for (const meter of meters) {
    assert.ok(meter.used !== undefined || meter.remaining !== undefined, `${meter.id} carries only its limit`);
  }
}

const glmPresets = [
  { baseUrl: "https://api.z.ai/api/anthropic", endpoint: "https://api.z.ai/api/monitor/usage/quota/limit", id: "zai-global-coding" },
  { baseUrl: "https://api.z.ai/api/paas/v4", endpoint: "https://api.z.ai/api/monitor/usage/quota/limit", id: "zai-global-general" },
  { baseUrl: "https://open.bigmodel.cn/api/anthropic", endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit", id: "zhipu-cn-coding" },
  { baseUrl: "https://open.bigmodel.cn/api/paas/v4", endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit", id: "zhipu-cn-general" }
];

for (const { baseUrl, endpoint, id } of glmPresets) {
  for (const [typeName, payload] of [["CREDIT_LIMIT", zaiQuotaPayload], ["TOKENS_LIMIT", zaiLegacyQuotaPayload]]) {
    test(`${id} maps the 5h and weekly windows when limits are typed ${typeName}, ignoring the TIME_LIMIT row listed first`, async (t) => {
      const preset = presetsApi.findProviderPreset(id);
      const connector = preset?.account?.connectors?.[0];
      assert.equal(connector?.type, "http-json");
      assert.equal(connector.endpoint, endpoint);
      assert.equal(connector.auth, "provider-api-key-raw");

      const capture = stubJsonFetch(t, payload);
      const result = await accountApi.testProviderAccountConnector({ apiKey: "glm-key", baseUrl, connector, providerName: preset.name });

      assert.equal(capture.url, endpoint);
      assert.equal(capture.authorization, "glm-key");
      assert.equal(result.meters.length, 2);
      assertMeter(result.meters, "five_hour_quota", { remaining: 94, resetAt: "2026-10-27T21:41:59.966Z", used: 6, window: "5h" });
      assertMeter(result.meters, "weekly_quota", { remaining: 34, resetAt: "2026-10-29T11:27:39.984Z", used: 66, window: "weekly" });
    });
  }
}

for (const [order, rows] of [["video", [minimaxVideoRow, minimaxGeneralRow]], ["general", [minimaxGeneralRow, minimaxVideoRow]]]) {
  test(`minimax-global maps the 5h and weekly windows of the general model when the ${order} row is listed first`, async (t) => {
    const preset = presetsApi.findProviderPreset("minimax-global");
    const connector = preset?.account?.connectors?.[0];
    assert.equal(connector?.type, "http-json");
    assert.equal(connector.endpoint, "https://www.minimax.io/v1/token_plan/remains");
    assert.equal(connector.auth, "provider-api-key");

    const capture = stubJsonFetch(t, minimaxQuotaPayload(rows));
    const result = await accountApi.testProviderAccountConnector({
      apiKey: "minimax-key",
      baseUrl: "https://api.minimax.io/anthropic/v1",
      connector,
      providerName: preset.name
    });

    assert.equal(capture.authorization, "Bearer minimax-key");
    assertMeter(result.meters, "five_hour_quota", { remaining: 75, resetAt: "2026-10-27T15:00:00.000Z", used: 25, window: "5h" });
    assertMeter(result.meters, "weekly_quota", { remaining: 54, resetAt: "2026-11-02T00:00:00.000Z", used: 46, window: "weekly" });
  });
}

test("a provider resolved by base URL gets the quota connector", () => {
  for (const [baseUrl, id] of [
    ["https://api.minimax.io/v1", "minimax-global"],
    ["https://api.minimax.io/anthropic/v1", "minimax-global"],
    ["https://api.z.ai/api/anthropic", "zai-global-coding"],
    ["https://open.bigmodel.cn/api/anthropic", "zhipu-cn-coding"]
  ]) {
    const preset = presetsApi.findProviderPresetByBaseUrl(baseUrl);
    assert.equal(preset?.id, id, baseUrl);
    assert.equal(preset.account?.connectors?.[0]?.type, "http-json", baseUrl);
  }
});

test("a standard-account MiniMax Global provider reads plan quota through the preset connector", async (t) => {
  const { capture, snapshot } = await snapshotForStandardProvider(t, {
    baseUrl: "https://api.minimax.io/anthropic/v1",
    name: "MiniMax Quota Standard",
    payload: minimaxQuotaPayload([minimaxVideoRow, minimaxGeneralRow]),
    type: "anthropic_messages"
  });

  assert.equal(capture.url, "https://www.minimax.io/v1/token_plan/remains");
  assert.equal(capture.authorization, "Bearer MiniMax Quota Standard-key");
  assert.equal(snapshot?.source, "http-json");
  assert.equal(snapshot?.status, "ok");
  assert.deepEqual(snapshot?.meters.map((meter) => [meter.id, meter.remaining]), [["five_hour_quota", 75], ["weekly_quota", 54]]);
});

test("a standard-account Z.ai provider reads plan quota through the preset connector", async (t) => {
  const { capture, snapshot } = await snapshotForStandardProvider(t, {
    baseUrl: "https://api.z.ai/api/anthropic",
    name: "Z.ai Quota Standard",
    payload: zaiQuotaPayload,
    type: "anthropic_messages"
  });

  assert.equal(capture.url, "https://api.z.ai/api/monitor/usage/quota/limit");
  assert.equal(capture.authorization, "Z.ai Quota Standard-key");
  assert.equal(snapshot?.source, "http-json");
  assert.equal(snapshot?.status, "ok");
  assert.deepEqual(snapshot?.meters.map((meter) => [meter.id, meter.remaining]), [["five_hour_quota", 94], ["weekly_quota", 34]]);
});

test("a Z.ai error body shows the vendor message instead of a full meter", async (t) => {
  const { snapshot } = await snapshotForStandardProvider(t, {
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    name: "Zhipu Quota Error",
    payload: { code: 1001, msg: "Authorization token is invalid", success: false },
    type: "anthropic_messages"
  });

  assertEveryMeterHasAReading(snapshot?.meters ?? []);
  assert.deepEqual(snapshot?.meters, []);
  assert.equal(snapshot?.status, "unsupported");
  assert.equal(snapshot?.message, "Authorization token is invalid");
});

test("a MiniMax error body shows the vendor message instead of a full meter", async (t) => {
  const { snapshot } = await snapshotForStandardProvider(t, {
    baseUrl: "https://api.minimax.io/v1",
    name: "MiniMax Quota Error",
    payload: { base_resp: { status_code: 1004, status_msg: "login fail: Please carry the API secret key" } },
    type: "openai_chat_completions"
  });

  assertEveryMeterHasAReading(snapshot?.meters ?? []);
  assert.deepEqual(snapshot?.meters, []);
  assert.equal(snapshot?.status, "unsupported");
  assert.equal(snapshot?.message, "login fail: Please carry the API secret key");
});

test("a Z.ai answer without the weekly row keeps the 5h meter and drops the weekly one", async (t) => {
  const { snapshot } = await snapshotForStandardProvider(t, {
    baseUrl: "https://api.z.ai/api/paas/v4",
    name: "Z.ai Quota No Weekly",
    payload: { ...zaiQuotaPayload, data: { ...zaiQuotaPayload.data, limits: zaiQuotaPayload.data.limits.filter((limit) => limit.unit !== 6) } },
    type: "openai_chat_completions"
  });

  assertEveryMeterHasAReading(snapshot?.meters ?? []);
  assert.deepEqual(snapshot?.meters.map((meter) => [meter.id, meter.remaining]), [["five_hour_quota", 94]]);
  assert.equal(snapshot?.status, "ok");
});
