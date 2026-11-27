import assert from "node:assert/strict";
import test from "node:test";
import {
  abortSignalMessage,
  filteredResponseHeaders,
  forwardHeaders,
  gatewayClientCallerForKey,
  inferGatewayClient,
  isTrustedForwarderKey,
  omitLocalObservabilityHeaders,
  parseJsonObject,
  readAuthToken,
  readHeader,
  readRemoteControlQueryAuthToken,
  shouldCaptureGatewayUsage,
  shouldSendBody,
  stripLocalGatewayAuthHeaders,
  withCoreGatewayAuthHeader
} from "@llmr/core/gateway/http/io.ts";
import {
  parseJsonObjectCached,
  parseJsonObjectSafe,
  releaseJsonObject,
  serializeJsonBody,
  serializeJsonBodyWithModel,
  takeJsonObject
} from "@llmr/core/gateway/http/body.ts";

const refused = { kind: "refused" };
const plain = { kind: "key", name: "Team key", trustedForwarder: false };
const forwarder = { kind: "key", name: "Apps gateway key", trustedForwarder: true };

test("gateway client inference honors explicit, proxy, API-key, and user-agent identity", () => {
  assert.equal(inferGatewayClient(plain, { "x-llmr-client": "  Desktop App  " }), "Desktop App");
  assert.equal(inferGatewayClient(plain, { "x-client-name": "codex-cli" }), "codex-cli");
  assert.equal(inferGatewayClient(plain, { "user-agent": "codex-cli/1.0" }), "Team key");
  assert.equal(inferGatewayClient(plain, { "user-agent": "codex-cli/1.0", "x-llmr-proxy-mode": "gateway" }), "Codex");
  assert.equal(inferGatewayClient({ kind: "key", trustedForwarder: false }, { "user-agent": "curl/8.0" }), "curl");
  assert.equal(inferGatewayClient(plain, { "x-forwarded-client-cert": "By=spiffe://a;Hash=b" }), "Team key");
  assert.deepEqual(gatewayClientCallerForKey({ id: "key-id", name: " Team key " }), plain);
  assert.deepEqual(gatewayClientCallerForKey({ id: "key-id", trustedForwarder: true }), { kind: "key", name: "key-id", trustedForwarder: true });
  assert.deepEqual(gatewayClientCallerForKey({ id: "profile:codex", trustedForwarder: true }), { kind: "key", name: "profile:codex", trustedForwarder: false });
  assert.equal(isTrustedForwarderKey(undefined), false);
});

test("gateway authentication accepts supported headers and scopes query tokens to remote control", () => {
  assert.equal(readAuthToken({ authorization: " Bearer secret-token " }), "secret-token");
  assert.equal(readAuthToken({ "x-api-key": " api-key-token " }), "api-key-token");
  assert.equal(readAuthToken({ "api-key": " legacy-token " }), "legacy-token");
  assert.equal(readAuthToken({ "x-goog-api-key": " google-token " }), "google-token");
  assert.equal(readAuthToken({ "x-mcp-key": " mcp-token " }), "mcp-token");
  assert.equal(readAuthToken({ "x-codex-access-token": " codex-token " }), "codex-token");
  assert.equal(readAuthToken({}), undefined);
  assert.equal(readHeader([" first ", "second"]), "first");

  assert.equal(
    readRemoteControlQueryAuthToken({ url: "/__llmr/remote/status?api_key=query-token" }),
    "query-token"
  );
  assert.equal(
    readRemoteControlQueryAuthToken({ url: "/__llmr/remote/session?key=fallback-token" }),
    "fallback-token"
  );
  assert.equal(readRemoteControlQueryAuthToken({ url: "/v1/messages?api_key=must-not-leak" }), undefined);
});

test("gateway header forwarding strips hop-by-hop, local auth, and observability headers", () => {
  const forwarded = forwardHeaders({
    connection: "keep-alive",
    host: "127.0.0.1:3456",
    "x-llmr-core-auth": "internal-secret",
    "x-extra": ["one", "two"],
    "x-keep": "yes"
  });

  assert.deepEqual(forwarded, {
    "x-extra": "one,two",
    "x-keep": "yes"
  });

  const authHeaders = {
    "api-key": "legacy",
    authorization: "Bearer local",
    "x-codex-access-token": "codex",
    "x-goog-api-key": "google",
    "x-mcp-key": "mcp",
    "x-api-key": "local",
    "x-keep": "yes"
  };
  stripLocalGatewayAuthHeaders(authHeaders);
  assert.deepEqual(authHeaders, { "x-keep": "yes" });

  assert.deepEqual(
    omitLocalObservabilityHeaders({
      "x-llmr-logical-provider": "Provider",
      "x-llmr-provider-credential-chain": "credential",
      "x-keep": "yes"
    }),
    { "x-keep": "yes" }
  );
});

test("core gateway auth and upstream response headers stay on their intended boundary", () => {
  assert.deepEqual(withCoreGatewayAuthHeader({ accept: "application/json" }, "core-token"), {
    accept: "application/json",
    "x-llmr-core-auth": "core-token"
  });
  assert.throws(() => withCoreGatewayAuthHeader({}, ""), /not initialized/);

  const headers = new Headers({
    connection: "close",
    "content-encoding": "gzip",
    "content-type": "application/json",
    "x-request-id": "request-1"
  });
  assert.deepEqual(filteredResponseHeaders(headers), [
    ["content-type", "application/json"],
    ["x-request-id", "request-1"]
  ]);
});

test("gateway JSON helpers accept only objects and preserve the selected model", () => {
  assert.deepEqual(parseJsonObject(Buffer.alloc(0)), {});
  assert.deepEqual(parseJsonObject(Buffer.from('{"model":"old","stream":true}')), {
    model: "old",
    stream: true
  });
  assert.throws(() => parseJsonObject(Buffer.from("[]")), /must be a JSON object/);
  assert.throws(() => parseJsonObject(Buffer.from("null")), /must be a JSON object/);

  assert.equal(parseJsonObjectSafe(undefined), undefined);
  assert.equal(parseJsonObjectSafe(Buffer.from("not-json")), undefined);
  assert.deepEqual(parseJsonObjectSafe(Buffer.from('{"ok":true}')), { ok: true });
  assert.equal(
    serializeJsonBodyWithModel({ model: "old", stream: true }, "Provider/new").toString("utf8"),
    '{"model":"Provider/new","stream":true}\n'
  );
});

test("gateway JSON helpers reuse immutable parses and release mutable ownership", () => {
  const buffer = Buffer.from('{"model":"old","stream":true}');
  const cached = parseJsonObjectCached(buffer);
  assert.equal(parseJsonObjectCached(buffer), cached);
  assert.equal(parseJsonObjectSafe(buffer), cached);

  const owned = takeJsonObject(buffer);
  assert.equal(owned, cached);
  owned.model = "mutated";

  const reparsed = parseJsonObjectCached(buffer);
  assert.notEqual(reparsed, owned);
  assert.equal(reparsed.model, "old");

  const body = { model: "Provider/new", stream: true };
  const serialized = serializeJsonBody(body);
  assert.equal(parseJsonObjectCached(serialized), body);
  releaseJsonObject(serialized);
  assert.notEqual(parseJsonObjectCached(serialized), body);
});

test("gateway method and abort helpers cover body and cancellation edge cases", () => {
  assert.equal(shouldSendBody("GET"), false);
  assert.equal(shouldSendBody("head"), false);
  assert.equal(shouldSendBody("POST"), true);
  assert.equal(shouldSendBody(undefined), true);
  assert.equal(shouldCaptureGatewayUsage("PATCH", "/v1/messages"), true);
  assert.equal(shouldCaptureGatewayUsage("GET", "/v1/messages"), false);

  const errorController = new AbortController();
  errorController.abort(new Error("client disconnected"));
  assert.equal(abortSignalMessage(errorController.signal), "client disconnected");

  const textController = new AbortController();
  textController.abort("  timed out  ");
  assert.equal(abortSignalMessage(textController.signal), "timed out");
});

test("inferGatewayClient names the developer only for a trusted forwarder key", () => {
  const identity = { "x-claude-gateway-user-email": " dev@example.com ", "user-agent": "claude-cli/2.1.310" };
  assert.equal(inferGatewayClient(forwarder, identity), "dev@example.com");
  assert.equal(inferGatewayClient(forwarder, { "x-litellm-end-user-id": "dev@example.com" }), "dev@example.com");
  assert.equal(inferGatewayClient(forwarder, { "x-llmr-client": "Proxy", "x-claude-gateway-user-email": "dev@example.com" }), "Proxy");
  assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": "   " }), "Apps gateway key");
  assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-id": "sub-123" }), "Apps gateway key");
  assert.equal(inferGatewayClient(plain, identity), "Team key");
  assert.equal(inferGatewayClient(plain, { "x-litellm-end-user-id": "dev@example.com", "user-agent": "curl/8.0" }), "Team key");
  assert.equal(inferGatewayClient(refused, identity), "Claude");
});

test("a refused caller is named from its User-Agent alone, and every label is cut to 120 characters", () => {
  assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor", "x-client-name": "Cursor", "user-agent": "curl/8.0" }), "curl");
  assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor" }), undefined);
  assert.equal(inferGatewayClient(refused, { "user-agent": "custom-client/2.1" }), "custom-client");
  assert.equal(inferGatewayClient(refused, { "user-agent": "u".repeat(300) }), "u".repeat(120));
  assert.equal(inferGatewayClient(plain, { "x-llmr-client": "c".repeat(300) }), "c".repeat(120));
  assert.equal(inferGatewayClient({ kind: "key", name: "n".repeat(300), trustedForwarder: false }, {}), "n".repeat(120));
  assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": `${"a".repeat(300)}@example.com` }).length, 120);
});
