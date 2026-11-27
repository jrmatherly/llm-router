import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewView } from "@llmr/ui/pages/home/components/dashboard.tsx";
import { LogExpandedDetails } from "@llmr/ui/pages/home/components/network-logs.tsx";
import { ShareCardWidget } from "@llmr/ui/pages/home/components/share-cards.tsx";
import { formatCost, formatTotalCost, priceSourceLabel, totalCostCaption } from "@llmr/ui/pages/home/shared/usage.ts";
import { formatTotalCost as formatTrayTotalCost } from "@llmr/ui/pages/tray/shared.tsx";
import type { RequestLogEntry } from "@llmr/core/contracts/app.ts";
import { installBrowserGlobals, usageRow, usageStats, usageTotals } from "../fixtures/index.ts";

installBrowserGlobals();

const mixed = { costUsd: 0.005, estimatedCostUsd: 0.003, pricedRequestCount: 2, unpricedRequestCount: 3 };

test("a cost with no basis shows as the plain amount, and an unknown basis wins over a stored amount", () => {
  assert.equal(formatCost(0.000016, undefined), "$0.000016");
  assert.equal(formatCost(0.000016, "user"), "$0.000016");
  assert.equal(formatCost(0, "estimate"), "~$0.00");
  assert.equal(formatCost(0.000016, "unknown"), "-");
  assert.equal(formatCost(undefined, "estimate"), "-");
});

test("the tray formats a total the way the home page does", () => {
  assert.equal(formatTrayTotalCost(mixed), formatTotalCost(mixed));
  assert.equal(formatTrayTotalCost(mixed), "~$0.005000");
});

test("a caption counts two requests in the plural and keeps the approximate part first", () => {
  assert.equal(totalCostCaption({ estimatedCostUsd: 0, unpricedRequestCount: 2 }), "2 requests without a price");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0.003, unpricedRequestCount: 1 }), "~$0.003000 approximate · 1 request without a price");
});

test("every other stored price source reads as words", () => {
  assert.equal(priceSourceLabel("litellm", "listed"), "LiteLLM list price");
  assert.equal(priceSourceLabel("openrouter", "listed"), "OpenRouter list price");
  assert.equal(priceSourceLabel("request_log", "estimate"), "Not recorded");
  assert.equal(priceSourceLabel("something-new", "estimate"), "Not recorded");
  assert.equal(priceSourceLabel(undefined, "unknown"), "Not priced yet");
  assert.equal(priceSourceLabel(undefined, "estimate"), "Not recorded");
});

const logEntry: RequestLogEntry = {
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  client: "claude-code",
  createdAt: "2026-07-23T00:00:00.000Z",
  credentialChain: [],
  credentialSaturated: false,
  durationMs: 120,
  id: 1,
  inputTokens: 100,
  isStream: true,
  method: "POST",
  model: "claude-sonnet-4",
  ok: true,
  outputTokens: 50,
  path: "/v1/messages",
  provider: "anthropic",
  reasoningTokens: 0,
  requestBody: { encoding: "utf8", sizeBytes: 2, text: "{}", truncated: false },
  requestHeaders: {},
  requestId: "req-cost-basis",
  retryAttempts: [],
  routeAttemptCount: 1,
  routeHopCount: 1,
  routeTraceTruncated: false,
  responseHeaders: {},
  statusCode: 200,
  totalTokens: 150,
  url: "/v1/messages"
};

const metric = (html: string, label: string) => html.match(new RegExp(`${label}</[^>]+>\\s*<[^>]+>([^<]*)<`))?.[1];

test("Logs detail shows a waiting request as a dash that is not priced yet, a listed price plain, and a user price of zero as zero", () => {
  const waiting = renderToStaticMarkup(<LogExpandedDetails entry={{ ...logEntry, costBasis: "unknown", costSource: "" }} />);
  assert.equal(metric(waiting, "Cost"), "-");
  assert.equal(metric(waiting, "Price source"), "Not priced yet");

  const listed = renderToStaticMarkup(<LogExpandedDetails entry={{ ...logEntry, costBasis: "listed", costSource: "models.dev", costUsd: 0.000016 }} />);
  assert.equal(metric(listed, "Cost"), "$0.000016");
  assert.equal(metric(listed, "Price source"), "models.dev list price");

  const userZero = renderToStaticMarkup(<LogExpandedDetails entry={{ ...logEntry, costBasis: "user", costSource: "custom", costUsd: 0 }} />);
  assert.equal(metric(userZero, "Cost"), "$0.00");
  assert.equal(metric(userZero, "Price source"), "Your price");

  const legacy = renderToStaticMarkup(<LogExpandedDetails entry={{ ...logEntry, costBasis: "estimate", costSource: "", costUsd: 2 }} />);
  assert.equal(metric(legacy, "Cost"), "~$2.00");
  assert.equal(metric(legacy, "Price source"), "Not recorded");

  const noTokens = renderToStaticMarkup(<LogExpandedDetails entry={logEntry} />);
  assert.equal(metric(noTokens, "Cost"), "-");
  assert.doesNotMatch(noTokens, /Price source/);
});

test("a usage analysis row marks a partly approximate cost and prints no caption", () => {
  const html = renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[{ enabled: true, id: "clients", size: "4:2", type: "client-analysis", variant: "table" }]}
      providerAccounts={[]}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={usageStats("30d", {
        clientModels: [
          usageRow("client:mixed", "Mixed", { ...mixed, client: "mixed" }),
          usageRow("client:unpriced", "Unpriced", { client: "unpriced", costUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 4 }),
          usageRow("client:listed", "Listed", { client: "listed", costUsd: 0.007, pricedRequestCount: 1 })
        ]
      })}
      onWidgetsChange={() => undefined}
    />
  );
  assert.match(html, /<td[^>]*>~\$0\.005000<\/td>/);
  assert.match(html, /<td[^>]*>-<\/td>/);
  assert.match(html, /<td[^>]*>\$0\.007000<\/td>/);
  assert.doesNotMatch(html, /approximate|without a price/);
});

test("both share cards that print a cost mark an approximate total, and only the receipt captions it", () => {
  const stats = usageStats("7d", { totals: usageTotals(mixed) });
  const render = (type: "share-spend-receipt" | "share-usage-wrapped") => renderToStaticMarkup(
    <ShareCardWidget providerAccounts={[]} type={type} usageRange="7d" usageStats={stats} />
  );
  assert.match(render("share-usage-wrapped"), />~\$0\.005000</);
  assert.doesNotMatch(render("share-usage-wrapped"), /approximate/);
  assert.match(render("share-spend-receipt"), />~\$0\.005000</);

  const nothingPriced = usageStats("7d", { totals: usageTotals({ costUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 2 }) });
  const receipt = renderToStaticMarkup(<ShareCardWidget providerAccounts={[]} type="share-spend-receipt" usageRange="7d" usageStats={nothingPriced} />);
  assert.match(receipt, /<div class="text-\[40px\][^>]*>-<\/div>/);
  assert.match(receipt, /2 requests without a price/);
});
