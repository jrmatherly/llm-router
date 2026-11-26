import assert from "node:assert/strict";
import test from "node:test";
import { profileStatusNotices } from "@llmr/ui/pages/home/shared/profile-status-notices.ts";

test("a save shows failures, kept copies and restores of profiles just switched off", () => {
  const status = { client: "codex", enabled: false, message: "m", ok: true, path: "/x" } as const;
  assert.deepEqual(profileStatusNotices([
    { ...status, message: "failed", ok: false },
    { ...status, changed: true, message: "restored" },
    { ...status, message: "never on" },
    { ...status, copy: "/copy", enabled: true, message: "copy kept" },
    { ...status, enabled: true, message: "applied" }
  ]), { errors: ["failed"], notices: ["restored", "copy kept"] });
});

test("a restore that changed a file and then failed shows only as an error", () => {
  assert.deepEqual(profileStatusNotices([
    { changed: true, client: "codex", copy: "/copy", enabled: false, message: "restored, then a side file failed", ok: false, path: "/x" }
  ]), { errors: ["restored, then a side file failed"], notices: [] });
});
