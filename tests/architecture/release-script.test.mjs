import assert from "node:assert/strict";
import test from "node:test";
import { nextVersion, parseReleaseArgs } from "../../scripts/release.mjs";

test("nextVersion bumps by keyword or accepts a higher explicit version", () => {
  assert.equal(nextVersion("4.2.0", "major"), "5.0.0");
  assert.equal(nextVersion("4.2.0", "minor"), "4.3.0");
  assert.equal(nextVersion("4.2.0", "patch"), "4.2.1");
  assert.equal(nextVersion("4.2.0", "4.3.0"), "4.3.0");
  assert.throws(() => nextVersion("4.2.0", "4.2.0"), /not above/);
  assert.throws(() => nextVersion("4.2.0", "4.1.9"), /not above/);
  assert.throws(() => nextVersion("4.2.0", "v4.3.0"), /not major, minor, patch/);
  assert.throws(() => nextVersion("4.2.0", "04.3.0"), /not major, minor, patch/);
  assert.throws(() => nextVersion("4.2", "patch"), /not x\.y\.z/);
});

test("parseReleaseArgs needs exactly one version spec and knows its flags", () => {
  assert.deepEqual(parseReleaseArgs(["minor"]), { dryRun: false, skipChecks: false, spec: "minor" });
  assert.deepEqual(parseReleaseArgs(["4.3.0", "--dry-run", "--skip-checks"]), { dryRun: true, skipChecks: true, spec: "4.3.0" });
  assert.throws(() => parseReleaseArgs([]), /usage/);
  assert.throws(() => parseReleaseArgs(["minor", "patch"]), /usage/);
  assert.throws(() => parseReleaseArgs(["minor", "--bogus"]), /--bogus/);
});
