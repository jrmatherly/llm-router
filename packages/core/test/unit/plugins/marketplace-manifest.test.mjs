import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { marketplaceUrl, normalizeMarketplaceManifest } from "@ccr/core/plugins/marketplace.ts";

const manifestUrl = "https://raw.githubusercontent.com/jrmatherly/ccr-extensions/main/marketplace/plugins.json";

test("default marketplace URL points at the fork's manifest", () => {
  const previous = process.env.CCR_PLUGIN_MARKETPLACE_URL;
  delete process.env.CCR_PLUGIN_MARKETPLACE_URL;
  try {
    assert.equal(marketplaceUrl(), manifestUrl);
  } finally {
    if (previous !== undefined) {
      process.env.CCR_PLUGIN_MARKETPLACE_URL = previous;
    }
  }
});

test("committed marketplace manifest normalizes without error", async () => {
  // Copy of marketplace/plugins.json in jrmatherly/ccr-extensions; keep the two in step.
  const source = readFileSync(path.resolve("packages/core/test/fixtures/plugin-marketplace/plugins.json"), "utf8");
  const manifest = JSON.parse(source);
  assert.ok(Array.isArray(manifest.plugins));
  const entries = await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true });
  assert.equal(entries.length, manifest.plugins.length);
});
