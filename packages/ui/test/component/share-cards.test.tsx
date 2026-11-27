import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteMapCard, ShareCardWidget, SharePosterHeader } from "@llmr/ui/pages/home/components/share-cards.tsx";
import type { UsageStatsSnapshot } from "@llmr/ui/pages/home/shared/index";

const emptyTotals = {
  avgDurationMs: 0,
  cacheRatio: 0,
  cacheTokens: 0,
  costUsd: 0,
  errorCount: 0,
  estimatedCostUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  pricedRequestCount: 0,
  requestCount: 0,
  successRate: 0,
  totalTokens: 0,
  unpricedRequestCount: 0
};

const emptyUsageStats: UsageStatsSnapshot = {
  clientModels: [],
  generatedAt: "2026-10-25T00:00:00.000Z",
  models: [],
  priceSources: [],
  providerModels: [],
  range: "7d",
  recentRequests: [],
  series: [],
  totals: emptyTotals
};

const minimalPosterHeaderProps = { title: "Route Map", tone: "indigo" as const };

test("share card route map and poster header name the product", () => {
  const map = renderToStaticMarkup(<RouteMapCard usageStats={emptyUsageStats} />);
  assert.match(map, /<span>LLMR<\/span>/);
  const header = renderToStaticMarkup(<SharePosterHeader {...minimalPosterHeaderProps} />);
  assert.match(header, />Route Map</);
  assert.match(header, />LLMR</);
});

test("the spend receipt marks a partly approximate total and prints its caption", () => {
  const totals = { ...emptyTotals, costUsd: 0.005, estimatedCostUsd: 0.003, pricedRequestCount: 2, unpricedRequestCount: 3 };
  const html = renderToStaticMarkup(
    <ShareCardWidget providerAccounts={[]} type="share-spend-receipt" usageRange="7d" usageStats={{ ...emptyUsageStats, totals }} />
  );
  assert.match(html, /~\$0\.005000/);
  assert.match(html, /~\$0\.003000 approximate · 3 requests without a price/);
});
