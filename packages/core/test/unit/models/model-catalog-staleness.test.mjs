import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Own file: the warning is suppressed once refreshModelCatalog has run in the
// process, and the other catalog tests call it.
test("a process that never refreshes warns once about a week-old catalog", async () => {
  const { loadModelCatalogPayload, modelCatalogCachePath } = await import("@llmr/core/models/catalog-file.ts");
  const keys = ["LLMR_MODEL_CATALOG_PATH", "LLMR_MODELS_JSON_PATH", "LLMR_INTERNAL_USER_DATA_DIR"];
  const previous = keys.map((key) => process.env[key]);
  const originalWarn = console.warn;
  const warnings = [];
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-catalog-staleness-test-"));
  const day = 24 * 60 * 60 * 1000;
  const catalog = (ageDays) => JSON.stringify({
    generatedAt: new Date(Date.now() - ageDays * day).toISOString(),
    models: [{ id: "stale-test/model" }],
    schemaVersion: 2
  });
  try {
    delete process.env.LLMR_MODEL_CATALOG_PATH;
    delete process.env.LLMR_MODELS_JSON_PATH;
    process.env.LLMR_INTERNAL_USER_DATA_DIR = dir;
    console.warn = (message) => warnings.push(String(message));
    mkdirSync(path.dirname(modelCatalogCachePath()), { recursive: true });

    writeFileSync(modelCatalogCachePath(), catalog(2));
    loadModelCatalogPayload();
    assert.deepEqual(warnings, []);

    writeFileSync(modelCatalogCachePath(), catalog(30));
    process.env.LLMR_MODEL_CATALOG_PATH = modelCatalogCachePath();
    loadModelCatalogPayload();
    assert.deepEqual(warnings, [], "a local override is the user's choice and is never called stale");
    delete process.env.LLMR_MODEL_CATALOG_PATH;

    assert.equal(loadModelCatalogPayload()?.loadedFrom, modelCatalogCachePath());
    loadModelCatalogPayload();
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /is 30 days old and this process does not refresh it; run `llmr start`/);
  } finally {
    console.warn = originalWarn;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    rmSync(dir, { force: true, recursive: true });
  }
});
