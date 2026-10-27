import {
  defaultTrayWidgetVariant, formatCompactNumber, formatDuration, formatPercent, formatProviderName, ProviderAccountSnapshot, rangeLabel,
  TrayComponentVariants, TrayWidgetConfig, UsageStatsRange, UsageStatsSnapshot
} from "../shared";
import { AccountSummaryPanel } from "./account-panel";
import { AnimatedUsageChart, ChartShell, ModelShareChart, RangeSwitch, RingMetrics, StatsGrid, TokenActivityPanel, TokenMixPanel } from "./widgets";

export function UsageDetailPanel({
  activeStats,
  accountSnapshots,
  accountRefreshing,
  provider,
  range,
  widgets,
  onRefreshAccount,
  onRangeChange
}: {
  activeStats: UsageStatsSnapshot;
  accountSnapshots: ProviderAccountSnapshot[];
  accountRefreshing?: boolean;
  provider?: string;
  range: UsageStatsRange;
  widgets: TrayWidgetConfig[];
  onRefreshAccount?: () => void | Promise<void>;
  onRangeChange: (range: UsageStatsRange) => void;
}) {
  const totals = activeStats.totals;
  const hasDetailModule = widgets.some((widget) => widget.type !== "source-tabs");

  return (
    <>
      <div className="space-y-2">
        {widgets.map((widget, index) => {
          if (widget.type === "source-tabs") {
            return null;
          }
          if (widget.type === "header") {
            return (
              <div className="tray-panel flex min-w-0 items-start justify-between gap-2 px-3 py-2.5" key={`${widget.id}-${index}`}>
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-bold text-slate-50">Usage Detail</h2>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{rangeLabel(range)} - {provider ? formatProviderName(provider) : "All providers"}</p>
                </div>
                <RangeSwitch range={range} onChange={onRangeChange} />
              </div>
            );
          }
          if (widget.type === "stats") {
            return (
              <StatsGrid
                items={[
                  { label: `${rangeLabel(range)} tokens`, value: formatCompactNumber(totals.totalTokens) },
                  { label: `${rangeLabel(range)} requests`, value: formatCompactNumber(totals.requestCount) },
                  { label: "Avg latency", value: formatDuration(totals.avgDurationMs) },
                  { label: "Success rate", value: formatPercent(totals.successRate) }
                ]}
                key={`${widget.id}-${index}`}
                variant={(widget.variant ?? defaultTrayWidgetVariant("stats")) as TrayComponentVariants["stats"]}
              />
            );
          }
          if (widget.type === "account") {
            return <AccountSummaryPanel accountProviders={trayWidgetAccountProviderValues(widget)} key={`${widget.id}-${index}`} refreshing={accountRefreshing} snapshots={accountSnapshots} variant={(widget.variant ?? defaultTrayWidgetVariant("account")) as TrayComponentVariants["account"]} onRefresh={onRefreshAccount} />;
          }
          if (widget.type === "token-flow") {
            return (
              <ChartShell key={`${widget.id}-${index}`} meta={`${formatCompactNumber(totals.requestCount)} requests`} title="Token Flow">
                <AnimatedUsageChart chartId={`detail-flow-${index}`} series={activeStats.series} variant={(widget.variant ?? defaultTrayWidgetVariant("token-flow")) as TrayComponentVariants["tokenFlow"]} />
              </ChartShell>
            );
          }
          if (widget.type === "activity") {
            return <TokenActivityPanel generatedAt={activeStats.generatedAt} key={`${widget.id}-${index}`} range={activeStats.range} series={activeStats.series} />;
          }
          if (widget.type === "token-mix") {
            return <TokenMixPanel key={`${widget.id}-${index}`} totals={totals} variant={(widget.variant ?? defaultTrayWidgetVariant("token-mix")) as TrayComponentVariants["tokenMix"]} />;
          }
          if (widget.type === "rings") {
            return <RingMetrics key={`${widget.id}-${index}`} totals={totals} variant={(widget.variant ?? defaultTrayWidgetVariant("rings")) as TrayComponentVariants["rings"]} />;
          }
          return <ModelShareChart key={`${widget.id}-${index}`} rows={activeStats.models} variant={(widget.variant ?? defaultTrayWidgetVariant("model-share")) as TrayComponentVariants["modelShare"]} />;
        })}
      </div>
      {!hasDetailModule ? (
        <div className="tray-panel-subtle flex min-h-[260px] items-center justify-center px-4 text-center text-[12px] font-medium text-slate-400">
          No tray modules enabled
        </div>
      ) : null}
    </>
  );
}

function trayWidgetAccountProviderValues(widget: TrayWidgetConfig): string[] | undefined {
  const values = [
    ...(widget.accountProviders ?? []),
    ...(widget.accountProvider ? [widget.accountProvider] : [])
  ].map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}
