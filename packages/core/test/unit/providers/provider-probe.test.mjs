import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeAppsGatewaySessionFile, persistClaudeAppsGatewaySession } from "@llmr/core/agents/claude-apps-gateway/session-store.ts";
import {
  newApiKeyUsageFallbackMessageForTest,
  newApiKeyUsageMetersForTest,
  newApiSubscriptionSelfFallbackMessageForTest,
  newApiSubscriptionSelfMetersForTest,
  newApiUserSelfMetersForTest
} from "@llmr/core/providers/account-service.ts";
import {
  detectedProviderFromHeaders,
  newApiKeyUsageAccountConfig,
  newApiSubscriptionSelfConnectorConfig,
  newApiUserSelfConnectorConfig
} from "@llmr/core/providers/new-api.ts";
import {
  checkGatewayProviderConnectivity,
  isProviderProtocolEndpointSupportedForProbe,
  probeGatewayProvider,
  probeGatewayProviderCandidates
} from "@llmr/core/providers/probe.ts";

// Catalog assertions use the fixture catalog; the bundled models.json follows live sources.
process.env.LLMR_MODEL_CATALOG_PATH = path.resolve("packages/core/test/fixtures/model-catalog.json");

test("#1778 Gemini probe does not present an AI Studio API key as an OAuth bearer token", async (t) => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers) });
    return new Response(JSON.stringify({ error: { message: "Missing contents" } }), { status: 400 });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  await probeGatewayProvider({ baseUrl: "https://generativelanguage.googleapis.com", apiKey: "AIza-test-key", forceRefresh: true, mode: "protocols", protocols: ["gemini_generate_content"] });
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("x-goog-api-key"), "AIza-test-key");
  }
});

test("protocol support probe does not treat Gemini auth errors as every protocol", () => {
  const message = "HTTP 403: API key not valid. Please pass a valid API key.";
  const hints = ["gemini_generate_content"];

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "anthropic_messages", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "openai_chat_completions", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "openai_responses", hints),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "gemini_generate_content", hints),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(403, message, "gemini_interactions", hints),
    false
  );
});

test("protocol support probe keeps auth-only fallback for unhinted endpoints", () => {
  const message = "HTTP 401: Unauthorized";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(401, message, "openai_chat_completions", []),
    true
  );
});

test("NVIDIA probe never requests or persists the Responses protocol", async (t) => {
  const previousFetch = globalThis.fetch;
  const paths = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_responses", "openai_chat_completions"]
  });

  assert.deepEqual(paths, ["/v1/chat/completions"]);
  assert.deepEqual(
    probe.protocols.map(({ protocol, status, supported }) => ({ protocol, status, supported })),
    [{ protocol: "openai_chat_completions", status: 401, supported: true }]
  );
  assert.deepEqual(
    probe.capabilities?.map(({ type }) => type),
    ["openai_chat_completions"]
  );
  assert.equal(probe.detectedProtocol, "openai_chat_completions");
  assert.equal(
    probe.catalogModelMetadata?.["qwen/qwen2.5-coder-32b-instruct"]?.contextWindow,
    131072
  );
});

test("protocol support probe treats HTTP 400 validation as protocol support", () => {
  const message = "HTTP 400: * GenerateContentRequest.contents: contents is not specified";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_generate_content", ["gemini_generate_content"]),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "openai_chat_completions", ["openai_chat_completions"]),
    true
  );
});

test("protocol support probe treats HTTP 400 input validation as protocol support", () => {
  const message = "HTTP 400: Gemini Interactions request requires input.";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_interactions", ["gemini_interactions"]),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "gemini_generate_content", ["gemini_generate_content"]),
    true
  );
});

test("protocol support probe still rejects HTTP 400 route misses", () => {
  const message = "HTTP 400: unknown route";

  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(400, message, "openai_chat_completions", ["openai_chat_completions"]),
    false
  );
});

test("media protocol support recognizes validation responses and HTTP 401 endpoints", () => {
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      422,
      "prompt is required",
      "openai_image_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_video_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_video_generations",
      ["openai_video_generations"]
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "Unauthorized",
      "openai_image_generations",
      []
    ),
    true
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      401,
      "unknown route",
      "openai_image_generations",
      []
    ),
    false
  );
  assert.equal(
    isProviderProtocolEndpointSupportedForProbe(
      403,
      "Forbidden",
      "openai_video_generations",
      []
    ),
    false
  );
});

test("provider probe exposes image and video capabilities when their endpoints return HTTP 401", async (t) => {
  const previousFetch = globalThis.fetch;
  const paths = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const probe = await probeGatewayProvider({
    baseUrl: "http://127.0.0.1:49124/v1",
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_image_generations", "openai_video_generations"]
  });

  assert.deepEqual(paths, ["/v1/images/generations", "/v1/videos/generations"]);
  assert.deepEqual(
    probe.protocols.map(({ protocol, status, supported }) => ({ protocol, status, supported })),
    [
      { protocol: "openai_image_generations", status: 401, supported: true },
      { protocol: "openai_video_generations", status: 401, supported: true }
    ]
  );
  assert.deepEqual(
    probe.capabilities?.map(({ type }) => type),
    ["openai_image_generations", "openai_video_generations"]
  );
});

test("candidate protocol probe carries the entered API key and Authorization fallback", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      pathname: url.pathname,
      protocol: url.pathname.includes("/messages")
        ? "anthropic"
        : url.pathname.includes(":generateContent")
          ? "gemini"
          : "openai",
      xApiKey: headers.get("x-api-key"),
      xGoogApiKey: headers.get("x-goog-api-key")
    });

    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      headers: { "content-type": "application/json" },
      status: 401
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await probeGatewayProviderCandidates({
    apiKey: "sk-probe-key",
    candidates: [{
      baseUrl: "http://127.0.0.1:49124",
      protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"],
      source: "custom"
    }],
    forceRefresh: true,
    mode: "protocols",
    protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"]
  });

  assert.deepEqual(
    calls.map((call) => call.protocol),
    ["openai", "anthropic", "gemini"]
  );
  assert.equal(calls[0]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[1]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[1]?.xApiKey, "sk-probe-key");
  assert.equal(calls[2]?.authorization, "Bearer sk-probe-key");
  assert.equal(calls[2]?.xGoogApiKey, "sk-probe-key");
});

test("model discovery carries Authorization fallback for protocol-specific API keys", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      key: url.searchParams.get("key"),
      pathname: url.pathname,
      xApiKey: headers.get("x-api-key"),
      xGoogApiKey: headers.get("x-goog-api-key")
    });

    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await probeGatewayProvider({
    apiKey: "Bearer sk-model-key",
    baseUrl: "http://127.0.0.1:49124",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions", "anthropic_messages", "gemini_generate_content"]
  });

  const modelCalls = calls.filter((call) => call.pathname.endsWith("/models"));
  assert.equal(modelCalls.length >= 3, true);
  assert.equal(calls.every((call) => call.authorization === "Bearer sk-model-key"), true);
  assert.equal(modelCalls.some((call) => call.xApiKey === "sk-model-key"), true);
  assert.equal(
    modelCalls.some((call) => call.key === "sk-model-key" && call.xGoogApiKey === "sk-model-key"),
    true
  );
});

test("connectivity probe applies provider plugin auth for local agent imports", async (t) => {
  const previousFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (input, init) => {
    called = true;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);

    assert.equal(url.origin, "http://127.0.0.1:49123");
    assert.equal(url.pathname, "/v1/chat/completions");
    assert.equal(url.searchParams.get("key"), "plugin-query-key");
    assert.equal(headers.get("authorization"), "Bearer plugin-token");
    assert.equal(headers.get("x-local-agent"), "opencode");

    return new Response(JSON.stringify({ id: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "llmr-local-agent-login",
    candidates: [{
      baseUrl: "http://127.0.0.1:49123/v1",
      name: "Local Agent",
      protocols: ["openai_chat_completions"],
      source: "preset"
    }],
    forceRefresh: true,
    models: ["local-model"],
    providerPlugins: [{
      auth: {
        headers: {
          authorization: "Bearer plugin-token",
          "x-local-agent": "opencode"
        },
        query: {
          key: "plugin-query-key"
        },
        removeHeaders: ["authorization"]
      }
    }],
    protocols: ["openai_chat_completions"]
  });

  assert.equal(called, true);
  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.equal(report.results[0]?.supported, true);
});

test("connectivity probe applies provider plugin request transforms", async (t) => {
  const previousFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (input, init) => {
    called = true;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}"));

    assert.equal(url.origin, "http://127.0.0.1:49124");
    assert.equal(url.pathname, "/v1/responses");
    assert.equal(url.searchParams.get("probe_model"), "probe-model");
    assert.equal(headers.get("x-probe-model"), "probe-model");
    assert.equal(body.model, "probe-model");
    assert.equal(body.max_output_tokens, undefined);

    return new Response(JSON.stringify({ id: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "sk-test",
    candidates: [{
      baseUrl: "http://127.0.0.1:49124/v1",
      name: "Local Agent",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["probe-model"],
    providerPlugins: [{
      request: {
        bodyRemove: ["max_output_tokens"],
        headers: {
          "x-probe-model": "{{ model }}"
        },
        query: {
          probe_model: "{{ request.body.model }}"
        }
      }
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(called, true);
  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
});

test("connectivity probe uses the live Claude apps gateway session token", async (t) => {
  const gatewayUrl = "http://127.0.0.1:49131";
  const sourceFile = claudeAppsGatewaySessionFile(gatewayUrl);
  persistClaudeAppsGatewaySession({
    accessToken: "live-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    gatewayUrl,
    models: ["claude-sonnet-4-6"],
    sourceFile
  });
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ authorization: headers.get("authorization"), pathname: new URL(String(input)).pathname, xApiKey: headers.get("x-api-key") });
    return new Response(JSON.stringify({ id: "ok" }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    fs.rmSync(sourceFile, { force: true });
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "llmr-local-agent-login",
    candidates: [{ baseUrl: gatewayUrl, name: "Claude apps gateway", protocols: ["anthropic_messages"], source: "custom" }],
    forceRefresh: true,
    models: ["claude-sonnet-4-6"],
    providerPlugins: [{
      auth: { headers: { authorization: "Bearer baked-expired" }, removeHeaders: ["x-api-key"], strict: true },
      claudeAppsGateway: { url: gatewayUrl },
      key: "llmr-local-agent-gw-claude-apps-gateway-oauth",
      providerName: "gw"
    }],
    protocols: ["anthropic_messages"]
  });

  assert.equal(report.passed.length, 1);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.authorization === "Bearer live-token" && call.xApiKey === null), JSON.stringify(calls));
});

function codexUpstream(t, codex, calls) {
  useFetch(t, codex, async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      chatgptAccountId: headers.get("chatgpt-account-id"),
      pathname: url.pathname
    });
    if (url.pathname.endsWith("/codex/responses")) {
      const ok = headers.get("authorization") === `Bearer ${codex.issued.at(-1) ?? codex.readAuth().tokens.access_token}`;
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }
    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  });
}

function codexProbe(baseUrl, providerPlugins, models = ["gpt-5-codex"]) {
  return checkGatewayProviderConnectivity({
    apiKey: "llmr-local-agent-login",
    candidates: [{
      baseUrl,
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models,
    providerPlugins,
    protocols: ["openai_responses"]
  });
}

const localCodexPlugin = {
  codexOauth: {
    accessToken: "stored-plugin-token",
    refreshToken: "stored-plugin-refresh",
    tokenEndpoint: "http://127.0.0.1:9/oauth/token"
  },
  key: "llmr-local-agent-codex-api-codex-oauth",
  providerName: "Codex API"
};

test("connectivity probe refreshes Codex OAuth plugin auth", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-refreshed" });
  codex.seed();
  const calls = [];
  codexUpstream(t, codex, calls);

  const report = await codexProbe("http://127.0.0.1:49122/codex", [localCodexPlugin]);

  assert.equal(report.passed.length, 1, JSON.stringify(report.failed));
  assert.equal(report.failed.length, 0);
  assert.deepEqual(codex.requests, [{
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    grant_type: "refresh_token",
    refresh_token: "r0",
    scope: "openid profile email offline_access api.connectors.read api.connectors.invoke"
  }]);
  assert.deepEqual(calls.map((call) => call.pathname), ["/codex/responses"]);
  assert.equal(calls[0]?.authorization, `Bearer ${codex.issued[0]}`);
  assert.equal(calls[0]?.chatgptAccountId, "acct-refreshed");
});

test("connectivity probe refreshes with the rotated Codex refresh token", async (t) => {
  const codex = await useCodexLogin(t, { lifetimeSeconds: 30 });
  codex.seed();
  const calls = [];
  codexUpstream(t, codex, calls);

  const first = await codexProbe("https://chatgpt.com/backend-api/codex", [localCodexPlugin]);
  const second = await codexProbe("https://chatgpt.com/backend-api/codex", [localCodexPlugin]);

  assert.equal(first.passed.length, 1, JSON.stringify(first.failed));
  assert.equal(second.passed.length, 1, JSON.stringify(second.failed));
  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0", "r1"]);
  assert.equal(codex.readAuth().tokens.refresh_token, "r2");
  assert.equal(codex.readAuth().tokens.access_token, codex.issued[1]);
});

test("connectivity probe never refreshes a Codex OAuth section on a plugin that is not a local agent", async (t) => {
  const codex = await useCodexLogin(t);
  codex.seed();
  const calls = [];
  codexUpstream(t, codex, calls);
  const staticToken = codexAccessToken(-10, "acct-static");

  await codexProbe("http://127.0.0.1:49126/codex", [{
    codexOauth: { accessToken: staticToken, refreshToken: "static-refresh" },
    key: "custom-codex-oauth",
    providerName: "Codex API"
  }]);

  assert.deepEqual(codex.requests, []);
  assert.equal(calls[0]?.authorization, `Bearer ${staticToken}`);
});

test("connectivity probe applies Codex request defaults for OAuth plugins", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-codex-defaults" });
  const accessToken = codexAccessToken(3600, "acct-codex-defaults");
  codex.seed({ accessToken });
  let requestBody;

  useFetch(t, codex, async (url, init) => {
    const headers = new Headers(init?.headers);
    requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (url.toString() === "https://chatgpt.com/backend-api/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${accessToken}` &&
        headers.get("chatgpt-account-id") === "acct-codex-defaults" &&
        requestBody?.max_output_tokens === undefined;
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Bad request" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 400
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  });

  const report = await codexProbe("https://chatgpt.com/backend-api/codex", [localCodexPlugin]);

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.equal(requestBody?.model, "gpt-5-codex");
  assert.equal(requestBody?.max_output_tokens, undefined);
});

test("connectivity probe prefers live Codex auth over saved OAuth plugin tokens", async (t) => {
  useTemporaryCodexHome(t, "llmr-codex-probe-live-over-plugin-");
  const previousFetch = globalThis.fetch;
  const savedToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-saved-plugin"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const liveToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live-token"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  const calls = [];

  fs.mkdirSync(path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".codex", "auth.json"), JSON.stringify({
    tokens: {
      access_token: liveToken,
      account_id: "acct-live-file",
      refresh_token: "refresh-live"
    }
  }));

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      chatgptAccountId: headers.get("chatgpt-account-id"),
      pathname: url.pathname,
      url: url.toString()
    });

    if (url.toString() === "https://chatgpt.com/backend-api/codex/responses") {
      const ok =
        headers.get("authorization") === `Bearer ${liveToken}` &&
        headers.get("chatgpt-account-id") === "acct-live-file";
      return new Response(JSON.stringify(ok ? { id: "ok" } : { error: { message: "Unauthorized" } }), {
        headers: { "content-type": "application/json" },
        status: ok ? 200 : 401
      });
    }

    return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), {
      headers: { "content-type": "application/json" },
      status: 404
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const report = await checkGatewayProviderConnectivity({
    apiKey: "llmr-local-agent-login",
    candidates: [{
      baseUrl: "https://chatgpt.com/backend-api/codex",
      name: "Codex API",
      protocols: ["openai_responses"],
      source: "custom"
    }],
    forceRefresh: true,
    models: ["gpt-5-codex"],
    providerPlugins: [{
      codexOauth: {
        accessToken: savedToken,
        accountId: "acct-saved-plugin"
      },
      key: "llmr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.deepEqual(calls.map((call) => call.pathname), ["/backend-api/codex/responses"]);
  assert.equal(calls[0]?.authorization, `Bearer ${liveToken}`);
  assert.equal(calls[0]?.chatgptAccountId, "acct-live-file");
  assert.equal(calls[0]?.body?.max_output_tokens, undefined);
});

test("connectivity probe shares concurrent Codex OAuth refreshes", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-shared-refresh", delayMs: 25 });
  codex.seed();
  const calls = [];
  codexUpstream(t, codex, calls);

  const report = await codexProbe("http://127.0.0.1:49125/codex", [localCodexPlugin], ["gpt-5-a", "gpt-5-b"]);

  assert.equal(codex.requests.length, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.chatgptAccountId === "acct-shared-refresh"), JSON.stringify(calls));
  assert.equal(report.passed.length, 2);
  assert.equal(report.failed.length, 0);
});

test("connectivity probe recovers Codex OAuth auth when saved plugin is missing", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-live-probe" });
  codex.seed();
  const calls = [];
  codexUpstream(t, codex, calls);

  const report = await codexProbe("https://chatgpt.com/backend-api/codex", [], ["gpt-5.5"]);

  assert.equal(report.passed.length, 1);
  assert.equal(report.failed.length, 0);
  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0"]);
  assert.deepEqual(calls.map((call) => call.pathname), ["/backend-api/codex/responses"]);
  assert.equal(calls[0]?.authorization, `Bearer ${codex.issued[0]}`);
  assert.equal(calls[0]?.chatgptAccountId, "acct-live-probe");
  assert.equal(calls[0]?.body?.max_output_tokens, undefined);
});

test("New API response headers enable key quota account connector", () => {
  assert.equal(detectedProviderFromHeaders({ "X-New-Api-Version": "0.8.0" }), "new-api");
  assert.equal(detectedProviderFromHeaders({ "x-oneapi-request-id": "req-1" }), "new-api");
  assert.equal(detectedProviderFromHeaders({ "content-type": "application/json" }), undefined);

  const account = newApiKeyUsageAccountConfig("https://gateway.example/v1");
  const connector = account.connectors?.[0];
  assert.equal(account.enabled, true);
  assert.equal(connector?.type, "http-json");
  assert.equal(connector?.endpoint, "https://gateway.example/api/usage/token/");
  assert.equal(connector?.parser, "new-api-key-usage");
  assert.equal(connector?.mapping.meters[0]?.kind, "quota");
  assert.equal(connector?.mapping.meters[0]?.remaining, "$.data.total_available");
  assert.equal(connector?.mapping.meters[0]?.limit, "$.data.total_granted");
  assert.equal(connector?.mapping.meters[0]?.used, "$.data.total_used");

  const userBalanceConnector = newApiUserSelfConnectorConfig("https://gateway.example/v1");
  assert.equal(userBalanceConnector.endpoint, "https://gateway.example/api/user/self");
  assert.equal(userBalanceConnector.parser, "new-api-user-self");
  assert.equal(userBalanceConnector.headers?.["New-Api-User"], "<user-id>");
});

test("New API key usage parser ignores keys without a dedicated quota", () => {
  const payload = {
    code: true,
    data: {
      name: "default",
      total_available: 0,
      total_granted: 0,
      total_used: 0,
      unlimited_quota: true
    },
    message: "ok"
  };

  assert.deepEqual(newApiKeyUsageMetersForTest(payload), []);
  assert.match(newApiKeyUsageFallbackMessageForTest(payload), /no dedicated quota/i);
});

test("New API user self parser returns user balance", () => {
  const payload = {
    data: {
      quota: 1250,
      used_quota: 250
    },
    message: "",
    success: true
  };

  assert.deepEqual(newApiUserSelfMetersForTest(payload), [{
    id: "new_api_user_balance",
    kind: "balance",
    label: "User balance",
    limit: 1500,
    remaining: 1250,
    source: "http-json",
    unit: "quota",
    used: 250
  }]);
});

const sub = (subscription) => ({ subscription });
const payloadOf = (list) => ({
  data: { all_subscriptions: list, billing_preference: "subscription_first", subscriptions: list },
  message: "",
  success: true
});

test("New API subscription config targets the root subscription route with a token placeholder", () => {
  const connector = newApiSubscriptionSelfConnectorConfig("https://gateway.example/v1");
  assert.equal(connector.endpoint, "https://gateway.example/api/subscription/self");
  assert.equal(connector.parser, "new-api-subscription-self");
  assert.equal(connector.auth, "none");
  assert.equal(connector.method, "GET");
  assert.equal(connector.headers?.Authorization, "Bearer <new-api-access-token>");
  assert.equal(connector.headers?.["New-Api-User"], undefined);
  assert.equal(connector.mapping.meters[0].id, "new_api_subscription_quota");
});

test("New API subscription meter sums active subscriptions", () => {
  assert.deepEqual(newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 1000, amount_used: 100, end_time: 2000000000, next_reset_time: 1900000000 }),
    sub({ amount_total: 500, amount_used: 200, end_time: 1950000000, next_reset_time: 1800000000 })
  ])), [{
    id: "new_api_subscription_quota",
    kind: "quota",
    label: "Subscription quota",
    limit: 1500,
    remaining: 1200,
    resetAt: new Date(1800000000 * 1000).toISOString(),
    source: "http-json",
    unit: "quota",
    used: 300
  }]);
});

test("New API subscription meter uses the earliest end time when nothing resets", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 10, amount_used: 0, end_time: 2000000000, next_reset_time: 0 }),
    sub({ amount_total: 10, amount_used: 0, end_time: 1950000000, next_reset_time: 0 })
  ]));
  assert.equal(meter.resetAt, new Date(1950000000 * 1000).toISOString());
});

test("New API subscription meter labels usage and omits the limit when any subscription is unlimited", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 0, amount_used: 50 }),
    sub({ amount_total: 1000, amount_used: 100 })
  ]));
  assert.equal(meter.label, "Subscription used (unlimited)");
  assert.equal(meter.used, 150);
  assert.equal(meter.limit, undefined);
  assert.equal(meter.remaining, undefined);
});

test("New API subscription meter never reports negative remaining", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([sub({ amount_total: 100, amount_used: 150 })]));
  assert.equal(meter.limit, 100);
  assert.equal(meter.remaining, 0);
});

test("New API subscription meter tolerates malformed items", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    null,
    { subscription: null },
    sub({ amount_total: "1000", amount_used: "100" })
  ]));
  assert.equal(meter.limit, 1000);
  assert.equal(meter.used, 100);
  assert.deepEqual(newApiSubscriptionSelfMetersForTest({ success: true, data: { subscriptions: "nope" } }), []);
  assert.deepEqual(newApiSubscriptionSelfMetersForTest("nope"), []);
});

test("New API subscription reports a plain message when there is no active subscription", () => {
  assert.deepEqual(newApiSubscriptionSelfMetersForTest(payloadOf([])), []);
  assert.equal(newApiSubscriptionSelfFallbackMessageForTest(payloadOf([])), "No active New API subscription.");
  assert.equal(newApiSubscriptionSelfFallbackMessageForTest({ success: false, message: "denied" }), "denied");
});

test("OpenCode Go model discovery only returns models for the requested protocol", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-probe-opencode-"));
  const previousHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    "opencode-go": {
      api: "https://opencode.ai/zen/go/v1",
      models: {
        "go-chat": { name: "Go Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
        "go-responses": { name: "Go Responses", provider: { npm: "@ai-sdk/openai" } },
        "stale-chat": { name: "Stale Chat", provider: { npm: "@ai-sdk/openai-compatible" } },
        "stale-responses": { name: "Stale Responses", provider: { npm: "@ai-sdk/openai" } }
      },
      name: "OpenCode Go",
      npm: "@ai-sdk/openai-compatible"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "go-chat" }, { id: "go-responses" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.LLMR_INTERNAL_HOME_DIR;
    } else {
      process.env.LLMR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_responses", "openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["go-chat", "go-responses"]);
  assert.deepEqual(probe.protocolModels, {
    openai_chat_completions: ["go-chat"],
    openai_responses: ["go-responses"]
  });

  const normalizedProbe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_responses"]
  });
  assert.deepEqual(normalizedProbe.models, ["go-responses"]);
});

test("OpenCode Go model discovery keeps live models when the local catalog has no protocol models", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-probe-opencode-empty-"));
  const previousHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    "opencode-go": {
      api: "https://opencode.ai/zen/go/v1",
      name: "OpenCode Go"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "go-new" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.LLMR_INTERNAL_HOME_DIR;
    } else {
      process.env.LLMR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    baseUrl: "https://opencode.ai/zen/go/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["go-new"]);
  assert.equal(probe.protocolModels, undefined);
});

test("OpenCode Zen model discovery keeps paid models when the probe supplies an API key", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-probe-opencode-paid-"));
  const previousHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const previousFetch = globalThis.fetch;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  fs.mkdirSync(path.join(home, ".cache", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cache", "opencode", "models.json"), JSON.stringify({
    opencode: {
      api: "https://opencode.ai/zen/v1",
      models: {
        "free-model": { cost: { input: 0, output: 0 }, name: "Free Model", provider: { npm: "@ai-sdk/openai-compatible" } },
        "paid-model": { cost: { input: 3, output: 15 }, name: "Paid Model", provider: { npm: "@ai-sdk/openai-compatible" } }
      },
      name: "OpenCode Zen",
      npm: "@ai-sdk/openai-compatible"
    }
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "free-model" }, { id: "paid-model" }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousHome === undefined) {
      delete process.env.LLMR_INTERNAL_HOME_DIR;
    } else {
      process.env.LLMR_INTERNAL_HOME_DIR = previousHome;
    }
    fs.rmSync(home, { force: true, recursive: true });
  });

  const probe = await probeGatewayProvider({
    apiKey: "paid-zen-key",
    baseUrl: "https://opencode.ai/zen/v1",
    forceRefresh: true,
    mode: "models",
    protocols: ["openai_chat_completions"]
  });
  assert.deepEqual(probe.models, ["free-model", "paid-model"]);
  assert.deepEqual(probe.protocolModels, {
    openai_chat_completions: ["free-model", "paid-model"]
  });
});

function jwt(payload) {
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url(payload),
    ""
  ].join(".");
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const codexEnvKeys = ["CODEX_HOME", "CODEX_REFRESH_TOKEN_URL_OVERRIDE", "HOME", "LLMR_INTERNAL_HOME_DIR", "USERPROFILE"];

function codexAccessToken(lifetimeSeconds, accountId = "acct-codex") {
  return jwt({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    scope: "api.connectors.read api.connectors.invoke"
  });
}

async function useCodexLogin(t, { accountId = "acct-codex", delayMs = 0, lifetimeSeconds = 3600 } = {}) {
  const saved = Object.fromEntries(codexEnvKeys.map((key) => [key, process.env[key]]));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-codex-probe-login-"));
  const codexDir = path.join(home, ".codex");
  fs.mkdirSync(codexDir, { recursive: true });
  const requests = [];
  const issued = [];
  const seen = new Set();
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      response.writeHead(seen.has(payload.refresh_token) ? 400 : 200, { "content-type": "application/json" });
      if (seen.has(payload.refresh_token)) {
        response.end(JSON.stringify({ error: "refresh_token_reused" }));
        return;
      }
      seen.add(payload.refresh_token);
      const token = codexAccessToken(lifetimeSeconds, accountId);
      issued.push(token);
      response.end(JSON.stringify({
        access_token: token,
        refresh_token: `r${Number(payload.refresh_token.slice(1)) + 1}`
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE = `${origin}/oauth/token`;
  delete process.env.CODEX_HOME;
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(home, { force: true, recursive: true });
  });
  const authFile = path.join(codexDir, "auth.json");
  return {
    issued,
    origin,
    readAuth: () => JSON.parse(fs.readFileSync(authFile, "utf8")),
    requests,
    seed: ({ accessToken = codexAccessToken(-10, accountId), refreshToken = "r0" } = {}) => fs.writeFileSync(authFile, JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: accessToken, account_id: accountId, refresh_token: refreshToken }
    }))
  };
}

function useFetch(t, codex, handler) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (codex && String(input).startsWith(codex.origin)) {
      return previousFetch(input, init);
    }
    return handler(new URL(String(input)), init);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
}

function useTemporaryCodexHome(t, prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousHome = process.env.LLMR_INTERNAL_HOME_DIR;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.LLMR_INTERNAL_HOME_DIR;
    } else {
      process.env.LLMR_INTERNAL_HOME_DIR = previousHome;
    }
  });
  return home;
}
