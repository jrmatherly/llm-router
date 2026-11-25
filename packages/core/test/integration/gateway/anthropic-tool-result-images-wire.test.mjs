import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { toCoreGatewayProviders } from "@llmr/core/providers/runtime-topology.ts";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

function fakePngBase64() {
  const ihdr = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
  ihdr.writeUInt32BE(13, 8);
  ihdr.write("IHDR", 12, "ascii");
  ihdr.writeUInt32BE(640, 16);
  ihdr.writeUInt32BE(480, 20);
  return ihdr.toString("base64") + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(64);
}

test("wire: tool_result images convert to multimodal inlineData / image_url instead of stringified Base64 JSON", { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "llmr-tool-result-images-"));
  const pngData = fakePngBase64();
  const captured = [];

  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    captured.push({ url: request.url, body });

    if (request.url?.includes(":generateContent")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        candidates: [{
          content: { role: "model", parts: [{ text: "Gemini saw the image." }] },
          finishReason: "STOP"
        }],
        usageMetadata: { promptTokenCount: 280, candidatesTokenCount: 6, totalTokenCount: 286 }
      }));
      return;
    }

    if (request.url?.endsWith("/chat/completions")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-vision",
        object: "chat.completion",
        model: "qwen3.8-max",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "Qwen saw the image." },
          finish_reason: "stop"
        }],
        usage: { prompt_tokens: 310, completion_tokens: 6, total_tokens: 316 }
      }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "msg-anthropic",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: "Claude saw the native tool_result image." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 300, output_tokens: 8 }
    }));
  });

  let child;
  let exited;
  let output = "";

  try {
    await listen(upstream);
    const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
    const port = await reserveLoopbackPort();

    const appConfig = createDefaultAppConfig();
    appConfig.Providers = [
      {
        apiKey: "test-gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        id: "google-gemini",
        models: ["gemini-4-argon"],
        name: "Google Gemini",
        type: "gemini_generate_content"
      },
      {
        apiKey: "test-qwen",
        baseUrl: "https://openrouter.ai/api/v1",
        id: "qwen",
        models: ["qwen3.8-max"],
        name: "QwenTokenPlan",
        type: "openai_chat_completions"
      },
      {
        apiKey: "test-claude",
        baseUrl: "https://api.anthropic.com",
        id: "anthropic-native",
        models: ["claude-sonnet-5-5"],
        name: "AnthropicNative",
        type: "anthropic_messages"
      }
    ];

    const configFile = path.join(root, "gateway.json");
    const redirectFile = path.join(root, "loopback-transport.cjs");
    writeFileSync(redirectFile, `exports.createGatewayPlugin = () => ({ providerHooks: [{
      key: 'test-loopback-transport', transformRequest({upstreamRequest}) {
        const url = new URL(upstreamRequest.url);
        return {ok: true, value: {...upstreamRequest, url: ${JSON.stringify(upstreamOrigin)} + url.pathname + url.search}};
      }
    }] });`);

    writeFileSync(configFile, JSON.stringify({
      host: "127.0.0.1",
      port,
      logging: { enabled: false },
      providers: appConfig.Providers.flatMap((provider) => toCoreGatewayProviders(provider)),
      plugins: [
        {
          key: "llm-router",
          modulePath: path.resolve(".test-dist/core/runtime/router-plugin.js"),
          config: { appConfig }
        },
        { key: "test-transport", modulePath: redirectFile }
      ]
    }));

    child = spawn(process.execPath, [path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js")], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
        GATEWAY_CONFIG_PATH: configFile,
        LLMR_TEST_FILE: process.env.LLMR_TEST_FILE,
        LLMR_TEST_NETWORK_LOG: process.env.LLMR_TEST_NETWORK_LOG,
        NODE_OPTIONS: process.env.NODE_OPTIONS
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    exited = once(child, "exit");
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8000); });

    const origin = `http://127.0.0.1:${port}`;
    await waitForGateway(origin, child, () => output);

    const buildReadImageTurn = (model) => ({
      model,
      max_tokens: 128,
      tools: [
        {
          name: "Read",
          description: "Read a file or image",
          input_schema: { type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"] }
        }
      ],
      messages: [
        { role: "user", content: "Inspect prototype.png" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "call_read_img", name: "Read", input: { file_path: "/tmp/prototype.png" } }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_read_img",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: pngData }
                }
              ]
            }
          ]
        }
      ]
    });

    const geminiResp = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(buildReadImageTurn("Google Gemini/gemini-4-argon"))
    });
    assert.equal(geminiResp.status, 200, await geminiResp.clone().text());

    assert.equal(captured.length, 1);
    const geminiUpstream = captured[0].body;
    const geminiLastTurnParts = geminiUpstream.contents.at(-1).parts;
    const geminiFnResp = geminiLastTurnParts.find((part) => part.functionResponse);
    const geminiInlineData = geminiLastTurnParts.find((part) => part.inlineData);
    assert.ok(geminiFnResp, "Gemini turn must contain functionResponse");
    assert.ok(geminiInlineData, "Gemini turn must contain inlineData");
    assert.equal(JSON.stringify(geminiFnResp).includes(pngData.slice(0, 48)), false, "functionResponse must not contain raw Base64");
    assert.equal(geminiInlineData.inlineData.mimeType, "image/png");
    assert.equal(geminiInlineData.inlineData.data, pngData);

    const qwenResp = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(buildReadImageTurn("QwenTokenPlan/qwen3.8-max"))
    });
    assert.equal(qwenResp.status, 200, await qwenResp.clone().text());

    assert.equal(captured.length, 2);
    const qwenUpstream = captured[1].body;
    const toolMessage = qwenUpstream.messages.find((msg) => msg.role === "tool");
    const trailingUserMessage = qwenUpstream.messages.at(-1);
    assert.ok(toolMessage, "OpenAI chat payload must include role=tool");
    assert.equal(JSON.stringify(toolMessage).includes(pngData.slice(0, 48)), false, "role=tool must not contain raw Base64");
    assert.match(JSON.stringify(toolMessage), /attached in this user message as image #1/);
    assert.equal(trailingUserMessage.role, "user");
    assert.ok(Array.isArray(trailingUserMessage.content));
    assert.equal(trailingUserMessage.content[0].type, "image_url");
    assert.equal(trailingUserMessage.content[0].image_url.url, `data:image/png;base64,${pngData}`);

    const claudeResp = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(buildReadImageTurn("AnthropicNative/claude-sonnet-5-5"))
    });
    assert.equal(claudeResp.status, 200, await claudeResp.clone().text());

    assert.equal(captured.length, 3);
    const claudeUpstream = captured[2].body;
    const claudeToolResult = claudeUpstream.messages.at(-1).content;
    assert.equal(claudeToolResult.length, 1);
    assert.equal(claudeToolResult[0].type, "tool_result");
    assert.equal(claudeToolResult[0].content[0].type, "image");
    assert.equal(claudeToolResult[0].content[0].source.data, pngData);

    const parallel = buildReadImageTurn("QwenTokenPlan/qwen3.8-max");
    parallel.messages[1].content.push({ type: "tool_use", id: "call_read_img_2", name: "Read", input: { file_path: "/tmp/b.png" } });
    parallel.messages[2].content.push({ ...parallel.messages[2].content[0], tool_use_id: "call_read_img_2" });
    const post = (model) => fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ ...parallel, model })
    });

    assert.equal((await post("QwenTokenPlan/qwen3.8-max")).status, 200);
    assert.deepEqual(
      captured.at(-1).body.messages.slice(2).map((msg) => msg.role),
      ["tool", "tool", "user"],
      "both tool messages must directly follow the assistant tool calls"
    );
    assert.equal(captured.at(-1).body.messages.at(-1).content.length, 2);
    assert.equal(JSON.stringify(captured.at(-1).body.messages.slice(2, 4)).includes(pngData.slice(0, 48)), false);

    assert.equal((await post("Google Gemini/gemini-4-argon")).status, 200);
    assert.deepEqual(
      captured.at(-1).body.contents.at(-1).parts.map((part) => Object.keys(part)[0]),
      ["functionResponse", "functionResponse", "inlineData", "inlineData"],
      "function responses must not be interleaved with images"
    );
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(force);
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});

async function waitForGateway(origin, child, readOutput) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(readOutput());
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await delay(50);
  }
  assert.fail(`Gateway did not become ready.\n${readOutput()}`);
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
