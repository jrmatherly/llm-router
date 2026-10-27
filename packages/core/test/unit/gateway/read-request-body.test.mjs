import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { handleClaudeCodeWifTokenRequest } from "@ccr/core/gateway/auth/api-key-authorizer.ts";
import { readRequestBody, RequestBodyTooLargeError } from "@ccr/core/gateway/http/io.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

const seventeenMiB = 17 * 1024 * 1024;
const sharedBody = Buffer.alloc(seventeenMiB);

function requestWithBody(byteLength) {
  return Readable.from([sharedBody.subarray(0, byteLength)]);
}

test("readRequestBody rejects past the cap with a 413 error", async () => {
  const request = requestWithBody(2048);
  await assert.rejects(readRequestBody(request, 1024), (error) => error instanceof RequestBodyTooLargeError && error.status === 413);
});

test("readRequestBody returns bodies under the cap", async () => {
  assert.equal((await readRequestBody(requestWithBody(512), 1024)).length, 512);
});

test("readRequestBody caps at 16 MiB by default", async () => {
  await assert.rejects(readRequestBody(requestWithBody(seventeenMiB)), RequestBodyTooLargeError);
});

test("gateway pipeline accepts a 17 MiB model request body", async () => {
  const config = createDefaultAppConfig();
  config.observability.requestLogs = false;
  config.contextArchive.enabled = false;
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test-core-token",
    getPlugin: () => ({}),
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" })
  });
  const originalFetch = globalThis.fetch;
  const forwardedBodyLengths = [];
  globalThis.fetch = async (_url, init) => {
    forwardedBodyLengths.push(init?.body ? Buffer.byteLength(init.body) : 0);
    return new Response(null, { status: 204 });
  };
  try {
    const request = requestWithBody(seventeenMiB);
    request.method = "POST";
    request.url = "/v1/responses/resp-test";
    request.headers = {};
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = () => response;
    await pipeline.proxyRequest(request, response, "/v1/responses/resp-test");
    assert.deepEqual(forwardedBodyLengths, [seventeenMiB]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the token exchange rejects bodies over 64 KiB", async () => {
  const request = requestWithBody(64 * 1024 + 1);
  await assert.rejects(handleClaudeCodeWifTokenRequest(request, new Writable(), createDefaultAppConfig()), (error) => error instanceof RequestBodyTooLargeError && error.status === 413);
});
