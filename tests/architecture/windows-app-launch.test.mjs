import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A launch from a process that has just started looks before the Store package list has loaded.
// No test drives a launch on Windows with an app installed, so the wait is pinned where it is called.
test("each launch that looks for a desktop app waits for the package list when its first look finds nothing", () => {
  for (const file of [
    "packages/core/src/agents/claude-app/launch.ts",
    "packages/core/src/agents/codex/app-launch.ts",
    "packages/core/src/profiles/launch-service.ts"
  ]) {
    assert.match(readFileSync(file, "utf8"), /await findAfterAppxLoad\(\(\) => findInstalled\w+AppExecutable\(/, file);
  }
});
