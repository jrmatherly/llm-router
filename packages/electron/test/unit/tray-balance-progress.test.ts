import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderAccountSnapshot } from "@llmr/core/contracts/app.ts";
import { trayBalanceProgress } from "@llmr/electron/main/tray-balance-progress.ts";

const planQuotaSnapshot: ProviderAccountSnapshot = {
  meters: [
    { id: "example_five_hour_quota", kind: "quota", label: "5h quota", limit: 100, remaining: 4, unit: "%", used: 96, window: "5h" },
    { id: "example_weekly_quota", kind: "quota", label: "Weekly quota", limit: 100, remaining: 31, unit: "%", used: 69, window: "weekly" }
  ],
  plan: "Pro",
  provider: "Example Provider",
  source: "http-json",
  status: "critical",
  updatedAt: "2026-06-30T00:00:00.000Z"
};

test("tray progress falls back to the fullest quota meter when the pinned one is gone", () => {
  assert.equal(trayBalanceProgress(planQuotaSnapshot, "example_monthly_quota"), 0.04);
  assert.equal(trayBalanceProgress(planQuotaSnapshot, "example_weekly_quota"), 0.31);
  assert.equal(trayBalanceProgress(undefined, "example_monthly_quota"), 0);
});

test("tray progress fallback ignores balance meters", () => {
  const withCredits: ProviderAccountSnapshot = {
    ...planQuotaSnapshot,
    meters: [
      ...planQuotaSnapshot.meters,
      { id: "example_extra_usage_credits", kind: "balance", label: "Extra usage credits", limit: 1900, remaining: 19, unit: "credits", used: 1881, window: "monthly" }
    ]
  };
  assert.equal(trayBalanceProgress(withCredits, "example_monthly_quota"), 0.04);
});
