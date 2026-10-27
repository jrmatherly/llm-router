import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("no UI source text still says CCR", () => {
  const hits = sourceFiles("packages/ui/src").flatMap((file) =>
    (readFileSync(file, "utf8").match(/^.*(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-]).*$/gm) ?? []).map((hit) => `${file}: ${hit}`)
  );
  assert.deepEqual(hits, []);
});
