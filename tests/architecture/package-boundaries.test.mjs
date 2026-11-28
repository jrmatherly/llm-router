import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const packageNames = ["cli", "core", "electron", "ui"];

test("legacy Electron process test suites contain no source files", () => {
  for (const directoryName of ["main", "renderer"]) {
    const directory = path.join(projectRoot, "tests", directoryName);
    const files = existsSync(directory) ? sourceFiles(directory) : [];
    assert.deepEqual(files, [], `${directoryName} must not contain legacy test sources`);
  }
});

test("every workspace package owns a test command and test directory", () => {
  for (const packageName of packageNames) {
    const packageRoot = path.join(projectRoot, "packages", packageName);
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(typeof manifest.scripts?.test, "string", `${packageName} must expose a test script`);
    assert.equal(existsSync(path.join(packageRoot, "test")), true, `${packageName} must own a test directory`);
  }
});

test("package code and tests do not reach into another package through relative source paths", () => {
  const violations = packageNames.flatMap((packageName) => {
    const packageRoot = path.join(projectRoot, "packages", packageName);
    return sourceFiles(packageRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:from\s+|import\s*\(|require\s*\()["'][^"']*packages\/(?:cli|core|electron|ui)\/src\//.test(source)
        ? [path.relative(projectRoot, file)]
        : [];
    });
  });

  assert.deepEqual(violations, []);
});

// Hoisting resolves an undeclared import in this checkout; the Docker image and the packaged app install per package.
test("every package a workspace's source imports is declared in that workspace's manifest", () => {
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']((?:@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*)(?:\/[^"'\n]*)?["']/gm;
  const violations = packageNames.flatMap((packageName) => {
    const packageRoot = path.join(projectRoot, "packages", packageName);
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const declared = new Set(Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies
    }));
    return sourceFiles(path.join(packageRoot, "src")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(specifier)]
        .map((match) => match[1])
        .filter((name) => !name.startsWith("@llmr/") && !isBuiltin(name) && !declared.has(name))
        .map((name) => `${path.relative(projectRoot, file)}: ${name}`));
  });

  assert.deepEqual(violations, []);
});

test("the TOML parser is a root dev dependency and no workspace declares it", () => {
  const root = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.match(root.devDependencies["smol-toml"] ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(root.dependencies?.["smol-toml"], undefined);
  for (const packageName of packageNames) {
    const manifest = JSON.parse(readFileSync(path.join(projectRoot, "packages", packageName, "package.json"), "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      assert.equal(manifest[field]?.["smol-toml"], undefined, `${packageName} ${field}`);
    }
  }
});

test("npm and Docker builds carry the plugin-capable gateway runtime", () => {
  const buildConfig = readFileSync(path.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

  const entryPointsOf = (name) =>
    buildConfig
      .split("\nexport function ")
      .find((chunk) => chunk.startsWith(`${name}(`))
      ?.match(/entryPoints:\s*\[([^\]]*)\]/)?.[1] ?? "";
  for (const name of ["createCliBuildOptions", "createCoreServerBuildOptions"]) {
    assert.match(entryPointsOf(name), /\bgatewayRuntimeInput\b/, name);
    assert.match(entryPointsOf(name), /\belectronUndiciProxyAgentInput\b/, name);
  }
  assert.equal(manifest.scripts["docker:prepare-gateway"], "node build/docker-local-gateway.mjs prepare");
  assert.equal(manifest.scripts["docker:build"], "node build/docker-image.mjs");
  assert.equal(manifest.scripts["docker:compose:build"], "node build/docker-compose.mjs build");
  assert.equal(manifest.scripts["docker:compose:up"], "node build/docker-compose.mjs up -d --build");
});

const runtimeSourceFile = "packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs";

test("every bundle that includes a .runtime.cjs source carries it as text", async () => {
  // Computed specifiers, so the test build does not bundle esbuild or the build config.
  const load = (...segments) => import(pathToFileURL(path.join(projectRoot, ...segments)).href);
  const esbuild = (await load("node_modules", "esbuild", "lib", "main.js")).default;
  const factories = Object.entries(await load("build", "esbuild.config.mjs")).filter(([name]) => /^create\w+BuildOptions$/.test(name));
  const isRuntimeSource = (input) => input.endsWith(".runtime.cjs");
  const carriers = [];
  for (const [name, create] of factories) {
    const { metafile, outputFiles } = await esbuild.build({ ...create(), logLevel: "silent", metafile: true, write: false });
    const outputs = outputFiles.filter((file) => Object.keys(metafile.outputs[path.relative(projectRoot, file.path)]?.inputs ?? {}).some(isRuntimeSource));
    if (!Object.keys(metafile.inputs).some(isRuntimeSource)) {
      continue;
    }
    carriers.push(name);
    assert.ok(outputs.length > 0, `${name} reaches a .runtime.cjs source but no output lists it`);
    for (const file of outputs) {
      // esbuild keeps a hashbang only at the top of an entry, so one further in is string data. Compiled as a module, the script would run in the host at startup.
      assert.notEqual(file.text.indexOf("#!/usr/bin/env node", 1), -1, `${name} must load .runtime.cjs as text: add loader { ".runtime.cjs": "text" }`);
    }
  }
  assert.deepEqual(carriers.sort(), ["createCliBuildOptions", "createCoreServerBuildOptions", "createMainBuildOptions"]);
  assert.match(readFileSync(path.join(projectRoot, "build", "test.mjs"), "utf8"), /"\.runtime\.cjs":\s*"text"/);
});

test("the Codex runtime source is checked out with LF line endings on every platform", () => {
  const attribute = execFileSync("git", ["check-attr", "eol", "--", runtimeSourceFile], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(attribute.trim(), `${runtimeSourceFile}: eol: lf`);
  assert.equal(readFileSync(path.join(projectRoot, runtimeSourceFile), "utf8").includes("\r"), false);
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(file);
    }
    return entry.isFile() && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}
