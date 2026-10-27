import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { handleClaudeCodeWifTokenRequest } from "@ccr/core/gateway/auth/api-key-authorizer.ts";
import { readRequestBody, RequestBodyTooLargeError, sendGatewayError } from "@ccr/core/gateway/http/io.ts";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(port, byteLength) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ headers: { "content-length": byteLength }, host: "127.0.0.1", method: "POST", port }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), headers: response.headers, status: response.statusCode }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(Buffer.alloc(byteLength));
  });
}

const cappedHandler = (maxBytes) => (request, response) => {
  readRequestBody(request, maxBytes).then(() => sendGatewayError(response, new Error("unexpected")), (error) => sendGatewayError(response, error));
};

test("an over-cap body gets HTTP 413 with a JSON error, not a reset", async () => {
  await withServer(cappedHandler(1024), async (port) => {
    const result = await post(port, 2048);
    assert.equal(result.status, 413);
    assert.equal(result.headers.connection, "close");
    assert.deepEqual(JSON.parse(result.body), { error: { message: "Request body exceeds 1024 bytes." } });
  });
});

test("a large over-cap body still gets HTTP 413", async () => {
  await withServer(cappedHandler(1024), async (port) => {
    assert.equal((await post(port, 64 * 1024 * 1024)).status, 413);
  });
});

test("an error without a status gets HTTP 502", async () => {
  await withServer((_request, response) => sendGatewayError(response, new Error("boom")), async (port) => {
    const result = await post(port, 0);
    assert.equal(result.status, 502);
    assert.deepEqual(JSON.parse(result.body), { error: { message: "boom" } });
  });
});

test("the token exchange answers a 64 KiB + 1 body with HTTP 413", async () => {
  const handler = (request, response) => {
    handleClaudeCodeWifTokenRequest(request, response, createDefaultAppConfig()).catch((error) => sendGatewayError(response, error));
  };
  await withServer(handler, async (port) => {
    assert.equal((await post(port, 64 * 1024 + 1)).status, 413);
  });
});

test("an error after the first streamed chunk closes the socket and appends nothing", async () => {
  let destroyed = false;
  const handler = (_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("data: partial\n\n", () => {
      sendGatewayError(response, new RequestBodyTooLargeError(1));
      destroyed = response.destroyed;
    });
  };
  await withServer(handler, async (port) => {
    const received = await new Promise((resolve) => {
      const chunks = [];
      httpRequest({ host: "127.0.0.1", port }, (response) => {
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("error", () => undefined);
      }).on("error", () => undefined).end();
    });
    assert.equal(received, "data: partial\n\n");
    assert.equal(destroyed, true);
  });
});

test("an endless over-cap upload is cut off after the drain limit", async () => {
  await withServer(cappedHandler(1024), async (port) => {
    const startedAt = Date.now();
    await new Promise((resolve) => {
      const request = httpRequest({ host: "127.0.0.1", method: "POST", port }, (response) => {
        response.resume();
        response.on("close", resolve);
      });
      request.on("error", resolve);
      const chunk = Buffer.alloc(16 * 1024);
      const pump = () => {
        while (request.write(chunk));
      };
      request.on("drain", pump);
      pump();
    });
    assert.ok(Date.now() - startedAt < 5_000);
  });
});

test("a client that aborts an over-cap upload closes the response without an error", async () => {
  let closed;
  const responseClosed = new Promise((resolve) => { closed = resolve; });
  const handler = (request, response) => {
    response.on("close", () => closed(response.writableFinished));
    response.on("error", (error) => closed(error));
    readRequestBody(request, 1024).catch((error) => sendGatewayError(response, error));
  };
  await withServer(handler, async (port) => {
    const request = httpRequest({ host: "127.0.0.1", method: "POST", port });
    request.on("error", () => undefined);
    request.write(Buffer.alloc(4096), () => setTimeout(() => request.destroy(), 50));
    assert.equal(await responseClosed, false);
  });
});

test("readRequestBody destroys an over-cap request that never ends, for callers that answer it themselves", async () => {
  const request = new PassThrough();
  request.write(Buffer.alloc(2048));
  await assert.rejects(readRequestBody(request, 1024), RequestBodyTooLargeError);
  assert.equal(request.destroyed, false);
  await new Promise((resolve) => request.once("close", resolve));
  assert.equal(request.destroyed, true);
});
