import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("packaged apps never carry the Electron sidecar binary", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.ok(config.files.includes("!node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node"));
});
