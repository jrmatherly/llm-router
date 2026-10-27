import {
  formatCompactNumber, formatUsdCost, ProviderAccountSnapshot, TrayComponentVariants, TrayWindowModuleId, UsageComparisonRow,
  UsageStatsSnapshot, UsageTotals
} from "../shared";
import { AccountSummaryPanel } from "./account-panel";
import { AnimatedUsageChart, ChartShell, ModelShareChart, RingMetrics, StatsGrid, TokenActivityPanel, TokenMixPanel } from "./widgets";

export function UsageOverviewPanel({
  activeStats,
  accountSnapshots,
  accountRefreshing,
  componentVariants,
  loading,
  modules,
  monthTotals,
  todayTotals,
  topModel,
  weekTotals,
  onRefreshAccount
}: {
  activeStats: UsageStatsSnapshot;
  accountSnapshots: ProviderAccountSnapshot[];
  accountRefreshing?: boolean;
  componentVariants: TrayComponentVariants;
  loading: boolean;
  modules: ReadonlySet<TrayWindowModuleId>;
  monthTotals: UsageTotals;
  todayTotals: UsageTotals;
  topModel?: UsageComparisonRow;
  weekTotals: UsageTotals;
  onRefreshAccount?: () => void | Promise<void>;
}) {
  const showTokenMix = modules.has("token-mix");
  const showRings = modules.has("rings");

  return (
    <section className="space-y-2">
      {modules.has("account") ? <AccountSummaryPanel refreshing={accountRefreshing} snapshots={accountSnapshots} variant={componentVariants.account} onRefresh={onRefreshAccount} /> : null}

      {modules.has("token-flow") ? (
      <ChartShell
        meta={topModel?.label ?? "No model yet"}
        title={`30d Token Flow`}
      >
        <AnimatedUsageChart chartId="overview-flow" series={activeStats.series} variant={componentVariants.tokenFlow} />
      </ChartShell>
      ) : null}

      {modules.has("activity") ? <TokenActivityPanel generatedAt={activeStats.generatedAt} range={activeStats.range} series={activeStats.series} /> : null}

      {modules.has("stats") ? (
      <StatsGrid
        items={[
          { label: "Today tokens", value: formatCompactNumber(todayTotals.totalTokens) },
          { label: `7d tokens`, value: formatCompactNumber(weekTotals.totalTokens) },
          { label: `30d tokens`, value: formatCompactNumber(monthTotals.totalTokens) },
          { label: "Today req", value: formatCompactNumber(todayTotals.requestCount) },
          { label: `Today Cost`, value: formatUsdCost(todayTotals.costUsd) }
        ]}
        variant={componentVariants.stats}
      />
      ) : null}

      {showTokenMix || showRings ? (
        <div className={`${showTokenMix && showRings ? "grid-cols-2" : "grid-cols-1"} grid gap-2`}>
          {showTokenMix ? <TokenMixPanel totals={monthTotals} variant={componentVariants.tokenMix} /> : null}
          {showRings ? <RingMetrics totals={monthTotals} variant={componentVariants.rings} /> : null}
        </div>
      ) : null}

      {modules.has("model-share") ? <ModelShareChart rows={activeStats.models} variant={componentVariants.modelShare} /> : null}

      {loading ? <div className="mt-1.5 text-[11px] font-medium text-slate-200/60">Syncing usage...</div> : null}
    </section>
  );
}
