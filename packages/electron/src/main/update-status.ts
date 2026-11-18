import type { ProgressInfo, UpdateInfo } from "electron-updater";
import type { AppUpdateStatus } from "@llmr/core/contracts/app";

export function deriveStatus(status: AppUpdateStatus): AppUpdateStatus {
  const busy = status.state === "checking" || status.state === "downloading" || status.state === "installing";
  return {
    ...status,
    canCheck: status.supported && !busy,
    canDownload: status.supported && status.state === "available",
    canInstall: status.supported && status.state === "downloaded"
  };
}

export function silentFailureStatus(restoreStatus: AppUpdateStatus, error: unknown): Partial<AppUpdateStatus> {
  const state = restoreStatus.state === "checking" || restoreStatus.state === "error" ? "idle" : restoreStatus.state;
  return {
    availableVersion: restoreStatus.availableVersion,
    downloadedAt: restoreStatus.downloadedAt,
    lastCheckedAt: restoreStatus.lastCheckedAt,
    lastError: formatUpdateError(error),
    progress: restoreStatus.progress,
    releaseDate: restoreStatus.releaseDate,
    releaseName: restoreStatus.releaseName,
    releaseNotes: restoreStatus.releaseNotes,
    state
  };
}

export function normalizeProgress(progress: ProgressInfo): AppUpdateStatus["progress"] {
  return {
    bytesPerSecond: finiteNumber(progress.bytesPerSecond),
    percent: finiteNumber(progress.percent),
    total: finiteNumber(progress.total),
    transferred: finiteNumber(progress.transferred)
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function formatReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (typeof notes === "string") {
    return notes.trim() || undefined;
  }
  if (!Array.isArray(notes)) {
    return undefined;
  }
  return notes
    .map((item) => [item.version, item.note].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n") || undefined;
}

export function formatUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isCodeSignatureValidationError(message)) {
    return "Downloaded update failed code-signature validation. Download the latest installer manually, or try again after the package is re-signed.";
  }
  return message;
}

function isCodeSignatureValidationError(message: string): boolean {
  return (
    /code signature at url\b/i.test(message) &&
    /did not pass validation/i.test(message)
  ) || /code failed to satisfy specified code requirement/i.test(message);
}
