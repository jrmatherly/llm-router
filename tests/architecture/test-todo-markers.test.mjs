import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const files = [
  "packages/core/test/integration/profiles/profile-service.test.mjs",
  "packages/core/test/unit/profiles/codex-config-strip.test.mjs"
];

test("the Codex profile tests carry only the todo markers of known open rows", () => {
  const reasons = files.flatMap((file) => [...readFileSync(path.join(process.cwd(), file), "utf8").matchAll(/todo: "([^"]*)"/g)].map((match) => match[1]));
  // A todo test that fails or passes exits 0, so a new one hides its failure and a fixed row goes unnoticed.
  assert.deepEqual(reasons, ["S-1, fixed in Task 2", "S-2, fixed in Task 3", "S-6, fixed in Task 3"], "a todo was added or removed: when a row is fixed, remove its todo from the test and its entry here; add no new todo");
});
