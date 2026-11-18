import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
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

const typecheckScript = "tsc --noEmit && tsc --noEmit -p tsconfig.codex-runtime.json";

test("typecheck covers the TypeScript test files", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.typecheck, typecheckScript);
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

test("lint is Biome with the formatter and assists off, pinned, and run by CI", () => {
  const { devDependencies, scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const biome = JSON.parse(readFileSync("biome.json", "utf8"));
  const version = devDependencies["@biomejs/biome"];
  assert.equal(scripts.lint, "biome lint --error-on-warnings .");
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(biome.$schema, `https://biomejs.dev/schemas/${version}/schema.json`);
  assert.equal(biome.formatter.enabled, false);
  assert.equal(biome.assist.enabled, false);
  const jobs = readFileSync(".github/workflows/test.yml", "utf8").split(/^(?= {2}[\w-]+:$)/m);
  const testJob = jobs.find((job) => job.startsWith("  test:\n"));
  assert.ok(testJob.includes("\n      - name: 🧹 Lint\n        run: npm run lint\n\n"), "the test job must run lint as a plain step");
});

test("lint reports a planted defect in workspace source", () => {
  // Pinning biome.json key by key would miss the next way to hollow it out; this fails when lint stops seeing packages/ or stops applying the rules.
  const probe = `packages/core/src/zz-lint-probe-${process.pid}.ts`;
  writeFileSync(probe, "debugger;\nlet x = 1;\nif (x == 2) {}\n");
  try {
    const result = spawnSync(path.resolve("node_modules/.bin/biome"), ["lint", "--error-on-warnings", probe], { encoding: "utf8", shell: process.platform === "win32" });
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 1, output);
    for (const rule of ["lint/suspicious/noDebugger", "lint/suspicious/noDoubleEquals", "lint/style/useConst"]) {
      assert.ok(output.includes(rule), `${rule} missing from:\n${output}`);
    }
  } finally {
    rmSync(probe, { force: true });
  }
});

test("typecheck covers the Codex runtime script without strict mode", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.typecheck, typecheckScript);
  const runtimeProject = JSON.parse(readFileSync("tsconfig.codex-runtime.json", "utf8"));
  assert.equal(runtimeProject.compilerOptions.checkJs, true);
  assert.equal(runtimeProject.compilerOptions.strict, false);
  assert.deepEqual(runtimeProject.files, ["packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs"]);
});
