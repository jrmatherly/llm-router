import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve as pathResolve } from "node:path";
import { resolveRuntimeDataDir } from "@ccr/core/runtime/app-paths";

export const DEFAULT_MODEL_CATALOG_URL = "https://models.ccrdesk.top/models.json";
const refreshIntervalMs = 60 * 60 * 1000;
let revision = 0;
let refreshStarted = false;
let lastAttempt = 0;
let pendingRefresh: Promise<void> | undefined;
let remoteCatalog: LoadedModelCatalogPayload | undefined;
let lastRefreshError: string | undefined;

export function scheduleModelCatalogRefresh(): void {
  if (refreshStarted) void refreshModelCatalog();
}

export function modelCatalogRevision(): number {
  return revision;
}

/** Message of the last CDN download that failed; undefined before any attempt, with a local override, or after a clean download. */
export function modelCatalogRefreshError(): string | undefined {
  return lastRefreshError;
}

export function modelCatalogCachePath(): string {
  return pathResolve(resolveRuntimeDataDir(), "cache", "models.json");
}

function hasLocalOverride(): boolean {
  return Boolean(process.env.CCR_MODEL_CATALOG_PATH?.trim() || process.env.CCR_MODELS_JSON_PATH?.trim());
}

/** Download once at startup and at most hourly thereafter. Local overrides stay offline. */
export function refreshModelCatalog(): Promise<void> {
  refreshStarted = true;
  if (hasLocalOverride()) return Promise.resolve();
  if (pendingRefresh) return pendingRefresh;
  if (Date.now() - lastAttempt < refreshIntervalMs) return Promise.resolve();
  lastAttempt = Date.now();
  pendingRefresh = downloadModelCatalog().finally(() => { pendingRefresh = undefined; });
  return pendingRefresh;
}

async function downloadModelCatalog(): Promise<void> {
  const url = process.env.CCR_MODEL_CATALOG_URL?.trim() || DEFAULT_MODEL_CATALOG_URL;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isModelCatalogPayload(payload)) throw new Error("Invalid model catalog (expected schemaVersion 2 and non-empty model records)");
    remoteCatalog = { loadedFrom: url, payload };
    revision += 1;
    lastRefreshError = undefined;
    await writeModelCatalogCache(payload);
  } catch (error) {
    lastRefreshError = errorMessage(error);
    console.warn(`[models] CDN refresh failed; using available local catalog: ${lastRefreshError}`);
  }
}

// A failed cache write is not a failed download: the fresh catalog is already
// in use, only the next start would fall back, so it stays out of lastRefreshError.
async function writeModelCatalogCache(payload: unknown): Promise<void> {
  const file = modelCatalogCachePath();
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporaryFile, JSON.stringify(payload), "utf8");
    await rename(temporaryFile, file);
  } catch (error) {
    console.warn(`[models] downloaded catalog could not be cached at ${file}: ${errorMessage(error)}`);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

// Node's fetch reports every transport failure as "fetch failed" and keeps the reason in cause.
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof Error && error.cause instanceof Error ? `${message}: ${error.cause.message}` : message;
}

function isModelCatalogPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const catalog = value as { schemaVersion?: unknown; models?: unknown };
  return catalog.schemaVersion === 2 && Array.isArray(catalog.models) && catalog.models.length > 0 &&
    catalog.models.every((model: unknown) => Boolean(model && typeof model === "object" &&
      typeof (model as { id?: unknown }).id === "string"));
}

export type LoadedModelCatalogPayload = {
  loadedFrom: string;
  payload: unknown;
};

export function loadModelCatalogPayload(): LoadedModelCatalogPayload | undefined {
  if (!hasLocalOverride() && remoteCatalog) return remoteCatalog;
  const candidate = resolveModelCatalogPath();
  if (!candidate) return undefined;
  const payload = JSON.parse(readFileSync(candidate, "utf8")) as unknown;
  warnOnceIfStale(candidate, payload);
  return { loadedFrom: candidate, payload };
}

const staleCatalogAfterMs = 7 * 24 * 60 * 60 * 1000;
let staleCatalogWarned = false;

// Only a process that will never download (one-shot CLI commands, gateway
// workers) reading the cache a daemon once wrote needs telling; the server and
// desktop app refresh on their own, and the bundled file is as old as the build.
function warnOnceIfStale(file: string, payload: unknown): void {
  if (staleCatalogWarned || refreshStarted || hasLocalOverride() || file !== modelCatalogCachePath()) return;
  const generatedAt = Date.parse(String((payload as { generatedAt?: unknown })?.generatedAt ?? ""));
  const ageMs = Date.now() - (Number.isFinite(generatedAt) ? generatedAt : statSync(file).mtimeMs);
  if (ageMs < staleCatalogAfterMs) return;
  staleCatalogWarned = true;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  console.warn(`[models] catalog ${file} is ${days} days old and this process does not refresh it; run \`ccr start\` to download the current catalog.`);
}

export function resolveModelCatalogPath(): string | undefined {
  return modelCatalogPathCandidates().find((candidate) => existsSync(candidate));
}

export function modelCatalogPathCandidates(): string[] {
  return uniqueStrings([
    process.env.CCR_MODEL_CATALOG_PATH?.trim() || "",
    process.env.CCR_MODELS_JSON_PATH?.trim() || "",
    modelCatalogCachePath(),
    pathResolve(process.cwd(), "models.json"),
    pathResolve(process.cwd(), "packages", "core", "models.json"),
    pathResolve(process.cwd(), "packages", "cli", "models.json"),
    pathResolve(__dirname, "..", "models.json"),
    pathResolve(__dirname, "..", "assets", "models.json"),
    pathResolve(__dirname, "..", "..", "models.json"),
    pathResolve(__dirname, "..", "..", "..", "models.json")
  ]);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    strings.push(trimmed);
  }
  return strings;
}
