import assert from "node:assert/strict";
import test from "node:test";
import type { AppUpdateStatus } from "@llmr/core/contracts/app";
import { deriveStatus, formatReleaseNotes, formatUpdateError, normalizeProgress, silentFailureStatus } from "@llmr/electron/main/update-status.ts";

const base: AppUpdateStatus = { canCheck: false, canDownload: false, canInstall: false, currentVersion: "1.0.0", state: "idle", supported: true };
const pick = ({ canCheck, canDownload, canInstall }: AppUpdateStatus) => ({ canCheck, canDownload, canInstall });

test("deriveStatus enables one action per state", () => {
  assert.deepEqual(pick(deriveStatus(base)), { canCheck: true, canDownload: false, canInstall: false });
  for (const state of ["checking", "downloading", "installing"] as const) {
    assert.equal(deriveStatus({ ...base, state }).canCheck, false, state);
  }
  assert.equal(deriveStatus({ ...base, state: "available" }).canDownload, true);
  assert.equal(deriveStatus({ ...base, state: "downloaded" }).canInstall, true);
  assert.deepEqual(pick(deriveStatus({ ...base, state: "available", supported: false })), { canCheck: false, canDownload: false, canInstall: false });
});

test("formatReleaseNotes handles strings, lists and null", () => {
  assert.equal(formatReleaseNotes("  notes  "), "notes");
  assert.equal(formatReleaseNotes("   "), undefined);
  assert.equal(formatReleaseNotes([{ note: "a", version: "1.1.0" }, { note: null, version: "1.2.0" }]), "1.1.0\na\n\n1.2.0");
  assert.equal(formatReleaseNotes(null), undefined);
});

test("formatUpdateError replaces code-signature errors with advice", () => {
  assert.equal(formatUpdateError(new Error("Code signature at URL file:///x did not pass validation")), "Downloaded update failed code-signature validation. Download the latest installer manually, or try again after the package is re-signed.");
  assert.equal(formatUpdateError(new Error("boom")), "boom");
  assert.equal(formatUpdateError("plain"), "plain");
});

test("normalizeProgress drops non-finite numbers", () => {
  assert.deepEqual(normalizeProgress({ bytesPerSecond: Number.NaN, delta: 0, percent: 50, total: Number.POSITIVE_INFINITY, transferred: 10 }), { bytesPerSecond: undefined, percent: 50, total: undefined, transferred: 10 });
});

test("silentFailureStatus restores the earlier state", () => {
  assert.equal(silentFailureStatus({ ...base, state: "checking" }, new Error("offline")).state, "idle");
  assert.equal(silentFailureStatus({ ...base, state: "error" }, new Error("offline")).state, "idle");
  const restored = silentFailureStatus({ ...base, availableVersion: "2.0.0", state: "available" }, new Error("offline"));
  assert.equal(restored.state, "available");
  assert.equal(restored.availableVersion, "2.0.0");
  assert.equal(restored.lastError, "offline");
});
