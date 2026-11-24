import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const credentialMarkers = [
  "Claude Code-credentials",
  ".credentials.json",
  "claudeAiOauth",
  "platform.claude.com/v1/oauth/token",
  "oauth-2025-04-20"
];
// Claude Code's own setting descriptions, which name its credential store.
const generated = path.join("packages", "ui", "src", "generated");

function sourceFiles() {
  return readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("packages", entry.name, "src"))
    .flatMap((root) => readdirSync(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.startsWith(`${generated}${path.sep}`));
}

test("no package source reads, refreshes or writes the Claude Code login", () => {
  const files = sourceFiles();
  assert.ok(files.length > 100, "the scan found the package sources");
  const offenders = files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return credentialMarkers.filter((marker) => text.includes(marker)).map((marker) => `${file}: ${marker}`);
  });
  assert.deepEqual(offenders, []);
});
