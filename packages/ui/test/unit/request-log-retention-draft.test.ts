import assert from "node:assert/strict";
import test from "node:test";
import { resolveRetentionDraft } from "@llmr/ui/pages/home/shared/logs.ts";

test("a whole number of days from 1 to 90 that differs from the saved one is saved as typed", () => {
  assert.equal(resolveRetentionDraft("30", 7), 30);
  assert.equal(resolveRetentionDraft("1", 7), 1);
  assert.equal(resolveRetentionDraft("90", 7), 90);
});

test("a retention draft that is not a new whole number of days from 1 to 90 saves nothing", () => {
  for (const draft of ["", "   ", "abc", "2.7", "0", "-1", "91", "7"]) {
    assert.equal(resolveRetentionDraft(draft, 7), undefined, JSON.stringify(draft));
  }
});
