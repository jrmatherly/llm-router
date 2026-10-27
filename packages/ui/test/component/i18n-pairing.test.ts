import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("no UI copy key still says CCR", () => {
  const i18n = readFileSync("packages/ui/src/pages/home/shared/i18n.tsx", "utf8");
  const ccrKeys = i18n.match(/^\s*"[^"]*(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])[^"]*":/gm) ?? [];
  assert.deepEqual(ccrKeys, []);
});
