import assert from "node:assert/strict";
import test from "node:test";
import { nextVersion, parseReleaseArgs, run, testsRunFailure } from "../../scripts/release.mjs";

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

test("run returns trimmed stdout, and an empty string when stdout is inherited", () => {
  assert.equal(run("node", ["-p", "' ok '"]), "ok");
  assert.equal(run("node", ["-e", ""], { stdio: "inherit" }), "");
  assert.throws(() => run("node", ["-e", "process.exit(3)"]), /3/);
});

test("testsRunFailure accepts a completed, successful Tests run", () => {
  assert.equal(testsRunFailure([{ conclusion: "success", status: "completed", url: "u" }]), undefined);
});

test("testsRunFailure names a missing, pending or failed Tests run", () => {
  assert.equal(testsRunFailure([]), "no Tests run for HEAD");
  assert.equal(testsRunFailure([{ conclusion: "", status: "in_progress", url: "u" }]), "Tests run for HEAD is in_progress: u");
  assert.equal(testsRunFailure([{ conclusion: "failure", status: "completed", url: "u" }]), "Tests run for HEAD concluded failure: u");
  assert.equal(testsRunFailure([{ conclusion: "cancelled", status: "completed", url: "u" }]), "Tests run for HEAD concluded cancelled: u");
});
