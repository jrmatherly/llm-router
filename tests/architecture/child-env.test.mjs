import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// LLMR's own processes: the gateway native-module probe (supervisor.ts) and the detached CLI daemon, which reads LLMR_WEB_AUTH_TOKEN.
const ownProcessSpreads = {
  "packages/cli/src/cli.ts": 1,
  "packages/core/src/gateway/core-runtime/supervisor.ts": 1
};

test("no child but LLMR itself is handed a spread of the whole environment", () => {
  const found = {};
  for (const root of ["packages/cli/src", "packages/core/src", "packages/electron/src"]) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const file = path.join(entry.parentPath, entry.name);
      const count = readFileSync(file, "utf8").match(/^(?!\s*\/\/).*\.\.\.process\.env\b/gm)?.length ?? 0;
      if (count) found[file] = count;
    }
  }
  assert.deepEqual(found, ownProcessSpreads, "pass withoutLlmrSecretEnv() to mergeChildEnv, not process.env");
});

test("no source file spreads the filtered environment under other layers", () => {
  const spread = /\.\.\.\s*withoutLlmrSecretEnv\s*\(|Object\.assign\([^)]*withoutLlmrSecretEnv\s*\(/g;
  const found = {};
  for (const root of readdirSync("packages").map((name) => path.join("packages", name, "src"))) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      const count = readFileSync(file, "utf8").match(spread)?.length ?? 0;
      if (count) found[file] = count;
    }
  }
  assert.deepEqual(
    found,
    {},
    "pass withoutLlmrSecretEnv() to mergeChildEnv as its first layer. This check misses a copy held in a variable and spread later, and an aliased import."
  );
});

test("the Codex runtime script copies the whole environment in one place only", () => {
  const runtime = readFileSync("packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs", "utf8");
  // The one copy is the bot gateway client, which runs inside LLMR's own process.
  assert.equal(runtime.match(/Object\.assign\(\{\},\s*process\.env\b|\.\.\.process\.env\b/g)?.length, 1, "use mergeChildEnv for a child's environment");
});

test("the routing guide's api.env examples read names the filter lets a route script see", () => {
  const pattern = /const llmrSecretEnvName = \/(.+)\/(\w*);/.exec(readFileSync("packages/core/src/mcp/child-env.ts", "utf8"));
  assert.ok(pattern, "child-env.ts no longer declares llmrSecretEnvName the way this test reads it");
  const hidden = new RegExp(pattern[1], pattern[2]);
  const names = [...readFileSync("docs/src/content/docs/en/configuration/routing.md", "utf8").matchAll(/api\.env\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(names.length >= 3, `read only ${names.length} api.env examples from the routing guide`);
  assert.deepEqual(names.filter((name) => hidden.test(name)), []);
});
