import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR || os.tmpdir(), `claude-oauth-usage-snapshot-${process.pid}`);
process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
let accountApi;
before(async () => {
  configApi = await import("@llmr/core/config/config.ts");
  accountApi = await import("@llmr/core/providers/account-service.ts");
});

const verifiedUltraUsage = {
  five_hour: { resets_at: null, utilization: 0 },
  limits: [
    { kind: "weekly_scoped", percent: 96, resets_at: "2026-10-31T12:00:00.468301+00:00", scope: { model: { display_name: "Fable" } } }
  ],
  seven_day: { resets_at: "2026-10-31T12:00:00.468172+00:00", utilization: 69 }
};

test("Stored Claude usage connector reports the plan and hides the absent five-hour window in the snapshot", async (t) => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ authorization: init?.headers?.authorization ?? "", url });
    const body = url.endsWith("/api/oauth/profile")
      ? { organization: { plan_display_name: "Ultra" } }
      : verifiedUltraUsage;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  accountApi.resetClaudeAccountPlanCacheForTest();

  const providerName = "Claude Snapshot Ultra";
  const config = await configApi.loadAppConfig();
  await configApi.saveAppConfig({
    ...config,
    Providers: [
      ...config.Providers,
      {
        account: {
          connectors: [
            {
              auth: "provider-api-key",
              endpoint: "https://api.anthropic.com/api/oauth/usage",
              headers: { "anthropic-beta": "oauth-2025-04-20" },
              mapping: { meters: [{ id: "claude_five_hour_quota", label: "5h quota", used: "$.five_hour.utilization" }] },
              type: "http-json"
            }
          ],
          enabled: true
        },
        api_base_url: "https://api.anthropic.com",
        api_key: "claude-snapshot-token",
        models: ["claude-sonnet-5"],
        name: providerName,
        type: "anthropic_messages"
      }
    ]
  });
  accountApi.invalidateProviderAccountSnapshotCache(providerName);

  const [snapshot] = await accountApi.getProviderAccountSnapshots(providerName, { forceRefresh: true });
  assert.equal(snapshot?.plan, "Ultra");
  assert.equal(snapshot?.status, "critical");
  assert.deepEqual(snapshot?.meters.map((meter) => [meter.id, meter.remaining]), [
    ["claude_seven_day_quota", 31],
    ["claude_weekly_scoped_fable", 4]
  ]);
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.anthropic.com/api/oauth/usage",
    "https://api.anthropic.com/api/oauth/profile"
  ]);
  assert.ok(requests.every((request) => request.authorization === "Bearer claude-snapshot-token"));
});
