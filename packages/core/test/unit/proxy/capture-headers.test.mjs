import assert from "node:assert/strict";
import test from "node:test";
import { cloneCapturedHeaders } from "@llmr/core/proxy/service.ts";

test("captured headers hide credentials and keep the rest", () => {
  const headers = cloneCapturedHeaders({ authorization: "Bearer x", cookie: "a=b", "set-cookie": ["s=1"], "content-type": "application/json" });
  assert.equal(headers.authorization, "[redacted]");
  assert.equal(headers.cookie, "[redacted]");
  assert.equal(headers["set-cookie"], "[redacted]");
  assert.equal(headers["content-type"], "application/json");
});

test("captured headers redact x-api-key and proxy-authorization case-insensitively", () => {
  const headers = cloneCapturedHeaders({ "Proxy-Authorization": "Basic z", "X-Api-Key": "k" });
  assert.equal(headers["proxy-authorization"], "[redacted]");
  assert.equal(headers["x-api-key"], "[redacted]");
});
