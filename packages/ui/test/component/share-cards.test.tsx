import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteMapCard, SharePosterHeader } from "@ccr/ui/pages/home/components/share-cards.tsx";
import type { UsageStatsSnapshot } from "@ccr/ui/pages/home/shared/index";

const emptyTotals = {
  avgDurationMs: 0,
  cacheRatio: 0,
  cacheTokens: 0,
  costUsd: 0,
  errorCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  requestCount: 0,
  successRate: 0,
  totalTokens: 0
};

const emptyUsageStats: UsageStatsSnapshot = {
  clientModels: [],
  generatedAt: "2026-10-25T00:00:00.000Z",
  models: [],
  providerModels: [],
  range: "7d",
  recentRequests: [],
  series: [],
  totals: emptyTotals
};

const minimalPosterHeaderProps = { title: "Route Map", tone: "indigo" as const };

test("share card route map and poster header name the product, not LLMR", () => {
  const map = renderToStaticMarkup(<RouteMapCard usageStats={emptyUsageStats} />);
  assert.doesNotMatch(map, />CCR</);
  assert.match(map, /LLMR/);
  const header = renderToStaticMarkup(<SharePosterHeader {...minimalPosterHeaderProps} />);
  assert.doesNotMatch(header, />CCR</);
});
