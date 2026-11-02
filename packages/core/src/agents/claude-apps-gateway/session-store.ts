import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isLoopbackUrl, isRecord, parseJsonRecord, readJsonRecord, readString } from "@llmr/core/agents/local-providers/shared";
import { CONFIGDIR } from "@llmr/core/config/constants";
import { fetchWithSystemProxy } from "@llmr/core/proxy/system-proxy-fetch";

const gatewayRequestTimeoutMs = 30_000;
const refreshInFlight = new Map<string, Promise<ClaudeAppsGatewaySession>>();

export type ClaudeAppsGatewaySession = {
  accessToken: string;
  email?: string;
  expiresAt: number;
  gatewayUrl: string;
  modelDisplayNames?: Record<string, string>;
  models: string[];
  refreshToken?: string;
  sourceFile: string;
};

export class ClaudeAppsGatewayAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ClaudeAppsGatewayAuthError";
  }
}

export function normalizeClaudeAppsGatewayUrl(value: string): string {
  const rule = "Claude apps gateway URL must use https:, or http: for a loopback host.";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(rule);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackUrl(url.href))) {
    throw new Error(rule);
  }
  return url.origin;
}

export function claudeAppsGatewaySlug(gatewayUrl: string): string {
  return new URL(gatewayUrl).host.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
}

export function claudeAppsGatewaySessionFile(gatewayUrl: string, configDir = CONFIGDIR): string {
  return path.join(sessionDirectory(configDir), `${claudeAppsGatewaySlug(gatewayUrl)}.json`);
}

export function readClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): ClaudeAppsGatewaySession | undefined {
  return readSessionFile(claudeAppsGatewaySessionFile(gatewayUrl, configDir));
}

export function listClaudeAppsGatewaySessions(configDir = CONFIGDIR): ClaudeAppsGatewaySession[] {
  const directory = sessionDirectory(configDir);
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readSessionFile(path.join(directory, name)))
    .filter((session): session is ClaudeAppsGatewaySession => Boolean(session))
    .sort((left, right) => left.gatewayUrl.localeCompare(right.gatewayUrl));
}

export function persistClaudeAppsGatewaySession(session: ClaudeAppsGatewaySession): void {
  const payload = {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt,
    gateway_url: session.gatewayUrl,
    email: session.email,
    models: session.models,
    model_display_names: session.modelDisplayNames
  };
  mkdirSync(path.dirname(session.sourceFile), { mode: 0o700, recursive: true });
  const temporaryFile = `${session.sourceFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryFile, session.sourceFile);
    chmodSync(session.sourceFile, 0o600);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
}

export function removeClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): void {
  rmSync(claudeAppsGatewaySessionFile(gatewayUrl, configDir), { force: true });
}

export function claudeAppsGatewaySessionExpired(
  session: ClaudeAppsGatewaySession,
  nowSeconds = Math.floor(Date.now() / 1000),
  skewSeconds = 60
): boolean {
  return session.expiresAt <= nowSeconds + skewSeconds;
}

export async function refreshClaudeAppsGatewaySession(session: ClaudeAppsGatewaySession): Promise<ClaudeAppsGatewaySession> {
  if (!session.refreshToken) {
    throw new Error("Claude apps gateway refresh token was not found.");
  }
  const { payload, response, text } = await gatewayRequest(`${session.gatewayUrl}/oauth/token`, {
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }).toString(),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  }, "token refresh");
  if (!response.ok) {
    const message = `Claude apps gateway token refresh returned HTTP ${response.status}${errorDetail(payload, text)}`;
    if (response.status === 401 || response.status === 403) {
      throw new ClaudeAppsGatewayAuthError(response.status, message);
    }
    throw new Error(message);
  }
  const tokens = claudeAppsGatewayTokenResponse(payload);
  if (!tokens) {
    throw new Error("Claude apps gateway token refresh returned an incomplete token response.");
  }
  return {
    ...session,
    accessToken: tokens.accessToken,
    email: tokens.email ?? session.email,
    expiresAt: tokens.expiresAt,
    refreshToken: tokens.refreshToken ?? session.refreshToken
  };
}

export async function resolveClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): Promise<ClaudeAppsGatewaySession | undefined> {
  const session = readClaudeAppsGatewaySession(gatewayUrl, configDir);
  if (!session?.refreshToken || !claudeAppsGatewaySessionExpired(session)) {
    return session;
  }
  const key = session.sourceFile;
  let refresh = refreshInFlight.get(key);
  if (!refresh) {
    refresh = refreshClaudeAppsGatewaySession(session)
      .then((refreshed) => {
        try {
          persistClaudeAppsGatewaySession(refreshed);
        } catch {
          // The refreshed token still serves this process; the next refresh retries the write.
        }
        return refreshed;
      })
      .catch((error: unknown) => adoptPeerRotatedSession(session, error))
      .finally(() => {
        refreshInFlight.delete(key);
      });
    refreshInFlight.set(key, refresh);
  }
  return refresh;
}

export async function fetchClaudeAppsGatewayModels(
  session: ClaudeAppsGatewaySession
): Promise<{ models: string[]; modelDisplayNames: Record<string, string> }> {
  const { payload, response, text } = await gatewayRequest(`${session.gatewayUrl}/v1/models`, {
    headers: { accept: "application/json", authorization: `Bearer ${session.accessToken}` },
    method: "GET"
  }, "model list");
  if (!response.ok) {
    throw new Error(`Claude apps gateway model list returned HTTP ${response.status}${errorDetail(payload, text)}`);
  }
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};
  for (const item of Array.isArray(payload?.data) ? payload.data : []) {
    const id = isRecord(item) ? readString(item.id) : undefined;
    if (!id || models.includes(id)) continue;
    models.push(id);
    const displayName = readString(item.display_name);
    if (displayName && displayName !== id) modelDisplayNames[id] = displayName;
  }
  return { modelDisplayNames, models };
}

export function claudeAppsGatewayTokenResponse(
  payload: Record<string, unknown> | undefined
): { accessToken: string; email?: string; expiresAt: number; refreshToken?: string } | undefined {
  const accessToken = readString(payload?.access_token);
  const expiresIn = typeof payload?.expires_in === "number" && Number.isFinite(payload.expires_in) ? payload.expires_in : undefined;
  if (!accessToken || expiresIn === undefined) {
    return undefined;
  }
  return {
    accessToken,
    email: readString(payload?.email),
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    refreshToken: readString(payload?.refresh_token)
  };
}

export async function gatewayRequest(
  url: string,
  init: RequestInit,
  label: string
): Promise<{ payload: Record<string, unknown> | undefined; response: Response; text: string }> {
  try {
    const response = await fetchWithSystemProxy(url, { ...init, signal: AbortSignal.timeout(gatewayRequestTimeoutMs) });
    const text = await response.text();
    return { payload: parseJsonRecord(text), response, text };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`Claude apps gateway ${label} timed out after ${gatewayRequestTimeoutMs}ms.`);
    }
    throw error;
  }
}

function adoptPeerRotatedSession(session: ClaudeAppsGatewaySession, error: unknown): ClaudeAppsGatewaySession {
  if (!(error instanceof ClaudeAppsGatewayAuthError)) {
    throw error;
  }
  // Desktop and the llmr CLI share this file; a peer that refreshed first leaves our refresh token stale but the newer one on disk.
  const latest = readSessionFile(session.sourceFile);
  if (latest?.refreshToken && latest.refreshToken !== session.refreshToken) {
    return latest;
  }
  throw error;
}

function readSessionFile(sourceFile: string): ClaudeAppsGatewaySession | undefined {
  const record = readJsonRecord(sourceFile);
  const accessToken = readString(record?.access_token);
  const gatewayUrl = readString(record?.gateway_url);
  if (!record || !accessToken || !gatewayUrl) {
    return undefined;
  }
  const models = Array.isArray(record.models) ? record.models.filter((model): model is string => typeof model === "string" && Boolean(model.trim())) : [];
  const displayNames = isRecord(record.model_display_names)
    ? Object.fromEntries(Object.entries(record.model_display_names).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : undefined;
  return {
    accessToken,
    ...(readString(record.email) ? { email: readString(record.email) } : {}),
    expiresAt: typeof record.expires_at === "number" && Number.isFinite(record.expires_at) ? record.expires_at : 0,
    gatewayUrl,
    ...(displayNames && Object.keys(displayNames).length > 0 ? { modelDisplayNames: displayNames } : {}),
    models,
    ...(readString(record.refresh_token) ? { refreshToken: readString(record.refresh_token) } : {}),
    sourceFile
  };
}

function sessionDirectory(configDir: string): string {
  return path.join(configDir, "claude-apps-gateway");
}

function errorDetail(payload: Record<string, unknown> | undefined, text: string): string {
  const message = readString(payload?.error_description) || readString(payload?.error) || readString(payload?.message) || text.trim().slice(0, 240);
  return message ? `: ${message}` : "";
}
