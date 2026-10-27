import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const exempt = /^docs\/superpowers\//;
const han = /\p{Script=Han}/u;
// Range endpoints (a CJK block written as a backslash-u range) stay legal: they size or normalize any user text.
const escapedHan = /(?<!-)\\u(?:[4-9][0-9a-f]{3}|3[0-9a-f]{3}|ff[0-9a-f]{2})(?!-\\u)/i;
// Both match one provider's Chinese 401 body so English users see an English message, not the raw text.
const escapedHanAllowed = new Set([
  "packages/ui/src/pages/home/shared/i18n.tsx",
  "packages/ui/src/pages/home/shared/providers.ts"
]);

function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file && !exempt.test(file))
    .map((file) => ({ file, bytes: readFileSync(file) }))
    .filter(({ bytes }) => !bytes.includes(0));
}

test("tracked file paths and text contain no Chinese", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter((file) => file && !exempt.test(file));
  assert.deepEqual(files.filter((file) => han.test(file)), []);
  assert.deepEqual(trackedTextFiles().filter(({ bytes }) => han.test(bytes.toString("utf8"))).map(({ file }) => file), []);
});

test("source files spell no Chinese as unicode escapes", () => {
  const offenders = trackedTextFiles()
    .filter(({ file }) => /\.(?:[cm]?[jt]sx?)$/.test(file) && !escapedHanAllowed.has(file))
    .filter(({ bytes }) => escapedHan.test(bytes.toString("utf8")))
    .map(({ file }) => file);
  assert.deepEqual(offenders, []);
});
