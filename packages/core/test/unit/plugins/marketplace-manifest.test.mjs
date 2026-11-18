import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { marketplaceUrl, normalizeMarketplaceManifest } from "@llmr/core/plugins/marketplace.ts";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("module.exports = {};\n")]);

function stubFetch(t, body) {
  const original = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = async (input) => {
    calls.count += 1;
    return new Response(typeof body === "function" ? body(String(input)) : body);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

const manifestUrl = "https://raw.githubusercontent.com/jrmatherly/llm-router-extensions/main/marketplace/plugins.json";

test("default marketplace URL points at the fork's manifest", () => {
  const previous = process.env.LLMR_PLUGIN_MARKETPLACE_URL;
  delete process.env.LLMR_PLUGIN_MARKETPLACE_URL;
  try {
    assert.equal(marketplaceUrl(), manifestUrl);
  } finally {
    if (previous !== undefined) {
      process.env.LLMR_PLUGIN_MARKETPLACE_URL = previous;
    }
  }
});

test("committed marketplace manifest normalizes without error", async () => {
  // Copy of marketplace/plugins.json in jrmatherly/llm-router-extensions; keep the two in step.
  const source = readFileSync(path.resolve("packages/core/test/fixtures/plugin-marketplace/plugins.json"), "utf8");
  const manifest = JSON.parse(source);
  assert.ok(Array.isArray(manifest.plugins));
  const entries = await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true });
  assert.equal(entries.length, manifest.plugins.length);
});

test("a module entry without integrity is skipped and never downloaded", async (t) => {
  const calls = stubFetch(t, "module.exports = {};");
  const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "no-integrity", module: "https://e.test/x.js" }] }, manifestUrl);
  assert.deepEqual(entries, []);
  assert.equal(calls.count, 0);
});

test("an app-only entry needs no integrity", async () => {
  const entries = await normalizeMarketplaceManifest({ plugins: [{ apps: [{ name: "Status", url: "/plugins/status" }], id: "app-only", name: "App only" }] }, manifestUrl, { offline: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].error, undefined);
  assert.equal(entries[0].modulePath, "");
});

test("module bytes are hashed raw and cached unchanged", async (t) => {
  stubFetch(t, bom);
  const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "raw-bytes", integrity: sha256(bom), module: "https://e.test/raw.js" }] }, manifestUrl);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].error, undefined);
  assert.deepEqual(readFileSync(entries[0].modulePath), bom);
});

test("a cached module that fails its hash is downloaded again", async (t) => {
  const calls = stubFetch(t, bom);
  const manifest = { plugins: [{ id: "redownload", integrity: sha256(bom), module: "https://e.test/re.js" }] };
  const [first] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  writeFileSync(first.modulePath, "truncated");
  const [second] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  assert.equal(second.error, undefined);
  assert.deepEqual(readFileSync(second.modulePath), bom);
  assert.equal(calls.count, 2);
});

test("offline, a cached module that fails its hash is listed with an integrity error", async (t) => {
  stubFetch(t, bom);
  const manifest = { plugins: [{ id: "offline-bad", integrity: sha256(bom), module: "https://e.test/off.js", name: "Offline bad" }] };
  const [first] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  writeFileSync(first.modulePath, "truncated");
  const entries = await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Offline bad");
  assert.equal(entries[0].error, "Integrity check failed");
  assert.equal(entries[0].modulePath, "");
});

test("a download that fails its hash is listed with an integrity error and not cached", async (t) => {
  stubFetch(t, "something else");
  const manifest = { plugins: [{ id: "bad-download", integrity: sha256(bom), module: "https://e.test/bad.js" }] };
  const entries = await normalizeMarketplaceManifest(manifest, manifestUrl);
  assert.equal(entries[0].error, "Integrity check failed");
  assert.equal(entries[0].modulePath, "");
  assert.deepEqual(await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true }), []);
});

test("a dependency module that fails its hash marks the entry as failed", async (t) => {
  stubFetch(t, "something else");
  const entries = await normalizeMarketplaceManifest({ plugins: [{ apps: [{ name: "Status", url: "/plugins/status" }], dependencies: [{ id: "dep", integrity: sha256(bom), module: "https://e.test/dep.js" }], id: "bad-dependency" }] }, manifestUrl);
  assert.equal(entries[0].error, "Integrity check failed");
  assert.deepEqual(entries[0].dependencies, []);
});

test("integrity accepts hex, prefixed hex and sha256-base64", async (t) => {
  stubFetch(t, bom);
  const forms = [sha256(bom), `sha256:${sha256(bom).toUpperCase()}`, `sha256=${sha256(bom)}`, `sha256-${createHash("sha256").update(bom).digest("base64")}`];
  const entries = await normalizeMarketplaceManifest({ plugins: forms.map((integrity, index) => ({ id: `form-${index}`, integrity, module: "https://e.test/form.js" })) }, manifestUrl);
  assert.equal(entries.length, forms.length);
  for (const entry of entries) {
    assert.equal(entry.error, undefined, entry.id);
    assert.deepEqual(readFileSync(entry.modulePath), bom);
  }
});

test("an entry with an invalid integrity is skipped and never downloaded", async (t) => {
  const calls = stubFetch(t, bom);
  for (const integrity of ["sha256:nothex", "sha256-abc", "sha256-AAAA"]) {
    const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "invalid-integrity", integrity, module: "https://e.test/invalid.js" }] }, manifestUrl);
    assert.deepEqual(entries, [], integrity);
  }
  assert.equal(calls.count, 0);
});

test("an intact cached module is reused online and offline", async (t) => {
  const calls = stubFetch(t, bom);
  const manifest = { plugins: [{ id: "cache-hit", integrity: sha256(bom), module: "https://e.test/hit.js" }] };
  const [first] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  const [online] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  const [offline] = await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true });
  assert.equal(calls.count, 1);
  assert.equal(online.modulePath, first.modulePath);
  assert.equal(offline.modulePath, first.modulePath);
  assert.equal(offline.error, undefined);
});

test("a dependency module without integrity skips the entry and is never downloaded", async (t) => {
  const calls = stubFetch(t, bom);
  const entries = await normalizeMarketplaceManifest({ plugins: [{ apps: [{ name: "Status", url: "/plugins/status" }], dependencies: [{ id: "dep", module: "https://e.test/dep-no-integrity.js" }], id: "dependency-no-integrity" }] }, manifestUrl);
  assert.deepEqual(entries, []);
  assert.equal(calls.count, 0);
});

test("a failed dependency clears the module path of an entry whose own module verified", async (t) => {
  stubFetch(t, (url) => url.endsWith("/parent.js") ? bom : "something else");
  const entries = await normalizeMarketplaceManifest({ plugins: [{ dependencies: [{ id: "dep", integrity: sha256(bom), module: "https://e.test/parent-dep.js" }], id: "verified-parent", integrity: sha256(bom), module: "https://e.test/parent.js" }] }, manifestUrl);
  assert.equal(entries[0].error, "Integrity check failed");
  assert.equal(entries[0].modulePath, "");
  assert.deepEqual(entries[0].dependencies, []);
});

test("a module over the size cap is skipped, not reported as an integrity failure", async (t) => {
  const large = Buffer.alloc(8 * 1024 * 1024 + 1, 0x20);
  stubFetch(t, large);
  const manifest = { plugins: [{ id: "too-large", integrity: sha256(large), module: "https://e.test/large.js" }] };
  assert.deepEqual(await normalizeMarketplaceManifest(manifest, manifestUrl), []);
  assert.deepEqual(await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true }), []);
});
