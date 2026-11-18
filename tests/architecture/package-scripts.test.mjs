import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("every root script that runs a repo file points at a file that exists", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const missing = Object.entries(scripts).flatMap(([name, command]) =>
    [...command.matchAll(/\bnode\s+([\w./-]+\.(?:mjs|cjs|js|ts))/g)]
      .map((match) => match[1])
      .filter((file) => !existsSync(file))
      .map((file) => `${name} -> ${file}`));
  assert.deepEqual(missing, []);
});

test("typecheck covers the TypeScript test files", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.typecheck, "tsc --noEmit");
  // The resolved file list, so an `exclude` entry or a narrowed glob fails here too.
  const { files } = JSON.parse(execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--showConfig"], { encoding: "utf8" }));
  for (const file of [
    "./packages/electron/test/unit/launch-at-login.test.ts",
    "./packages/ui/test/component/layout.test.tsx",
    "./packages/ui/test/unit/usage-format.test.ts"
  ]) {
    assert.ok(files.includes(file), file);
  }
});
