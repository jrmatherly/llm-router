import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("every t() key used in the UI that mentions LLMR has a Chinese entry, and no key still says LLMR", () => {
  const i18n = readFileSync("packages/ui/src/pages/home/shared/i18n.tsx", "utf8") + readFileSync("packages/ui/src/pages/tray/shared.tsx", "utf8");
  const ccrKeys = i18n.match(/^\s*"[^"]*(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])[^"]*":/gm) ?? [];
  assert.deepEqual(ccrKeys, []);
  const used = execFileSync("git", ["grep", "-ohP", "t\\(\"[^\"]*LLMR[^\"]*\"", "--", "packages/ui/src"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((line) => line.slice(3, -1));
  const missing = [...new Set(used)].filter((key) => !i18n.includes(`"${key}":`));
  assert.deepEqual(missing, []);
});
