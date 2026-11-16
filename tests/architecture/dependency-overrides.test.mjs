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
