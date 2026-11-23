import {
  ClaudeAppsGatewayAuthError,
  claudeAppsGatewaySessionExpired,
  readClaudeAppsGatewaySession,
  readCodexAuth,
  readGrokAuth,
  readKimiAuth,
  resolveClaudeAppsGatewaySession,
  resolveCodexAuth,
  resolveGrokAuth,
  resolveKimiAuth,
  type ClaudeAppsGatewaySession,
  type CodexTokenSet
} from "@llmr/core/agents/local-providers/service";
import { codexAccessTokenExpired } from "@llmr/core/agents/local-providers/codex";
import { applyOpenCodePublicFreeTierHeaders, isOpenCodePublicFreeTierPlugin, withOpenCodePublicFreeTierTools } from "@llmr/core/agents/local-providers/opencode-freetier";
import { grokAccessTokenExpired, grokClientVersion } from "@llmr/core/agents/local-providers/grok";
import { kimiAccessTokenExpired, kimiIdentityHeaders } from "@llmr/core/agents/local-providers/kimi";
import { llmrCallerAuthorizationHeader } from "@llmr/core/gateway/core-runtime/router-plugin-contract";
import { claudeLoginMissingMessage } from "@llmr/core/gateway/features/claude-login-pass-through";
import { transformCodexApplyPatchBridgeRequestBody } from "@llmr/core/gateway/features/codex-patch-bridge";
import { isRecord, stringValue } from "@llmr/core/gateway/internal/value";

const liveProviderPluginKeyPrefix = "module:llmr-live-auth:";
const configProviderPluginKeyPrefix = "config:";
const localAgentProviderPluginKeyPrefix = "llmr-local-agent-";
const bearerPrefix = "Bearer ";

type HeaderRecord = Record<string, string>;

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers?: HeaderRecord;
  method?: string;
  url: string;
};

type ProviderPluginInput = {
  model?: string;
  request?: {
    headers?: Record<string, string | string[] | undefined>;
  };
  upstreamRequest: UpstreamRequest;
};

type ProviderHookResult = {
  ok: true;
  value: UpstreamRequest;
} | {
  error: string;
  ok: false;
};

type ProviderHook = {
  authenticate?: (input: ProviderPluginInput) => Promise<ProviderHookResult> | ProviderHookResult;
  key: string;
  provider?: string;
  providerName?: string;
  transformRequest?: (input: ProviderPluginInput) => Promise<ProviderHookResult> | ProviderHookResult;
};

type LocalAgentOauthKind = "claude-apps-gateway" | "claude-code" | "codex" | "grok" | "kimi";

export function createGatewayPlugin(input: { config?: Record<string, unknown>; plugin?: { config?: Record<string, unknown> } } = {}) {
  return {
    providerHooks: localAgentOauthProviderHooks(input.plugin?.config ?? input.config)
  };
}

export function localAgentOauthProviderHooks(config: Record<string, unknown> | undefined): ProviderHook[] {
  const providerPlugins = Array.isArray(config?.providerPlugins) ? config.providerPlugins : [];
  return providerPlugins
    .map(localAgentOauthProviderHook)
    .filter((hook): hook is ProviderHook => Boolean(hook));
}

export function isLocalAgentOauthProviderPlugin(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return localAgentOauthKind(value) !== undefined;
}

function localAgentOauthProviderHook(plugin: unknown): ProviderHook | undefined {
  if (!isRecord(plugin)) {
    return undefined;
  }
  const key = stringValue(plugin.key);
  if (!key) {
    return undefined;
  }

  if (isOpenCodePublicFreeTierPlugin(plugin)) {
    return {
      key: `${configProviderPluginKeyPrefix}${key}`,
      provider: stringValue(plugin.provider),
      providerName: stringValue(plugin.providerName),
      transformRequest: transformOpenCodePublicFreeTierRequest
    };
  }

  const kind = localAgentOauthKind(plugin);
  if (!kind) {
    return undefined;
  }

  const hook: ProviderHook = {
    key: `${liveProviderPluginKeyPrefix}${key}`,
    provider: stringValue(plugin.provider),
    providerName: stringValue(plugin.providerName)
  };

  if (kind === "grok") {
    hook.authenticate = (input) => authenticateWithBearer(input, () => resolveLiveGrokAccessToken(plugin), plugin, "Grok CLI access token was not found.");
    hook.transformRequest = (input) => transformGrokRequest(input, plugin);
    return hook;
  }

  if (kind === "kimi") {
    hook.authenticate = (input) => authenticateWithBearer(input, () => resolveLiveKimiAccessToken(plugin), plugin, "Kimi CLI access token was not found.");
    hook.transformRequest = (input) => transformWithHeaders(input, kimiIdentityHeaders());
    return hook;
  }

  if (kind === "claude-apps-gateway") {
    hook.authenticate = (input) => authenticateClaudeAppsGateway(input, plugin);
    return hook;
  }

  if (kind === "codex") {
    hook.authenticate = (input) => authenticateCodex(input, plugin);
    return hook;
  }

  hook.authenticate = (input) => authenticateClaudeCode(input, plugin);
  return hook;
}

function localAgentOauthKind(plugin: Record<string, unknown>): LocalAgentOauthKind | undefined {
  const key = stringValue(plugin.key)?.toLowerCase();
  if (!key?.startsWith(localAgentProviderPluginKeyPrefix)) {
    return undefined;
  }
  if (key.includes("claude-apps-gateway-oauth")) {
    return "claude-apps-gateway";
  }
  if (key.includes("grok-cli-oauth")) {
    return "grok";
  }
  if (key.includes("kimi-cli-oauth")) {
    return "kimi";
  }
  if (key.includes("claude-code-oauth")) {
    return "claude-code";
  }
  if (key.includes("codex-oauth")) {
    return "codex";
  }
  return undefined;
}

async function authenticateWithBearer(
  input: ProviderPluginInput,
  tokenResolver: () => Promise<string | undefined> | string | undefined,
  plugin: Record<string, unknown>,
  missingTokenError: string
): Promise<ProviderHookResult> {
  const token = await tokenResolver() || originalBearerToken(plugin);
  if (!token) {
    return { error: missingTokenError, ok: false };
  }
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin))
    }
  };
}

// The login is the caller's own. Nothing here reads one from disk, stores one or refreshes one.
function authenticateClaudeCode(
  input: ProviderPluginInput,
  plugin: Record<string, unknown>
): ProviderHookResult {
  const login = requestHeader(input.request?.headers, llmrCallerAuthorizationHeader);
  if (!login?.startsWith(bearerPrefix)) {
    return { error: claudeLoginMissingMessage, ok: false };
  }
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: withBearerAuth(input.upstreamRequest.headers, login.slice(bearerPrefix.length), originalRemoveHeaders(plugin))
    }
  };
}

async function authenticateClaudeAppsGateway(
  input: ProviderPluginInput,
  plugin: Record<string, unknown>
): Promise<ProviderHookResult> {
  const url = isRecord(plugin.claudeAppsGateway) ? stringValue(plugin.claudeAppsGateway.url) : undefined;
  if (!url || !URL.canParse(url)) {
    return { error: "Claude apps gateway URL is missing from the provider plugin.", ok: false };
  }
  const signInAgain = "Claude apps gateway session ended. Sign in again from Providers, Add, Import local agent provider.";
  let session: ClaudeAppsGatewaySession | undefined;
  try {
    session = await resolveClaudeAppsGatewaySession(url);
  } catch (error) {
    if (error instanceof ClaudeAppsGatewayAuthError) {
      return { error: signInAgain, ok: false };
    }
    session = readClaudeAppsGatewaySession(url);
    if (session && claudeAppsGatewaySessionExpired(session, undefined, 0)) {
      return { error: `Claude apps gateway token could not be refreshed: ${error instanceof Error ? error.message : String(error)}`, ok: false };
    }
  }
  // No session file means the developer signed out; the token baked in at import must not outlive that.
  if (!session) {
    return { error: "Claude apps gateway session was not found. Sign in again.", ok: false };
  }
  if (!session.refreshToken && claudeAppsGatewaySessionExpired(session, undefined, 0)) {
    return { error: signInAgain, ok: false };
  }
  const token = session.accessToken;
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin))
    }
  };
}

// The gateway keeps the Codex URL and body rewriting; this sets only the headers. The gateway's retry after
// an upstream 401 lands here again, and resolveCodexAuth refreshes only an expired login.
async function authenticateCodex(
  input: ProviderPluginInput,
  plugin: Record<string, unknown>
): Promise<ProviderHookResult> {
  let auth: CodexTokenSet | undefined;
  try {
    auth = await resolveCodexAuth();
  } catch (error) {
    auth = readCodexAuth();
    if (!auth?.accessToken || codexAccessTokenExpired(auth.accessToken, 0)) {
      return { error: `Codex login could not be refreshed: ${error instanceof Error ? error.message : String(error)}. Run codex login.`, ok: false };
    }
  }
  const token = auth?.accessToken;
  if (!token) {
    return { error: "Codex login was not found. Run codex login.", ok: false };
  }
  if (codexAccessTokenExpired(token, 0)) {
    return { error: "Codex login has expired and LLMR cannot refresh it. Run codex login.", ok: false };
  }
  const claims = jwtClaims(token);
  const headers = withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin));
  const tokenAuthClaims = isRecord(claims["https://api.openai.com/auth"]) ? claims["https://api.openai.com/auth"] : {};
  const accountId = auth?.accountId || stringValue(tokenAuthClaims.chatgpt_account_id) || stringValue(tokenAuthClaims.account_id);
  if (accountId) {
    setHeader(headers, "ChatGPT-Account-Id", accountId);
  }
  if (auth?.isFedrampAccount) {
    setHeader(headers, "X-OpenAI-Fedramp", "true");
  }
  return { ok: true, value: { ...input.upstreamRequest, headers } };
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return isRecord(claims) ? claims : {};
  } catch {
    return {};
  }
}

async function resolveLiveGrokAccessToken(plugin: Record<string, unknown>): Promise<string | undefined> {
  const auth = await resolveGrokAuth().catch(() => readGrokAuth());
  if (auth?.accessToken && !grokAccessTokenExpired(auth)) {
    return auth.accessToken;
  }
  return originalBearerToken(plugin);
}

async function resolveLiveKimiAccessToken(plugin: Record<string, unknown>): Promise<string | undefined> {
  const reference = kimiOauthReference(plugin);
  const auth = await resolveKimiAuth(reference).catch(() => readKimiAuth(reference));
  if (auth?.accessToken && !kimiAccessTokenExpired(auth)) {
    return auth.accessToken;
  }
  return originalBearerToken(plugin);
}

function transformOpenCodePublicFreeTierRequest(input: ProviderPluginInput): ProviderHookResult {
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      body: withOpenCodePublicFreeTierTools(input.upstreamRequest.body, input.upstreamRequest.url),
      headers: applyOpenCodePublicFreeTierHeaders(input.upstreamRequest.headers)
    }
  };
}

function transformWithHeaders(input: ProviderPluginInput, headers: HeaderRecord): ProviderHookResult {
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      headers: {
        ...(input.upstreamRequest.headers ?? {}),
        ...headers
      }
    }
  };
}

function transformGrokRequest(input: ProviderPluginInput, plugin: Record<string, unknown>): ProviderHookResult {
  const headers = {
    ...(input.upstreamRequest.headers ?? {}),
    "x-grok-client-identifier": "xai-grok-cli",
    "x-grok-client-version": grokClientVersion(),
    "x-grok-model-override": input.model || originalRequestHeader(plugin, "x-grok-model-override") || ""
  };
  const body = transformGrokResponsesBody(input.upstreamRequest.body);
  return {
    ok: true,
    value: {
      ...input.upstreamRequest,
      body: body.changed ? body.value : input.upstreamRequest.body,
      headers
    }
  };
}

function transformGrokResponsesBody(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value)) {
    return { value, changed: false };
  }
  const patched = transformCodexApplyPatchBridgeRequestBody(value);
  const sanitizedOptions = sanitizeGrokUnsupportedResponsesOptions(patched.body);
  const sanitized = sanitizeGrokResponsesTools(sanitizedOptions.value);
  return {
    value: sanitized.value,
    changed: patched.changed || sanitizedOptions.changed || sanitized.changed
  };
}

function sanitizeGrokUnsupportedResponsesOptions(body: Record<string, unknown>): {
  value: Record<string, unknown>;
  changed: boolean;
} {
  let next: Record<string, unknown> | undefined;
  for (const key of grokUnsupportedResponsesOptions) {
    if (Object.hasOwn(body, key)) {
      next ??= { ...body };
      delete next[key];
    }
  }
  return next ? { value: next, changed: true } : { value: body, changed: false };
}

function sanitizeGrokResponsesTools(body: Record<string, unknown>): { value: Record<string, unknown>; changed: boolean } {
  if (!Array.isArray(body.tools)) {
    return { value: body, changed: false };
  }

  let changed = false;
  const removedToolNames = new Set<string>();
  const tools = body.tools.filter((tool) => {
    const supported = isGrokSupportedResponsesTool(tool);
    if (!supported) {
      changed = true;
      const name = responseToolName(tool);
      if (name) {
        removedToolNames.add(name);
      }
    }
    return supported;
  });

  if (!changed) {
    return { value: body, changed: false };
  }

  const next = { ...body };
  if (tools.length > 0) {
    next.tools = tools;
  } else {
    delete next.tools;
    delete next.parallel_tool_calls;
  }
  if (tools.length === 0 || grokToolChoiceNamesRemovedTool(next.tool_choice, removedToolNames)) {
    delete next.tool_choice;
  }
  return { value: next, changed: true };
}

function isGrokSupportedResponsesTool(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return grokSupportedResponsesToolTypes.has(stringValue(value.type) ?? "");
}

function responseToolName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return stringValue(value.name) || stringValue(value.server_label);
}

function grokToolChoiceNamesRemovedTool(value: unknown, removedToolNames: Set<string>): boolean {
  if (removedToolNames.size === 0) {
    return false;
  }
  if (!isRecord(value)) {
    return false;
  }
  const name = stringValue(value.name) || stringValue(value.server_label);
  return name ? removedToolNames.has(name) : false;
}

function withBearerAuth(
  headers: HeaderRecord | undefined,
  token: string,
  removeHeaders: string[]
): HeaderRecord {
  const next = { ...(headers ?? {}) };
  for (const name of removeHeaders) {
    deleteHeader(next, name);
  }
  setHeader(next, "authorization", `Bearer ${token}`);
  return next;
}

function originalRemoveHeaders(plugin: Record<string, unknown>): string[] {
  const auth = isRecord(plugin.auth) ? plugin.auth : undefined;
  const removeHeaders = Array.isArray(auth?.removeHeaders) ? auth.removeHeaders : [];
  return uniqueStrings([
    ...removeHeaders
      .map((value) => stringValue(value))
      .filter((value): value is string => Boolean(value)),
    "x-api-key"
  ]);
}

function originalBearerToken(plugin: Record<string, unknown>): string | undefined {
  const authorization = originalAuthHeader(plugin, "authorization");
  return authorization?.startsWith(bearerPrefix) ? authorization.slice(bearerPrefix.length).trim() || undefined : undefined;
}

function originalAuthHeader(plugin: Record<string, unknown>, name: string): string | undefined {
  const auth = isRecord(plugin.auth) ? plugin.auth : undefined;
  const headers = isRecord(auth?.headers) ? auth.headers : undefined;
  return recordHeader(headers, name);
}

function originalRequestHeader(plugin: Record<string, unknown>, name: string): string | undefined {
  const request = isRecord(plugin.request) ? plugin.request : undefined;
  const headers = isRecord(request?.headers) ? request.headers : undefined;
  return recordHeader(headers, name);
}

function recordHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = recordHeaderValue(headers, name);
  return typeof value === "string" ? value : undefined;
}

function recordHeaderValue(headers: Record<string, unknown> | undefined, name: string): unknown {
  if (!headers) {
    return undefined;
  }
  const normalizedName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.trim().toLowerCase() === normalizedName)?.[1];
}

function requestHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const normalizedName = name.toLowerCase();
  const value = Object.entries(headers).find(([key]) => key.trim().toLowerCase() === normalizedName)?.[1];
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return value;
}

function setHeader(headers: HeaderRecord, name: string, value: string): void {
  deleteHeader(headers, name);
  headers[name] = value;
}

function deleteHeader(headers: HeaderRecord, name: string): void {
  const normalizedName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.trim().toLowerCase() === normalizedName) {
      delete headers[key];
    }
  }
}

function kimiOauthReference(plugin: Record<string, unknown>): { key?: string; oauthHost?: string } | undefined {
  const oauth = isRecord(plugin.kimiOauth) ? plugin.kimiOauth : undefined;
  if (!oauth) {
    return undefined;
  }
  const key = stringValue(oauth.key);
  const oauthHost = stringValue(oauth.oauthHost) || stringValue(oauth.oauth_host);
  return key || oauthHost ? { key, oauthHost } : undefined;
}

const grokSupportedResponsesToolTypes = new Set([
  "function",
  "x_search",
  "image_generation",
  "collections_search",
  "file_search",
  "code_execution",
  "code_interpreter",
  "mcp",
  "shell"
]);

const grokUnsupportedResponsesOptions = new Set([
  "external_web_access"
]);

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}
