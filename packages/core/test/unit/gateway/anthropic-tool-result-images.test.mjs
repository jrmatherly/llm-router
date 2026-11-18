import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import {
  llmrRoutedModelHeader,
  llmrRouterRouteResolverKey
} from "@llmr/core/gateway/core-runtime/router-plugin-contract.ts";
import { createGatewayPlugin } from "@llmr/core/gateway/core-runtime/router-plugin.ts";
import { hoistAnthropicToolResultImages } from "@llmr/core/gateway/features/anthropic-tool-result-images.ts";
import { calculateTokenCount } from "@llmr/core/routing/token-estimator.ts";

function fakePngBase64(width, height, tailChars = 0) {
  const ihdr = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
  ihdr.writeUInt32BE(13, 8);
  ihdr.write("IHDR", 12, "ascii");
  ihdr.writeUInt32BE(width, 16);
  ihdr.writeUInt32BE(height, 20);
  return ihdr.toString("base64") + "A".repeat(tailChars);
}

test("hoistAnthropicToolResultImages lifts image-only tool_result blocks into top-level user images", () => {
  const pngData = fakePngBase64(1200, 800, 4096);
  const body = {
    model: "Google Gemini/gemini-4-argon",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_read_1", name: "Read", input: { file_path: "/tmp/ui.png" } }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_read_1",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: pngData
                }
              }
            ]
          }
        ]
      }
    ]
  };

  const transformed = hoistAnthropicToolResultImages(body);

  const userContent = transformed.messages[1].content;
  assert.equal(userContent.length, 2);
  assert.deepEqual(userContent[0], {
    type: "tool_result",
    tool_use_id: "call_read_1",
    content: [
      {
        type: "text",
        text: "[Image returned by tool call call_read_1 is attached in this user message as image #1.]"
      }
    ]
  });
  assert.deepEqual(userContent[1], {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: pngData
    }
  });
});

test("hoistAnthropicToolResultImages preserves text, tool_reference, is_error, and multi-image ordering", () => {
  const firstPng = fakePngBase64(800, 600, 128);
  const secondPng = fakePngBase64(1024, 768, 128);
  const thirdPng = fakePngBase64(640, 480, 128);

  const body = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: firstPng }
          },
          {
            type: "tool_result",
            tool_use_id: "call_mcp_shot",
            is_error: false,
            content: [
              { type: "text", text: "[Image resized to 1024x768]" },
              { type: "tool_reference", tool_name: "mcp__playwright__screenshot" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: secondPng } }
            ]
          },
          {
            type: "tool_result",
            tool_use_id: "call_read_3",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: thirdPng } },
              { type: "image", source: { type: "url", url: "https://example.test/preview.webp" } }
            ]
          }
        ]
      }
    ]
  };

  const transformed = hoistAnthropicToolResultImages(body);

  const content = transformed.messages[0].content;
  assert.equal(content.length, 6);
  assert.equal(content[0].type, "image");
  assert.deepEqual(content[1], {
    type: "tool_result",
    tool_use_id: "call_mcp_shot",
    is_error: false,
    content: [
      { type: "text", text: "[Image resized to 1024x768]" },
      { type: "tool_reference", tool_name: "mcp__playwright__screenshot" },
      {
        type: "text",
        text: "[Image returned by tool call call_mcp_shot is attached in this user message as image #2.]"
      }
    ]
  });
  assert.deepEqual(content[2], {
    type: "tool_result",
    tool_use_id: "call_read_3",
    content: [
      {
        type: "text",
        text: "[2 images returned by tool call call_read_3 are attached in this user message as images #3-#4.]"
      }
    ]
  });
  assert.equal(content[3].source.data, secondPng);
  assert.equal(content[4].source.data, thirdPng);
  assert.equal(content[5].source.url, "https://example.test/preview.webp");
});

test("hoistAnthropicToolResultImages keeps tool results first and numbers hoisted images after every top-level image", () => {
  const image = (data) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
  const content = hoistAnthropicToolResultImages({
    messages: [{
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: [image("A")] },
        { type: "tool_result", tool_use_id: "b", content: [image("B")] },
        { type: "image", source: { type: "file", file_id: "file_1" } },
        { type: "text", text: "compare" },
        image("TOP")
      ]
    }]
  }).messages[0].content;

  assert.deepEqual(
    content.map((block) => block.source?.data ?? block.source?.file_id ?? block.type),
    ["tool_result", "tool_result", "file_1", "text", "TOP", "A", "B"]
  );
  assert.match(content[0].content[0].text, /as image #3\./);
  assert.match(content[1].content[0].text, /as image #4\./);
});

test("calculateTokenCount counts a record that only resembles an image as text", () => {
  const text = "word ".repeat(20_000);
  const asText = calculateTokenCount([{ role: "user", content: text }], undefined, undefined);
  for (const lookalike of [
    { inline_data: { data: text } },
    { type: "image", source: { url: text } }
  ]) {
    const tokens = calculateTokenCount(
      [{ role: "assistant", content: [{ type: "tool_use", id: "t", name: "n", input: lookalike }] }],
      undefined,
      undefined
    );
    assert.ok(tokens >= asText, `${tokens} < ${asText}`);
  }
});

test("hoistAnthropicToolResultImages leaves text-only tool results untouched without cloning", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_text",
            content: [{ type: "text", text: "plain output" }]
          }
        ]
      }
    ]
  };

  assert.equal(hoistAnthropicToolResultImages(body), body);
});

test("hoistAnthropicToolResultImages hoists in every user turn of the history and numbers per message", () => {
  const turn = (id) => ({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: id,
      content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: id } }]
    }]
  });
  const { messages } = hoistAnthropicToolResultImages({
    messages: [
      turn("first"),
      { role: "assistant", content: [{ type: "tool_use", id: "second", name: "Read", input: {} }] },
      turn("second")
    ]
  });

  for (const index of [0, 2]) {
    assert.deepEqual(messages[index].content.map((block) => block.type), ["tool_result", "image"]);
    assert.match(messages[index].content[0].content[0].text, /as image #1\./);
  }
});

test("hoistAnthropicToolResultImages keeps cache_control on a hoisted image", () => {
  const image = {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "AAAA" },
    cache_control: { type: "ephemeral" }
  };
  const { messages } = hoistAnthropicToolResultImages({
    messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [image] }] }]
  });

  assert.deepEqual(messages[0].content[1], image);
});

test("hoistAnthropicToolResultImages leaves nested blocks the gateway cannot send as images", () => {
  for (const nested of [
    { type: "image", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
    { type: "image", source: { type: "url", url: "file:///tmp/a.png" } },
    { type: "image", source: { type: "file", file_id: "file_1" } }
  ]) {
    const body = {
      messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [nested] }] }]
    };
    assert.equal(hoistAnthropicToolResultImages(body), body, JSON.stringify(nested));
  }
});

test("LLMR route resolver hoists tool_result images for non-Anthropic targets and preserves native Anthropic passthrough", async () => {
  const pngData = fakePngBase64(1000, 750, 512);
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      id: "google-gemini",
      name: "Google Gemini",
      type: "gemini_generate_content",
      api_base_url: "https://generativelanguage.googleapis.com",
      models: ["gemini-4-argon"]
    },
    {
      id: "qwen",
      name: "QwenTokenPlan",
      type: "openai_chat_completions",
      api_base_url: "https://example.test/compatible-mode/v1",
      models: ["qwen3.8-max"]
    },
    {
      id: "anthropic-native",
      name: "AnthropicNative",
      type: "anthropic_messages",
      api_base_url: "https://example.test/anthropic",
      models: ["claude-sonnet-5-5"]
    }
  ];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const resolver = plugin.routeResolvers.find((item) => item.key === llmrRouterRouteResolverKey);

  const makeBody = (model) => ({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_img",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: pngData } }
            ]
          }
        ]
      }
    ]
  });

  for (const selector of ["Google Gemini/gemini-4-argon", "QwenTokenPlan/qwen3.8-max"]) {
    const resolved = resolver.resolve({
      request: {
        headers: { [llmrRoutedModelHeader]: selector },
        method: "POST",
        url: "/v1/messages"
      },
      requestBody: makeBody(selector)
    });
    const content = resolved.requestBody.messages[0].content;
    assert.equal(content.length, 2, selector);
    assert.equal(content[0].type, "tool_result", selector);
    assert.equal(content[1].type, "image", selector);
    assert.equal(JSON.stringify(content[0]).includes(pngData.slice(0, 64)), false, selector);
  }

  const virtualConfig = { ...config };
  virtualConfig.virtualModelProfiles = [{
    baseModel: { fixedModel: "AnthropicNative/claude-sonnet-5-5", mode: "fixed" },
    enabled: true,
    execution: { matchMultimodal: true },
    match: { exactAliases: ["fusion-vision"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true },
    tools: []
  }];
  const virtualPlugin = await createGatewayPlugin({ plugin: { config: { appConfig: virtualConfig } } });
  const virtualResolved = virtualPlugin.routeResolvers
    .find((item) => item.key === llmrRouterRouteResolverKey)
    .resolve({
      request: { headers: {}, method: "POST", url: "/v1/messages" },
      requestBody: makeBody("Fusion/fusion-vision")
    });
  assert.deepEqual(
    virtualResolved.requestBody.messages[0].content.map((block) => block.type),
    ["tool_result", "image"],
    "a virtual model's target is unknown here, so its images are hoisted"
  );

  const nativeSelector = "AnthropicNative/claude-sonnet-5-5";
  const nativeResolved = resolver.resolve({
    request: {
      headers: { [llmrRoutedModelHeader]: nativeSelector },
      method: "POST",
      url: "/v1/messages"
    },
    requestBody: makeBody(nativeSelector)
  });
  const nativeContent = nativeResolved.requestBody.messages[0].content;
  assert.equal(nativeContent.length, 1);
  assert.equal(nativeContent[0].type, "tool_result");
  assert.equal(nativeContent[0].content[0].type, "image");
  assert.equal(nativeContent[0].content[0].source.data, pngData);
});

function imageBlock(header, tailChars = 0) {
  return {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: header.toString("base64") + "A".repeat(tailChars) }
  };
}

function pngHeader(width, height) {
  return Buffer.from(fakePngBase64(width, height), "base64");
}

// One 28 px patch costs one token, so the difference from this message is the image's own estimate minus one.
const onePatchMessageTokens = calculateTokenCount(
  [{ role: "user", content: [imageBlock(pngHeader(28, 28))] }],
  undefined,
  undefined
);

function imageTokens(block) {
  return calculateTokenCount([{ role: "user", content: [block] }], undefined, undefined) - onePatchMessageTokens + 1;
}

test("calculateTokenCount counts an image by its 28 px patches, not by its Base64 length", () => {
  assert.equal(imageTokens(imageBlock(pngHeader(1200, 800), 500_000)), 43 * 29);
  assert.equal(imageTokens(imageBlock(pngHeader(3136, 200))), 56 * 4, "long edge scales to 1568 px first");
  assert.equal(imageTokens(imageBlock(pngHeader(1500, 1500))), 1568, "capped at the tier's token limit");
});

test("calculateTokenCount reads image dimensions from GIF, JPEG and WebP headers", () => {
  const gif = Buffer.alloc(16);
  gif.write("GIF89a", 0, "ascii");
  gif.writeUInt16LE(1200, 6);
  gif.writeUInt16LE(800, 8);

  const jpeg = Buffer.alloc(40);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).copy(jpeg, 0);
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]).copy(jpeg, 20);
  jpeg.writeUInt16BE(800, 25);
  jpeg.writeUInt16BE(1200, 27);

  const webp = (chunk) => {
    const header = Buffer.alloc(32);
    header.write("RIFF", 0, "ascii");
    header.write("WEBP", 8, "ascii");
    header.write(chunk, 12, "ascii");
    return header;
  };
  const vp8x = webp("VP8X");
  vp8x.writeUIntLE(1199, 24, 3);
  vp8x.writeUIntLE(799, 27, 3);
  const vp8l = webp("VP8L");
  vp8l[20] = 0x2f;
  vp8l.writeUInt32LE(1199 | (799 << 14), 21);
  const vp8 = webp("VP8 ");
  Buffer.from([0x9d, 0x01, 0x2a]).copy(vp8, 23);
  vp8.writeUInt16LE(1200, 26);
  vp8.writeUInt16LE(800, 28);

  for (const [name, header] of Object.entries({ gif, jpeg, vp8x, vp8l, vp8 })) {
    assert.equal(imageTokens(imageBlock(header)), 43 * 29, name);
  }
});

test("calculateTokenCount falls back to a fixed estimate when the header gives no dimensions", () => {
  const jpegWithoutFrame = Buffer.alloc(6000);
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]).copy(jpegWithoutFrame, 0);

  assert.equal(imageTokens(imageBlock(jpegWithoutFrame)), 1000);
  assert.equal(imageTokens({ type: "image", source: { type: "url", url: "https://example.test/a.png" } }), 1000);
});

test("calculateTokenCount counts OpenAI and Gemini image blocks as images", () => {
  const data = fakePngBase64(1200, 800, 500_000);

  assert.equal(imageTokens({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } }), 43 * 29);
  assert.equal(imageTokens({ type: "image_url", image_url: "https://example.test/a.png" }), 1000);
  assert.equal(imageTokens({ inlineData: { mimeType: "image/png", data } }), 43 * 29);
});
