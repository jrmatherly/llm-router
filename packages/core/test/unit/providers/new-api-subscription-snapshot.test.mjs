import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR || os.tmpdir(), `new-api-subscription-snapshot-${process.pid}`);
process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
let accountApi;
let newApi;
before(async () => {
  configApi = await import("@llmr/core/config/config.ts");
  accountApi = await import("@llmr/core/providers/account-service.ts");
  newApi = await import("@llmr/core/providers/new-api.ts");
});

const base = "https://gateway.example/v1";
const keyUsage = { code: true, data: { total_available: 9000, total_granted: 10000, total_used: 1000, unlimited_quota: false }, message: "ok" };
const payloadOf = (list) => ({
  data: { all_subscriptions: list, billing_preference: "subscription_first", subscriptions: list },
  message: "",
  success: true
});
const activeSubscriptions = payloadOf([
  { subscription: { amount_total: 1000, amount_used: 100, end_time: 2000000000, next_reset_time: 0 } },
  { subscription: { amount_total: 500, amount_used: 200, end_time: 2000000000, next_reset_time: 0 } }
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function mockFetch(t, subscriptionResponse) {
  const previousFetch = globalThis.fetch;
  const requests = {};
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/usage/token/")) {
      requests.keyUsage = init?.headers ?? {};
      return jsonResponse(keyUsage);
    }
    if (url.endsWith("/api/subscription/self")) {
      requests.subscription = init?.headers ?? {};
      return subscriptionResponse();
    }
    return jsonResponse({ message: `unexpected ${url}` }, 404);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  return requests;
}

function subscriptionConnector() {
  return { ...newApi.newApiSubscriptionSelfConnectorConfig(base), headers: { Authorization: "Bearer nap_test" } };
}

function keyUsageConnector() {
  return newApi.newApiKeyUsageAccountConfig(base).connectors[0];
}

async function snapshotFor(providerName, connectors) {
  const config = await configApi.loadAppConfig();
  await configApi.saveAppConfig({
    ...config,
    Providers: [
      ...config.Providers.filter((provider) => provider.name !== providerName),
      {
        account: { connectors, enabled: true },
        api_base_url: base,
        api_key: "provider-key",
        models: ["gpt-test"],
        name: providerName,
        type: "openai_chat_completions"
      }
    ]
  });
  accountApi.invalidateProviderAccountSnapshotCache(providerName);
  const [snapshot] = await accountApi.getProviderAccountSnapshots(providerName, { forceRefresh: true });
  return snapshot;
}

test("subscription connector merges with key usage and sends only the access token", async (t) => {
  const requests = mockFetch(t, () => jsonResponse(activeSubscriptions));
  const snapshot = await snapshotFor("New API Merge", [keyUsageConnector(), subscriptionConnector()]);
  assert.deepEqual(snapshot.meters.map((meter) => [meter.id, meter.remaining]).sort(), [["new_api_key_quota", 9000], ["new_api_subscription_quota", 1200]]);
  assert.equal(requests.subscription.Authorization, "Bearer nap_test");
  assert.equal(requests.subscription.authorization, undefined);
});

test("no active subscription reports a message without an error", async (t) => {
  mockFetch(t, () => jsonResponse(payloadOf([])));
  const snapshot = await snapshotFor("New API Empty", [subscriptionConnector()]);
  assert.deepEqual(snapshot.meters, []);
  assert.equal(snapshot.message, "No active New API subscription.");
  assert.equal(snapshot.errors, undefined);
  assert.equal(snapshot.status, "unsupported");
});

test("a denied subscription request keeps the other connector's meter", async (t) => {
  mockFetch(t, () => jsonResponse({ message: "scope denied", success: false }, 403));
  const snapshot = await snapshotFor("New API Denied", [keyUsageConnector(), subscriptionConnector()]);
  assert.deepEqual(snapshot.meters.map((meter) => meter.id), ["new_api_key_quota"]);
  assert.match(snapshot.errors[0].message, /HTTP 403/);
  assert.equal(snapshot.status, "error");
});

test("a critical subscription is not hidden by the merge", async (t) => {
  mockFetch(t, () => jsonResponse(payloadOf([{ subscription: { amount_total: 100, amount_used: 99 } }])));
  const snapshot = await snapshotFor("New API Critical", [keyUsageConnector(), subscriptionConnector()]);
  assert.equal(snapshot.status, "critical");
});

test("the connector test action and browser connectors dispatch the parser too", async (t) => {
  mockFetch(t, () => jsonResponse(activeSubscriptions));
  const tested = await accountApi.testProviderAccountConnector({ baseUrl: base, connector: newApi.newApiSubscriptionSelfConnectorConfig(base) });
  assert.equal(tested.meters[0].id, "new_api_subscription_quota");
  assert.equal(tested.meters[0].remaining, 1200);

  accountApi.setProviderAccountWebContentFetchHandler(async () => ({ payload: activeSubscriptions }));
  t.after(() => {
    accountApi.setProviderAccountWebContentFetchHandler(undefined);
  });
  const snapshot = await snapshotFor("New API Browser", [{ ...newApi.newApiSubscriptionSelfConnectorConfig(base), type: "webcontent-json" }]);
  assert.deepEqual(snapshot.meters.map((meter) => [meter.id, meter.remaining, meter.source]), [["new_api_subscription_quota", 1200, "webcontent-json"]]);
});
