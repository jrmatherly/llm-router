import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeAppsGatewaySessionFile, persistClaudeAppsGatewaySession } from "@llmr/core/agents/claude-apps-gateway/session-store.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { claudeLoginMissingMessage } from "@llmr/core/gateway/features/claude-login-pass-through.ts";
import {
  createGatewayPlugin,
  isLocalAgentOauthProviderPlugin
} from "@llmr/core/gateway/core-runtime/local-agent-auth-provider-hook.ts";
import { virtualApplyPatchToolName } from "@llmr/core/gateway/internal/shared.ts";

test("Grok local agent auth hook refreshes live login state before authenticating upstream requests", async (t) => {
  await withGrokHome(async (grokHome) => {
    writeGrokAuth(grokHome, {
      expires_at: "2000-01-01T00:00:00Z",
      key: "expired-grok-access-token",
      oidc_client_id: "grok-client-id",
      oidc_issuer: "https://auth.x.ai",
      refresh_token: "grok-refresh-token"
    });

    const previousFetch = globalThis.fetch;
    const previousTokenEndpoint = process.env.GROK_OIDC_TOKEN_ENDPOINT;
    process.env.GROK_OIDC_TOKEN_ENDPOINT = "http://127.0.0.1/grok/oauth/token";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1/grok/oauth/token");
      assert.equal(String(init?.body ?? ""), "client_id=grok-client-id&grant_type=refresh_token&refresh_token=grok-refresh-token");
      return new Response(JSON.stringify({
        access_token: "refreshed-grok-access-token",
        expires_in: 3600,
        refresh_token: "refreshed-grok-refresh-token"
      }), { headers: { "content-type": "application/json" }, status: 200 });
    };
    t.after(() => {
      globalThis.fetch = previousFetch;
      restoreEnv("GROK_OIDC_TOKEN_ENDPOINT", previousTokenEndpoint);
    });

    const [hook] = createGatewayPlugin({
      config: {
        providerPlugins: [grokOauthProviderPlugin()]
      }
    }).providerHooks;
    assert.equal(hook.key, "module:llmr-live-auth:llmr-local-agent-grok-cli-api-grok-cli-oauth");

    const patch = "*** Begin Patch\n*** Add File: grok.txt\n+hi\n*** End Patch\n";
    const upstreamRequest = {
      body: {
        external_web_access: true,
        input: [
          { type: "custom_tool_call", call_id: "call_patch", name: "apply_patch", input: patch },
          { type: "custom_tool_call_output", call_id: "call_patch", output: "Success" }
        ],
        model: "wrong-model",
        parallel_tool_calls: true,
        tool_choice: "auto",
        tools: [
          { type: "function", name: "exec_command" },
          { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } },
          { type: "namespace", name: "multi_agent_v1" },
          { type: "web_search" }
        ]
      },
      headers: {
        "content-type": "application/json",
        "x-api-key": "client-key"
      },
      method: "POST",
      url: "https://cli-chat-proxy.grok.com/v1/responses"
    };
    const authResult = await hook.authenticate({
      model: "grok-4.5",
      upstreamRequest
    });

    assert.equal(authResult.ok, true);
    assert.equal(authResult.value.headers.authorization, "Bearer refreshed-grok-access-token");
    assert.equal(authResult.value.headers["x-api-key"], undefined);
    assert.equal(upstreamRequest.headers["x-api-key"], "client-key");

    const requestResult = await hook.transformRequest({
      model: "grok-4.5",
      upstreamRequest: authResult.value
    });
    assert.equal(requestResult.ok, true);
    assert.equal(requestResult.value.headers["x-grok-client-identifier"], "xai-grok-cli");
    assert.equal(requestResult.value.headers["x-grok-client-version"], "0.2.93");
    assert.equal(requestResult.value.headers["x-grok-model-override"], "grok-4.5");
    assert.equal(requestResult.value.body.external_web_access, undefined);
    assert.deepEqual(requestResult.value.body.tools.map((tool) => tool.type), ["function", "function"]);
    assert.equal(requestResult.value.body.tools[1].name, virtualApplyPatchToolName);
    assert.equal(requestResult.value.body.tools.some((tool) => tool.type === "custom" || tool.type === "namespace"), false);
    assert.equal(requestResult.value.body.tool_choice, "auto");
    assert.equal(requestResult.value.body.parallel_tool_calls, true);
    assert.match(requestResult.value.body.instructions, /When modifying files, call virtual_apply_patch/);
    assert.equal(requestResult.value.body.input[0].type, "function_call");
    assert.equal(requestResult.value.body.input[0].name, virtualApplyPatchToolName);
    assert.deepEqual(JSON.parse(requestResult.value.body.input[0].arguments), { patch });
    assert.equal(requestResult.value.body.input[1].type, "function_call_output");

    const persisted = JSON.parse(readFileSync(path.join(grokHome, "auth.json"), "utf8"));
    assert.equal(persisted["https://auth.x.ai::test-account"].key, "refreshed-grok-access-token");
  });
});

test("Claude Code hook copies the login the request carries", () => {
  const result = claudeCodeHook().authenticate(claudeCodeHookInput({ "x-llmr-caller-authorization": callerLogin }));

  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization === callerLogin, true, "authorization is the caller's login");
});

test("Claude Code hook removes x-api-key", () => {
  const input = claudeCodeHookInput({ "x-llmr-caller-authorization": callerLogin });
  const result = claudeCodeHook().authenticate(input);

  assert.equal("x-api-key" in result.value.headers, false);
  assert.equal(input.upstreamRequest.headers["x-api-key"], "client-key");
});

test("Claude Code hook refuses a request that carries no login, whatever the plugin stores", () => {
  assert.deepEqual(claudeCodeHook().authenticate(claudeCodeHookInput({})), { error: claudeLoginMissingMessage, ok: false });
  assert.deepEqual(claudeCodeHook().authenticate({ upstreamRequest: claudeCodeHookInput({}).upstreamRequest }), { error: claudeLoginMissingMessage, ok: false });
});

test("Claude Code hook refuses a carried value that is not a bearer login", () => {
  const result = claudeCodeHook().authenticate(claudeCodeHookInput({ "x-llmr-caller-authorization": "sk-ant-api-key" }));

  assert.deepEqual(result, { error: claudeLoginMissingMessage, ok: false });
});

test("Claude Code hook adds nothing to anthropic-beta", () => {
  const input = claudeCodeHookInput({ "anthropic-beta": "made-up-beta-2099-01-01", "x-llmr-caller-authorization": callerLogin });
  const sent = claudeCodeHook().authenticate(input);
  delete input.upstreamRequest.headers["anthropic-beta"];
  const absent = claudeCodeHook().authenticate(input);

  assert.equal(sent.value.headers["anthropic-beta"], "made-up-beta-2099-01-01");
  assert.equal("anthropic-beta" in absent.value.headers, false);
});

test("Claude apps gateway hook swaps in a refreshed bearer token", async (t) => {
  const gatewayUrl = "http://127.0.0.1:18091";
  writeClaudeAppsGatewaySession(t, gatewayUrl, { accessToken: "expired", expiresAt: 1, refreshToken: "old" });
  stubFetch(t, (url, init) => {
    assert.equal(url, `${gatewayUrl}/oauth/token`);
    assert.equal(String(init?.body), "grant_type=refresh_token&refresh_token=old");
    return jsonResponse(200, { access_token: "fresh", expires_in: 3600 });
  });

  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(gatewayUrl)] } }).providerHooks;
  const result = await hook.authenticate({ model: "claude-sonnet-4-6", upstreamRequest: { headers: { "x-api-key": "client" }, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, "Bearer fresh");
  assert.equal(result.value.headers["x-api-key"], undefined);
});

test("Claude apps gateway hook fails the request when refresh is refused", async (t) => {
  const gatewayUrl = "http://127.0.0.1:18092";
  writeClaudeAppsGatewaySession(t, gatewayUrl, { accessToken: "expired", expiresAt: 1, refreshToken: "old" });
  stubFetch(t, () => jsonResponse(401, { error: "invalid_grant" }));

  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(gatewayUrl)] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, false);
  assert.match(result.error, /sign in again/i);
  assert.doesNotMatch(result.error, /stale|old|expired/);
});

test("Claude apps gateway hook keeps the stored token after a transient refresh failure", async (t) => {
  const gatewayUrl = "http://127.0.0.1:18093";
  writeClaudeAppsGatewaySession(t, gatewayUrl, { accessToken: "stored", expiresAt: Math.floor(Date.now() / 1000) + 30, refreshToken: "old" });
  stubFetch(t, () => jsonResponse(503, { error: "unavailable" }));

  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(gatewayUrl)] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, "Bearer stored");
});

test("Claude apps gateway hook reports the refresh error instead of sending an expired token", async (t) => {
  const gatewayUrl = "http://127.0.0.1:18097";
  writeClaudeAppsGatewaySession(t, gatewayUrl, { accessToken: "expired", expiresAt: 1, refreshToken: "old" });
  stubFetch(t, () => jsonResponse(503, { error: "unavailable" }));

  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(gatewayUrl)] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, false);
  assert.match(result.error, /could not be refreshed: .*HTTP 503/);
});

test("Claude apps gateway hook treats a deleted session file as signed out", async (t) => {
  stubFetch(t, () => assert.fail("no session, no request"));
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin("http://127.0.0.1:18098")] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: "http://127.0.0.1:18098/v1/messages" } });
  assert.equal(result.ok, false);
  assert.match(result.error, /not found\. Sign in again/);
});

test("Claude apps gateway hook asks for a new sign-in when an expired session has no refresh token", async (t) => {
  const gatewayUrl = "http://127.0.0.1:18096";
  writeClaudeAppsGatewaySession(t, gatewayUrl, { accessToken: "expired", expiresAt: 1 });
  stubFetch(t, () => assert.fail("nothing to refresh"));

  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(gatewayUrl)] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, false);
  assert.match(result.error, /sign in again/i);
});

test("Claude apps gateway hook rejects a malformed gateway URL without throwing", async () => {
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin("gw.example.com")] } }).providerHooks;
  const result = await hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: "https://gw.example.com/v1/messages" } });
  assert.equal(result.ok, false);
});

test("two Claude apps gateway plugins resolve their own sessions", async (t) => {
  const first = "http://127.0.0.1:18094";
  const second = "http://127.0.0.1:18095";
  writeClaudeAppsGatewaySession(t, first, { accessToken: "first-token" });
  writeClaudeAppsGatewaySession(t, second, { accessToken: "second-token" });
  stubFetch(t, () => assert.fail("valid sessions need no refresh"));

  const hooks = createGatewayPlugin({ config: { providerPlugins: [claudeAppsGatewayProviderPlugin(first, "a"), claudeAppsGatewayProviderPlugin(second, "b")] } }).providerHooks;
  const [firstResult, secondResult] = await Promise.all(hooks.map((hook, index) =>
    hook.authenticate({ upstreamRequest: { headers: {}, method: "POST", url: `${[first, second][index]}/v1/messages` } })
  ));
  assert.equal(firstResult.value.headers.authorization, "Bearer first-token");
  assert.equal(secondResult.value.headers.authorization, "Bearer second-token");
  assert.equal(isLocalAgentOauthProviderPlugin(claudeAppsGatewayProviderPlugin(first)), true);
});

test("Grok local agent request hook removes unsupported Responses tools and stale tool choice", () => {
  const [hook] = createGatewayPlugin({
    config: {
      providerPlugins: [grokOauthProviderPlugin()]
    }
  }).providerHooks;
  const requestResult = hook.transformRequest({
    model: "grok-4.5",
    upstreamRequest: {
      body: {
        parallel_tool_calls: true,
        tool_choice: { type: "tool", name: "multi_agent_v1" },
        tools: [
          { type: "namespace", name: "multi_agent_v1" },
          { type: "function", name: "exec_command" }
        ]
      },
      headers: {},
      method: "POST",
      url: "https://cli-chat-proxy.grok.com/v1/responses"
    }
  });

  assert.equal(requestResult.ok, true);
  assert.deepEqual(requestResult.value.body.tools, [{ type: "function", name: "exec_command" }]);
  assert.equal(requestResult.value.body.tool_choice, undefined);
  assert.equal(requestResult.value.body.parallel_tool_calls, true);
});

test("core gateway config installs the local agent dynamic auth runtime hook when OAuth plugins are present", async () => {
  const config = createDefaultAppConfig();
  config.providerPlugins = [grokOauthProviderPlugin()];
  config.Providers = [
    {
      api_base_url: "https://cli-chat-proxy.grok.com/v1",
      api_key: "llmr-local-agent-login",
      id: "grok-cli-api",
      models: ["grok-4.5"],
      name: "Grok CLI API",
      type: "openai_responses"
    }
  ];

  const compiled = await compileCoreGatewayConfig(
    config,
    "raw-trace-token",
    "billing-usage-token",
    "core-auth-token"
  );
  const plugins = Array.isArray(compiled.plugins) ? compiled.plugins : [];
  const localAgentAuthPlugin = plugins.find((plugin) => plugin.key === "llmr-local-agent-auth-provider-hooks");

  assert.ok(localAgentAuthPlugin);
  assert.match(localAgentAuthPlugin.modulePath, /local-agent-auth-provider-hook\.js$/);
});

test("core gateway config removes Grok unsupported Responses options through declarative request transforms", async () => {
  await withGrokHome(async (grokHome) => {
    writeGrokAuth(grokHome, {
      expires_at: "2099-01-01T00:00:00Z",
      key: "live-grok-access-token",
      oidc_client_id: "grok-client-id",
      oidc_issuer: "https://auth.x.ai",
      refresh_token: "grok-refresh-token"
    });
    const plugin = grokOauthProviderPlugin();
    plugin.request.bodyRemove = ["metadata"];

    const config = createDefaultAppConfig();
    config.providerPlugins = [plugin];
    config.Providers = [
      {
        api_base_url: "https://cli-chat-proxy.grok.com/v1",
        api_key: "llmr-local-agent-login",
        id: "grok-cli-api",
        models: ["grok-4.5"],
        name: "Grok CLI API",
        type: "openai_responses"
      }
    ];

    const compiled = await compileCoreGatewayConfig(
      config,
      "raw-trace-token",
      "billing-usage-token",
      "core-auth-token"
    );
    const providerPlugins = Array.isArray(compiled.providerPlugins) ? compiled.providerPlugins : [];
    const grokPlugin = providerPlugins.find((value) => value.key === "llmr-local-agent-grok-cli-api-grok-cli-oauth");

    assert.ok(grokPlugin);
    assert.deepEqual(grokPlugin.request.bodyRemove, ["metadata", "external_web_access"]);
  });
});

test("Codex local agent auth hook sets the bearer token and account id from the live login", async (t) => {
  const codex = await codexHookFixture(t);
  codex.seed({ expiresIn: 3600 });

  const upstreamRequest = codexUpstreamRequest();
  const result = await codexHook().authenticate({ upstreamRequest });

  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, `Bearer ${codex.readAuth().tokens.access_token}`);
  assert.equal(result.value.headers["ChatGPT-Account-Id"], "acct-1");
  assert.equal(result.value.headers["x-api-key"], undefined);
  assert.equal(result.value.headers["X-OpenAI-Fedramp"], undefined);
  assert.equal(result.value.url, upstreamRequest.url);
  assert.equal(result.value.body, upstreamRequest.body);
  assert.deepEqual(codex.requests, []);
});

test("#1941 Codex local agent auth hook accepts a token without the connector scopes", async (t) => {
  const codex = await codexHookFixture(t);
  const accessToken = codexJwt({ exp: Math.floor(Date.now() / 1000) + 3600, scp: ["openid", "profile", "email", "offline_access"] });
  codex.seed({ expiresIn: 3600, tokens: { access_token: accessToken } });

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, `Bearer ${accessToken}`);
  assert.deepEqual(codex.requests, []);
});

test("Codex local agent auth hook refreshes an expired login once and saves it", async (t) => {
  const codex = await codexHookFixture(t);
  codex.seed();

  const first = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });
  const saved = codex.readAuth();
  assert.equal(first.ok, true);
  assert.equal(first.value.headers.authorization, `Bearer ${saved.tokens.access_token}`);
  assert.equal(saved.tokens.refresh_token, "r1");

  const retry = await codexHook().authenticate({ forceCodexOauthRefreshOnce: true, upstreamRequest: codexUpstreamRequest() });
  assert.equal(retry.value.headers.authorization, `Bearer ${saved.tokens.access_token}`);
  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0"]);
});

test("Codex local agent auth hook marks a FedRAMP login", async (t) => {
  const codex = await codexHookFixture(t);
  codex.seed({ expiresIn: 3600, tokens: { id_token: codexJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1", chatgpt_account_is_fedramp: true } }) } });

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.equal(result.value.headers["X-OpenAI-Fedramp"], "true");
});

test("Codex local agent auth hook asks for codex login when there is no login", async (t) => {
  const codex = await codexHookFixture(t);

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.deepEqual(result, { error: "Codex login was not found. Run codex login.", ok: false });
  assert.deepEqual(codex.requests, []);
});

test("Codex local agent auth hook keeps a still valid token when the refresh fails", async (t) => {
  const codex = await codexHookFixture(t, { onRequest: () => ({ body: { error: "unavailable" }, status: 503 }) });
  codex.seed({ expiresIn: 30 });
  const stored = codex.readAuth().tokens.access_token;

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, `Bearer ${stored}`);
  assert.equal(codex.requests.length, 1);
});

test("Codex local agent auth hook fails the request when an expired login cannot be refreshed", async (t) => {
  const codex = await codexHookFixture(t, { onRequest: () => ({ body: { error: "refresh_token_reused" }, status: 400 }) });
  codex.seed();

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.equal(result.ok, false);
  assert.match(result.error, /refresh_token_reused\. Run codex login/);
  assert.doesNotMatch(result.error, /r0|eyJ/);
});

test("Codex local agent auth hook fails an expired login that LLMR declines to refresh", async (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic links need extra rights on Windows");
    return;
  }
  const codex = await codexHookFixture(t);
  codex.seed();
  const target = path.join(codex.home, "real-auth.json");
  renameSync(codex.authFile, target);
  symlinkSync(target, codex.authFile);

  const result = await codexHook().authenticate({ upstreamRequest: codexUpstreamRequest() });

  assert.deepEqual(result, { error: "Codex login has expired and LLMR cannot refresh it. Run codex login.", ok: false });
  assert.deepEqual(codex.requests, []);
});

test("local agent OAuth plugin detector only matches managed OAuth imports", () => {
  assert.equal(isLocalAgentOauthProviderPlugin(codexOauthProviderPlugin()), true);
  assert.equal(isLocalAgentOauthProviderPlugin(grokOauthProviderPlugin()), true);
  assert.equal(isLocalAgentOauthProviderPlugin({
    key: "llmr-local-agent-grok-cli-api-grok-cli-api-key"
  }), false);
  assert.equal(isLocalAgentOauthProviderPlugin({
    key: "external-grok-cli-oauth"
  }), false);
});

function codexOauthProviderPlugin() {
  return {
    codexOauth: { accessToken: { from: "llmr.codexLoginIsSetByTheLiveHook" }, refreshIfMissingAccessToken: false, required: false },
    key: "llmr-local-agent-codex-api-codex-oauth",
    providerName: "Codex API"
  };
}

function codexHook() {
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [codexOauthProviderPlugin()] } }).providerHooks;
  assert.equal(hook.key, "module:llmr-live-auth:llmr-local-agent-codex-api-codex-oauth");
  return hook;
}

function codexUpstreamRequest() {
  return {
    body: { input: "hi", model: "gpt-5.5" },
    headers: { "content-type": "application/json", "x-api-key": "client-key" },
    method: "POST",
    url: "https://chatgpt.com/backend-api/codex/responses"
  };
}

function codexJwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(payload)}.`;
}

function codexAccessToken(lifetimeSeconds) {
  return codexJwt({ exp: Math.floor(Date.now() / 1000) + lifetimeSeconds, scp: ["openid", "api.connectors.read", "api.connectors.invoke"] });
}

async function codexHookFixture(t, { onRequest } = {}) {
  const keys = ["CODEX_HOME", "CODEX_REFRESH_TOKEN_URL_OVERRIDE", "HOME", "LLMR_INTERNAL_HOME_DIR", "USERPROFILE"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-codex-hook-test-"));
  const authFile = path.join(home, ".codex", "auth.json");
  mkdirSync(path.dirname(authFile));
  const requests = [];
  const seen = new Set();
  const server = http.createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const payload = JSON.parse(text);
    requests.push(payload);
    const reply = onRequest?.(payload) ?? (seen.has(payload.refresh_token)
      ? { body: { error: "refresh_token_reused" }, status: 400 }
      : { body: { access_token: codexAccessToken(3600), refresh_token: `r${Number(payload.refresh_token.slice(1)) + 1}` }, status: 200 });
    seen.add(payload.refresh_token);
    response.writeHead(reply.status, { "content-type": "application/json" });
    response.end(JSON.stringify(reply.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE = `http://127.0.0.1:${server.address().port}/oauth/token`;
  delete process.env.CODEX_HOME;
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) restoreEnv(key, value);
    await new Promise((resolve) => server.close(resolve));
    rmSync(home, { force: true, recursive: true });
  });
  return {
    authFile,
    home,
    readAuth: () => JSON.parse(readFileSync(authFile, "utf8")),
    requests,
    seed: ({ expiresIn = -10, tokens = {} } = {}) => writeFileSync(authFile, JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: codexAccessToken(expiresIn),
        account_id: "acct-1",
        id_token: codexJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } }),
        refresh_token: "r0",
        ...tokens
      }
    }))
  };
}

function claudeAppsGatewayProviderPlugin(gatewayUrl, providerName = "gw") {
  return {
    auth: { headers: { authorization: "Bearer stale" }, removeHeaders: ["x-api-key"], strict: true },
    claudeAppsGateway: { url: gatewayUrl },
    key: `llmr-local-agent-${providerName}-claude-apps-gateway-oauth`,
    providerName
  };
}

function writeClaudeAppsGatewaySession(t, gatewayUrl, fields) {
  const sourceFile = claudeAppsGatewaySessionFile(gatewayUrl);
  persistClaudeAppsGatewaySession({
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    gatewayUrl,
    models: ["claude-sonnet-4-6"],
    sourceFile,
    ...fields
  });
  t.after(() => rmSync(sourceFile, { force: true }));
}

function stubFetch(t, handler) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(String(input), init);
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function grokOauthProviderPlugin() {
  return {
    auth: {
      headers: {
        authorization: "Bearer imported-stale-token"
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: "llmr-local-agent-grok-cli-api-grok-cli-oauth",
    providerName: "Grok CLI API",
    request: {
      headers: {
        "x-grok-client-identifier": "xai-grok-cli",
        "x-grok-client-version": "0.2.93",
        "x-grok-model-override": "{{ model }}"
      },
      strict: true
    }
  };
}

const callerLogin = "Bearer sk-ant-oat01-FAKE";

function claudeCodeHook() {
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [claudeCodeOauthProviderPlugin()] } }).providerHooks;
  assert.equal(hook.key, "module:llmr-live-auth:llmr-local-agent-claude-code-api-claude-code-oauth");
  return hook;
}

function claudeCodeHookInput(headers) {
  return {
    request: { headers },
    upstreamRequest: {
      headers: { "anthropic-beta": "made-up-beta-2099-01-01", "content-type": "application/json", "x-api-key": "client-key" },
      method: "POST",
      url: "https://api.anthropic.com/v1/messages"
    }
  };
}

function claudeCodeOauthProviderPlugin() {
  return {
    auth: {
      headers: {
        authorization: "Bearer stale-imported-access-token",
        "anthropic-beta": "oauth-2025-04-20"
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: "llmr-local-agent-claude-code-api-claude-code-oauth",
    providerName: "Claude Code API"
  };
}

async function withGrokHome(run) {
  const previousGrokHome = process.env.GROK_HOME;
  const previousGrokAuthFile = process.env.GROK_AUTH_FILE;
  const previousGrokCliVersion = process.env.GROK_CLI_VERSION;
  const grokHome = mkdtempSync(path.join(os.tmpdir(), "llmr-grok-hook-test-"));
  process.env.GROK_HOME = grokHome;
  process.env.GROK_CLI_VERSION = "0.2.93";
  delete process.env.GROK_AUTH_FILE;
  try {
    await run(grokHome);
  } finally {
    restoreEnv("GROK_HOME", previousGrokHome);
    restoreEnv("GROK_AUTH_FILE", previousGrokAuthFile);
    restoreEnv("GROK_CLI_VERSION", previousGrokCliVersion);
    rmSync(grokHome, { force: true, recursive: true });
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function writeGrokAuth(grokHome, auth) {
  writeFileSync(path.join(grokHome, "auth.json"), JSON.stringify({
    "https://auth.x.ai::test-account": auth
  }, null, 2));
}
