import assert from "node:assert/strict";
import test from "node:test";
import { betterSqliteNativeBindingCandidates } from "@ccr/core/storage/sqlite-native.ts";

test("node runtime resolves only the default binary", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({}), [
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});

test("electron runtime prefers the version-named sidecar", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({ electron: "42.4.1" }), [
    "better-sqlite3/build/Release/better_sqlite3.electron-42.4.1.node",
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});
