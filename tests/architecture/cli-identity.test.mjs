import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the npm bin and the desktop launcher share one CLI name", () => {
  const cliPackage = JSON.parse(readFileSync("packages/cli/package.json", "utf8"));
  assert.deepEqual(Object.keys(cliPackage.bin), ["llmr"]);
  assert.equal(cliPackage.private, true);
  assert.match(readFileSync("packages/core/src/profiles/launch-service.ts", "utf8"), /desktopCliCommandName = "llmr"/);
  assert.match(readFileSync("packages/cli/src/cli.ts", "utf8"), /defaultCliCommandName = "llmr"/);
});
