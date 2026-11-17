import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { LLMRouterPlugin } from "@llmr/core/gateway/llm-router-plugin.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { coreGatewayAuthHeader } from "@llmr/core/gateway/internal/shared.ts";
import { GatewayRequestPipeline } from "@llmr/core/gateway/request/pipeline.ts";
import { readProviderCredentialCooldown } from "@llmr/core/providers/credential-pool.ts";

const gatewayEntry = path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js");
async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
function successResponse(body) {
  return { id: "chat_test", object: "chat.completion", model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}

// Header assertions cannot show which key and model the core sends upstream,
// so run the host pipeline against a spawned core with the router plugin.
async function run(providerFactory, probes, { configure, publicGatewayMode = false, upstreamTimeoutMs = 5000 } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-credential-routing-"));
  const calls = [];
  let gateway, host, failure;
  const upstream = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text || "{}");
    const token = req.headers.authorization?.replace(/^Bearer /, "") ?? req.headers["x-api-key"];
    const key = token === "good" || token === "bad" ? token : "other";
    calls.push({ path: req.url, body, key, beta: req.headers["anthropic-beta"] });
    if (key === "bad" || failure === "all-fail") {
      if (failure === "network") { req.socket.destroy(); return; }
      if (failure === "timeout") return; // Never respond; the core's upstreamTimeoutMs must end this attempt.
      if (failure === "partial") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (req.url.startsWith("/native")) {
          res.write('event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","model":"pool-model","content":[],"usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n');
        } else if (req.url.includes("responses")) {
          res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n');
        } else {
          res.write('data: {"id":"partial","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
        }
        setTimeout(() => res.destroy(), 30).unref();
        return;
      }
      const status = typeof failure === "number" ? failure : 401;
      res.writeHead(status, { "content-type": "application/json", "retry-after": "0" });
      res.end(JSON.stringify({ error: { message: `synthetic ${status}` } }));
      return;
    }
    const guarded = Boolean(body.safeguards) || req.headers["anthropic-beta"] !== undefined;
    const verdict = guarded ? { safeguard_results: { synthetic_verdict: "allow", tool_use_id: "toolu_guard_test_123" } } : {};
    if (req.url.startsWith("/native") && body.stream) {
      const message = { id: "msg_test", type: "message", role: "assistant", model: body.model, content: [], usage: { input_tokens: 1, output_tokens: 1 } };
      const events = [
        { type: "message_start", message, ...verdict },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_guard_test_123", name: "t", input: {} } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use", ...verdict }, usage: { output_tokens: 1 }, ...verdict },
        { type: "message_stop" }
      ];
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    } else if (req.url.startsWith("/native")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: body.model,
        content: guarded ? [{ type: "tool_use", id: "toolu_guard_test_123", name: "t", input: {} }] : [{ type: "text", text: "ok" }],
        ...verdict, stop_reason: guarded ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    } else if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ ...successResponse(body), object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(successResponse(body)));
    }
  });
  try {
    const url = await listen(upstream);
    const config = createDefaultAppConfig();
    config.Providers = providerFactory(url);
    config.Router.builtInRules = { "claude-code": { enabled: false }, codex: { enabled: false } };
    config.Router.fallback = { mode: "off", models: [], retryCount: 0 };
    config.observability = { ...config.observability, requestLogs: false, agentAnalysis: false };
    config.profile.enabled = false;
    config.profile.profiles = [];
    configure?.(config);
    const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth", undefined, undefined, { publicGatewayMode });
    const router = compiled.plugins.find(plugin => plugin.key === "llm-router");
    router.modulePath = path.resolve(".test-dist/core/runtime/router-plugin.js");
    const reserve = createServer();
    const gatewayUrl = await listen(reserve);
    const port = reserve.address().port;
    await close(reserve);
    const file = path.join(root, "gateway.json");
    writeFileSync(file, JSON.stringify({ host: "127.0.0.1", port, upstreamTimeoutMs,
      auth: { enabled: false }, rawTrace: { enabled: false }, billing: { enabled: false },
      logging: { level: "error", accessLog: false }, scheduling: compiled.scheduling, providers: compiled.providers, plugins: [router],
      virtualModelProfiles: compiled.virtualModelProfiles }));
    gateway = spawn(process.execPath, [gatewayEntry], { cwd: root,
      env: { ...process.env, GATEWAY_CONFIG_PATH: file }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    gateway.stdout.on("data", chunk => { log += chunk; });
    gateway.stderr.on("data", chunk => { log += chunk; });
    let healthy = false;
    for (let i = 0; i < 150; i += 1) {
      if (gateway.exitCode !== null) throw new Error(log);
      try { if ((await fetch(`${gatewayUrl}/health`)).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(healthy, log);
    const plugin = new LLMRouterPlugin(config);
    const pipeline = new GatewayRequestPipeline({ getConfig: () => config, getPlugin: () => plugin,
      getCoreAuthToken: () => "auth", getBrowserWebSearchMcpIntegration: () => undefined,
      getStatus: () => ({ coreEndpoint: gatewayUrl, endpoint: "http://127.0.0.1" }) });
    host = createServer((req, res) => void pipeline.proxyRequest(req, res, req.url).catch(error => { res.writeHead(500); res.end(String(error)); }));
    const publicUrl = await listen(host);
    for (const probe of probes) {
      failure = probe.failure;
      const start = calls.length;
      const response = await fetch((probe.coreOnly ? gatewayUrl : publicUrl) + probe.path, { method: "POST",
        headers: { "content-type": "application/json", "user-agent": "routing-regression",
          ...(probe.coreOnly ? { [publicGatewayMode ? "authorization" : coreGatewayAuthHeader]: publicGatewayMode ? "Bearer auth" : "auth" } : {}),
          ...probe.headers }, body: JSON.stringify(probe.body) });
      let responseText = "";
      try {
        for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) responseText += chunk;
      } catch (error) {
        if (failure !== "partial") throw error;
        responseText += `[socket closed: ${error.message}]`;
      }
      const attempts = calls.slice(start);
      if (!probe.status) assert.ok(attempts.length > 0, `${probe.name}: ${response.status} ${responseText}`);
      for (const attempt of attempts) {
        assert.equal(attempt.body.model, probe.expectedUpstreamModel ?? probe.body.model.slice(probe.body.model.indexOf("/") + 1), probe.name);
        assert.equal(attempt.body.temperature, probe.body.temperature, probe.name);
        assert.equal(attempt.path, attempts[0].path, "credential fallback preserves the endpoint");
      }
      if (probe.status) {
        assert.equal(response.status, probe.status, `${probe.name}: ${responseText}`);
        assert.deepEqual(attempts.map(attempt => attempt.key), probe.keys, probe.name);
      } else if (failure === "all-fail") {
        assert.ok(response.status >= 400, responseText);
        assert.match(responseText, /401|synthetic/);
        assert.equal(attempts[0].key, "bad", probe.name);
        assert.ok(attempts.some(attempt => attempt.key === "good"));
      } else if (failure === "partial") {
        assert.equal(response.status, 200);
        assert.ok(attempts.every(attempt => attempt.key === "bad"), `never retry after stream delivery: ${JSON.stringify({ attempts, responseText })}`);
      } else {
        assert.equal(response.status, 200, `${probe.name}: ${responseText}`);
        assert.equal(attempts.at(-1).key, "good", probe.name);
        if (failure) {
          assert.equal(attempts[0].key, "bad", `${probe.name}: the failing key goes first`);
          assert.ok(attempts.slice(0, -1).every(attempt => attempt.key === "bad"), probe.name);
        }
        if (probe.body.stream) assert.match(responseText, probe.path === "/v1/messages" ? /message_stop/ : /\[DONE\]/);
      }
      probe.assertResponse?.(responseText, attempts);
      assert.ok(attempts.length <= 8, "credential retries must terminate");
    }
    return config;
  } finally {
    await close(host);
    if (gateway && gateway.exitCode === null) {
      gateway.kill();
      await new Promise(resolve => {
        const timer = setTimeout(() => { gateway.kill("SIGKILL"); resolve(); }, 2000);
        gateway.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    await close(upstream);
    rmSync(root, { recursive: true, force: true });
  }
}
const credentials = [{ id: "first", apiKey: "bad", priority: 1 }, { id: "second", apiKey: "good", priority: 2 }];
function probe(model, failure, path = "/v1/chat/completions", stream = false) {
  return { name: `${model}: ${failure ?? "success"}`, failure, path,
    body: { model, stream, temperature: 0.2, max_tokens: 32,
      ...(path === "/v1/responses" ? { input: "hi" } : { messages: [{ role: "user", content: "hi" }] }) } };
}

test("#1920 vendor-prefixed model IDs survive Chat, Responses-compatible conversion and Anthropic ingress", { timeout: 30000 }, async () => {
  await run(url => [{ id: "agg", name: "agg", type: "openai_chat_completions", api_base_url: `${url}/v1`, api_key: "good",
    models: ["openai/gpt-test", "anthropic/claude-test", "poolside/laguna-test"] }],
  ["openai/gpt-test", "anthropic/claude-test", "poolside/laguna-test"].flatMap(model =>
    [probe(`agg/${model}`), probe(`agg/${model}`, undefined, "/v1/messages"), probe(`agg/${model}`, undefined, "/v1/responses")]));
  await run(url => [{ id: "native", name: "native", type: "anthropic_messages", api_base_url: `${url}/native`, api_key: "good", models: ["anthropic/claude-test"] }],
    [probe("native/anthropic/claude-test", undefined, "/v1/messages")]);
});

test("#1923 credential fallback handles HTTP, network, timeout, all-failed and streaming outcomes", { timeout: 30000 }, async () => {
  for (const failure of [401, 403, 429, 503, "network", "timeout", "all-fail", "stream-429", "partial"]) {
    // Each scenario has a fresh pool so cooldowns from an all-failed request
    // cannot skip the first credential in subsequent scenarios.
    const id = `pool-${failure}`;
    const stream = failure === "stream-429" || failure === "partial";
    await run(url => [{ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"], credentials }],
      [probe(`${id}/pool-model`, failure === "stream-429" ? 429 : failure, "/v1/chat/completions", stream)],
      failure === "timeout" ? { upstreamTimeoutMs: 500 } : undefined);
  }
});

test("#1923 a pool reached as a fallback model still falls back across its credentials", { timeout: 30000 }, async () => {
  await run(url => [
    { id: "primary", name: "primary", type: "openai_chat_completions", api_base_url: `${url}/v1`, api_key: "bad", models: ["pool-model"] },
    { id: "fallback-pool", name: "fallback-pool", type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"], credentials }
  ], [probe("primary/pool-model", 401)], {
    configure: config => { config.Router.fallback = { mode: "model-chain", models: ["fallback-pool/pool-model"], retryCount: 0 }; }
  });
});

test("#1920 and #1923 vendor model IDs also support credential fallback and reserved provider IDs", { timeout: 30000 }, async () => {
  for (const id of ["pool-vendor", "openai"]) {
    await run(url => [{ id, name: `Pool ${id}`, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["openai/gpt-test"], credentials }],
      [probe(`${id}/openai/gpt-test`, 401)]);
  }
});

test("#1923 the host cools down a key the core skipped", { timeout: 30000 }, async () => {
  const id = "pool-cooldown";
  const config = await run(url => [{ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"], credentials }],
    [probe(`${id}/pool-model`, 401)]);
  const [provider] = config.Providers;

  assert.equal(readProviderCredentialCooldown(provider, provider.credentials[0])?.reason, "skipped by credential fallback");
  assert.equal(readProviderCredentialCooldown(provider, provider.credentials[1]), undefined);
});

test("#1923 a key that rejects a request for its own reasons is skipped and cooled down", { timeout: 30000 }, async () => {
  for (const status of [400, 402]) {
    const id = `pool-key-${status}`;
    const config = await run(url => [{ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"], credentials }],
      [probe(`${id}/pool-model`, status)]);
    const [provider] = config.Providers;

    assert.equal(readProviderCredentialCooldown(provider, provider.credentials[0])?.reason, "skipped by credential fallback");
    assert.equal(readProviderCredentialCooldown(provider, provider.credentials[1]), undefined);
  }
});

test("#1923 a pinned credential is the only one tried and the only one cooled down", { timeout: 30000 }, async () => {
  const id = "pool-pinned";
  const pin = (credential, protocol = "openai_chat_completions") => `${id}::${protocol}::cred:${credential}/pool-model`;
  const pool = url => [{ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"],
    credentials: [{ id: "working", apiKey: "good", priority: 1 }, { id: "spare", apiKey: "good", priority: 2 }, { id: "broken", apiKey: "bad", priority: 3 }] }];
  const cooldowns = async probes => {
    const [provider] = (await run(pool, probes)).Providers;
    return provider.credentials.map(credential => readProviderCredentialCooldown(provider, credential)?.reason);
  };

  assert.deepEqual(await cooldowns([{ ...probe(pin("spare")), status: 200, keys: ["good"] }]), [undefined, undefined, undefined]);
  assert.deepEqual(await cooldowns([
    { ...probe(pin("broken")), status: 401, keys: ["bad", "bad"] },
    { ...probe(pin("broken")), status: 401, keys: ["bad", "bad"] }
  ]), [undefined, undefined, "HTTP 401"]);
  assert.deepEqual(await cooldowns([
    { ...probe(pin("missing")), status: 400, keys: [] },
    { ...probe(pin("missing", "openai_responses")), status: 400, keys: [] }
  ]), [undefined, undefined, "HTTP 401"]);
});

test("#1923 a pin on the first provider does not follow the request to a fallback pool", { timeout: 30000 }, async () => {
  const pool = (id, keys, url) => ({ id, name: id, type: "openai_chat_completions", api_base_url: `${url}/v1`, models: ["pool-model"],
    credentials: keys.map((apiKey, index) => ({ id: `key-${index + 1}`, apiKey, priority: index + 1 })) });
  await run(url => [pool("pinned-primary", ["bad", "bad"], url), pool("unpinned-fallback", ["good", "bad"], url)],
    [probe("pinned-primary::openai_chat_completions::cred:key-2/pool-model", 401)], {
      configure: config => { config.Router.fallback = { mode: "model-chain", models: ["unpinned-fallback/pool-model"], retryCount: 0 }; }
    });
});

const paths = [
  { via: "host pipeline" },
  { via: "gateway child in public mode", coreOnly: true, publicGatewayMode: true }
];
// The vendored gateway fails these cases (upstream review row 29). The match
// keeps any other failure red, and a gateway that fixes one turns it red too.
const gatewayDefect = match => ({ expectFailure: { label: "vendored gateway defect, upstream review row 29", match } });

test("#1917 a stream cut after its first chunk ends with a terminal error frame", { timeout: 60000 }, async t => {
  for (const scenario of [
    { type: "anthropic_messages", base: "/native", path: "/v1/messages", marker: /event: error/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/chat/completions", marker: /"upstream_stream_error"/ },
    { type: "openai_responses", base: "/responses-native", path: "/v1/responses", marker: /response\.failed/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/messages", marker: /event: error/ },
    { type: "openai_chat_completions", base: "/v1", path: "/v1/responses", marker: /response\.failed/ }
  ]) {
    for (const { via, coreOnly, publicGatewayMode } of paths) {
      await t.test(`${scenario.type} -> ${scenario.path} via ${via}`, coreOnly ? gatewayDefect(/socket closed/) : {}, async () => {
        const id = `cut-${scenario.type}`;
        await run(url => [{ id, name: id, type: scenario.type, api_base_url: url + scenario.base, models: ["pool-model"], credentials }],
          [{ ...probe(`${id}/pool-model`, "partial", scenario.path, true), coreOnly,
            assertResponse: text => assert.match(text, scenario.marker, text) }], { publicGatewayMode });
      });
    }
  }
});

test("#1932 native models keep safeguards, unknown request fields and verdicts", { timeout: 60000 }, async t => {
  const verdict = { synthetic_verdict: "allow", tool_use_id: "toolu_guard_test_123" };
  const guardedProfile = streamMode => ({ id: "guarded", key: "guarded", displayName: "Guarded", enabled: true,
    match: { exactAliases: ["guarded", "Fusion/guarded"], prefixes: [], suffixes: [] },
    baseModel: { mode: "fixed", fixedModel: "safe/guard-model" }, tools: [],
    execution: { mode: "tool_loop", maxTurns: 2, maxToolCalls: 2, clientToolsPolicy: "passthrough", streamMode },
    materialization: { enabled: true, includeInGatewayModels: true } });
  for (const { model, streamMode } of [
    { model: "safe/guard-model" },
    { model: "Fusion/guarded", streamMode: "buffered" },
    { model: "Fusion/guarded", streamMode: "optimistic" }
  ]) {
    for (const { via, coreOnly, publicGatewayMode } of paths) {
      for (const stream of [false, true]) {
        const name = [streamMode ? `virtual model (${streamMode})` : "direct model", via, stream ? "stream" : "json"].join(", ");
        await t.test(name, streamMode ? gatewayDefect(/lost request safeguards/) : {}, async () => {
          const p = { ...probe(model, undefined, "/v1/messages", stream), coreOnly, expectedUpstreamModel: "guard-model" };
          p.body.safeguards = { synthetic_check: { tool_use_id: verdict.tool_use_id, opaque_config: { unknown_future: [1, "keep"] } } };
          p.body.future_native_request = { keep: ["opaque", 123] };
          p.body.tools = [{ name: "t", input_schema: { type: "object" } }];
          p.headers = { "anthropic-beta": "synthetic-safeguards-2026-11-16" };
          p.assertResponse = (text, [call]) => {
            const events = stream ? text.split(/\r?\n/).filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6))) : [];
            const lost = Object.entries({
              "request safeguards": () => assert.deepEqual(call.body.safeguards, p.body.safeguards),
              "unknown request field": () => assert.deepEqual(call.body.future_native_request, p.body.future_native_request),
              "beta header": () => assert.equal(call.beta, p.headers["anthropic-beta"]),
              "tool_use block": () => assert.match(text, /"id":\s*"toolu_guard_test_123"/),
              "verdict": () => stream
                ? assert.deepEqual(events.find(event => event.type === "message_delta")?.delta.safeguard_results, verdict)
                : assert.deepEqual(JSON.parse(text).safeguard_results, verdict)
            }).filter(([, check]) => { try { check(); return false; } catch { return true; } }).map(([what]) => what);
            assert.deepEqual(lost, [], `lost ${lost.join(", ")}: ${text}`);
          };
          await run(url => [{ id: "safe", name: "Safe", type: "anthropic_messages", api_base_url: `${url}/native`, api_key: "good", models: ["guard-model"] }], [p], {
            configure: config => { if (streamMode) config.virtualModelProfiles = [guardedProfile(streamMode)]; }, publicGatewayMode });
        });
      }
    }
  }
});
