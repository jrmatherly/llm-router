import assert from "node:assert/strict";
import test from "node:test";
import { redactSensitiveUrlQuery } from "@llmr/core/observability/sensitive-headers.ts";

test("redactSensitiveUrlQuery hides credential parameters and keeps the rest", () => {
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?key=abc&x=1"), "https://h.test/v1?key=%5Bredacted%5D&x=1");
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?API_KEY=a&apikey=b&access_token=c"), "https://h.test/v1?API_KEY=%5Bredacted%5D&apikey=%5Bredacted%5D&access_token=%5Bredacted%5D");
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?x=1"), "https://h.test/v1?x=1");
});

test("redactSensitiveUrlQuery keeps a path a path and passes through what it cannot parse", () => {
  assert.equal(redactSensitiveUrlQuery("/v1/models?api_key=abc"), "/v1/models?api_key=%5Bredacted%5D");
  assert.equal(redactSensitiveUrlQuery("http://["), "http://[");
});

test("redactSensitiveUrlQuery redacts credential parameters in a target it cannot parse", () => {
  assert.equal(redactSensitiveUrlQuery("//?key=abc&x=1"), "//?key=[redacted]&x=1");
  assert.equal(redactSensitiveUrlQuery("//a b?x=1&API_KEY=abc#frag"), "//a b?x=1&API_KEY=[redacted]#frag");
});
