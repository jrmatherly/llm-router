import assert from "node:assert/strict";
import test from "node:test";
import { chromeLoginImportInternalsForTest } from "@llmr/electron/main/chrome-login-import.ts";

const { confirmationPageHtml, createService, normalizeChromeCookie, normalizeImportDomain, normalizeLocalStorageEntry, readImportPayload } = chromeLoginImportInternalsForTest;
const soon = Date.now() / 1000 + 3600;

test("normalizeImportDomain rejects public suffixes and single labels", () => {
  for (const value of ["com", "co.uk", "github.io", "intranet", "*.com", ""]) {
    assert.equal(normalizeImportDomain(value), undefined, value);
  }
  assert.equal(normalizeImportDomain("Sub.Example.com/x"), "sub.example.com");
  assert.equal(normalizeImportDomain("https://user.github.io/page"), "user.github.io");
  assert.equal(normalizeImportDomain("localhost"), "localhost");
  assert.equal(normalizeImportDomain("192.168.1.10"), "192.168.1.10");
});

test("createJob refuses a request that names only public suffixes", async () => {
  await assert.rejects(createService().createJob({ domains: ["com", "co.uk"] }), /At least one Chrome import domain is required/);
});

test("normalizeChromeCookie keeps only allowed, unexpired, unpartitioned cookies", () => {
  const cookie = { domain: ".example.com", expirationDate: soon, hostOnly: false, httpOnly: true, name: "sid", path: "/", sameSite: "lax", secure: true, value: "1" };
  assert.deepEqual(normalizeChromeCookie(cookie as any, ["example.com"]), { domain: ".example.com", expirationDate: soon, httpOnly: true, name: "sid", path: "/", sameSite: "lax", secure: true, url: "https://example.com/", value: "1" });
  assert.equal(normalizeChromeCookie({ ...cookie, hostOnly: true } as any, ["example.com"])?.domain, undefined);
  for (const patch of [{ domain: "evil.com" }, { domain: "notexample.com" }, { expirationDate: 1 }, { partitionKey: { topLevelSite: "https://a.com" } }]) {
    assert.equal(normalizeChromeCookie({ ...cookie, ...patch } as any, ["example.com"]), undefined, JSON.stringify(patch));
  }
});

test("normalizeLocalStorageEntry rejects non-http and foreign origins", () => {
  assert.deepEqual(normalizeLocalStorageEntry({ items: { a: "1", b: 2 }, origin: "https://app.example.com/path" } as any, ["example.com"]), { items: { a: "1" }, origin: "https://app.example.com" });
  for (const origin of ["file:///x", "chrome-extension://abc", "https://evil.com", "not a url"]) {
    assert.equal(normalizeLocalStorageEntry({ items: { a: "1" }, origin }, ["example.com"]), undefined, origin);
  }
});

test("readImportPayload rejects empty payloads", () => {
  assert.throws(() => readImportPayload(null), /must be an object/);
  assert.throws(() => readImportPayload({ cookies: [], localStorage: [] }), /must include cookies or localStorage/);
});

test("the confirmation page escapes domains", () => {
  const html = confirmationPageHtml({ confirmUrl: "", createdAt: 0, domains: ['a"><script>'], endpointUrl: "", expiresAt: 0, id: "j", importUrl: "", status: "pending", target: "browser" });
  assert.match(html, /a&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
});
