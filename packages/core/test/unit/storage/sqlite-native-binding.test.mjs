import assert from "node:assert/strict";
import test from "node:test";
import { betterSqliteNativeBindingCandidates } from "@ccr/core/storage/sqlite-native.ts";

test("node runtime resolves only the default binary", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({ modules: "137" }), [
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});

test("electron runtime prefers the ABI-named sidecar", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({ electron: "42.4.1", modules: "146" }), [
    "better-sqlite3/build/Release/better_sqlite3.electron-146.node",
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});
