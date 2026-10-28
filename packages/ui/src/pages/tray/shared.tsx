import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LoaderCircle, Power, RefreshCw } from "lucide-react";
import appLogoUrl from "@/assets/logo.png";
import codexLogoUrl from "@/assets/agent-logos/codex.png";
import trayCyanIconUrl from "@/assets/tray-cyan.png";
import trayOrangeIconUrl from "@/assets/tray-orange.png";
import trayVioletIconUrl from "@/assets/tray-violet.png";
import { DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS } from "@llmr/core/contracts/app";
import { findProviderPreset, findProviderPresetByBaseUrl, providerPresets } from "@llmr/core/providers/presets";
import { providerPresetIconUrls } from "../home/shared/options";
import { clampNumber, providerBaseUrl } from "../home/shared/common";
import { formatCompactNumber } from "../home/shared/usage";
import type {
  AppConfig,
  GatewayProviderConfig,
  ProviderAccountMeter,
  ProviderAccountSnapshot,
  TrayBalanceProgressConfig,
  TrayComponentVariants,
  TrayWidgetConfig,
  TrayWidgetType,
  TrayWidgetVariant,
  TrayWindowModuleId,
  UsageComparisonRow,
  UsageStatsFilter,
  UsageStatsRange,
  UsageStatsSnapshot,
  UsageTotals
} from "@llmr/core/contracts/app";

export { defaultTrayWidgetVariant, normalizeTrayComponentVariants, normalizeTrayIconPreference, normalizeTrayWidgets, normalizeTrayWindowModules } from "../home/shared/common";
export { formatDuration } from "../home/shared/network";
export { formatCompactNumber, formatPercent, formatUsdCost, rangeLabel } from "../home/shared/usage";

export  {
  createContext, useCallback, useContext, useEffect, useMemo, useState, createRoot,
  LoaderCircle, Power, RefreshCw, appLogoUrl, trayCyanIconUrl, trayOrangeIconUrl, trayVioletIconUrl, DEFAULT_TRAY_COMPONENT_VARIANTS, DEFAULT_TRAY_WIDGETS, DEFAULT_TRAY_WINDOW_MODULES, TRAY_SINGLETON_WIDGET_TYPES, TRAY_TOP_WIDGET_TYPES, TRAY_WINDOW_MODULE_IDS
};
export type {
  ReactNode, AppConfig, ProviderAccountMeter, ProviderAccountSnapshot, TrayBalanceProgressConfig, TrayComponentVariants, TrayWidgetConfig, TrayWidgetType, TrayWidgetVariant, TrayWindowModuleId, UsageComparisonRow,
  UsageStatsFilter, UsageStatsRange, UsageStatsSnapshot, UsageTotals
};

export type SnapshotMap = Record<UsageStatsRange, UsageStatsSnapshot>;

export type SourceTab = {
  id: string;
  iconUrl?: string;
  label: string;
  provider?: string;
};

export function applyTrayThemePreference(theme: AppConfig["theme"] | undefined): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.dataset.theme = theme;
    return;
  }
  root.removeAttribute("data-theme");
}

export function useTrayThemePreference(): void {
  useEffect(() => {
    const syncTheme = () => {
      if (!window.llmr) {
        return;
      }
      void window.llmr.getConfig()
        .then((config) => applyTrayThemePreference(config.theme))
        .catch(() => undefined);
    };

    syncTheme();
    const unsubscribeThemePreference = window.llmr?.onThemePreferenceChanged?.(applyTrayThemePreference);
    window.addEventListener("focus", syncTheme);
    return () => {
      unsubscribeThemePreference?.();
      window.removeEventListener("focus", syncTheme);
    };
  }, []);
}

export const ranges: UsageStatsRange[] = ["today", "24h", "7d", "30d"];

export const emptyTotals: UsageTotals = {
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

export const emptySnapshots: SnapshotMap = {
  today: createEmptySnapshot("today"),
  "24h": createEmptySnapshot("24h"),
  "7d": createEmptySnapshot("7d"),
  "30d": createEmptySnapshot("30d")
};

export function createSourceTabs(rows: UsageComparisonRow[], configuredProviders: GatewayProviderConfig[]): SourceTab[] {
  const providers = new Map<string, { iconUrl?: string; index: number; score: number }>();
  configuredProviders.forEach((provider, index) => {
    const name = provider.name.trim();
    if (!name) {
      return;
    }
    providers.set(name, {
      iconUrl: resolveTrayProviderIcon(provider),
      index,
      score: 0
    });
  });

  for (const row of rows) {
    const provider = row.provider?.trim();
    if (!provider) {
      continue;
    }
    const current = providers.get(provider) ?? {
      iconUrl: resolveTrayProviderIcon({ models: [], name: provider }),
      index: providers.size,
      score: 0
    };
    providers.set(provider, {
      iconUrl: current.iconUrl,
      index: current.index,
      score: current.score + row.totalTokens + row.requestCount
    });
  }

  const providerTabs = Array.from(providers.entries())
    .sort((a, b) => b[1].score - a[1].score || a[1].index - b[1].index)
    .slice(0, 7)
    .map(([provider, metadata]) => ({
      id: `provider:${provider}`,
      iconUrl: metadata.iconUrl,
      label: formatProviderName(provider),
      provider
    }));

  return [
    {
      id: "all",
      label: "All"
    },
    ...providerTabs
  ];
}

export function resolveTrayProviderIcon(provider: GatewayProviderConfig): string | undefined {
  const explicitIcon = provider.icon?.trim();
  if (explicitIcon) {
    return explicitIcon;
  }

  const name = provider.name.trim();
  const normalizedName = normalizeProviderIdentity(name);
  const baseUrl = providerBaseUrl(provider);
  if (normalizedName.includes("codex") || baseUrl.toLowerCase().includes("/codex")) {
    return codexLogoUrl;
  }

  const preset = findProviderPreset(provider.id)
    ?? (baseUrl ? findProviderPresetByBaseUrl(baseUrl) : undefined)
    ?? providerPresets.find((candidate) => providerNameMatchesPreset(normalizedName, candidate.name, candidate.aliases));
  if (preset) {
    return providerPresetIconUrls[preset.id];
  }

  return undefined;
}

function normalizeProviderIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function providerNameMatchesPreset(normalizedName: string, presetName: string, aliases: string[] = []): boolean {
  if (!normalizedName) {
    return false;
  }
  const identities = [presetName, ...aliases]
    .map(normalizeProviderIdentity)
    .filter((identity) => identity.length >= 4)
    .sort((a, b) => b.length - a.length);
  return identities.some((identity) => normalizedName === identity || normalizedName.startsWith(`${identity} `));
}

export function createEmptySnapshot(range: UsageStatsRange): UsageStatsSnapshot {
  return {
    clientModels: [],
    generatedAt: new Date().toISOString(),
    models: [],
    providerModels: [],
    range,
    recentRequests: [],
    series: createEmptySeries(range),
    totals: { ...emptyTotals }
  };
}

export function createEmptySeries(range: UsageStatsRange): UsageStatsSnapshot["series"] {
  const now = new Date();
  const count = range === "today" ? now.getHours() + 1 : range === "24h" ? 24 : range === "7d" ? 7 : 30;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    if (range === "today") {
      date.setHours(index, 0, 0, 0);
    } else if (range === "24h") {
      date.setHours(now.getHours() - (count - 1 - index), 0, 0, 0);
    } else {
      date.setDate(now.getDate() - (count - 1 - index));
      date.setHours(0, 0, 0, 0);
    }
    return {
      ...emptyTotals,
      bucket: date.toISOString(),
      label: range === "today" || range === "24h" ? `${String(date.getHours()).padStart(2, "0")}:00` : `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

export function buildChartGeometry(
  series: UsageStatsSnapshot["series"],
  readValue: (point: UsageStatsSnapshot["series"][number]) => number,
  maxValue?: number
): { areaPath: string; bars: Array<{ height: number; width: number; x: number; y: number }>; linePath: string } {
  if (series.length === 0) {
    return { areaPath: "", bars: [], linePath: "" };
  }

  const left = 0;
  const right = 260;
  const top = 8;
  const bottom = 62;
  const max = Math.max(maxValue ?? 0, ...series.map((point) => readValue(point)), 1);
  const barStep = series.length <= 1 ? right - left : (right - left) / series.length;
  const barWidth = Math.max(3, Math.min(16, barStep * 0.58));
  const points = series.map((point, index) => {
    const x = series.length <= 1 ? (left + right) / 2 : left + (index / (series.length - 1)) * (right - left);
    const y = bottom - (Math.max(0, readValue(point)) / max) * (bottom - top);
    return { x, y };
  });
  const linePath = buildSmoothLinePath(points, { bottom, left, right, top });
  const areaPath = linePath ? `${linePath} L ${right.toFixed(2)} ${bottom.toFixed(2)} L ${left.toFixed(2)} ${bottom.toFixed(2)} Z` : "";
  const bars = series.map((point, index) => {
    const value = Math.max(0, readValue(point));
    const height = Math.max(value > 0 ? 3 : 1, (value / max) * (bottom - top));
    const x = left + index * barStep + (barStep - barWidth) / 2;
    return {
      height,
      width: barWidth,
      x,
      y: bottom - height
    };
  });

  return { areaPath, bars, linePath };
}

export function buildSmoothLinePath(
  points: Array<{ x: number; y: number }>,
  bounds: { bottom: number; left: number; right: number; top: number }
): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    };
    const controlTwo = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6
    };

    commands.push(
      [
        "C",
        clampNumber(controlOne.x, bounds.left, bounds.right).toFixed(2),
        clampNumber(controlOne.y, bounds.top, bounds.bottom).toFixed(2),
        clampNumber(controlTwo.x, bounds.left, bounds.right).toFixed(2),
        clampNumber(controlTwo.y, bounds.top, bounds.bottom).toFixed(2),
        next.x.toFixed(2),
        next.y.toFixed(2)
      ].join(" ")
    );
  }

  return commands.join(" ");
}

export function formatProviderName(provider: string): string {
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bOpenai\b/g, "OpenAI")
    .slice(0, 18);
}

export function formatUpdated(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "Updated just now";
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return "Updated just now";
  }
  if (seconds < 3600) {
    return `Updated ${Math.round(seconds / 60)}m ago`;
  }
  return `Updated ${Math.round(seconds / 3600)}h ago`;
}

export function compareAccountSnapshots(a: ProviderAccountSnapshot, b: ProviderAccountSnapshot): number {
  return (
    accountStatusRank(b.status) - accountStatusRank(a.status) ||
    a.provider.localeCompare(b.provider) ||
    accountSnapshotCredentialLabel(a).localeCompare(accountSnapshotCredentialLabel(b))
  );
}

export function accountSnapshotLabel(snapshot: ProviderAccountSnapshot): string {
  const credential = accountSnapshotCredentialLabel(snapshot);
  return credential ? `${snapshot.provider} / ${credential}` : snapshot.provider;
}

export function accountSnapshotKey(snapshot: ProviderAccountSnapshot): string {
  return snapshot.credentialId ? `${snapshot.provider}::${snapshot.credentialId}` : snapshot.provider;
}

export function accountSnapshotCredentialLabel(snapshot: ProviderAccountSnapshot): string {
  return snapshot.credentialLabel?.trim() || snapshot.credentialId?.trim() || "";
}

export function accountStatusRank(status: ProviderAccountSnapshot["status"]): number {
  if (status === "error") {
    return 4;
  }
  if (status === "critical") {
    return 3;
  }
  if (status === "warning") {
    return 2;
  }
  if (status === "ok") {
    return 1;
  }
  return 0;
}

export function accountMetersForDisplay(snapshot: ProviderAccountSnapshot, maxCount: number): ProviderAccountMeter[] {
  const meters = snapshot.meters.slice(0, maxCount);
  const manualResetMeter = snapshot.meters.find(isAccountManualResetMeter);
  if (!manualResetMeter || meters.includes(manualResetMeter) || meters.length < maxCount) {
    return meters;
  }
  return [...meters.slice(0, Math.max(0, maxCount - 1)), manualResetMeter];
}

function isAccountManualResetMeter(meter: ProviderAccountMeter): boolean {
  const text = `${meter.id} ${meter.label} ${meter.window ?? ""}`.toLowerCase();
  return text.includes("manual_reset") || text.includes("manual reset") || text.includes("manual-reset");
}

export function meterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  if (!meter.limit || meter.limit <= 0 || meter.remaining === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, meter.remaining / meter.limit));
}

export function meterProgress(meter: ProviderAccountMeter): number | undefined {
  const ratio = meterRemainingRatio(meter);
  return ratio === undefined ? undefined : Math.max(3, Math.round(ratio * 100));
}

export function meterValidityProgress(meter: ProviderAccountMeter, now = Date.now()): number | undefined {
  const detail = currentMeterDetail(meter, now);
  const effectiveAt = meterDetailTimestamp(detail?.effectiveAt);
  const expiresAt = meterDetailTimestamp(detail?.expiresAt);
  if (effectiveAt === undefined || expiresAt === undefined || expiresAt <= effectiveAt || now < effectiveAt || now >= expiresAt) {
    return undefined;
  }
  const ratio = (expiresAt - now) / (expiresAt - effectiveAt);
  return Math.max(3, Math.round(Math.max(0, Math.min(1, ratio)) * 100));
}

function currentMeterDetail(meter: ProviderAccountMeter, now = Date.now()): NonNullable<ProviderAccountMeter["details"]>[number] | undefined {
  return (meter.details ?? [])
    .filter((detail) => {
      const effectiveAt = meterDetailTimestamp(detail.effectiveAt);
      const expiresAt = meterDetailTimestamp(detail.expiresAt);
      return effectiveAt !== undefined && expiresAt !== undefined && effectiveAt <= now && now < expiresAt;
    })
    .sort((a, b) => (meterDetailTimestamp(a.expiresAt) ?? Number.MAX_SAFE_INTEGER) - (meterDetailTimestamp(b.expiresAt) ?? Number.MAX_SAFE_INTEGER))[0];
}

function meterDetailTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function formatAccountMeterValue(meter: ProviderAccountMeter): string {
  const value = meter.remaining ?? meter.used ?? meter.limit;
  if (value === undefined) {
    return "-";
  }
  const unit = meter.unit.trim();
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === "USD") {
    return `$${formatMeterNumber(value)}`;
  }
  if (normalizedUnit === "CNY") {
    return `¥${formatMeterNumber(value)}`;
  }
  if (normalizedUnit === "EUR") {
    return `€${formatMeterNumber(value)}`;
  }
  if (unit === "%") {
    return `${formatMeterNumber(value)}%`;
  }
  if (unit === "hours") {
    return `${formatMeterNumber(value)}h`;
  }
  if (unit === "minutes") {
    return `${formatMeterNumber(value)}m`;
  }
  if (meter.kind === "balance") {
    return `${formatMeterNumber(value)} ${unit}`;
  }
  return `${formatCompactNumber(value)} ${unit}`;
}

export function formatMeterNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

export function formatAccountReset(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes <= 0) {
    return "expired";
  }
  const prefix = "expires in";
  if (minutes < 60) {
    return `${prefix} ${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${prefix} ${hours}h`;
  }
  return `${prefix} ${Math.round(hours / 24)}d`;
}

export function formatAccountMeterTitle(meter: ProviderAccountMeter): string {
  const label = meter.label;
  return meter.resetAt ? `${label} (${formatAccountReset(meter.resetAt)})` : label;
}

export function accountProgressClass(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "bg-rose-300";
  }
  if (status === "warning") {
    return "bg-amber-300";
  }
  return "bg-[#30d158]";
}

export function accountProgressColor(status: ProviderAccountSnapshot["status"]): string {
  if (status === "critical" || status === "error") {
    return "rgb(253,164,175)";
  }
  if (status === "warning") {
    return "rgb(252,211,77)";
  }
  return "rgb(48,209,88)";
}
