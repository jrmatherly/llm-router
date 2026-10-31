import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderAccountSnapshot } from "@llmr/core/contracts/app.ts";
import { trayBalanceProgress } from "@llmr/electron/main/tray-balance-progress.ts";

const ultraClaudeSnapshot: ProviderAccountSnapshot = {
  meters: [
    { id: "claude_seven_day_quota", kind: "quota", label: "7d quota", limit: 100, remaining: 31, unit: "%", used: 69, window: "weekly" },
    { id: "claude_weekly_scoped_fable", kind: "quota", label: "Fable weekly quota", limit: 100, remaining: 4, unit: "%", used: 96, window: "weekly" }
  ],
  plan: "Ultra",
  provider: "Claude Code API",
  source: "http-json",
  status: "critical",
  updatedAt: "2026-06-30T00:00:00.000Z"
};

test("tray progress falls back to the fullest quota meter when the pinned one is gone", () => {
  assert.equal(trayBalanceProgress(ultraClaudeSnapshot, "claude_five_hour_quota"), 0.04);
  assert.equal(trayBalanceProgress(ultraClaudeSnapshot, "claude_seven_day_quota"), 0.31);
  assert.equal(trayBalanceProgress(undefined, "claude_five_hour_quota"), 0);
});
