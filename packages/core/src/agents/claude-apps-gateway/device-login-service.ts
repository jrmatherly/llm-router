import { randomUUID } from "node:crypto";
import type {
  ClaudeAppsGatewayLoginCancelRequest,
  ClaudeAppsGatewayLoginCancelResult,
  ClaudeAppsGatewayLoginStartRequest,
  ClaudeAppsGatewayLoginStartResult,
  ClaudeAppsGatewayLoginStatus,
  ClaudeAppsGatewayLoginWaitRequest,
  ClaudeAppsGatewayLoginWaitResult
} from "@llmr/core/contracts/app";
import { readString } from "@llmr/core/agents/local-providers/shared";
import {
  claudeAppsGatewaySessionFile,
  claudeAppsGatewayTokenResponse,
  fetchClaudeAppsGatewayModels,
  gatewayRequest,
  normalizeClaudeAppsGatewayUrl,
  persistClaudeAppsGatewaySession,
  type ClaudeAppsGatewaySession
} from "@llmr/core/agents/claude-apps-gateway/session-store";

const deviceCodeGrant = "urn:ietf:params:oauth:grant-type:device_code";
const defaultWaitTimeoutMs = 20_000;
const slowDownStepMs = 5_000;

type PendingLogin = {
  configDir?: string;
  deviceCode: string;
  expiresAtMs: number;
  gatewayUrl: string;
  intervalMs: number;
};

const pendingLogins = new Map<string, PendingLogin>();

const statusMessages: Record<ClaudeAppsGatewayLoginStatus, string> = {
  canceled: "Login session was not found or was canceled.",
  confirmed: "Gateway sign-in confirmed.",
  denied: "Gateway sign-in was denied.",
  expired: "Gateway sign-in expired. Try again.",
  pending: "Waiting for approval in the browser."
};

export async function startClaudeAppsGatewayLogin(
  request: ClaudeAppsGatewayLoginStartRequest,
  options: { configDir?: string } = {}
): Promise<ClaudeAppsGatewayLoginStartResult> {
  const gatewayUrl = normalizeClaudeAppsGatewayUrl(request.gatewayUrl);
  const discovery = await gatewayRequest(`${gatewayUrl}/.well-known/oauth-authorization-server`, {
    headers: { accept: "application/json" },
    method: "GET"
  }, "discovery");
  const grants = Array.isArray(discovery.payload?.grant_types_supported) ? discovery.payload.grant_types_supported : [];
  if (!discovery.response.ok || !grants.includes(deviceCodeGrant)) {
    throw new Error(`${gatewayUrl} is not a Claude apps gateway: its discovery document does not offer the device-code grant.`);
  }
  const device = await gatewayRequest(`${gatewayUrl}/oauth/device_authorization`, {
    headers: { accept: "application/json" },
    method: "POST"
  }, "device authorization");
  const deviceCode = readString(device.payload?.device_code);
  const userCode = readString(device.payload?.user_code);
  const verificationUri = readString(device.payload?.verification_uri);
  if (!device.response.ok || !deviceCode || !userCode || !verificationUri) {
    throw new Error(`Claude apps gateway device authorization returned HTTP ${device.response.status} without a device code.`);
  }
  const verificationUriComplete = readString(device.payload?.verification_uri_complete) || verificationUri;
  normalizeClaudeAppsGatewayUrl(verificationUri);
  normalizeClaudeAppsGatewayUrl(verificationUriComplete);
  const expiresIn = nonNegativeNumber(device.payload?.expires_in) ?? 600;
  const intervalSeconds = nonNegativeNumber(device.payload?.interval) ?? 5;
  const now = Date.now();
  for (const [id, login] of pendingLogins) {
    if (login.expiresAtMs <= now) pendingLogins.delete(id);
  }
  const sessionId = randomUUID();
  pendingLogins.set(sessionId, {
    configDir: options.configDir,
    deviceCode,
    expiresAtMs: now + expiresIn * 1000,
    gatewayUrl,
    intervalMs: intervalSeconds * 1000
  });
  return {
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
    gatewayUrl,
    intervalSeconds,
    sessionId,
    userCode,
    verificationUri,
    verificationUriComplete
  };
}

export async function waitClaudeAppsGatewayLogin(request: ClaudeAppsGatewayLoginWaitRequest): Promise<ClaudeAppsGatewayLoginWaitResult> {
  const deadline = Date.now() + (request.timeoutMs ?? defaultWaitTimeoutMs);
  for (;;) {
    const login = pendingLogins.get(request.sessionId);
    if (!login) {
      return waitResult(request.sessionId, "canceled", "");
    }
    if (Date.now() >= login.expiresAtMs) {
      pendingLogins.delete(request.sessionId);
      return waitResult(request.sessionId, "expired", login.gatewayUrl);
    }
    const outcome = await pollToken(login);
    if (pendingLogins.get(request.sessionId) !== login) {
      return waitResult(request.sessionId, "canceled", login.gatewayUrl);
    }
    if (outcome.status === "confirmed") {
      pendingLogins.delete(request.sessionId);
      return { ...waitResult(request.sessionId, "confirmed", login.gatewayUrl), email: outcome.session.email, models: outcome.session.models };
    }
    if (outcome.status !== "pending") {
      pendingLogins.delete(request.sessionId);
      return waitResult(request.sessionId, outcome.status, login.gatewayUrl);
    }
    if (outcome.slowDown) {
      login.intervalMs += slowDownStepMs;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return waitResult(request.sessionId, "pending", login.gatewayUrl);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(login.intervalMs, remaining)));
    if (Date.now() >= deadline) {
      return waitResult(request.sessionId, "pending", login.gatewayUrl);
    }
  }
}

export function cancelClaudeAppsGatewayLogin(request: ClaudeAppsGatewayLoginCancelRequest): ClaudeAppsGatewayLoginCancelResult {
  return { canceled: pendingLogins.delete(request.sessionId) };
}

type PollOutcome =
  | { session: ClaudeAppsGatewaySession; status: "confirmed" }
  | { status: "denied" | "expired" }
  | { slowDown: boolean; status: "pending" };

async function pollToken(login: PendingLogin): Promise<PollOutcome> {
  const reply = await gatewayRequest(`${login.gatewayUrl}/oauth/token`, {
    body: new URLSearchParams({ grant_type: deviceCodeGrant, device_code: login.deviceCode }).toString(),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  }, "token request").catch(() => undefined);
  // A network blip or a 5xx mid-login is retried on the next poll; the device code's own expiry still ends the loop.
  if (!reply || reply.response.status >= 500) return { slowDown: false, status: "pending" };
  const { payload, response, text } = reply;
  if (response.ok) {
    const tokens = claudeAppsGatewayTokenResponse(payload);
    if (!tokens) {
      throw new Error("Claude apps gateway returned an incomplete token response.");
    }
    const session: ClaudeAppsGatewaySession = {
      accessToken: tokens.accessToken,
      ...(tokens.email ? { email: tokens.email } : {}),
      expiresAt: tokens.expiresAt,
      gatewayUrl: login.gatewayUrl,
      models: [],
      ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      sourceFile: claudeAppsGatewaySessionFile(login.gatewayUrl, login.configDir)
    };
    // The device code is spent by now; losing the tokens over a model-list hiccup would force a new sign-in, and import refetches the list.
    const catalog = await fetchClaudeAppsGatewayModels(session).catch(() => ({ modelDisplayNames: {}, models: [] }));
    session.models = catalog.models;
    if (Object.keys(catalog.modelDisplayNames).length > 0) {
      session.modelDisplayNames = catalog.modelDisplayNames;
    }
    persistClaudeAppsGatewaySession(session);
    return { session, status: "confirmed" };
  }
  const error = readString(payload?.error);
  if (error === "authorization_pending") return { slowDown: false, status: "pending" };
  if (error === "slow_down") return { slowDown: true, status: "pending" };
  if (error === "expired_token") return { status: "expired" };
  if (error === "access_denied") return { status: "denied" };
  throw new Error(`Claude apps gateway token request returned HTTP ${response.status}: ${error || text.trim().slice(0, 240)}`);
}

function waitResult(sessionId: string, status: ClaudeAppsGatewayLoginStatus, gatewayUrl: string): ClaudeAppsGatewayLoginWaitResult {
  return {
    confirmed: status === "confirmed",
    gatewayUrl,
    message: statusMessages[status],
    models: [],
    sessionId,
    status
  };
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
