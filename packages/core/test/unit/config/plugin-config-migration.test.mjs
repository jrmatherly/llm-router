import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateKnownGatewayPluginConfigsForTest } from "@llmr/core/config/config.ts";

test("stale Claude Design and Claude Ship plugin entries are dropped on load", () => {
  const result = migrateKnownGatewayPluginConfigsForTest([
    { enabled: true, id: "claude-design", module: "/gone/index.cjs" },
    { enabled: true, id: "claude-ship", module: "/gone/index.cjs" },
    { enabled: true, id: "cursor-proxy" }
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.plugins.map((plugin) => plugin.id), ["cursor-proxy"]);
});

test("externalized plugin modules migrate from the old marketplace path to llmr-extensions", () => {
  const extensionsRoot = mkdtempSync(path.join(os.tmpdir(), "llmr-extensions-migration-"));
  const previousExtensionsDir = process.env.LLMR_EXTENSIONS_DIR;
  try {
    writePluginModule(extensionsRoot, "cursor-proxy");
    process.env.LLMR_EXTENSIONS_DIR = extensionsRoot;

    const result = migrateKnownGatewayPluginConfigsForTest([{
      enabled: true,
      id: "cursor-proxy",
      module: "/Users/example/products/LLMR/llm-router/marketplace/plugins/cursor-proxy/index.cjs"
    }]);

    assert.equal(result.changed, true);
    assert.equal(result.plugins[0].module, path.join(extensionsRoot, "plugins", "cursor-proxy", "index.cjs"));
  } finally {
    restoreEnv("LLMR_EXTENSIONS_DIR", previousExtensionsDir);
    rmSync(extensionsRoot, { force: true, recursive: true });
  }
});

function writePluginModule(root, pluginId) {
  const dir = path.join(root, "plugins", pluginId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.cjs"), "\"use strict\";\nmodule.exports = {};\n", "utf8");
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
