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

test("web management server is ready before the catalog CDN answers", async () => {
  let downloadRequests = 0;
  const cdn = createServer(() => { downloadRequests += 1; });
  await new Promise((resolve) => cdn.listen(0, "127.0.0.1", resolve));
  process.env.CCR_MODEL_CATALOG_URL = `http://127.0.0.1:${cdn.address().port}/models.json`;
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const startedAt = Date.now();
  const runtime = await startWebManagementServer({
    authToken: "catalog-startup-token",
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  const readyAfterMs = Date.now() - startedAt;
  try {
    assert.ok(readyAfterMs < 2_000, `ready after ${readyAfterMs}ms while the CDN never answered`);
    const deadline = Date.now() + 2_000;
    while (downloadRequests === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(downloadRequests, 1, "startup still kicks off the catalog download");
    const appInfo = async () => {
      const response = await fetch(new URL("/api/ccr/rpc", runtime.url), {
        body: JSON.stringify({ args: [], method: "getAppInfo" }),
        headers: { "content-type": "application/json", "x-ccr-web-auth": "catalog-startup-token" },
        method: "POST"
      });
      assert.equal(response.status, 200);
      return (await response.json()).value;
    };
    assert.equal((await appInfo()).modelCatalogRefreshError, undefined);
    cdn.closeAllConnections();
    const { modelCatalogRefreshError } = await import("@llmr/core/models/catalog-file.ts");
    const failureDeadline = Date.now() + 2_000;
    while (modelCatalogRefreshError() === undefined && Date.now() < failureDeadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(modelCatalogRefreshError() ?? "", /^fetch failed: .+/, "the failed download is recorded with its cause");
    assert.equal((await appInfo()).modelCatalogRefreshError, modelCatalogRefreshError());
  } finally {
    await runtime.close();
    cdn.closeAllConnections();
    await new Promise((resolve) => cdn.close(resolve));
  }
});
