import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  localAgentProviderAccountCredentialForTest,
  localCodexAccountCredentialForTest,
  setProviderAccountWebContentFetchHandler,
  testProviderAccountConnector
} from "@llmr/core/providers/account-service.ts";
import { importLocalAgentProvider } from "@llmr/core/agents/local-providers/service.ts";
import {
  grokDefaultBillingEndpoint,
  grokDefaultBaseUrl,
  grokDefaultSubscriptionEndpoint,
  grokProviderAccountConfig
} from "@llmr/core/agents/local-providers/grok.ts";
import { findProviderPreset } from "@llmr/core/providers/presets/index.ts";

const localAgentProviderApiKey = "llmr-local-agent-login";
const codexDefaultBaseUrl = "https://chatgpt.com/backend-api/codex";
const zcodeDefaultBaseUrl = "https://zcode.z.ai/api/v1/zcode-plan/anthropic";
test("Grok billing connector maps credit usage payload", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  let clientIdentifier = "";
  let clientVersion = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), grokDefaultBillingEndpoint);
    authorization = init?.headers?.authorization ?? "";
    clientIdentifier = init?.headers?.["x-grok-client-identifier"] ?? "";
    clientVersion = init?.headers?.["x-grok-client-version"] ?? "";
    return new Response(JSON.stringify({
      config: {
        billingPeriodEnd: "2026-08-01T00:00:00Z",
        creditUsagePercent: { val: 25 },
        includedUsed: { val: 10 },
        monthlyLimit: { val: 40 },
        onDemandCap: { val: 100 },
        onDemandUsed: { val: 5 },
        prepaidBalance: { val: 12 },
        totalUsed: { val: 15 }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = grokProviderAccountConfig().connectors?.[0];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "grok-access-token",
    baseUrl: grokDefaultBaseUrl,
    connector,
    providerName: "Grok CLI API"
  });

  assert.equal(authorization, "Bearer grok-access-token");
  assert.equal(clientIdentifier, "xai-grok-cli");
  assert.equal(clientVersion, "0.2.93");
  assert.equal(result.meters.find((meter) => meter.id === "grok_credit_usage_percent")?.remaining, 75);
  assert.equal(result.meters.find((meter) => meter.id === "grok_included_credits")?.remaining, 30);
  assert.equal(result.meters.find((meter) => meter.id === "grok_total_credits")?.used, 15);
  assert.equal(result.meters.find((meter) => meter.id === "grok_pay_as_you_go_cap")?.remaining, 95);
  assert.equal(result.meters.find((meter) => meter.id === "grok_prepaid_balance")?.remaining, 12);
});

test("Grok subscription connector maps access status payload", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  let clientIdentifier = "";
  let clientVersion = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), grokDefaultSubscriptionEndpoint);
    authorization = init?.headers?.authorization ?? "";
    clientIdentifier = init?.headers?.["x-grok-client-identifier"] ?? "";
    clientVersion = init?.headers?.["x-grok-client-version"] ?? "";
    return new Response(JSON.stringify({
      hasGrokCodeAccess: true,
      subscriptionTier: "SuperGrok Heavy"
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = grokProviderAccountConfig().connectors?.[1];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "grok-access-token",
    baseUrl: grokDefaultBaseUrl,
    connector,
    providerName: "Grok CLI API"
  });

  assert.equal(authorization, "Bearer grok-access-token");
  assert.equal(clientIdentifier, "xai-grok-cli");
  assert.equal(clientVersion, "0.2.93");
  assert.equal(result.status, "ok");
  assert.equal(result.message, "SuperGrok Heavy");
  assert.equal(result.meters.find((meter) => meter.id === "grok_subscription_access")?.remaining, 100);
});

test("OpenCode Go usage connector maps official windows to remaining percent", async (t) => {
  const previousFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://opencode.ai/zen/go/v1/usage");
    authorization = init?.headers?.authorization ?? "";
    return new Response(JSON.stringify({
      usage: {
        rolling: { resetsAt: "2026-09-11T20:00:00.000Z", status: "ok", percent: 12 },
        weekly: { resetsAt: "2026-09-14T00:00:00.000Z", status: "ok", percent: 34 },
        monthly: { resetsAt: "2026-10-01T00:00:00.000Z", status: "limit_reached", percent: 100 }
      }
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const connector = findProviderPreset("opencode-go")?.account?.connectors?.[0];
  assert.equal(connector?.type, "http-json");
  const result = await testProviderAccountConnector({
    apiKey: "opencode-go-key",
    baseUrl: "https://opencode.ai/zen/go/v1",
    connector,
    providerName: "OpenCode Go"
  });

  assert.equal(authorization, "Bearer opencode-go-key");
  const rolling = result.meters.find((meter) => meter.id === "opencode_go_5h");
  assert.equal(rolling?.used, 12);
  assert.equal(rolling?.remaining, 88);
  assert.equal(rolling?.limit, 100);
  assert.equal(rolling?.unit, "%");
  assert.equal(rolling?.resetAt, "2026-09-11T20:00:00.000Z");
  assert.equal(result.meters.find((meter) => meter.id === "opencode_go_weekly")?.remaining, 66);
  assert.equal(result.meters.find((meter) => meter.id === "opencode_go_monthly")?.remaining, 0);
});

test("webcontent-json connector uses browser-session handler without provider API key", async (t) => {
  let captured;
  setProviderAccountWebContentFetchHandler(async (request) => {
    captured = request;
    return {
      payload: {
        balance: 42,
        message: "Signed in"
      }
    };
  });
  t.after(() => {
    setProviderAccountWebContentFetchHandler(undefined);
  });

  const result = await testProviderAccountConnector({
    apiKey: "should-not-reach-handler",
    baseUrl: "https://vendor.example.com/v1",
    connector: {
      browser: {
        headerTemplates: {
          authorization: "Bearer ${localStorage.accessToken}"
        },
        loginUrl: "https://vendor.example.com/login",
        requestOrigin: "https://vendor.example.com",
        timeoutMs: 12000
      },
      endpoint: "https://api.vendor.example.com/account",
      headers: {
        "x-csrf-token": "csrf"
      },
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance",
            unit: "USD"
          }
        ],
        message: "$.message"
      },
      type: "webcontent-json"
    },
    providerName: "Vendor"
  });

  assert.equal(captured.endpoint, "https://api.vendor.example.com/account");
  assert.equal(captured.credentials, "omit");
  assert.equal(captured.method, "GET");
  assert.equal(captured.requestOrigin, "https://vendor.example.com");
  assert.equal(captured.loginUrl, "https://vendor.example.com/login");
  assert.equal(captured.headerTemplates.authorization, "Bearer ${localStorage.accessToken}");
  assert.equal(captured.provider.api_key, "");
  assert.equal(captured.provider.apiKey, undefined);
  assert.equal(captured.headers["x-csrf-token"], "csrf");
  assert.equal(result.message, "Signed in");
  assert.equal(result.meters[0].remaining, 42);
  assert.equal(result.meters[0].source, "webcontent-json");
});

test("webcontent-json connector defaults browser request origin to login URL origin", async (t) => {
  let captured;
  setProviderAccountWebContentFetchHandler(async (request) => {
    captured = request;
    return {
      payload: {
        balance: 7
      }
    };
  });
  t.after(() => {
    setProviderAccountWebContentFetchHandler(undefined);
  });

  const result = await testProviderAccountConnector({
    baseUrl: "https://vendor.example.com/v1",
    connector: {
      browser: {
        loginUrl: "https://app.vendor.example.com/login"
      },
      endpoint: "https://api.vendor.example.com/account",
      mapping: {
        meters: [
          {
            id: "balance",
            kind: "balance",
            label: "Balance",
            remaining: "$.balance",
            unit: "USD"
          }
        ]
      },
      type: "webcontent-json"
    },
    providerName: "Vendor"
  });

  assert.equal(captured.endpoint, "https://api.vendor.example.com/account");
  assert.equal(captured.credentials, "include");
  assert.equal(captured.requestOrigin, "https://app.vendor.example.com");
  assert.equal(result.meters[0].remaining, 7);
});

test("webcontent-json connector reports unsupported outside LLMR Desktop", async () => {
  setProviderAccountWebContentFetchHandler(undefined);

  await assert.rejects(
    () => testProviderAccountConnector({
      baseUrl: "https://vendor.example.com/v1",
      connector: {
        endpoint: "https://vendor.example.com/account",
        mapping: { meters: [] },
        type: "webcontent-json"
      },
      providerName: "Vendor"
    }),
    /only available in LLMR Desktop/
  );
});

test("webcontent-json connector refuses to send storage header templates to another site", async (t) => {
  let called = false;
  setProviderAccountWebContentFetchHandler(async () => {
    called = true;
    return { payload: {} };
  });
  t.after(() => {
    setProviderAccountWebContentFetchHandler(undefined);
  });

  await assert.rejects(
    () => testProviderAccountConnector({
      baseUrl: "https://vendor.example.com/v1",
      connector: {
        browser: {
          headerTemplates: { authorization: "Bearer ${localStorage.accessToken}" },
          requestOrigin: "https://vendor.example.com"
        },
        endpoint: "https://collector.example.net/account",
        mapping: { meters: [] },
        type: "webcontent-json"
      },
      providerName: "Vendor"
    }),
    /can only be sent to vendor\.example\.com or its subdomains, not collector\.example\.net/
  );
  assert.equal(called, false);
});

test("Codex local account credential refreshes an expired login", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-refreshed" });
  codex.seed();

  const credential = await localCodexAccountCredentialForTest(localCodexPlugin);

  assert.equal(credential.apiKey, codex.issued[0]);
  assert.equal(credential.headers?.["ChatGPT-Account-Id"], "acct-refreshed");
  assert.deepEqual(codex.requests, [{
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    grant_type: "refresh_token",
    refresh_token: "r0"
  }]);
});

test("Codex local account credential refreshes with the rotated Codex refresh token", async (t) => {
  const codex = await useCodexLogin(t, { lifetimeSeconds: 30 });
  codex.seed();

  await localCodexAccountCredentialForTest(localCodexPlugin);
  const credential = await localCodexAccountCredentialForTest(localCodexPlugin);

  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0", "r1"]);
  assert.equal(codex.readAuth().tokens.refresh_token, "r2");
  assert.equal(credential.apiKey, codex.issued[1]);
});

test("Codex local account credential keeps a still valid token when the refresh fails", async (t) => {
  const codex = await useCodexLogin(t, { failStatus: 500 });
  const accessToken = codexAccessToken(30, "acct-codex");
  codex.seed({ accessToken });

  const credential = await localCodexAccountCredentialForTest(localCodexPlugin);

  assert.equal(codex.requests.length, 1);
  assert.equal(credential.apiKey, accessToken);
});

test("Codex local account credential matches internal provider plugin names", async (t) => {
  const codex = await useCodexLogin(t, { accountId: "acct-internal" });
  const accessToken = codexAccessToken(3600, "acct-internal");
  codex.seed({ accessToken });

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        codexOauth: {
          accessToken: "stored-plugin-token"
        },
        key: "llmr-local-agent-codex-api-codex-oauth-internal",
        providerName: "codex-api::openai_responses"
      }
    ]
  }, {
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "codex-api",
    models: ["gpt-5-codex"],
    name: "Renamed Codex API",
    type: "openai_responses"
  });

  assert.equal(credential?.apiKey, accessToken);
  assert.equal(credential?.headers?.["ChatGPT-Account-Id"], "acct-internal");
  assert.deepEqual(codex.requests, []);
});

test("Codex local account credential falls back to the live auth file when plugin is missing", async (t) => {
  const home = useTemporaryCodexHome(t, "llmr-codex-account-live-auth-");
  const codexHome = path.join(home, ".codex");
  mkdirSync(codexHome, { recursive: true });
  const accessToken = jwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live"
    },
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api.connectors.read api.connectors.invoke"
  });
  writeFileSync(path.join(codexHome, "auth.json"), JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      access_token: accessToken
    }
  }));

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: []
  }, {
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "codex-api",
    models: ["gpt-5-codex"],
    name: "Codex API",
    type: "openai_responses"
  });

  assert.equal(credential?.apiKey, accessToken);
  assert.equal(credential?.headers?.["ChatGPT-Account-Id"], "acct-live");
});

test("an imported Claude Code provider has no account connector", async (t) => {
  useTemporaryHome(t, "llmr-claude-code-account-");
  const result = await importLocalAgentProvider({ id: "claude-code-api", providerNames: [] });
  assert.equal(result.candidate.kind, "claude-code");
  assert.equal(result.provider.account, undefined);
});

test("Kimi local account credential carries its API key and CLI identity", async (t) => {
  const home = useTemporaryCodexHome(t, "llmr-kimi-account-plugin-");
  const previousVersion = process.env.KIMI_CODE_VERSION;
  process.env.KIMI_CODE_VERSION = "0.27.0-test";
  t.after(() => {
    if (previousVersion === undefined) delete process.env.KIMI_CODE_VERSION;
    else process.env.KIMI_CODE_VERSION = previousVersion;
  });

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { authorization: "Bearer kimi-plugin-key" },
          strict: true
        },
        key: "llmr-local-agent-kimi-api-kimi-cli-api-key-internal",
        providerName: "kimi-api::openai_chat_completions"
      }
    ]
  }, {
    api_base_url: "https://api.kimi.com/coding/v1",
    api_key: localAgentProviderApiKey,
    id: "kimi-api",
    models: ["k3"],
    name: "Renamed Kimi API",
    type: "openai_chat_completions"
  });

  assert.equal(credential?.apiKey, "kimi-plugin-key");
  assert.equal(credential?.headers?.["User-Agent"], "kimi-code-cli/0.27.0-test");
  assert.equal(credential?.headers?.["X-Msh-Platform"], "kimi_code_cli");
  assert.ok(credential?.headers?.["X-Msh-Device-Id"]);
  assert.equal(existsSync(path.join(home, ".kimi-code", "device_id")), true);
});

test("ZCode local account credential matches internal provider plugin names", async () => {
  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: {
            "x-api-key": "zcode-plugin-key"
          },
          removeHeaders: ["authorization"],
          strict: true
        },
        key: "llmr-local-agent-zcode-api-zcode-api-key-internal",
        providerName: "zcode-api::anthropic_messages"
      }
    ]
  }, {
    api_base_url: zcodeDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "zcode-api",
    models: ["GLM-5.2"],
    name: "Renamed ZCode API",
    type: "anthropic_messages"
  });

  assert.equal(credential?.apiKey, "zcode-plugin-key");
});

test("ZCode local account credential falls back to the live config when plugin is missing", async (t) => {
  const home = useTemporaryCodexHome(t, "llmr-zcode-account-live-config-");
  const zcodeConfigDir = path.join(home, ".zcode", "cli");
  mkdirSync(zcodeConfigDir, { recursive: true });
  writeFileSync(path.join(zcodeConfigDir, "config.json"), JSON.stringify({
    provider: {
      zcode: {
        enabled: true,
        kind: "anthropic",
        models: ["GLM-5.2"],
        name: "ZCode",
        options: {
          apiKey: "zcode-live-key",
          baseURL: zcodeDefaultBaseUrl
        }
      }
    }
  }));

  const credential = await localAgentProviderAccountCredentialForTest({
    providerPlugins: []
  }, {
    api_base_url: zcodeDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    id: "zcode-api",
    models: ["GLM-5.2"],
    name: "ZCode API",
    type: "anthropic_messages"
  });

  assert.equal(credential?.apiKey, "zcode-live-key");
});

test("OpenCode local account credential reuses the imported plugin key", async () => {
  const bearer = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { authorization: "Bearer opencode-go-key" },
          removeHeaders: ["x-api-key"],
          strict: true
        },
        key: "llmr-local-agent-opencode-go-chat-completions-opencode-go-openai-chat-completions-api-key",
        providerName: "OpenCode Go (Chat Completions)"
      }
    ]
  }, {
    api_base_url: "https://opencode.ai/zen/go/v1",
    api_key: localAgentProviderApiKey,
    id: "opencode-go-api-openai-chat-completions",
    models: ["kimi-k2.7-code"],
    name: "OpenCode Go (Chat Completions)",
    type: "openai_chat_completions"
  });

  assert.equal(bearer?.apiKey, "opencode-go-key");
  assert.equal(bearer?.headers?.authorization, undefined);

  const anthropic = await localAgentProviderAccountCredentialForTest({
    providerPlugins: [
      {
        auth: {
          headers: { "x-api-key": "opencode-go-anthropic-key" },
          removeHeaders: ["authorization"],
          strict: true
        },
        key: "llmr-local-agent-opencode-go-anthropic-messages-opencode-go-anthropic-messages-api-key",
        providerName: "opencode-go-api-anthropic-messages::anthropic_messages"
      }
    ]
  }, {
    api_base_url: "https://opencode.ai/zen/go/v1",
    api_key: localAgentProviderApiKey,
    id: "opencode-go-api-anthropic-messages",
    models: ["minimax-m3"],
    name: "Renamed OpenCode Go",
    type: "anthropic_messages"
  });

  assert.equal(anthropic?.apiKey, "opencode-go-anthropic-key");
  assert.equal(anthropic?.headers?.["x-api-key"], undefined);
});

const codexEnvKeys = ["CODEX_HOME", "CODEX_REFRESH_TOKEN_URL_OVERRIDE", "HOME", "LLMR_INTERNAL_HOME_DIR", "USERPROFILE"];

const localCodexPlugin = {
  codexOauth: {
    accessToken: "stored-plugin-token",
    refreshToken: "stored-plugin-refresh",
    tokenEndpoint: "http://127.0.0.1:9/oauth/token"
  },
  key: "llmr-local-agent-codex-api-codex-oauth",
  providerName: "Codex API"
};

function codexAccessToken(lifetimeSeconds, accountId = "acct-codex") {
  return jwt({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    scope: "api.connectors.read api.connectors.invoke"
  });
}

async function useCodexLogin(t, { accountId = "acct-codex", failStatus, lifetimeSeconds = 3600 } = {}) {
  const saved = Object.fromEntries(codexEnvKeys.map((key) => [key, process.env[key]]));
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-codex-account-login-"));
  const codexDir = path.join(home, ".codex");
  mkdirSync(codexDir, { recursive: true });
  const requests = [];
  const issued = [];
  const seen = new Set();
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      if (failStatus) {
        response.writeHead(failStatus, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unavailable" }));
        return;
      }
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
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE = `http://127.0.0.1:${server.address().port}/oauth/token`;
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
    rmSync(home, { force: true, recursive: true });
  });
  const authFile = path.join(codexDir, "auth.json");
  return {
    issued,
    readAuth: () => JSON.parse(readFileSync(authFile, "utf8")),
    requests,
    seed: ({ accessToken = codexAccessToken(-10, accountId), refreshToken = "r0" } = {}) => writeFileSync(authFile, JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: accessToken, account_id: accountId, refresh_token: refreshToken }
    }))
  };
}

function useTemporaryCodexHome(t, prefix) {
  const home = useTemporaryHome(t, prefix);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  return home;
}

function useTemporaryHome(t, prefix) {
  const previousHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const previousOsHome = process.env.HOME;
  const previousZcodeHome = process.env.ZCODE_HOME;
  const previousZcodeStorageDir = process.env.ZCODE_STORAGE_DIR;
  const home = mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  delete process.env.ZCODE_HOME;
  delete process.env.ZCODE_STORAGE_DIR;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.LLMR_INTERNAL_HOME_DIR;
    } else {
      process.env.LLMR_INTERNAL_HOME_DIR = previousHome;
    }
    if (previousOsHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousOsHome;
    }
    if (previousZcodeHome === undefined) {
      delete process.env.ZCODE_HOME;
    } else {
      process.env.ZCODE_HOME = previousZcodeHome;
    }
    if (previousZcodeStorageDir === undefined) {
      delete process.env.ZCODE_STORAGE_DIR;
    } else {
      process.env.ZCODE_STORAGE_DIR = previousZcodeStorageDir;
    }
    rmSync(home, { force: true, recursive: true });
  });
  return home;
}

function jwt(payload) {
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url(payload),
    "signature"
  ].join(".");
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
