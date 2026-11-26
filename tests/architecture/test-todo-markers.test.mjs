import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const files = [
  "packages/core/test/integration/profiles/profile-service.test.mjs",
  "packages/core/test/unit/profiles/codex-config-strip.test.mjs"
];

test("the Codex profile tests carry only the todo markers of known open rows", () => {
  const sources = files.map((file) => readFileSync(path.join(process.cwd(), file), "utf8"));
  const reasons = sources.flatMap((source) => [...source.matchAll(/todo: "([^"]*)"/g)].map((match) => match[1]));
  // A todo test that fails or passes exits 0, so a new one hides its failure and a fixed row goes unnoticed.
  assert.deepEqual(reasons, [], "a todo was added or removed: when a row is fixed, remove its todo from the test and its entry here; add no new todo");
  const words = sources.flatMap((source) => source.match(/\btodo\b/g) ?? []);
  assert.equal(words.length, reasons.length, "the word todo appears in another form (todo: true, single quotes, test.todo): every todo is written todo: \"<row>\" and listed above");
});
