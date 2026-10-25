import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const envKeys = [
  "CCR_INTERNAL_APP_DATA_DIR",
  "CCR_INTERNAL_HOME_DIR",
  "CCR_INTERNAL_USER_DATA_DIR",
  "CCR_MODEL_CATALOG_PATH",
  "CCR_MODEL_CATALOG_URL",
  "CCR_MODELS_JSON_PATH"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-catalog-startup-test-"));
process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(runtimeRoot, "app-data");
process.env.CCR_INTERNAL_HOME_DIR = path.join(runtimeRoot, "home");
process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(runtimeRoot, "user-data");
delete process.env.CCR_MODEL_CATALOG_PATH;
delete process.env.CCR_MODELS_JSON_PATH;

after(() => {
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  rmSync(runtimeRoot, { force: true, recursive: true });
});

test("catalog lookups pick up the downloaded catalog once it lands", async () => {
  const model = { id: "startup-test/startup-model", model: "startup-model", provider: "startup-test",
    limits: { contextTokens: 4096 } };
  const cdn = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ models: [model], schemaVersion: 2 }));
  });
  await new Promise((resolve) => cdn.listen(0, "127.0.0.1", resolve));
  process.env.CCR_MODEL_CATALOG_URL = `http://127.0.0.1:${cdn.address().port}/models.json`;
  const { modelCatalogRevision, refreshModelCatalog } = await import("@ccr/core/models/catalog-file.ts");
  const { findModelCatalogEntry } = await import("@ccr/core/gateway/model-catalog.ts");
  const revision = modelCatalogRevision();
  assert.equal(findModelCatalogEntry(model.id), undefined);
  try {
    await refreshModelCatalog();
    assert.equal(modelCatalogRevision(), revision + 1);
    assert.equal(findModelCatalogEntry(model.id)?.limits?.contextTokens, 4096);
  } finally {
    await new Promise((resolve) => cdn.close(resolve));
  }
});
