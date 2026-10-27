import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("installed apps fetch the catalog from this repository", () => {
  assert.match(readFileSync("packages/core/src/models/catalog-file.ts", "utf8"),
    /DEFAULT_MODEL_CATALOG_URL = "https:\/\/raw\.githubusercontent\.com\/jrmatherly\/llm-router\/models-catalog\/models\.json"/);
  assert.equal(existsSync("scripts/update-models-cdn.mjs"), false);
  assert.equal(existsSync("cdn"), false);
});

test("the catalog workflow pushes only the models-catalog branch and only after a strict build", () => {
  const workflow = readFileSync(".github/workflows/model-catalog.yml", "utf8");
  assert.match(workflow, /generate-models-json\.mjs --strict/);
  assert.match(workflow, /HEAD:models-catalog\b/);
  assert.doesNotMatch(workflow, /HEAD:main|refs\/heads\/main/);
  assert.match(workflow, /persist-credentials: false/);
});
