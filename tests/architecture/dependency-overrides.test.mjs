import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("ai-gateway never loads the glob that the root override forces to a new major", () => {
  const { overrides } = JSON.parse(readFileSync("package.json", "utf8"));
  if (!overrides["@the-next-ai/ai-gateway"]?.glob) {
    return;
  }
  const root = "node_modules/@the-next-ai/ai-gateway";
  const references = readdirSync(root, { recursive: true })
    .filter((file) => /\.[cm]?js$/.test(file) && !file.split(path.sep).includes("node_modules"))
    .filter((file) => /\b(?:glob|minimatch|path-scurry)\b/.test(readFileSync(path.join(root, file), "utf8")));
  assert.deepEqual(references, [], "ai-gateway references glob now: drop its override in package.json and triage the glob range again");
});

test("no install carries baseui or styletron, and core-js cannot run install scripts", () => {
  // The lockfiles cover every manifest, every dependency field and transitive installs.
  for (const file of ["package-lock.json", "docs/package-lock.json"]) {
    const installed = Object.keys(JSON.parse(readFileSync(file, "utf8")).packages);
    assert.deepEqual(installed.filter((name) => /(?:^|\/)node_modules\/(?:baseui|styletron-[^/]+)$/.test(name)), [], file);
  }
  const { allowScripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(Object.keys(allowScripts).filter((name) => name.startsWith("core-js@")), []);
});
