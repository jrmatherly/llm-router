import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrowserInput } from "@llmr/electron/main/browser-url.ts";

const home = "about:blank";
const search = (text: string) => `https://www.google.com/search?q=${encodeURIComponent(text)}`;

test("normalizeBrowserInput uses http for loopback and https elsewhere", () => {
  assert.equal(normalizeBrowserInput("localhost:3000", home), "http://localhost:3000");
  assert.equal(normalizeBrowserInput("localhost", home), "http://localhost");
  assert.equal(normalizeBrowserInput("127.0.0.1:8080/x", home), "http://127.0.0.1:8080/x");
  assert.equal(normalizeBrowserInput("[::1]:5173", home), "http://[::1]:5173");
  assert.equal(normalizeBrowserInput("localhost:3000?x=1", home), "http://localhost:3000?x=1");
  assert.equal(normalizeBrowserInput("example.com", home), "https://example.com");
  assert.equal(normalizeBrowserInput("localhost.example.com", home), "https://localhost.example.com");
  assert.equal(normalizeBrowserInput("127.0.0.1.nip.io", home), "https://127.0.0.1.nip.io");
  assert.equal(normalizeBrowserInput("http://example.com/a", home), "http://example.com/a");
});

test("normalizeBrowserInput searches for free text and non-http schemes", () => {
  assert.equal(normalizeBrowserInput("hello world", home), search("hello world"));
  assert.equal(normalizeBrowserInput("file:///etc/passwd", home), search("file:///etc/passwd"));
});

test("normalizeBrowserInput returns the home URL for empty input", () => {
  for (const value of [undefined, "", "   ", "ABOUT:BLANK"]) {
    assert.equal(normalizeBrowserInput(value, home), home);
  }
});
