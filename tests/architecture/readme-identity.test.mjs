import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const upstreamLinks = /musistudio\/claude-code-router\/releases|npm install -g @musistudio|ccrdesk\.top/;

for (const file of ["README.md"]) {
  test(`${file} points at this fork`, () => {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, upstreamLinks);
    assert.match(text, /github\.com\/jrmatherly\/llm-router\/releases\/latest/);
  });
}

for (const file of [
  "packages/cli/README.md",
  "docker/README.md",
  "docs/src/content/docs/en/guides/install.md",
]) {
  test(`${file} points at this fork`, () => {
    assert.doesNotMatch(readFileSync(file, "utf8"), upstreamLinks);
  });
}

test("README.md local images exist", () => {
  const sources = [...readFileSync("README.md", "utf8").matchAll(/<img[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((source) => !/^https?:/.test(source));
  assert.ok(sources.length > 0);
  for (const source of sources) {
    assert.ok(existsSync(source.replace(/^\//, "")), `missing README image: ${source}`);
  }
});
