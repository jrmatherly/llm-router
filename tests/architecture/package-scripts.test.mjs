import assert from "node:assert/strict";
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
  const { compilerOptions, include } = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.ok(include.includes("packages/*/test/**/*.ts"));
  assert.ok(include.includes("packages/*/test/**/*.tsx"));
  assert.equal(compilerOptions.allowImportingTsExtensions, true);
});
