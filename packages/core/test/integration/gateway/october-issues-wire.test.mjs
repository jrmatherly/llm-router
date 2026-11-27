import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { LLMRouterPlugin } from "@llmr/core/gateway/llm-router-plugin.ts";
import { GatewayRequestPipeline } from "@llmr/core/gateway/request/pipeline.ts";
import { RAW_TRACE_SPOOL_DIR } from "@llmr/core/config/constants.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, requestLogRuntime } from "@llmr/core/observability/request-log-store.ts";

import { gatewayService, singleGatewayRuntimeBlockersForTest } from "@llmr/core/gateway/application/gateway-service.ts";
import { pluginService } from "@llmr/core/plugins/service.ts";
import { resolveRuntimeConfigDir } from "@llmr/core/runtime/app-paths.ts";
import { usageStore } from "@llmr/core/usage/store.ts";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

const entry = process.env.LLMR_TEST_GATEWAY_ENTRY;
const skip = !entry && "set LLMR_TEST_GATEWAY_ENTRY to the gateway production entry";
// The request log runtime cannot reopen once closed, and several tests here share it.
after(() => closeRequestLogRuntime());

test("#1850/#1861 fallback attribution reaches OpenAI JSON/SSE clients and request logs", { skip, timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "llmr-october-fallback-"));
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const calls = [];
  const tokenCounts = [];
  const originalTransforms = pluginService.gatewayRequestTransforms;
  pluginService.gatewayRequestTransforms = [{ pluginId: "customer", id: "token-probe",
    transform: input => { tokenCounts.push(input.tokenCount); return undefined; } }];
  const upstream = createServer(async (req, res) => {
    const body = await readJson(req);
    calls.push({ path: req.url, model: body.model });
    if (req.url.startsWith("/primary/")) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "primary quota exhausted" } }));
      return;
    }
    const responses = req.url.endsWith("/responses");
    const payload = responses
      ? { id: "resp_backup", object: "response", model: "backup", status: "completed", output: [{ id: "msg_backup", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "from backup", annotations: [] }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
      : { id: "chatcmpl_backup", object: "chat.completion", model: "backup", choices: [{ index: 0, message: { role: "assistant", content: "from backup" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } };
    res.writeHead(200, { "content-type": body.stream ? "text/event-stream" : "application/json" });
    if (!body.stream) res.end(JSON.stringify(payload));
    else if (responses) res.end(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: payload })}\n\n`);
    else res.end(`data: ${JSON.stringify({ ...payload, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "from backup" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  let gateway;
  let host;
  try {
    const url = await listen(upstream);
    const config = createDefaultAppConfig();
    config.Providers = ["Primary", "Backup"].map(name => ({
      id: name.toLowerCase(), name, api_key: "test", models: [name.toLowerCase()], type: "openai_chat_completions",
      api_base_url: `${url}/${name.toLowerCase()}/v1`,
      capabilities: ["openai_chat_completions", "openai_responses"].map(type => ({ type, source: "detected", baseUrl: `${url}/${name.toLowerCase()}/v1` })),
    }));
    config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
    config.Router.fallback = { mode: "model-chain", models: ["Backup/backup"], retryCount: 0 };
    config.observability = { ...config.observability, requestLogs: true, requestLogBodyCapture: "all", requestLogSuccessSampleRate: 1 };
    const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth");
    const router = compiled.plugins.find(plugin => plugin.key === "llm-router");
    router.modulePath = path.resolve(__dirname, "../../../runtime/router-plugin.js");
    gateway = await startGateway(root, { providers: compiled.providers, plugins: [router] });
    const plugin = new LLMRouterPlugin(config);
    const pipeline = new GatewayRequestPipeline({
      getConfig: () => config, getPlugin: () => plugin, getCoreAuthToken: () => "auth",
      getBrowserWebSearchMcpIntegration: () => undefined,
      getStatus: () => ({ coreEndpoint: gateway.url, endpoint: "http://127.0.0.1" }),
    });
    host = createServer((req, res) => void pipeline.proxyRequest(req, res, req.url).catch(error => { res.writeHead(500); res.end(String(error)); }));
    const hostUrl = await listen(host);
    for (const route of ["/v1/chat/completions", "/v1/responses"]) for (const stream of [false, true]) {
      const before = calls.length;
      const response = await fetch(hostUrl + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "Primary/primary", stream, messages: [{ role: "user", content: "hi" }], input: "hi" }) });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      assert.match(text, /"model":"backup"/);
      assert.match(text, /from backup/);
      assert.doesNotMatch(text, /"model":"primary"/);
      assert.deepEqual(calls.slice(before), [{ path: `/primary${route}`, model: "primary" }, { path: `/backup${route}`, model: "backup" }]);
    }
    assert.equal(tokenCounts.length, 4);
    assert.ok(tokenCounts.every(count => count > 0), `#1869 plugin token input: ${JSON.stringify(tokenCounts)}`);
    await until(async () => { await flushRequestLogRuntime(1000); return (await requestLogRuntime.list({ pageSize: 100 })).items.length === 4; });
    const rows = (await requestLogRuntime.list({ pageSize: 100 })).items;
    assert.ok(rows.every(row => row.provider === "Backup" && row.responseModel === "backup" && row.resolvedModel.includes("backup")), JSON.stringify(rows));
  } finally {
    pluginService.gatewayRequestTransforms = originalTransforms;
    await close(host);
    if (gateway) await stopGateway(gateway);
    await close(upstream);
    rmSync(root, { recursive: true, force: true });
  }
});

test("#1852 built gateway preserves native virtual-model content and usage with billing on/off", { skip, timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "llmr-october-native-stream-"));
  const upstream = createServer(async (req, res) => {
    const body = await readJson(req);
    assert.equal(body.model, "native");
    const payload = { id: "msg_native", type: "message", role: "assistant", model: "native", content: [{ type: "text", text: "native answer café 🌏" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 7 } };
    res.writeHead(200, { "content-type": body.stream ? "text/event-stream" : "application/json" });
    if (!body.stream) { res.end(JSON.stringify(payload)); return; }
    const events = [
      ["message_start", { type: "message_start", message: { ...payload, content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "native reasoning" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "native signature" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "native answer café 🌏" } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    // Send fragmented UTF-8/SSE chunks through actual HTTP, not Fastify inject.
    const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
    const bytes = Buffer.from(text);
    for (let offset = 0; offset < bytes.length; offset += 37) res.write(bytes.subarray(offset, offset + 37));
    res.end();
  });
  let gateway;
  try {
    const upstreamUrl = await listen(upstream);
    for (const billing of [false, true]) {
      gateway = await startGateway(root, { providers: [{ name: "native", type: "anthropic_messages", baseUrl: upstreamUrl, apiKey: "test", models: ["native"] }], billing: { enabled: billing }, virtualModelProfiles: [{ id: "alias", key: "alias", displayName: "Alias", enabled: true, match: { exactAliases: ["alias"], prefixes: [], suffixes: [] }, baseModel: { mode: "fixed", fixedModel: "native/native" }, tools: [], execution: { mode: "tool_loop", maxTurns: 2, maxToolCalls: 2, clientToolsPolicy: "allow", streamMode: "buffered" }, materialization: { enabled: true, includeInGatewayModels: true } }] });
      for (const stream of [false, true]) {
        const response = await fetch(gateway.url + "/v1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "alias", max_tokens: 32, stream, messages: [{ role: "user", content: "hi" }] }) });
        const text = await response.text();
        assert.equal(response.status, 200, text);
        assert.match(text, /native answer café 🌏/);
        assert.match(text, /"output_tokens":7/);
        if (stream) { assert.match(text, /native reasoning/); assert.match(text, /native signature/); }
      }
      await stopGateway(gateway); gateway = undefined;
    }
  } finally {
    if (gateway) await stopGateway(gateway);
    await close(upstream);
    rmSync(root, { recursive: true, force: true });
  }
});

test("#1867 a killed managed core restarts and restores the real service health", { skip, timeout: 30000 }, async () => {
  const originalEntry = process.env.LLMR_GATEWAY_ENTRY;
  process.env.LLMR_GATEWAY_ENTRY = entry;
  const service = new gatewayService.constructor();
  const upstream = createServer((req, res) => { req.resume(); res.end("{}"); });
  try {
    const upstreamUrl = await listen(upstream);
    const publicPort = await reserveLoopbackPort();
    const corePort = await reserveLoopbackPort();
    const config = createDefaultAppConfig();
    config.Providers = [{ name: "Provider", id: "provider", models: ["native"], type: "anthropic_messages", api_base_url: upstreamUrl, api_key: "test" }];
    config.gateway = { ...config.gateway, enabled: true, host: "127.0.0.1", port: publicPort, coreHost: "127.0.0.1", corePort };
    config.Router.fallback = { mode: "model-chain", models: ["Provider/native"], retryCount: 0 };
    config.mediaTools.enabled = false;
    config.proxy.enabled = false; config.proxy.captureNetwork = false;
    config.contextArchive.enabled = false;
    config.observability.requestLogs = false; config.observability.requestLogBodyCapture = "none";
    config.profile.enabled = false; config.profile.profiles = [];
    config.plugins = [];
    const started = await service.start(config);
    assert.equal(started.state, "running", started.lastError);
    const pid = started.pid;
    const auth = service.coreAuthToken;
    service.child.kill("SIGKILL");
    await until(() => service.getStatus().state === "running" && service.getStatus().pid !== pid, 15000);
    assert.ok(service.getStatus().pid);
    assert.notEqual(service.coreAuthToken, auth);
    const health = await fetch(`http://127.0.0.1:${publicPort}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "running");
  } finally {
    await service.stop();
    await close(upstream);
    if (originalEntry === undefined) delete process.env.LLMR_GATEWAY_ENTRY;
    else process.env.LLMR_GATEWAY_ENTRY = originalEntry;
  }
});

for (const layout of ["single", "compat"]) {
  test(`a request for a model no provider has gets one Logs row and one usage event (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const { port, upstreamCalls } = await startWireService(t, layout);
    const since = new Date(Date.now() - 1000);
    const model = `no-provider-has-this-model-${layout}`;
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model }),
      headers: { authorization: "Bearer sk-wire-key-0001", "content-type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400, await response.text());
    assert.deepEqual(upstreamCalls, []);
    let row;
    // The host's own row names no provider; the provider comes only from the child's trace.
    await until(async () => {
      await flushRequestLogRuntime(1000);
      row = (await requestLogRuntime.list({ pageSize: 100 })).items.find(item => item.statusCode === 400 && item.path === "/v1/chat/completions" && item.model === model && item.provider === "Provider");
      return Boolean(row);
    }, 20000);
    const rowFoundAt = Date.now();
    const database = await usageStore.getDatabase();
    const readUsage = async (read) => {
      const totals = await usageStore.getTotalsSince(since, { model }, { includeProxy: true });
      assert.equal(totals.requestCount, 1, `usage read ${read}: ${JSON.stringify(totals)}`);
      assert.equal(totals.errorCount, 1, `usage read ${read}`);
      const events = database.prepare("SELECT provider, request_id, status_code FROM usage_events WHERE model = ?").all(model);
      assert.deepEqual(events, [{ provider: "Provider", request_id: row.requestId, status_code: 400 }], `usage read ${read}`);
    };
    await readUsage(1);
    // A duplicate event would come from a later trace sync, so the second read waits for the log to settle.
    await until(async () => {
      const flushed = await flushRequestLogRuntime(1000);
      return flushed.pending === 0 && !flushed.timedOut && Date.now() - rowFoundAt >= 2000;
    }, 10000);
    await readUsage(2);
  });
}

test("a single-layout Logs row appears within 1500 ms of the answer", { skip, timeout: 60000 }, async (t) => {
  const { port } = await startWireService(t, "single");
  const model = `no-provider-has-this-model-timed-${Date.now()}`;
  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model }),
    headers: { authorization: "Bearer sk-wire-key-0001", "content-type": "application/json" },
    method: "POST"
  });
  assert.equal(response.status, 400, await response.text());
  const answeredAt = Date.now();
  await until(async () => (await requestLogRuntime.list({ pageSize: 100 })).items.some(item => item.model === model), 10000);
  assert.ok(Date.now() - answeredAt < 1500, `row took ${Date.now() - answeredAt} ms`);
});

test("a trace left in the spool gives a usage event dated at its start", { skip, timeout: 60000 }, async (t) => {
  await startWireService(t, "single");
  const turnKey = `spool-left-${Date.now()}`;
  const model = `spool-left-model-${Date.now()}`;
  const startedAt = new Date(Date.now() - 3_600_000).toISOString();
  const bundle = path.join(RAW_TRACE_SPOOL_DIR, turnKey);
  mkdirSync(bundle, { recursive: true });
  const files = {
    client_request_metadata: [path.join(bundle, "client_request_metadata.json"), JSON.stringify({ headers: {} })],
    upstream_response: [path.join(bundle, "upstream_response.json"), JSON.stringify({ model, usage: { input_tokens: 3, output_tokens: 2 } })],
    upstream_response_metadata: [path.join(bundle, "upstream_response_metadata.json"), JSON.stringify({ headers: { "content-type": "application/json" }, statusCode: 200 })]
  };
  for (const [filePath, text] of Object.values(files)) writeFileSync(filePath, text);
  const parts = Object.entries(files).map(([partType, [filePath, text]]) => ({
    ...(partType === "upstream_response" ? { contentType: "application/json", originalBytes: text.length } : {}),
    filePath,
    partType
  }));
  writeFileSync(path.join(bundle, "manifest.json"), JSON.stringify({ parts, requestId: `${turnKey}-bundle`, startedAt, target: { model, providerName: "Provider" }, turnKey }));
  await until(() => usageStore.hasRequestId(turnKey), 10000);
  const event = (await usageStore.getDatabase()).prepare("SELECT created_at FROM usage_events WHERE request_id = ?").get(turnKey);
  assert.equal(event.created_at, startedAt);
});

test("Logs rows sent before the gateway stops are listed after it", { skip, timeout: 60000 }, async (t) => {
  const { port, service } = await startWireService(t, "single");
  const models = [0, 1, 2].map(index => `no-provider-has-this-model-stop-${index}-${Date.now()}`);
  for (const model of models) {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model }),
      headers: { authorization: "Bearer sk-wire-key-0001", "content-type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400, await response.text());
  }
  const listed = async () => (await requestLogRuntime.list({ pageSize: 100 })).items.filter(item => models.includes(item.model)).length;
  await until(async () => await listed() === 3, 10000);
  await service.stop();
  assert.equal(await listed(), 3);
});

test("a request with a wrong API key shows on the gateway status without the key", { skip, timeout: 60000 }, async (t) => {
  const { port, service } = await startWireService(t, "single");
  const wrongKey = "sk-wrong-key-9999";
  const before = refusedKeyCount(service);
  const sentAt = new Date().toISOString();
  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions?x=1`, {
    body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "Provider/native" }),
    headers: { authorization: `Bearer ${wrongKey}`, "content-type": "application/json" },
    method: "POST"
  });
  assert.equal(response.status, 401, await response.text());
  await until(() => refusedKeyCount(service) === before + 1, 5000);
  const { refusedForKey } = service.getStatus();
  const [newest] = refusedForKey.recent;
  assert.ok(newest.at >= sentAt, `newest refusal ${newest.at} was made after ${sentAt}`);
  assert.equal(newest.reason, "Invalid API key.");
  assert.equal(newest.route, "/v1/chat/completions");
  for (const part of [wrongKey, wrongKey.slice(-4), "x=1"]) assert.equal(JSON.stringify(refusedForKey).includes(part), false, part);
});

for (const layout of ["single", "compat"]) {
  test(`an expired key gets the same 401 in both layouts (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const expiredKey = "sk-wire-expired-0002";
    const { port, service } = await startWireService(t, layout, (config) => {
      config.APIKEYS.push({ createdAt: new Date(0).toISOString(), expiresAt: "2020-01-02T00:00:00.000Z", id: "wire-expired", key: expiredKey });
    });
    const before = refusedKeyCount(service);
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "Provider/native" }),
      headers: { authorization: `Bearer ${expiredKey}`, "content-type": "application/json" },
      method: "POST"
    });
    const text = await response.text();
    assert.equal(response.status, 401, text);
    const message = JSON.parse(text).error?.message;
    if (layout === "compat") assert.equal(message, "API key is expired.");
    else assert.match(message, /beforeAuth failed: API key is expired\.$/);
    await until(() => refusedKeyCount(service) === before + 1, 5000);
    assert.equal(service.getStatus().refusedForKey.recent[0].reason, "API key is expired.");
  });
}

test("refused-key counts survive a killed core", { skip, timeout: 60000 }, async (t) => {
  const { port, service } = await startWireService(t, "single");
  const sendWrongKey = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "Provider/native" }),
      headers: { authorization: "Bearer sk-wrong-key-8888", "content-type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 401, await response.text());
  };
  const before = refusedKeyCount(service);
  await sendWrongKey();
  await until(() => refusedKeyCount(service) === before + 1, 5000);
  const { pid } = service.getStatus();
  service.child.kill("SIGKILL");
  await until(() => service.getStatus().state === "running" && service.getStatus().pid !== pid, 15000);
  await sendWrongKey();
  await until(() => refusedKeyCount(service) === before + 2, 5000);
  assert.equal(refusedKeyCount(service), before + 2);
});

const forwarderKey = { createdAt: new Date(0).toISOString(), id: "forwarder", key: "sk-wire-forwarder-0002", trustedForwarder: true };
const markedProfileKey = { createdAt: new Date(0).toISOString(), id: "profile:codex", key: "sk-wire-profile-0003", trustedForwarder: true };

for (const [name, layout] of [["single", "single"], ["compat", "compat"], ["single, logs off", "single"]]) {
  test(`the client label follows the key's trusted forwarder mark (${name})`, { skip, timeout: 90000 }, async (t) => {
    const logsOn = name !== "single, logs off";
    const { port, service } = await startWireService(t, layout, (config) => {
      config.APIKEYS.push(forwarderKey, markedProfileKey);
      if (!logsOn) config.observability.requestLogs = false;
    });
    const modelFor = (kind) => `no-provider-${name.replaceAll(/\W+/g, "-")}-${kind}`;
    const requests = [
      ["marked", { authorization: "Bearer sk-wire-forwarder-0002", "x-claude-gateway-user-email": "dev@example.com" }, 400],
      ["unmarked", { authorization: "Bearer sk-wire-key-0001", "x-auth-api-key-id": "forwarder", "x-auth-sub": "forwarder", "x-claude-gateway-user-email": "other@example.com" }, 400],
      ["profile", { authorization: "Bearer sk-wire-profile-0003", "x-claude-gateway-user-email": "other@example.com" }, 400],
      ["refused", { authorization: "Bearer sk-wrong-key-7777", "x-claude-gateway-user-email": "other@example.com", "x-llmr-client": "Spoof" }, 401]
    ];
    const before = refusedKeyCount(service);
    for (const [kind, headers, status] of requests) {
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: modelFor(kind) }),
        headers: { ...headers, "content-type": "application/json" },
        method: "POST"
      });
      assert.equal(response.status, status, `${kind}: ${await response.text()}`);
    }
    const database = await usageStore.getDatabase();
    const usageRows = (kind) => database.prepare("SELECT client FROM usage_events WHERE model = ?").all(modelFor(kind));
    const expected = {
      marked: layout === "compat" ? "forwarder" : "Node.js",
      profile: layout === "compat" ? "profile:codex" : "Node.js",
      unmarked: layout === "compat" ? "wire" : "Node.js"
    };
    for (const [kind, client] of Object.entries(expected)) {
      await until(() => usageRows(kind).length > 0, 20000);
      assert.deepEqual(usageRows(kind), [{ client }], kind);
    }
    let logRows = [];
    if (logsOn) {
      await until(async () => {
        await flushRequestLogRuntime(1000);
        logRows = (await requestLogRuntime.list({ pageSize: 200 })).items.filter((item) => Object.keys(expected).some((kind) => item.model === modelFor(kind)));
        return Object.keys(expected).every((kind) => logRows.some((item) => item.model === modelFor(kind)));
      }, 20000);
      for (const row of logRows) assert.equal(row.client, expected[Object.keys(expected).find((kind) => row.model === modelFor(kind))], row.model);
    }
    await until(() => refusedKeyCount(service) === before + 1, 5000);
    const { refusedForKey } = service.getStatus();
    assert.equal(refusedForKey.recent[0].client, "Node.js");
    assert.deepEqual(usageRows("refused"), []);
    const stored = JSON.stringify([Object.keys(expected).map(usageRows), logRows, refusedForKey]);
    for (const part of ["other@example.com", "Spoof"]) assert.equal(stored.includes(part), false, part);
  });
}

for (const layout of ["single", "compat"]) {
  test(`the client label holds for every source and caller (${layout})`, { skip, timeout: 120000 }, async (t) => {
    const { port, service, upstreamHeaders } = await startWireService(t, layout, (config) => {
      config.APIKEYS.push(
        forwarderKey,
        { ...markedProfileKey, name: "Profile: Codex" },
        { createdAt: new Date(0).toISOString(), id: "long", key: "sk-wire-long-0004", name: "n".repeat(300) }
      );
    });
    const keys = { forwarder: "sk-wire-forwarder-0002", long: "sk-wire-long-0004", "profile:codex": "sk-wire-profile-0003", wire: "sk-wire-key-0001", wrong: "sk-wrong-key-6666" };
    const identity = (email) => ({ "x-claude-gateway-user-email": email, "x-claude-gateway-user-id": `id-of-${email}`, "x-litellm-end-user-id": email });
    const forged = { "x-auth-api-key-id": "forwarder", "x-auth-sub": "forwarder" };
    const single = layout === "single";
    const cases = [
      ["marked-identity", "forwarder", identity("dev@example.com"), single ? "Node.js" : "forwarder"],
      ["marked-bare", "forwarder", {}, single ? "Node.js" : "forwarder"],
      ["marked-display", "forwarder", { ...identity("dev@example.com"), "x-llmr-client": "Tool" }, "Tool"],
      ["marked-litellm-only", "forwarder", { "x-litellm-end-user-id": "lite@example.com" }, single ? "Node.js" : "forwarder"],
      ["marked-id-only", "forwarder", { "x-claude-gateway-user-id": "sub-123" }, single ? "Node.js" : "forwarder"],
      ["marked-long-email", "forwarder", { "x-claude-gateway-user-email": `${"a".repeat(300)}@example.com` }, single ? "Node.js" : "forwarder"],
      ["plain-forged", "wire", { ...forged, ...identity("other@example.com") }, single ? "Node.js" : "wire"],
      ["plain-display", "wire", { "x-client-name": "MyTool" }, "MyTool"],
      ["plain-long-display", "wire", { "x-llmr-client": "c".repeat(300) }, "c".repeat(120)],
      ["plain-long-agent", "wire", { "user-agent": `${"u".repeat(300)}/1.0` }, single ? "u".repeat(120) : "wire"],
      ["plain-cert", "wire", { "x-forwarded-client-cert": "By=spiffe://a;Hash=b" }, single ? "Node.js" : "wire"],
      ["profile-marked", "profile:codex", identity("other@example.com"), single ? "Node.js" : "Profile: Codex"],
      ["long-key-name", "long", {}, single ? "Node.js" : "n".repeat(120)],
      ["refused", "wrong", { ...forged, ...identity("other@example.com"), "user-agent": `${"r".repeat(300)}/1.0`, "x-client-name": "Spoof", "x-forwarded-client-cert": "Spoof", "x-llmr-client": "Spoof" }],
      ["missing", undefined, { ...forged, ...identity("other@example.com"), "x-llmr-client": "Spoof" }]
    ];
    const modelFor = (request) => `audit-${layout}-${request}`;
    const send = async (key, headers, model) => {
      const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        body: JSON.stringify({ max_tokens: 16, messages: [{ content: "hi", role: "user" }], model }),
        headers: { ...(key ? { authorization: `Bearer ${keys[key]}` } : {}), ...headers, "content-type": "application/json" },
        method: "POST"
      });
      const text = await response.text();
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { status: response.status, text };
    };
    const before = refusedKeyCount(service);
    for (const [request, key, headers, client] of cases) {
      const { status, text } = await send(key, headers, modelFor(request));
      assert.equal(status, client === undefined ? 401 : 400, `${request}: ${text}`);
    }
    const upstream = await send("forwarder", { ...identity("dev@example.com"), "client-cert": ":MIIB:", "x-client-name": "codex-cli" }, "Provider/native");
    assert.equal(upstream.status, 200, upstream.text);

    const database = await usageStore.getDatabase();
    const usageRows = (request) => database.prepare("SELECT client FROM usage_events WHERE model = ?").all(modelFor(request));
    const accepted = cases.filter(([, , , client]) => client !== undefined);
    for (const [request, , , client] of accepted) {
      await until(() => usageRows(request).length > 0, 20000);
      assert.deepEqual(usageRows(request), [{ client }], request);
    }
    let logRows = [];
    await until(async () => {
      await flushRequestLogRuntime(1000);
      logRows = (await requestLogRuntime.list({ pageSize: 500 })).items.filter((item) => item.model?.startsWith(`audit-${layout}-`) || item.model?.endsWith("native"));
      return accepted.every(([request]) => logRows.some((item) => item.model === modelFor(request)));
    }, 20000);
    for (const [request, , , client] of accepted) {
      for (const row of logRows.filter((item) => item.model === modelFor(request))) assert.equal(row.client, client, request);
    }
    for (const request of ["refused", "missing"]) {
      assert.deepEqual(usageRows(request), [], request);
      assert.equal(logRows.some((item) => item.model === modelFor(request)), false, request);
    }
    await until(() => refusedKeyCount(service) === before + 2, 5000);
    const [newest, previous] = service.getStatus().refusedForKey.recent;
    assert.equal(newest.client, "Node.js");
    assert.equal(previous.client, "r".repeat(120));
    if (!single) {
      const forgedRow = logRows.find((item) => item.model === modelFor("plain-forged"));
      for (const name of Object.keys(identity("x"))) assert.equal(forgedRow.requestHeaders[name], "[redacted]", name);
    }
    const details = await Promise.all(logRows.map((row) => requestLogRuntime.getDetail({ id: row.id })));
    const stored = JSON.stringify([logRows, details]);
    for (const part of ["other@example.com", "id-of-other", "Spoof"]) assert.equal(stored.includes(part), false, part);
    for (const row of [...logRows, ...details]) {
      assert.equal(JSON.stringify([row?.requestHeaders, row?.responseHeaders, row?.routeTrace]).includes("dev@example.com"), false, row?.model);
    }
    assert.equal(upstreamHeaders.length, 1);
    assert.deepEqual(Object.keys(upstreamHeaders[0]).filter((header) => /claude-gateway|litellm|client-cert|x-client-name|x-auth|x-llmr/.test(header)), []);
  });
}

for (const layout of ["single", "compat"]) {
  test(`a request from a marked key is recorded under the developer's id and e-mail, and one from another key naming the same developer is not (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const { port } = await startWireService(t, layout, (config) => {
      config.APIKEYS.push(forwarderKey);
    });
    const identity = { "x-claude-gateway-user-email": "dev@example.com", "x-claude-gateway-user-id": "sub-123", "x-litellm-end-user-id": "dev@example.com" };
    const modelFor = (kind) => `forwarded-${layout}-${kind}`;
    for (const [kind, key] of [["marked", "sk-wire-forwarder-0002"], ["plain", "sk-wire-key-0001"]]) {
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: modelFor(kind) }),
        headers: { ...identity, authorization: `Bearer ${key}`, "content-type": "application/json" },
        method: "POST"
      });
      assert.equal(response.status, 400, `${kind}: ${await response.text()}`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    const database = await usageStore.getDatabase();
    const usageRows = (kind) => database.prepare("SELECT client, forwarded_user_email, forwarded_user_id FROM usage_events WHERE model = ?").all(modelFor(kind)).map((row) => ({ ...row }));
    const expected = {
      marked: { client: layout === "compat" ? "forwarder" : "Node.js", forwarded_user_email: "dev@example.com", forwarded_user_id: "sub-123" },
      plain: { client: layout === "compat" ? "wire" : "Node.js", forwarded_user_email: "", forwarded_user_id: "" }
    };
    for (const [kind, row] of Object.entries(expected)) {
      await until(() => usageRows(kind).length > 0, 20000);
      assert.deepEqual(usageRows(kind), [row], kind);
    }
    let logRows = [];
    await until(async () => {
      await flushRequestLogRuntime(1000);
      logRows = (await requestLogRuntime.list({ pageSize: 200 })).items.filter((item) => Object.keys(expected).some((kind) => item.model === modelFor(kind)));
      return Object.keys(expected).every((kind) => logRows.some((item) => item.model === modelFor(kind)));
    }, 20000);
    for (const row of logRows) {
      const marked = row.model === modelFor("marked");
      assert.deepEqual([row.client, row.forwardedUserEmail, row.forwardedUserId], marked
        ? [expected.marked.client, "dev@example.com", "sub-123"]
        : [expected.plain.client, undefined, undefined], row.model);
    }
  });
}

function refusedKeyCount(service) {
  return service.getStatus().refusedForKey?.count ?? 0;
}

async function startWireService(t, layout, configure) {
  const originalEntry = process.env.LLMR_GATEWAY_ENTRY;
  process.env.LLMR_GATEWAY_ENTRY = entry;
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const service = new gatewayService.constructor();
  const upstreamCalls = [];
  const upstreamHeaders = [];
  const upstream = createServer((req, res) => {
    upstreamCalls.push(req.url);
    upstreamHeaders.push(req.headers);
    req.resume();
    if (!req.url?.endsWith("/v1/messages")) return res.end("{}");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg_wire", model: "native", role: "assistant", stop_reason: "end_turn", stop_sequence: null, type: "message", usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  t.after(async () => {
    await service.stop();
    await close(upstream);
    if (originalEntry === undefined) delete process.env.LLMR_GATEWAY_ENTRY;
    else process.env.LLMR_GATEWAY_ENTRY = originalEntry;
  });
  const upstreamUrl = await listen(upstream);
  const port = await reserveLoopbackPort();
  const corePort = layout === "single" ? port : await reserveLoopbackPort();
  const config = createDefaultAppConfig();
  config.Providers = [{ name: "Provider", id: "provider", models: ["native"], type: "anthropic_messages", api_base_url: upstreamUrl, api_key: "test" }];
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "wire", key: "sk-wire-key-0001" }];
  config.APIKEY = "sk-wire-key-0001";
  config.gateway = { ...config.gateway, enabled: true, host: "127.0.0.1", port, coreHost: "127.0.0.1", corePort };
  config.mediaTools.enabled = false;
  config.proxy.enabled = false; config.proxy.captureNetwork = false;
  config.contextArchive.enabled = layout === "compat";
  config.observability = { ...config.observability, requestLogs: true, requestLogBodyCapture: "all", requestLogSuccessSampleRate: 1 };
  config.profile.enabled = false; config.profile.profiles = [];
  config.plugins = [];
  configure?.(config);
  assert.deepEqual(singleGatewayRuntimeBlockersForTest(config, { gatewayRuntimeSupportsRouterPlugin: () => true }), layout === "single" ? [] : ["context-archive"]);
  const started = await service.start(config);
  assert.equal(started.state, "running", started.lastError);
  assert.equal(Boolean(service.server), layout === "compat");
  return { port, service, upstreamCalls, upstreamHeaders };
}

test("Codex requests reach the upstream unchanged when the login comes from the live hook", { skip, timeout: 30000 }, async (t) => {
  const codex = await codexWireFixture(t);
  const importedToken = codex.seed(3600);
  const gateway = await codex.start();
  // A login rotated after the gateway started must reach the upstream, so the token is read live.
  const accessToken = codex.seed(3600);
  const clientResponses = [];
  for (const stream of [false, true]) {
    const response = await codex.send(gateway, stream);
    clientResponses.push({ status: response.status, contentType: response.headers.get("content-type"), text: await response.text() });
  }
  const gatewayConfig = readFileSync(path.join(codex.root, "gateway.json"), "utf8");
  assert.ok(gatewayConfig.includes("local-agent-auth-provider-hook.js"));
  assert.equal(gatewayConfig.includes(importedToken), false);
  assert.equal(gatewayConfig.includes(JSON.stringify("r0")), false);
  assert.deepEqual(codex.tokenCalls, []);
  assert.equal(codex.upstreamCalls.length, 2);
  for (const call of codex.upstreamCalls) {
    assert.equal(call.method, "POST");
    assert.equal(call.path, "/backend-api/codex/responses");
    assert.equal(call.headers.authorization, `Bearer ${accessToken}`);
    assert.equal(call.headers["chatgpt-account-id"], "acct-wire");
    assert.equal(call.headers.accept, "*/*");
    assert.equal(call.headers["content-type"], "application/json");
    assert.equal(call.headers["x-openai-fedramp"], undefined);
    assert.deepEqual(call.body, { model: "gpt-5.5", stream: true, input: "hi", store: false, instructions: "You are a helpful assistant." });
  }
  // The gateway forces stream: true upstream and hands the event stream back to a non-streaming client as it is.
  assert.deepEqual(clientResponses.map(response => [response.status, response.contentType]), [[200, "text/event-stream"], [200, "text/event-stream; charset=utf-8"]]);
  for (const response of clientResponses) assert.equal(response.text, codex.eventStream);
});

test("Codex requests refresh an expired login once inside the gateway and save it", { skip, timeout: 30000 }, async (t) => {
  const codex = await codexWireFixture(t);
  codex.seed(-10);
  const gateway = await codex.start();
  const first = await codex.send(gateway, false);
  assert.equal(first.status, 200);
  await first.text();
  const saved = JSON.parse(readFileSync(codex.authFile, "utf8"));
  assert.deepEqual(codex.tokenCalls, ["r0"]);
  assert.equal(saved.tokens.refresh_token, "r1");
  assert.equal(saved.tokens.access_token, codex.issued[0]);
  assert.equal(codex.upstreamCalls[0].headers.authorization, `Bearer ${codex.issued[0]}`);
  // The child takes the lock in the same LLMR config directory as the host.
  assert.ok(existsSync(codex.lockDir));
  assert.deepEqual(readdirSync(codex.lockDir), []);

  const second = await codex.send(gateway, false);
  assert.equal(second.status, 200);
  await second.text();
  assert.deepEqual(codex.tokenCalls, ["r0"]);
  assert.equal(codex.upstreamCalls[1].headers.authorization, `Bearer ${codex.issued[0]}`);
});

test("three concurrent Codex requests with an expired login make one token call", { skip, timeout: 30000 }, async (t) => {
  const codex = await codexWireFixture(t);
  codex.seed(-10);
  const gateway = await codex.start();
  const responses = await Promise.all([false, true, false].map(stream => codex.send(gateway, stream)));
  await Promise.all(responses.map(response => response.text()));
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
  assert.deepEqual(codex.tokenCalls, ["r0"]);
  assert.deepEqual(codex.upstreamCalls.map(call => call.headers.authorization), Array(3).fill(`Bearer ${codex.issued[0]}`));
});

test("an upstream 401 on a Codex request makes no token call", { skip, timeout: 30000 }, async (t) => {
  const codex = await codexWireFixture(t, { upstreamStatus: 401 });
  const accessToken = codex.seed(3600);
  const gateway = await codex.start();
  const response = await codex.send(gateway, false);
  await response.text();
  assert.equal(response.status, 401);
  assert.deepEqual(codex.tokenCalls, []);
  // The gateway retries once after a 401; the hook reads the same unexpired login again.
  assert.equal(codex.upstreamCalls.length, 2);
  for (const call of codex.upstreamCalls) assert.equal(call.headers.authorization, `Bearer ${accessToken}`);
});

test("#1941 a Codex login without the connector scopes reaches the upstream, before and after a refresh", { skip, timeout: 30000 }, async (t) => {
  const codex = await codexWireFixture(t, { scp: ["openid", "profile", "email", "offline_access"] });
  const accessToken = codex.seed(3600);
  const gateway = await codex.start();
  const fresh = await codex.send(gateway, false);
  assert.equal(fresh.status, 200, await fresh.text());
  assert.deepEqual(codex.tokenCalls, []);
  assert.equal(codex.upstreamCalls[0].headers.authorization, `Bearer ${accessToken}`);

  codex.seed(-10);
  const refreshed = await codex.send(gateway, false);
  assert.equal(refreshed.status, 200, await refreshed.text());
  assert.deepEqual(codex.tokenCalls, ["r0"]);
  assert.equal(codex.upstreamCalls[1].headers.authorization, `Bearer ${codex.issued[0]}`);
});

async function codexWireFixture(t, { scp = ["openid", "api.connectors.read", "api.connectors.invoke"], upstreamStatus = 200 } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "llmr-codex-wire-"));
  const envKeys = ["CODEX_HOME", "HOME", "LLMR_INTERNAL_HOME_DIR", "USERPROFILE"];
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { HOME: root, USERPROFILE: root, LLMR_INTERNAL_HOME_DIR: root });
  delete process.env.CODEX_HOME;
  const lockDir = path.join(resolveRuntimeConfigDir(), "locks");
  const authFile = path.join(root, ".codex", "auth.json");
  mkdirSync(path.dirname(authFile));
  const upstreamCalls = [];
  const tokenCalls = [];
  const issued = [];
  const gateways = [];
  const payload = { id: "resp_codex", object: "response", model: "gpt-5.5", status: "completed", output: [{ id: "msg_codex", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "from codex", annotations: [] }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } };
  const eventStream = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: payload })}\n\n`;
  const stub = createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.url === "/oauth/token") {
      const reused = tokenCalls.includes(body.refresh_token);
      tokenCalls.push(body.refresh_token);
      if (reused) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "refresh_token_reused" }));
        return;
      }
      issued.push(codexWireToken(3600, scp));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: issued.at(-1), refresh_token: `r${Number(body.refresh_token.slice(1)) + 1}` }));
      return;
    }
    upstreamCalls.push({ method: req.method, path: req.url, headers: req.headers, body });
    if (upstreamStatus !== 200) {
      res.writeHead(upstreamStatus, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "unauthorized" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(eventStream);
  });
  t.after(async () => {
    for (const gateway of gateways) await stopGateway(gateway);
    await close(stub);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  const stubUrl = await listen(stub);
  // The gateway always sends Codex requests to chatgpt.com, so the child's own dispatcher redirects them.
  const preload = path.join(root, "redirect-chatgpt.mjs");
  writeFileSync(preload, `import { createRequire } from "node:module";
const { Agent, setGlobalDispatcher } = createRequire(process.env.LLMR_TEST_GATEWAY_ENTRY)("undici");
const target = new URL(process.env.LLMR_TEST_CHATGPT_ORIGIN).origin;
class LoopbackOnly extends Agent {
  dispatch(options, handler) {
    const origin = new URL(options.origin).origin;
    if (origin === "https://chatgpt.com") return super.dispatch({ ...options, origin: target }, handler);
    if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Unexpected upstream " + origin);
    return super.dispatch(options, handler);
  }
}
setGlobalDispatcher(new LoopbackOnly());
`);
  let providerName;
  return {
    authFile,
    eventStream,
    issued,
    lockDir,
    root,
    tokenCalls,
    upstreamCalls,
    seed(lifetimeSeconds) {
      const accessToken = codexWireToken(lifetimeSeconds, scp);
      writeFileSync(authFile, JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: accessToken, account_id: "acct-wire", refresh_token: "r0" } }));
      return accessToken;
    },
    async start() {
      const login = JSON.parse(readFileSync(authFile, "utf8")).tokens;
      const config = createDefaultAppConfig();
      config.Providers = [{ api_base_url: "https://chatgpt.com/backend-api/codex", api_key: "llmr-local-agent-login", id: "codex-api", models: ["gpt-5.5"], name: "Codex API", type: "openai_responses" }];
      config.providerPlugins = [{ codexOauth: { accessToken: login.access_token, accountId: "acct-wire", refreshIfMissingAccessToken: true, refreshToken: login.refresh_token, required: true }, key: "llmr-local-agent-codex-api-codex-oauth", providerName: "Codex API", request: { bodyRemove: ["max_output_tokens"] } }];
      const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth");
      providerName = compiled.providers[0].name;
      const plugins = compiled.plugins.filter(plugin => plugin.key !== "llm-router").map(plugin => ({ ...plugin, modulePath: path.resolve(__dirname, "../../../runtime", path.basename(plugin.modulePath)) }));
      const env = { ...process.env, HOME: root, USERPROFILE: root, LLMR_INTERNAL_HOME_DIR: root, CODEX_REFRESH_TOKEN_URL_OVERRIDE: `${stubUrl}/oauth/token`, LLMR_TEST_CHATGPT_ORIGIN: stubUrl, NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(" ") };
      delete env.CODEX_HOME;
      const gateway = await startGateway(root, { providers: compiled.providers, providerPlugins: compiled.providerPlugins, plugins }, env);
      gateways.push(gateway);
      return gateway;
    },
    send(gateway, stream) {
      return fetch(`${gateway.url}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: `${providerName}/gpt-5.5`, stream, input: "hi", max_output_tokens: 16 }) });
    }
  };
}

function codexWireToken(lifetimeSeconds, scp) { return testJwt({ exp: Math.floor(Date.now() / 1000) + lifetimeSeconds, scp }); }
function testJwt(payload) { const part = value => Buffer.from(JSON.stringify(value)).toString("base64url"); return `${part({ alg: "none", typ: "JWT" })}.${part(payload)}.`; }
async function readJson(request) { let text = ""; for await (const chunk of request) text += chunk; return JSON.parse(text || "{}"); }
async function listen(server) { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
async function until(predicate, timeout = 10000) { const deadline = Date.now() + timeout; do { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); } while (Date.now() < deadline); assert.fail("Timed out waiting for gateway/logs."); }
async function startGateway(root, config, env = process.env) {
  const port = await reserveLoopbackPort(); const url = `http://127.0.0.1:${port}`;
  const file = path.join(root, "gateway.json");
  writeFileSync(file, JSON.stringify({ host: "127.0.0.1", port, auth: { enabled: false }, rawTrace: { enabled: false }, billing: { enabled: false }, logging: { level: "error", accessLog: false }, ...config }));
  const child = spawn(process.execPath, [entry], { env: { ...env, GATEWAY_CONFIG_PATH: file }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => output += chunk);
  try { await until(async () => { if (child.exitCode !== null) throw new Error(output); try { return (await fetch(url + "/health")).ok; } catch { return false; } }); return { child, url }; }
  catch (error) { child.kill(); throw new Error(`${error}\n${output}`); }
}
async function stopGateway({ child }) { if (child.exitCode !== null) return; child.kill(); await new Promise(resolve => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
