import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig,
  ProviderAccountMappingConfig
} from "@llmr/core/contracts/app";
import {
  bearerAuthPlugin,
  isLoopbackUrl,
  isRecord,
  missingCandidate,
  parseJsonRecord,
  providerInternalNamePlaceholder,
  providerPayload,
  readFiniteNumber,
  readJsonRecord,
  readOauthTokenSetFields,
  readString,
  uniqueProviderName,
  uniqueStrings,
  type OAuthTokenSet
} from "@llmr/core/agents/local-providers/shared";
import { fetchWithSystemProxy } from "@llmr/core/proxy/system-proxy-fetch";

const claudeDefaultModels = ["claude-sonnet-5"];
const claudeCodeKeychainServiceBase = "Claude Code-credentials";
const claudeCodeKeychainAccountPattern = /^[a-zA-Z0-9._-]+$/;
const claudeCodeKeychainServicePattern = /^Claude Code(?:-[a-z]+-oauth)?-credentials(?:-[0-9a-f]{8})?$/;
// `security` exit code for errSecItemNotFound.
const keychainItemNotFoundStatus = 44;
const claudeCodeDefaultTokenEndpoint = "https://platform.claude.com/v1/oauth/token";
const claudeCodeOauthClientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

const claudeCodeRefreshInFlight = new Map<string, Promise<ClaudeCodeTokenSet>>();
const claudeCodeRefreshed = new Map<string, ClaudeCodeRefreshedEntry>();
// Keyed by refresh token, so a token the server rejected is never posted again.
const claudeCodeRejectedRefreshTokens = new Map<string, { code?: string; status: number }>();
const claudeCodeWriteBackWarned = new Set<string>();

type ClaudeCodeRefreshedEntry = { auth: ClaudeCodeTokenSet; persisted: boolean; postedRefreshToken: string; retryWriteAfter?: number };

type ClaudeCodeKeychainCandidate = { account?: string; service: string };

type ClaudeCodeTokenContainer = "claudeAiOauth" | "root";

export type ClaudeCodeTokenStore =
  | { account?: string; container: ClaudeCodeTokenContainer; kind: "keychain"; refreshable: boolean; service: string }
  | { container: ClaudeCodeTokenContainer; kind: "file"; path: string; refreshable: boolean };

export type ClaudeCodeTokenSet = OAuthTokenSet & {
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  scopes?: string[];
  store: ClaudeCodeTokenStore;
};

export type ClaudeCodeLoginScan = {
  /** Reads that failed, with the `security` stderr that explains why. */
  errors: string[];
  /** Locations that parsed successfully. */
  inspected: string[];
  oauth?: ClaudeCodeTokenSet;
  /** Locations that parsed but carry no OAuth token. */
  tokenless: string[];
};

const percentLimitMapping = (id: string, label: string, path: string, window: string) => ({
  id,
  kind: "quota" as const,
  label,
  limit: 100,
  remaining: `100 - ${path}.utilization`,
  resetAt: `${path}.resets_at`,
  unit: "%",
  used: `${path}.utilization`,
  window
});

const claudeCodeAccountMapping: ProviderAccountMappingConfig = {
  meters: [
    percentLimitMapping("claude_five_hour_quota", "5h quota", "$.five_hour", "5h"),
    percentLimitMapping("claude_seven_day_quota", "7d quota", "$.seven_day", "weekly"),
    percentLimitMapping("claude_oauth_apps_quota", "OAuth apps quota", "$.seven_day_oauth_apps", "weekly"),
    percentLimitMapping("claude_opus_quota", "Opus quota", "$.seven_day_opus", "weekly"),
    percentLimitMapping("claude_sonnet_quota", "Sonnet quota", "$.seven_day_sonnet", "weekly"),
    {
      id: "claude_extra_usage",
      kind: "quota",
      label: "Extra usage",
      limit: 100,
      remaining: "100 - $.extra_usage.utilization",
      unit: "%",
      used: "$.extra_usage.utilization",
      window: "monthly"
    },
    {
      id: "claude_extra_usage_credits",
      kind: "balance",
      label: "Extra usage credits",
      limit: "$.extra_usage.monthly_limit",
      unit: "credits",
      used: "$.extra_usage.used_credits",
      window: "monthly"
    }
  ]
};

export function claudeCodeCandidate(): LocalAgentProviderCandidate {
  const scan = scanClaudeCodeLogin();
  const oauth = scan.oauth;
  if (oauth?.accessToken && claudeCodeAccessTokenExpired(oauth) && (!oauth.refreshToken || !oauth.store.refreshable)) {
    return {
      detail: oauth.refreshToken
        ? "Claude Code access token is expired and LLMR cannot refresh this login. Run `claude /login`, then retry."
        : "Claude Code access token is expired and the login has no refresh token. Run `claude /login`, then retry.",
      id: "claude-code-api",
      importable: false,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: oauth.sourceFile,
      status: "locked"
    };
  }
  if (oauth?.accessToken) {
    return {
      detail: "Claude Code login detected. Click Import to add it as a gateway provider.",
      id: "claude-code-api",
      importable: true,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: oauth.sourceFile,
      status: "available"
    };
  }
  if (oauth?.refreshToken) {
    return {
      detail: "Claude Code login was detected, but no usable access token was found.",
      id: "claude-code-api",
      importable: false,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: oauth.sourceFile,
      status: "locked"
    };
  }
  const detail = claudeCodeScanDiagnostic(scan);
  if (detail) {
    return {
      detail,
      id: "claude-code-api",
      importable: false,
      kind: "claude-code",
      models: claudeDefaultModels,
      name: "Claude Code API",
      protocol: "anthropic_messages",
      sourceFile: scan.inspected[0],
      status: "locked"
    };
  }
  return missingCandidate("claude-code", "claude-code-api", "Claude Code API", "anthropic_messages", claudeDefaultModels);
}

// Distinguishes "found login state but no token" and "could not read the store"
// from "no login at all", so the Add Provider list can say why an import is
// unavailable instead of silently omitting the candidate.
function claudeCodeScanDiagnostic(scan: ClaudeCodeLoginScan): string | undefined {
  if (scan.tokenless.length > 0) {
    return `Claude Code login state was found but contains no OAuth token (${scan.tokenless.join("; ")}). Run \`claude /login\`, then retry.`;
  }
  if (scan.errors.length > 0) {
    return `Claude Code login state could not be read: ${scan.errors.join("; ")}`;
  }
  return undefined;
}

export async function importClaudeCodeProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): Promise<LocalAgentProviderImportResult> {
  const oauth = await resolveClaudeCodeAuth();
  const token = oauth?.accessToken;
  if (!token) {
    throw new Error("Claude Code access token was not found.");
  }
  const provider = providerPayload(
    candidate,
    uniqueProviderName(providerNames, "Claude Code API"),
    "https://api.anthropic.com",
    claudeCodeProviderAccountConfig()
  );
  const auth = bearerAuthPlugin("claude-code-oauth", token, {
    "anthropic-beta": "oauth-2025-04-20"
  });
  const internalAuth = bearerAuthPlugin("claude-code-oauth-internal", token, {
    "anthropic-beta": "oauth-2025-04-20"
  }, providerInternalNamePlaceholder);
  return {
    candidate,
    provider,
    providerPlugins: [auth, internalAuth]
  };
}

function claudeCodeProviderAccountConfig(): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: "https://api.anthropic.com/api/oauth/usage",
        headers: {
          "Content-Type": "application/json",
          "anthropic-beta": "oauth-2025-04-20"
        },
        mapping: claudeCodeAccountMapping,
        type: "http-json"
      }
    ],
    enabled: true
  };
}

export function readClaudeCodeOauth(): ClaudeCodeTokenSet | undefined {
  return scanClaudeCodeLogin().oauth;
}

export function claudeCodeAccessTokenExpired(auth: Pick<ClaudeCodeTokenSet, "accessToken" | "expiresAt">): boolean {
  return !auth.accessToken || (auth.expiresAt !== undefined && auth.expiresAt <= Date.now() + 60_000);
}

export class ClaudeCodeRefreshAuthError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(status: number, code?: string) {
    super(`Claude Code OAuth token refresh was rejected (HTTP ${status}${code ? `, ${code}` : ""}). Run \`claude /login\`, then retry.`);
    this.name = "ClaudeCodeRefreshAuthError";
    this.code = code;
    this.status = status;
  }
}

export function resetClaudeCodeAuthStateForTest(): void {
  claudeCodeRefreshInFlight.clear();
  claudeCodeRefreshed.clear();
  claudeCodeRejectedRefreshTokens.clear();
  claudeCodeWriteBackWarned.clear();
}

export function claudeCodeTokenEndpoint(): string {
  const override = process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT;
  return override && isLoopbackUrl(override) ? override : claudeCodeDefaultTokenEndpoint;
}

export async function resolveClaudeCodeAuth(): Promise<ClaudeCodeTokenSet | undefined> {
  const auth = readClaudeCodeOauth();
  if (!auth?.refreshToken) {
    return auth;
  }
  let storedRefreshToken = auth.refreshToken;
  const key = storeKey(auth.store);
  const refreshed = claudeCodeRefreshed.get(key);
  // While the store still holds the token we consumed, the cached pair is the live one.
  let current = refreshed?.postedRefreshToken === storedRefreshToken ? refreshed.auth : auth;
  if (refreshed && current === refreshed.auth && !refreshed.persisted && (refreshed.retryWriteAfter ?? 0) <= Date.now()) {
    if (persistRefreshedClaudeCodeAuth(refreshed) === "adopted") {
      current = claudeCodeRefreshed.get(key)?.auth ?? current;
      storedRefreshToken = current.refreshToken ?? storedRefreshToken;
    }
  }
  const refreshToken = current.refreshToken ?? storedRefreshToken;
  if (!claudeCodeAccessTokenExpired(current) || !auth.store.refreshable) {
    return current;
  }
  const rejected = claudeCodeRejectedRefreshTokens.get(refreshToken);
  if (rejected) {
    throw new ClaudeCodeRefreshAuthError(rejected.status, rejected.code);
  }
  // One refresh per credential at a time: the refresh token rotates on every use.
  let refresh = claudeCodeRefreshInFlight.get(key);
  if (!refresh) {
    refresh = (async () => {
      let entry: ClaudeCodeRefreshedEntry;
      try {
        entry = await refreshClaudeCodeAuth(current, refreshToken, storedRefreshToken);
        if (refreshed && current === refreshed.auth) {
          entry.postedRefreshToken = refreshed.postedRefreshToken;
        }
      } catch (error) {
        return adoptPeerRotatedClaudeCodeAuth(auth, refreshToken, error);
      }
      return persistRefreshedClaudeCodeAuth(entry) === "adopted" ? claudeCodeRefreshed.get(key)?.auth ?? entry.auth : entry.auth;
    })().finally(() => {
      claudeCodeRefreshInFlight.delete(key);
    });
    claudeCodeRefreshInFlight.set(key, refresh);
  }
  return refresh;
}

export async function resolveClaudeCodeAuthOrStored(): Promise<ClaudeCodeTokenSet | undefined> {
  return resolveClaudeCodeAuth().catch(() => readClaudeCodeOauth());
}

// A peer (Claude Code itself) that refreshed first leaves our refresh token
// stale and rejected, while the store already holds the rotated pair.
function adoptPeerRotatedClaudeCodeAuth(stored: ClaudeCodeTokenSet, postedRefreshToken: string, error: unknown): ClaudeCodeTokenSet {
  if (!(error instanceof ClaudeCodeRefreshAuthError)) {
    throw error;
  }
  const latest = readClaudeCodeOauth();
  if (latest?.accessToken && latest.refreshToken !== stored.refreshToken && storeKey(latest.store) === storeKey(stored.store)) {
    return latest;
  }
  console.warn(error.message);
  claudeCodeRejectedRefreshTokens.set(postedRefreshToken, { code: error.code, status: error.status });
  throw error;
}

// The compare-and-swap baseline rides on the shared cache entry and is re-read after the POST, so a write that landed meanwhile moves it.
async function refreshClaudeCodeAuth(auth: ClaudeCodeTokenSet, refreshToken: string, storedRefreshToken: string): Promise<ClaudeCodeRefreshedEntry> {
  const configuredTimeout = Number(process.env.LLMR_CLAUDE_CODE_OAUTH_REFRESH_TIMEOUT_MS);
  const timeoutMs = configuredTimeout > 0 ? configuredTimeout : 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithSystemProxy(claudeCodeTokenEndpoint(), {
      body: JSON.stringify({
        client_id: claudeCodeOauthClientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        ...(auth.scopes?.length ? { scope: auth.scopes.join(" ") } : {})
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal
    });
    const payload = parseJsonRecord(await response.text());
    if (!response.ok) {
      const code = readString(payload?.error);
      if (response.status === 401 || response.status === 403 || (response.status === 400 && code === "invalid_grant")) {
        throw new ClaudeCodeRefreshAuthError(response.status, code);
      }
      throw new Error(`Claude Code OAuth token refresh returned HTTP ${response.status}.`);
    }
    const accessToken = readString(payload?.access_token);
    if (!accessToken) {
      throw new Error("Claude Code OAuth token refresh did not return an access token.");
    }
    const expiresIn = readFiniteNumber(payload?.expires_in);
    const refreshExpiresIn = readFiniteNumber(payload?.refresh_token_expires_in);
    const scope = readString(payload?.scope);
    const next: ClaudeCodeTokenSet = {
      ...auth,
      accessToken,
      expiresAt: expiresIn === undefined ? auth.expiresAt : Date.now() + expiresIn * 1000,
      refreshToken: readString(payload?.refresh_token) ?? refreshToken,
      refreshTokenExpiresAt: refreshExpiresIn === undefined ? auth.refreshTokenExpiresAt : Date.now() + refreshExpiresIn * 1000,
      scopes: scope ? scope.split(" ").filter(Boolean) : auth.scopes
    };
    const entry = { auth: next, persisted: false, postedRefreshToken: storedRefreshToken };
    claudeCodeRefreshed.set(storeKey(auth.store), entry);
    return entry;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Claude Code OAuth token refresh timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Compare-and-swap: the store is re-read just before the write, so a pair a peer rotated since our refresh is adopted, not overwritten.
function persistRefreshedClaudeCodeAuth(entry: ClaudeCodeRefreshedEntry): "adopted" | "failed" | "written" {
  const { auth } = entry;
  const { store } = auth;
  const key = storeKey(store);
  try {
    const record = readClaudeCodeStoreRecord(store);
    if (!record) {
      throw new Error("Claude Code login record is gone.");
    }
    const container = store.container === "root" ? record : isRecord(record.claudeAiOauth) ? record.claudeAiOauth : {};
    const onDisk = readOauthTokenSetFields(container);
    if (onDisk?.refreshToken && onDisk.refreshToken !== entry.postedRefreshToken) {
      claudeCodeRefreshed.set(key, { auth: { ...onDisk, sourceFile: auth.sourceFile, store }, persisted: true, postedRefreshToken: onDisk.refreshToken });
      return "adopted";
    }
    const tokens = {
      ...container,
      accessToken: auth.accessToken,
      expiresAt: auth.expiresAt,
      refreshToken: auth.refreshToken,
      ...(auth.refreshTokenExpiresAt === undefined ? {} : { refreshTokenExpiresAt: auth.refreshTokenExpiresAt }),
      ...(auth.scopes === undefined ? {} : { scopes: auth.scopes })
    };
    writeClaudeCodeStoreRecord(store, store.container === "root" ? tokens : { ...record, claudeAiOauth: tokens });
    entry.persisted = true;
    entry.postedRefreshToken = auth.refreshToken ?? entry.postedRefreshToken;
    return "written";
  } catch (error) {
    entry.retryWriteAfter = Date.now() + 60_000;
    if (!claudeCodeWriteBackWarned.has(key)) {
      claudeCodeWriteBackWarned.add(key);
      const failure = error as { code?: string; status?: number };
      const reason = store.kind === "keychain" ? `security exited ${failure.status ?? "unknown"}` : failure.code ?? "write failed";
      console.warn(`Claude Code login could not be written back to ${store.kind === "keychain" ? auth.sourceFile : store.path} (${reason})`);
    }
    return "failed";
  }
}

function readClaudeCodeStoreRecord(store: ClaudeCodeTokenStore): Record<string, unknown> | undefined {
  if (store.kind === "file") {
    return readJsonRecord(store.path);
  }
  return readClaudeCodeKeychainRecord(store, { errors: [], inspected: [], tokenless: [] }, store.service);
}

function writeClaudeCodeStoreRecord(store: ClaudeCodeTokenStore, record: Record<string, unknown>): void {
  const json = JSON.stringify(record);
  if (store.kind === "file") {
    const target = realpathSync(store.path);
    const tmp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      writeFileSync(tmp, json, { mode: 0o600 });
      renameSync(tmp, target);
    } catch (error) {
      try {
        rmSync(tmp, { force: true });
      } catch {}
      throw error;
    }
    return;
  }
  if (store.account === undefined) {
    throw new Error("Claude Code keychain item has no account.");
  }
  const hex = Buffer.from(json, "utf8").toString("hex");
  // `security -i` takes the command on stdin, so the record never shows in argv (`ps`); `-w` would put it there in plaintext.
  const line = `add-generic-password -U -a "${store.account}" -s "${store.service}" -X ${hex}\n`;
  if (Buffer.byteLength(line) > 4032) {
    execFileSync("security", ["add-generic-password", "-U", "-a", store.account, "-s", store.service, "-X", hex], { stdio: ["ignore", "ignore", "ignore"] });
    return;
  }
  execFileSync("security", ["-i"], { input: line, stdio: ["pipe", "ignore", "ignore"] });
}

function storeKey(store: ClaudeCodeTokenStore): string {
  return store.kind === "keychain" ? `keychain:${store.service}\u0000${store.account ?? ""}` : `file:${store.path}`;
}

// Not refreshable: a custom OAuth URL or a `-<env>-oauth-` service has a token
// endpoint unknown here, an accountless read cannot be written back to the
// same item, and an account outside the safe pattern cannot be quoted on the
// `security -i` line.
function claudeCodeKeychainStore(candidate: ClaudeCodeKeychainCandidate, container: ClaudeCodeTokenContainer): ClaudeCodeTokenStore {
  return {
    account: candidate.account,
    container,
    kind: "keychain",
    refreshable: !process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL && claudeCodeKeychainAccountPattern.test(candidate.account ?? "") && !/-[a-z]+-oauth-credentials/.test(candidate.service),
    service: candidate.service
  };
}

export function scanClaudeCodeLogin(): ClaudeCodeLoginScan {
  const scan: ClaudeCodeLoginScan = { errors: [], inspected: [], tokenless: [] };
  const keychainOauth = scanClaudeCodeKeychain(scan);
  if (keychainOauth) {
    scan.oauth = keychainOauth;
    return scan;
  }

  for (const sourceFile of claudeCredentialFiles()) {
    const record = readJsonRecord(sourceFile);
    if (!record) {
      continue;
    }
    scan.inspected.push(sourceFile);
    // Root-level fields only, same reasoning as the keychain path below: Claude
    // Code writes this file with the identical record shape, mcpOAuth included.
    const claudeAiOauth = readOauthTokenSetFields(record.claudeAiOauth);
    const credential = claudeAiOauth ?? readOauthTokenSetFields(record);
    if (!credential) {
      scan.tokenless.push(`${sourceFile} (keys: ${Object.keys(record).join(", ")})`);
      continue;
    }
    scan.oauth = {
      ...credential,
      sourceFile,
      store: { container: claudeAiOauth ? "claudeAiOauth" : "root", kind: "file", path: sourceFile, refreshable: !process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL }
    };
    return scan;
  }

  return scan;
}

function claudeCredentialFiles(): string[] {
  return uniqueStrings([
    path.join(claudeCodeStorageDir(), ".credentials.json"),
    path.join(os.homedir(), ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", "credentials.json"),
    path.join(os.homedir(), ".config", "claude", "credentials.json")
  ]);
}

// Claude Code's plaintext fallback lives in its secure-storage config dir,
// which CLAUDE_SECURESTORAGE_CONFIG_DIR / CLAUDE_CONFIG_DIR can relocate.
function claudeCodeStorageDir(): string {
  const secureStorageDir = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const dir = secureStorageDir !== undefined
    ? secureStorageDir || path.join(os.homedir(), ".claude")
    : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return dir.normalize("NFC");
}

// Claude Code >= 2.1 derives the keychain service name from its config dir:
//   `Claude Code${oauthSuffix}-credentials${configSuffix}`
// `configSuffix` is empty for a default config dir and
// `-${sha256(NFC(configDir)).slice(0, 8)}` once CLAUDE_CONFIG_DIR or
// CLAUDE_SECURESTORAGE_CONFIG_DIR is set. Verified against 2.1.220.
function claudeCodeExpectedKeychainServices(): string[] {
  const secureStorageDir = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const usesDefaultDir = secureStorageDir !== undefined ? !secureStorageDir : !process.env.CLAUDE_CONFIG_DIR;
  const configSuffix = usesDefaultDir
    ? ""
    : `-${createHash("sha256").update(claudeCodeStorageDir()).digest("hex").slice(0, 8)}`;
  const oauthSuffix = process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : "";
  return uniqueStrings([`Claude Code${oauthSuffix}-credentials${configSuffix}`, claudeCodeKeychainServiceBase]);
}

// Claude Code writes the item under the current `$USER`; a login from an older
// build (or one that could not resolve a username) sits under a different
// account on the *same* service name, so the account has to be explicit.
function claudeCodeKeychainAccount(): string {
  let user: string | undefined;
  try {
    user = process.env.USER || os.userInfo().username;
  } catch {
    user = undefined;
  }
  return user && claudeCodeKeychainAccountPattern.test(user) ? user : "claude-code-user";
}

// Newer macOS builds of the Claude Code CLI store credentials in the Keychain
// instead of ~/.claude/.credentials.json. Reading one triggers the standard
// macOS keychain access prompt (Allow / Always Allow); the user declining or
// the item not existing both surface as a non-zero exit here.
function scanClaudeCodeKeychain(scan: ClaudeCodeLoginScan): ClaudeCodeTokenSet | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const expectedServices = claudeCodeExpectedKeychainServices();
  const account = claudeCodeKeychainAccount();
  // Ordered by cost: the enumeration tier shells out to `security dump-keychain`,
  // so it is only built once the expected item fails to produce a token.
  const tiers: Array<() => ClaudeCodeKeychainCandidate[]> = [
    () => expectedServices.map(service => ({ account, service })),
    // An item written under a different account, or under a config dir this
    // process cannot reconstruct, only turns up by enumeration.
    discoverClaudeCodeKeychainItems,
    // Pre-2.1 lookup: no `-a`, so the Keychain picks an arbitrary account when
    // several items share the service name.
    () => expectedServices.map(service => ({ service }))
  ];

  const attempted = new Set<string>();
  const servicesRead = new Set<string>();
  let legacyRootMatch: ClaudeCodeTokenSet | undefined;
  for (const buildTier of tiers) {
    for (const candidate of buildTier()) {
      const key = `${candidate.service}\u0000${candidate.account ?? ""}`;
      // An accountless read of a service already read by account returns one of
      // those same items, so it would only duplicate the diagnostics.
      if (attempted.has(key) || (candidate.account === undefined && servicesRead.has(candidate.service))) {
        continue;
      }
      attempted.add(key);
      const label = candidate.account === undefined ? candidate.service : `${candidate.service} (${candidate.account})`;
      const record = readClaudeCodeKeychainRecord(candidate, scan, label);
      if (!record) {
        continue;
      }
      servicesRead.add(candidate.service);
      scan.inspected.push(`keychain:${label}`);
      // Only `claudeAiOauth` is an Anthropic API credential. Both reads are
      // root-level: a recursive search would descend into `mcpOAuth`, whose
      // per-plugin records also carry `accessToken`, and that token imports
      // cleanly as a provider and then 401s on every request. Restricting to
      // root-level fields excludes *any* nested container, so a future sibling
      // key cannot reintroduce the hole.
      const claudeAiOauth = readOauthTokenSetFields(record.claudeAiOauth);
      if (claudeAiOauth) {
        return { ...claudeAiOauth, sourceFile: `keychain:${label}`, store: claudeCodeKeychainStore(candidate, "claudeAiOauth") };
      }
      // Pre-`claudeAiOauth` layout, where the tokens sat at the record root.
      const legacyRoot = readOauthTokenSetFields(record);
      if (legacyRoot) {
        legacyRootMatch ??= { ...legacyRoot, sourceFile: `keychain:${label}`, store: claudeCodeKeychainStore(candidate, "root") };
        continue;
      }
      scan.tokenless.push(`keychain:${label} (keys: ${Object.keys(record).join(", ")})`);
    }
  }
  // Every tier is exhausted before falling back to a root-level match, so an
  // explicit `claudeAiOauth` on any item always wins.
  return legacyRootMatch;
}

// `security dump-keychain` without `-d` prints item *metadata* only: it never
// decrypts a password and never prompts. Finds login items this environment
// cannot name, newest-modified first.
function discoverClaudeCodeKeychainItems(): ClaudeCodeKeychainCandidate[] {
  let dump: string;
  try {
    dump = execFileSync("security", ["dump-keychain"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return [];
  }
  const found: Array<ClaudeCodeKeychainCandidate & { modified: string }> = [];
  let account: string | undefined;
  let modified = "";
  let service: string | undefined;
  const flush = () => {
    if (service && claudeCodeKeychainServicePattern.test(service)) {
      found.push({ account, modified, service });
    }
    account = undefined;
    modified = "";
    service = undefined;
  };
  for (const line of dump.split("\n")) {
    if (line.startsWith("keychain:")) {
      flush();
      continue;
    }
    const serviceMatch = /^\s*"svce"<blob>="(.*)"$/.exec(line);
    if (serviceMatch) {
      service = serviceMatch[1];
      continue;
    }
    const accountMatch = /^\s*"acct"<blob>="(.*)"$/.exec(line);
    if (accountMatch) {
      account = accountMatch[1];
      continue;
    }
    const modifiedMatch = /^\s*"mdat"<timedate>=.*"(\d{14})Z/.exec(line);
    if (modifiedMatch) {
      modified = modifiedMatch[1];
    }
  }
  flush();
  return found
    .sort((left, right) => right.modified.localeCompare(left.modified))
    .map(({ account: itemAccount, service: itemService }) => ({ account: itemAccount, service: itemService }));
}

function readClaudeCodeKeychainRecord(
  candidate: ClaudeCodeKeychainCandidate,
  scan: ClaudeCodeLoginScan,
  label: string
): Record<string, unknown> | undefined {
  const args = ["find-generic-password", "-s", candidate.service, "-w"];
  if (candidate.account !== undefined) {
    args.splice(1, 0, "-a", candidate.account);
  }
  try {
    const output = execFileSync("security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(output.trim()) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
    scan.errors.push(`keychain:${label}: item is not a JSON object`);
    return undefined;
  } catch (error) {
    const message = keychainErrorMessage(error);
    // errSecItemNotFound is the ordinary "no such login" answer, not a fault:
    // recording it would turn a logged-out machine into a `locked` candidate.
    if (message !== undefined) {
      scan.errors.push(`keychain:${label}: ${message}`);
    }
    return undefined;
  }
}

// Returns undefined when the item simply does not exist.
function keychainErrorMessage(error: unknown): string | undefined {
  if (error instanceof SyntaxError) {
    return `item is not valid JSON (${error.message})`;
  }
  const failure = error as { status?: number; stderr?: Buffer | string } | undefined;
  if (failure?.status === keychainItemNotFoundStatus) {
    return undefined;
  }
  const stderr = typeof failure?.stderr === "string" ? failure.stderr : failure?.stderr?.toString("utf8");
  const message = stderr?.trim().replace(/\s*\n\s*/g, "; ");
  if (message) {
    return /could not be found/i.test(message) ? undefined : message;
  }
  return failure?.status === undefined ? String(error) : `security exited ${failure.status}`;
}
