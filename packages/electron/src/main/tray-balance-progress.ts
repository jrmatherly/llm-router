import type { ProviderAccountMeter, ProviderAccountSnapshot } from "@llmr/core/contracts/app";

export function trayBalanceProgress(snapshot: ProviderAccountSnapshot | undefined, meterId: string): number {
  const pinned = snapshot?.meters.find((meter) => meter.id === meterId);
  if (pinned) {
    return calculateTrayBalanceProgress(pinned);
  }
  const ratios = (snapshot?.meters ?? [])
    .filter((meter) => meter.kind !== "balance" && Number.isFinite(meter.limit) && (meter.limit ?? 0) > 0 && Number.isFinite(meter.remaining))
    .map(calculateTrayBalanceProgress);
  return ratios.length > 0 ? Math.min(...ratios) : 0;
}

function calculateTrayBalanceProgress(meter: ProviderAccountMeter): number {
  if (meter.limit && meter.limit > 0) {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / meter.limit));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / meter.limit));
    }
  }
  if (meter.unit === "%") {
    if (meter.remaining !== undefined) {
      return Math.max(0, Math.min(1, meter.remaining / 100));
    }
    if (meter.used !== undefined) {
      return Math.max(0, Math.min(1, 1 - meter.used / 100));
    }
  }
  const rawValue = meter.remaining ?? meter.limit ?? meter.used ?? 0;
  return rawValue > 0 ? 1 : 0;
}
