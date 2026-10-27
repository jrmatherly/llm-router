import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of ["README.md", "README_zh.md"]) {
  test(`${file} points at this fork`, () => {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /musistudio\/claude-code-router\/releases|npm install -g @musistudio|ccrdesk\.top/);
    assert.match(text, /github\.com\/jrmatherly\/llm-router\/releases\/latest/);
  });
}
