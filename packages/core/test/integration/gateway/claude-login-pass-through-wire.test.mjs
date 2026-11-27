import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, mock } from "node:test";
import { RAW_TRACE_SPOOL_DIR } from "@llmr/core/config/constants.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { claudeLoginMissingMessage } from "@llmr/core/gateway/features/claude-login-pass-through.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, getRequestLogs, requestLogRuntime } from "@llmr/core/observability/request-log-store.ts";
import { pluginService } from "@llmr/core/plugins/service.ts";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";
import { withEnv } from "../../support/with-env.mjs";

// The price catalogs load in this process. Only the test's own loopback servers answer.
const loopbackFetch = globalThis.fetch;
mock.method(globalThis, "fetch", (input, init) => {
  const { hostname } = new URL(input instanceof Request ? input.url : String(input));
  return ["127.0.0.1", "[::1]", "localhost"].includes(hostname)
    ? loopbackFetch(input, init)
    : Promise.reject(new TypeError(`fetch failed: ${hostname} is outside the test`));
});

const entry = process.env.LLMR_TEST_GATEWAY_ENTRY;
const skip = !entry && "set LLMR_TEST_GATEWAY_ENTRY to the gateway production entry";
const key = "sk-good-key-0001";
const login = "Bearer sk-ant-oat01-FAKE";
const profileKey = "sk-profile-key-0001";
const codexKey = "sk-codex-key-0002";
const storedToken = "stored-token-0001";
const loginHeaders = { authorization: login, "x-llmr-api-key": profileKey };
const claudeCodeHeaders = { ...loginHeaders, "anthropic-beta": "oauth-2025-04-20,made-up-beta-2099-01-01", "anthropic-version": "2023-06-01", "x-app": "cli" };
const claudeCodeBody = {
  max_tokens: 16,
  messages: [{ content: "hi", role: "user" }],
  model: "claude-opus-4-8",
  system: [{ cache_control: { type: "ephemeral" }, text: "You are a helper. <LLMR-SUBAGENT-MODEL>Provider/native</LLMR-SUBAGENT-MODEL>", type: "text" }],
  tools: [{ description: "Runs a command.", input_schema: { properties: { command: { type: "string" } }, type: "object" }, name: "Bash" }],
  x_future_field: 1
};
const limitReply = { error: { message: "stub limit", type: "rate_limit_error" }, type: "error" };
const loginRefusedReply = { error: { message: "stub invalid login", type: "authentication_error" }, type: "error" };
const webSearchProfile = {
  displayName: "Search",
  enabled: true,
  execution: { clientToolsPolicy: "allow", matchWebSearch: true, maxToolCalls: 8, maxTurns: 6, mode: "tool_loop", streamMode: "optimistic" },
  id: "search-1",
  key: "search",
  match: { exactAliases: [claudeCodeBody.model], prefixes: [], suffixes: [] },
  materialization: { enabled: false, includeInGatewayModels: false },
  metadata: { fusionWebSearch: { provider: "browser", toolName: "web_search_search_1" } },
  tools: [{ name: "web_search_search_1", visibility: "internal" }]
};
const limitHeaders = { "anthropic-ratelimit-unified-status": "stub", "retry-after": "7", "x-should-retry": "false" };
const messageReply = JSON.stringify({
  content: [{ text: "ok", type: "text" }],
  id: "msg_1",
  model: "m",
  role: "assistant",
  stop_reason: "end_turn",
  type: "message",
  usage: { input_tokens: 1, output_tokens: 1 }
});
const messageBody = JSON.stringify({ max_tokens: 16, messages: [{ content: "hi", role: "user" }], model: "Provider/native" });

// node:http rather than fetch, which drops a Host header set by the caller.
function send(port, route, { body, headers = {}, method = "GET", onFirstChunk } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      headers: body === undefined ? headers : { ...headers, "content-length": Buffer.byteLength(body), "content-type": "application/json" },
      host: "127.0.0.1",
      method,
      path: route,
      port
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (!text) onFirstChunk?.();
        text += chunk;
      });
      response.on("end", () => resolve({ body: text, headers: response.headers, status: response.statusCode }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function post(gateway, headers, body, extra = {}) {
  return send(gateway.publicPort, "/v1/messages", { body: JSON.stringify(body), headers, method: "POST", ...extra });
}

// A `security` that records its calls, so a test can prove that serving a config from an earlier import asks nothing of the Keychain.
function withoutKeychain(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-no-keychain-"));
  const calls = path.join(dir, "calls");
  writeFileSync(path.join(dir, "security"), `#!/bin/sh\necho "$1" >> "${calls}"\nexit 44\n`);
  chmodSync(path.join(dir, "security"), 0o755);
  withEnv(t, { CLAUDE_SECURESTORAGE_CONFIG_DIR: dir, PATH: `${dir}${path.delimiter}${process.env.PATH}` });
  return { calls, dir };
}

async function startGateway(t, layout, edit) {
  const keychain = withoutKeychain(t);
  withEnv(t, {
    AUTH_STATIC_API_KEY: "sk-env-key-0003",
    GATEWAY_CORS_ORIGINS: "*",
    LLMR_GATEWAY_ENTRY: entry,
    MANAGER_API_KEY: "abc"
  });
  const service = new gatewayService.constructor();
  const recorded = [];
  const stub = {
    reply: (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(messageReply);
    }
  };
  const upstream = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      recorded.push({ body, headers: req.headers, method: req.method, url: req.url });
      stub.reply(res);
    });
  });
  t.after(async () => {
    await service.stop();
    if (upstream.listening) await new Promise((resolve) => upstream.close(resolve));
    // Removed only after the child has gone: with the stand-in missing, its PATH would reach the real `security`.
    rmSync(keychain.dir, { force: true, recursive: true });
  });
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
  const publicPort = await reserveLoopbackPort();
  const corePort = layout === "single" ? publicPort : await reserveLoopbackPort();
  const config = createDefaultAppConfig();
  const stubUrl = `http://127.0.0.1:${upstream.address().port}`;
  const createdAt = new Date(0).toISOString();
  config.Providers = [
    { api_base_url: stubUrl, api_key: "test-provider-secret", id: "provider", models: ["native"], name: "Provider", type: "anthropic_messages" },
    { api_base_url: stubUrl, api_key: "llmr-local-agent-login", id: "claude-code-api", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" }
  ];
  config.providerPlugins = [{ auth: { headers: { authorization: `Bearer ${storedToken}` }, removeHeaders: ["x-api-key"], strict: true }, key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
  config.APIKEY = key;
  config.APIKEYS = [
    { createdAt, id: "good", key },
    { createdAt, id: "profile:p1", key: profileKey },
    { createdAt, id: "profile:cx", key: codexKey }
  ];
  config.gateway = { ...config.gateway, coreHost: "127.0.0.1", corePort, enabled: true, host: "127.0.0.1", port: publicPort };
  config.mediaTools.enabled = false;
  config.proxy.enabled = false; config.proxy.captureNetwork = false;
  // The two-process layout is selected by the context archive and not by a fallback chain, which would answer a refused request with 200.
  config.contextArchive.enabled = layout === "compat";
  config.observability.requestLogs = false; config.observability.requestLogBodyCapture = "none";
  config.profile.enabled = true;
  config.profile.profiles = [
    { agent: "claude-code", enabled: true, env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" }, id: "p1", model: "", name: "p1", scope: "global" },
    { agent: "codex", enabled: true, id: "cx", model: "", name: "cx", scope: "global" }
  ];
  config.plugins = [];
  edit?.(config);
  const started = await service.start(config);
  assert.equal(started.state, "running", started.lastError);
  assert.equal(Boolean(service.server), layout === "compat");
  return { config, corePort, keychain, publicPort, recorded, service, stub };
}

function attemptMessage(response) {
  return JSON.parse(response.body).error.attempts.at(-1).message;
}

function filesHolding(dir, text) {
  const scan = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) return scan(file);
    return item.isFile() && readFileSync(file).includes(text) ? [file] : [];
  });
  // A file can vanish between the listing and the read, as a SQLite checkpoint does to a -wal file after moving its pages into a database file the scan may have read already, so the whole scan starts over.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return scan(dir);
    } catch (error) {
      if (error.code !== "ENOENT" || attempt === 5) throw error;
    }
  }
}

async function until(predicate, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function headerValues(entry) {
  return Object.values(entry.headers).flat().map(String);
}

// Its worker threads would keep the test process alive.
after(() => closeRequestLogRuntime());

for (const layout of ["single", "compat"]) {
  test(`a gateway key in x-llmr-api-key is accepted (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await send(gateway.publicPort, "/v1/messages", { body: messageBody, headers: { "x-llmr-api-key": key }, method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    const [seen] = gateway.recorded;
    assert.equal(seen.headers["x-api-key"], "test-provider-secret");
    assert.equal("x-llmr-api-key" in seen.headers, false);
    assert.equal(headerValues(seen).some((value) => value.includes(key)), false);
  });

  test(`a login beside the key does not replace the key (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await send(gateway.publicPort, "/v1/messages", { body: messageBody, headers: { authorization: login, "x-llmr-api-key": key }, method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.equal(headerValues(gateway.recorded[0]).some((value) => value.includes("sk-ant-oat01")), false);
  });

  test(`count_tokens and the model list accept the key beside a login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const headers = { authorization: login, "x-llmr-api-key": key };
    const before = gateway.recorded.length;
    const count = await send(gateway.publicPort, "/v1/messages/count_tokens", { body: messageBody, headers, method: "POST" });
    const models = await send(gateway.publicPort, "/v1/models", { headers });

    assert.equal(count.status, 200);
    assert.equal(models.status, 200);
    assert.equal(gateway.recorded.length, before);
  });
  test(`a Claude-login request reaches the upstream with the caller's login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await post(gateway, claudeCodeHeaders, claudeCodeBody);

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    const [seen] = gateway.recorded;
    assert.equal(seen.headers.authorization === login, true, "the upstream gets the caller's login");
    assert.equal("x-api-key" in seen.headers, false);
    assert.equal(seen.headers["anthropic-beta"], claudeCodeHeaders["anthropic-beta"]);
    assert.deepEqual(Object.keys(seen.headers).filter((name) => /^x-(llmr|auth)-/.test(name)), []);
    assert.equal(headerValues(seen).some((value) => value.includes(profileKey) || value.includes(storedToken)), false);
    assert.deepEqual(JSON.parse(seen.body), claudeCodeBody);
  });

  test(`a Claude model id that another provider's model shadows keeps its id and its login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    // Without the login, the front door reads "claude-native" from Claude Code as the other provider's "native".
    const response = await post(gateway, { ...claudeCodeHeaders, "user-agent": "claude-cli/2.1.330 (external, cli)" }, { ...claudeCodeBody, model: "claude-native" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.equal(JSON.parse(gateway.recorded[0].body).model, "claude-native");
    assert.equal(gateway.recorded[0].headers.authorization === login, true, "the upstream gets the caller's login");
  });

  test(`the stored token of an earlier import is never sent, and the Keychain is not asked (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const compiled = JSON.stringify(await compileCoreGatewayConfig(gateway.config, "trace", "billing", "auth"));
    const response = await post(gateway, claudeCodeHeaders, claudeCodeBody);

    assert.equal(compiled.includes(storedToken), false, "the compiled gateway config holds no stored token");
    assert.equal(response.status, 200);
    assert.equal(existsSync(gateway.keychain.calls), false, "nothing ran `security`");
  });

  test(`a streamed response arrives event by event (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`;
    let secondSent = false;
    let firstReadBeforeSecond;
    gateway.stub.reply = (res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(event("message_start", { message: { content: [], id: "msg_1", model: "m", role: "assistant", type: "message", usage: { input_tokens: 1, output_tokens: 0 } } }));
      setTimeout(() => {
        secondSent = true;
        res.end(
          event("content_block_start", { content_block: { text: "", type: "text" }, index: 0 }) +
          event("content_block_delta", { delta: { text: "ok", type: "text_delta" }, index: 0 }) +
          event("content_block_stop", { index: 0 }) +
          event("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }) +
          event("message_stop", {})
        );
      }, 200);
    };
    const response = await post(gateway, claudeCodeHeaders, { ...claudeCodeBody, stream: true }, { onFirstChunk: () => { firstReadBeforeSecond = !secondSent; } });

    assert.equal(response.status, 200);
    assert.equal(firstReadBeforeSecond, true, "the first event is read before the second is sent");
    assert.match(response.body, /message_start[\s\S]*message_stop/);
    assert.equal(gateway.recorded[0].headers.authorization === login, true, "the upstream gets the caller's login");
  });

  test(`a caller without a login gets 400 and the provider is not called (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await post(gateway, { authorization: `Bearer ${codexKey}` }, { ...claudeCodeBody, model: "Claude Code API/claude-sonnet-5" });

    assert.equal(response.status, 400);
    assert.equal(gateway.recorded.length, 0);
    assert.equal(attemptMessage(response).endsWith(claudeLoginMissingMessage), true, "the attempt names the missing login");
  });

  test(`a request that brings its own x-llmr-caller-authorization gets 400 and the provider is not called (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const body = { ...claudeCodeBody, model: "Claude Code API/claude-sonnet-5" };
    const forged = { authorization: `Bearer ${codexKey}`, "x-llmr-caller-authorization": "Bearer forged" };
    const inAuthorization = await post(gateway, forged, body);
    const inKeyHeader = await post(gateway, { "x-llmr-api-key": codexKey, "x-llmr-caller-authorization": "Bearer forged" }, body);

    assert.equal(gateway.recorded.some((seen) => headerValues(seen).some((value) => value.includes("forged"))), false, "no upstream header holds the forged value");
    assert.equal(inAuthorization.status, 400);
    assert.equal(inKeyHeader.status, 400);
    assert.equal(gateway.recorded.length, 0);
    if (layout === "compat") {
      const direct = await send(gateway.corePort, "/v1/messages", { body: JSON.stringify(body), headers: forged, method: "POST" });
      assert.equal(direct.status, 401);
      assert.equal(gateway.recorded.length, 0);
    }
  });

  test(`a Claude-login profile's request for another provider carries no login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await post(gateway, loginHeaders, { ...claudeCodeBody, model: "Provider/native" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.equal(gateway.recorded[0].headers["x-api-key"], "test-provider-secret");
    assert.equal(headerValues(gateway.recorded[0]).some((value) => value.includes("sk-ant-oat01")), false);

    const count = await send(gateway.publicPort, "/v1/messages/count_tokens", { body: JSON.stringify(claudeCodeBody), headers: loginHeaders, method: "POST" });
    assert.equal(count.status, 200);
    assert.equal(gateway.recorded.length, 1);
  });

  test(`an upstream 429 reaches the caller unchanged (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout, (config) => {
      if (layout === "compat") config.Router.fallback = { mode: "retry", models: [], retryCount: 3 };
    });
    gateway.stub.reply = (res) => {
      res.writeHead(429, { "content-type": "application/json", ...limitHeaders });
      res.end(JSON.stringify(limitReply));
    };
    const response = await post(gateway, claudeCodeHeaders, claudeCodeBody);

    assert.equal(response.status, 429);
    assert.deepEqual(JSON.parse(response.body), limitReply);
    assert.deepEqual(Object.fromEntries(Object.keys(limitHeaders).map((name) => [name, response.headers[name]])), limitHeaders);
    assert.equal(gateway.recorded.length, 1);
  });

  test(`an upstream 401 reaches the caller unchanged after one request (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout, (config) => {
      if (layout === "compat") config.Router.fallback = { mode: "retry", models: [], retryCount: 3 };
    });
    gateway.stub.reply = (res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify(loginRefusedReply));
    };
    const response = await post(gateway, claudeCodeHeaders, claudeCodeBody);

    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.body), loginRefusedReply);
    assert.equal(gateway.recorded.length, 1);
  });

  test(`a Claude-login request with no login gets 400 even when another provider lists the model (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout, (config) => {
      config.Providers.push({ api_base_url: config.Providers[0].api_base_url, api_key: "test-other-secret", id: "other", models: [claudeCodeBody.model], name: "Other", type: "anthropic_messages" });
    });
    const response = await post(gateway, { "x-llmr-api-key": profileKey }, claudeCodeBody);

    assert.equal(response.status, 400);
    assert.equal(gateway.recorded.length, 0);
    assert.equal(attemptMessage(response).endsWith(claudeLoginMissingMessage), true, "the attempt names the missing login");
  });

  test(`the front door's body steps leave a Claude-login body as sent (${layout})`, { skip, timeout: 60000 }, async (t) => {
    // Each switch turns on one front-door body step: managed compact with the compact header, hosted web search, a plugin request transform.
    const gateway = await startGateway(t, layout, (config) => {
      config.profile.profiles[0].managedCompact = true;
      config.virtualModelProfiles = [webSearchProfile];
    });
    const transforms = pluginService.gatewayRequestTransforms;
    pluginService.gatewayRequestTransforms = [...transforms, { id: "body-probe", pluginId: "customer", transform: ({ body }) => ({ body: { ...body, x_transformed: true } }) }];
    t.after(() => { pluginService.gatewayRequestTransforms = transforms; });
    const body = { ...claudeCodeBody, tools: [...claudeCodeBody.tools, { max_uses: 1, name: "web_search", type: "web_search_20250305" }] };
    const response = await post(gateway, { ...claudeCodeHeaders, "x-context-compact": "true" }, body);

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.deepEqual(JSON.parse(gateway.recorded[0].body), body);
  });

  test(`a model id with the [1m] suffix goes to the pass-through provider (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await post(gateway, claudeCodeHeaders, { ...claudeCodeBody, model: "claude-opus-4-8[1m]" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.equal(JSON.parse(gateway.recorded[0].body).model, "claude-opus-4-8[1m]");
    assert.equal(gateway.recorded[0].headers.authorization === login, true, "the upstream gets the caller's login");
  });

  test(`no file under the data folder holds the login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    // The log writer loads its worker from beside the running bundle, and a test bundle has none there.
    requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
    const gateway = await startGateway(t, layout, (config) => {
      config.observability.requestLogs = true;
      config.observability.requestLogBodyCapture = "all";
    });
    const spooled = () => existsSync(RAW_TRACE_SPOOL_DIR) ? filesHolding(RAW_TRACE_SPOOL_DIR, "") : [];
    // Bundles of the cases above, whose gateways stopped before sending them, stay in the spool.
    const stale = new Set(spooled());
    const response = await post(gateway, claudeCodeHeaders, claudeCodeBody);
    assert.equal(response.status, 200);

    const logged = await until(async () => {
      await flushRequestLogRuntime(1000);
      return spooled().every((file) => stale.has(file)) && (await getRequestLogs({ pageSize: 10 })).items.length > 0;
    }, 30000);
    assert.equal(logged, true, "the request is logged and its trace bundle is ingested");

    const home = process.env.LLMR_TEST_HOME;
    assert.deepEqual(filesHolding(home, login.slice("Bearer ".length)), []);
    assert.deepEqual(filesHolding(home, profileKey).filter((file) => !/config\.sqlite(-wal|-shm)?$/.test(file)), []);
  });

  test(`a static-key provider keeps its own key (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await send(gateway.publicPort, "/v1/messages", { body: messageBody, headers: { authorization: `Bearer ${key}` }, method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded[0].headers["x-api-key"], "test-provider-secret");
    assert.equal(headerValues(gateway.recorded[0]).some((value) => value.includes(storedToken)), false);
  });
}
