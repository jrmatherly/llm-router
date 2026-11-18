import assert from "node:assert/strict";
import test from "node:test";
import type { ChromeLoginImportJob } from "@llmr/core/contracts/app.ts";
import { chromeLoginImportFailureMessage } from "@llmr/ui/lib/chrome-login-import.ts";

const job: ChromeLoginImportJob = { confirmUrl: "", createdAt: 0, domains: ["example.com"], endpointUrl: "", expiresAt: 0, id: "j", importUrl: "", status: "failed", target: "browser" };
const result = { completedAt: 0, cookieImported: 0, cookieSkipped: 2, domains: ["example.com"], imported: 0, localStorageImported: 0, localStorageSkipped: 1, partitions: [], skipped: 3 };

test("a failed Chrome import message gives the counts and the first error", () => {
  assert.equal(chromeLoginImportFailureMessage(job), "Chrome import failed.");
  assert.equal(chromeLoginImportFailureMessage({ ...job, result }), "Chrome import failed: 0 imported, 3 skipped.");
  assert.equal(
    chromeLoginImportFailureMessage({ ...job, result: { ...result, errors: ["example.com:sid: rejected", "second"] } }),
    "Chrome import failed: 0 imported, 3 skipped. First error: example.com:sid: rejected"
  );
});
