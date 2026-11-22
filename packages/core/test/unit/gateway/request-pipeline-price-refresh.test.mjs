import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test, { mock } from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { GatewayRequestPipeline } from "@llmr/core/gateway/request/pipeline.ts";
import { LLMRouterPlugin } from "@llmr/core/gateway/llm-router-plugin.ts";
import { preloadUsagePriceCatalog } from "@llmr/core/models/pricing-service.ts";
import { onUsageRecorded } from "@llmr/core/usage/store.ts";

const catalogHosts = ["models.dev", "openrouter.ai", "raw.githubusercontent.com"];
const catalogs = {
  litellm: { "other-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000001 } },
  modelsDev: { deepseek: { models: { "shared-model": { cost: { input: 0.3, output: 0.9 } } } } },
  openRouter: { data: [{ id: "lab/other-model", pricing: { completion: "0.000001", prompt: "0.000001" } }] }
};

function isCatalogUrl(url) {
  return catalogHosts.some((host) => url.includes(host));
}

function catalogResponse(url) {
  if (url.includes("litellm")) return Response.json(catalogs.litellm);
  if (url.includes("models.dev")) return Response.json(catalogs.modelsDev);
  return Response.json(catalogs.openRouter);
}

async function sendOneRequest({ refreshUsagePriceCatalog, userPricing }) {
  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  config.Providers = [{
    api_base_url: "https://api.deepseek.com",
    models: ["shared-model"],
    name: "DS",
    type: "anthropic_messages",
    ...(userPricing ? { modelMetadata: { "shared-model": { pricing: userPricing } } } : {})
  }];
  const router = new LLMRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test",
    getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" }),
    ...(refreshUsagePriceCatalog ? { refreshUsagePriceCatalog } : {})
  });
  const fetched = [];
  let stopListening;
  const recorded = new Promise((resolve) => { stopListening = onUsageRecorded(resolve); });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    fetched.push(url);
    if (isCatalogUrl(url)) return catalogResponse(url);
    if (new URL(url).pathname.startsWith("/__llmr/")) return new Response(null, { status: 404 });
    const body = JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg", model: "shared-model", role: "assistant", type: "message", usage: { input_tokens: 1000, output_tokens: 100 } });
    return new Response(body, { headers: { "content-type": "application/json", "x-gateway-target-provider-name": "DS" }, status: 200 });
  };
  try {
    const request = Readable.from([Buffer.from(JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "DS/shared-model" }))]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json" };
    let status;
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = (value) => { status = value; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages");
    assert.equal(status, 200);
    // The usage write resolves the request's price first.
    await recorded;
    // A catalog fetch starts only after the proxy settings load, so give it time to show.
    const deadline = performance.now() + (refreshUsagePriceCatalog ? 0 : 2_000);
    while (!fetched.some(isCatalogUrl) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return fetched;
  } finally {
    stopListening();
    globalThis.fetch = previousFetch;
  }
}

async function withStaleCatalog(run) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => catalogResponse(String(input));
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
  } finally {
    globalThis.fetch = previousFetch;
  }
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });
  try {
    await run();
  } finally {
    mock.timers.reset();
  }
}

test("a request against a stale catalog starts one catalog refresh, through the injected dependency", async () => {
  await withStaleCatalog(async () => {
    let refreshes = 0;
    const fetched = await sendOneRequest({ refreshUsagePriceCatalog: () => { refreshes += 1; } });
    assert.equal(refreshes, 1);
    assert.deepEqual(fetched.filter(isCatalogUrl), []);
  });
});

test("a request with a price the user set starts no catalog refresh", async () => {
  await withStaleCatalog(async () => {
    let refreshes = 0;
    await sendOneRequest({
      refreshUsagePriceCatalog: () => { refreshes += 1; },
      userPricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 }
    });
    assert.equal(refreshes, 0);
  });
});

test("a pipeline built without a refresh dependency fetches no price catalog", async () => {
  await withStaleCatalog(async () => {
    const fetched = await sendOneRequest({});
    assert.deepEqual(fetched.filter(isCatalogUrl), []);
    assert.ok(fetched.length > 0, "the request reached the stubbed gateway");
  });
});
