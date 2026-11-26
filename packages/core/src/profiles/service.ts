import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, claudeAppTakesOverDirectLaunches, claudeCodeUsesSharedHome, enforceSingleEnabledGlobalProfilePerAgent, hasAvailableGatewayModels, isEnabledGlobalProfile, isGatewayProviderEnabled, type AppConfig, type GlobalProfileRecoveryResult, type ProfileApplyResult, type ProfileClientApplyStatus, type ProfileClientKind, type ProfileConfig } from "@llmr/core/contracts/app";
import { resolveClaudeCodeGatewayAuthMode, type ClaudeCodeGatewayAuthMode } from "@llmr/core/agents/claude-code/auth-mode";
import { claudeCodeManagedSettingsFiles, readClaudeCodeGatewayLoginPolicy } from "@llmr/core/agents/claude-code/gateway-login-policy";
import { appConfigLoadError, disableGlobalAgentProfile, loadAppConfig } from "@llmr/core/config/config";
import { loadPersistedApiKeys, updatePersistedApiKeys } from "@llmr/core/config/config-repository";
import { botGatewayProfileEnv } from "@llmr/core/agents/bot-gateway/env";
import {
  CLAUDE_CODE_CONFIG_DIR_ENV,
  CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS,
  CLAUDE_CODE_MCP_CONFIG_ENV,
  STALE_BOT_GATEWAY_ENV_PREFIX,
  STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS,
  type ClaudeCodeModelSelection,
  claudeCodeHomeEnv,
  claudeCodeHomeUnsetEnvKeys,
  claudeCodeModelEnv,
  claudeCodeMcpConfigEnv,
  clearClaudeCodeManagedModelEnv,
  isClaudeCodeAccountFile,
  isClaudeCodeManagedModelEnvKey,
  isStaleClaudeCodeSettingsEnvKey,
  normalizeClaudeCodeClientModel
} from "@llmr/core/agents/claude-code/environment";
import { codexAppModelCatalogPath, isManagedWorkbuddyModelsContent, writeCodexCompatibleAppModelCatalog } from "@llmr/core/agents/codex/app-launch";
import { codexCliMiddlewareRuntimeScript } from "@llmr/core/agents/codex/cli-middleware-runtime";
import { codexModelCatalogJson } from "@llmr/core/agents/codex/model-catalog";
import { applyGrokProfile, grokWrapperPath } from "@llmr/core/agents/grok/profile-config";
import { applyKimiProfile, kimiWrapperPath } from "@llmr/core/agents/kimi/profile-config";
import {
  kiloDefaultSchema,
  resolveKiloConfigFile,
  writeKiloGatewayConfig
} from "@llmr/core/agents/kilo/profile-config";
import {
  openCodeDefaultSchema,
  resolveOpenCodeConfigFile,
  writeOpenCodeGatewayConfig
} from "@llmr/core/agents/opencode/profile-config";
import {
  isManagedPiModelsContent,
  piProviderId,
  piWrapperFilename,
  resolvePiAgentDir,
  writePiGatewayConfig
} from "@llmr/core/agents/pi/profile-config";
import { CONFIGDIR } from "@llmr/core/config/constants";
import { profileApiKeyId, pruneInactiveProfileApiKeysFromList, syncProfileApiKeys } from "@llmr/core/profiles/api-key";
import { cmdQuote, defaultClientModel, disabledStatus, formatError, gatewayEndpoint, gatewayNoProxyHosts, isRecord, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, providerBaseUrl, sanitizeProfilePathSegment, shellQuote, stringRecord, tomlKey, tomlString, trimLeadingBlankLines, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
import { type BackupOptions, backupBeforeWrite, backupContent, backupCurrentFile, backupFiles, backupMarker, chmodFileIfRequested, ensureOriginalSnapshot, originalBackupSuffix, originalMissingSuffix, removeFileKeepingLink, saveRemovedConfigCopy, writeFileAtomic } from "@llmr/core/profiles/backup-files";
import {
  type CodexWrittenLines,
  type CodexWrittenRecord,
  codexProfileTableBody,
  collapseBlankStatements,
  decideCodexRootLines,
  firstCodexTableIndex,
  isManagedCodexConfigContent,
  isRootKeyInsideManagedBlock,
  managedConfiguredModel,
  managedConfiguredModelPrefix,
  managedContextArchiveMcpEnd,
  managedContextArchiveMcpStart,
  managedProviderEnd,
  managedProviderStart,
  managedRootEnd,
  managedRootStart,
  managedToolHubMcpEnd,
  managedToolHubMcpStart,
  readCodexDisplacedConfig,
  removeCodexMcpServerTable,
  removeCodexProviderTable,
  removeManagedConfiguredModelLine,
  removeManagedMarkerLines,
  removeRootTomlKeys,
  removeTomlTable,
  rootTomlAssignment,
  scanTomlStatements,
  stripManagedCodexConfigContent
} from "@llmr/core/profiles/codex-config-strip";
import { isEmptyProviderJsonContent, isManagedProviderJsonContent, type ProviderJsonClient, stripManagedProviderJsonContent } from "@llmr/core/profiles/json-config-strip";
import { profileAllowedModels } from "@llmr/core/profiles/model-allowlist";
import { refreshClaudeAppModelDiscoveryCache, restoreClaudeAppGatewayConfig, syncClaudeAppGatewayConfig } from "@llmr/core/agents/claude-app/gateway-service";
import { probeExistingLlmrGateway } from "@llmr/core/gateway/existing-gateway-probe";
import { resolveClaudeAppProfileUserDataDir } from "@llmr/core/agents/claude-app/launch";
import { resolveZcodeConfigFile, writeZcodeGatewayConfig, zcodeHomeFromConfigFile } from "@llmr/core/agents/zcode/profile-config";
import { CONTEXT_ARCHIVE_MCP_SERVER_NAME, contextArchiveConfigForProfile, contextArchiveMcpEnabled, contextArchiveMcpServer } from "@llmr/core/gateway/context-archive";
import { claudeLoginProviderNames, withoutClaudeLoginProviders } from "@llmr/core/gateway/features/claude-login-pass-through";
import { claudeClientDiscoveryPayloads, createClaudeCliAutoCompactWindows } from "@llmr/core/gateway/features/model-discovery";
import { claudeCodeOneMillionContextSuffix, llmrApiKeyHeader } from "@llmr/core/gateway/internal/shared";
import { windowsBatchEscapeValue as cmdValue, windowsBatchSetLine as cmdSetLine } from "@llmr/core/platform/windows-batch";
import {
  TOOL_HUB_MCP_RUNTIME_FILE_NAME,
  TOOL_HUB_MCP_SERVER_NAME,
  bundledToolHubMcpEntryPathCandidates,
  toolHubClaudeCodeMcpConfig,
  toolHubMcpRuntimeConfig,
  type ClaudeCodeMcpServerConfig,
  type ToolHubMcpRuntimeConfig
} from "@llmr/core/mcp/toolhub-config";
import { resolveRuntimeAppPath, resolveUserPath } from "@llmr/core/runtime/app-paths";

const globalProfileTakeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
const fallbackClientToken = "llmr-local";
const publicExecutableMode = 0o755;
const claudeCodeCustomHeadersEnvKey = "ANTHROPIC_CUSTOM_HEADERS";
const claudeCodeWifFederationRuleId = "llmr-local";
const claudeCodeWifOrganizationId = "llmr-local";
const claudeModelDiscoveryFingerprintStateFile = path.join(CONFIGDIR, "claude-model-discovery-fingerprint.json");
const claudeCodeGatewayEnvKeys = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_BASE_URL",
  "CLAUDE_AGENT_API_BASE_URL"
] as const;
const claudeCodeNoProxyEnvKeys = [
  "NO_PROXY",
  "no_proxy"
] as const;
const gatewayLocalNoProxyHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const claudeCodeGatewayCompatibilityEnvKeys = [
  "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT"
] as const;
const claudeCodeApiKeyHelperConflictPaths = [
  "autoMode"
] as const;
const claudeCodeRemovedAuthEnvKeys = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY"
] as const;
const claudeCodeFirstPartyProviderEnvKeys = [
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_GATEWAY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
  ...claudeCodeRemovedAuthEnvKeys
] as const;
const claudeCodeWifEnvKeys = [
  "ANTHROPIC_FEDERATION_RULE_ID",
  "ANTHROPIC_ORGANIZATION_ID",
  "ANTHROPIC_IDENTITY_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN_FILE",
  "ANTHROPIC_SERVICE_ACCOUNT_ID",
  "ANTHROPIC_WORKSPACE_ID",
  "ANTHROPIC_SCOPE",
  "ANTHROPIC_PROFILE"
] as const;
let ownedGlobalProfileTakeovers: GlobalProfileTakeoverRecord[] | undefined;

type CodexContextArchiveMcpConfig = {
  headers: Record<string, string>;
  requestTimeoutMs: number;
  startupTimeoutMs: number;
  url: string;
};

type GlobalProfileTakeoverRecord = {
  agent: ProfileClientKind;
  codexHome?: string;
  configFile?: string;
  id: string;
  name: string;
  providerId?: string;
  settingsFile?: string;
};

type ApplyProfileConfigOptions = {
  excludeAgents?: readonly ProfileClientKind[];
};

let applyQueue: Promise<unknown> = Promise.resolve();

function enqueueApply<T>(operation: () => T | Promise<T>): Promise<T> {
  const run = applyQueue.then(operation);
  applyQueue = run.catch(() => undefined);
  return run;
}

export function applyProfileConfig(
  config: AppConfig,
  options: ApplyProfileConfigOptions = {}
): Promise<ProfileApplyResult> {
  return enqueueApply(async () => {
    const result = await applyProfileConfigNow(config, options);
    return { ...result, clients: mergeProfileStatuses(result.clients) };
  });
}

// The disable is saved by the time refreshRuntime runs, so its failure is reported in the status, never thrown.
export async function recoverGlobalAgentProfile(
  profileId: string,
  refreshRuntime: (config: AppConfig) => unknown = () => undefined
): Promise<GlobalProfileRecoveryResult> {
  // Saved before any file changes, so a failed restore cannot be followed by a startup that takes the agent over again.
  const config = await disableGlobalAgentProfile(profileId);
  const profile = config.profile.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Profile ${profileId} is not in the saved configuration.`);
  }
  const token = config.APIKEYS.find((apiKey) => apiKey.id === profileApiKeyId(profile))?.key;
  const status = await enqueueApply((): ProfileClientApplyStatus => {
    try {
      const file = profilePath(profile);
      if (profile.agent === "claude-code") {
        if (existsSync(file) && !parseJsonContent(readFileSync(file, "utf8"))) {
          throw new Error(`${file} is not valid JSON.`);
        }
        cleanupClaudeCodeGeneratedFiles(profile);
      }
      const owner = enabledOwnerOfFile(profile, config.profile.profiles);
      const restored = owner ? stillManagedStatus(profile, owner, file) : disabledProfileStatus(profile, config.profile.profiles);
      // A normal save releases Claude App the same way once no profile takes it over.
      if (!config.profile.profiles.some(claudeAppTakesOverDirectLaunches)) {
        restoreClaudeAppGatewayConfig();
      }
      return restored;
    } catch (error) {
      console.error(`Failed to restore the original settings for profile ${profile.name || profile.id}: ${formatError(error)}`);
      return {
        client: profile.agent,
        enabled: false,
        message: `This profile is disabled, but its original settings could not be restored: ${formatError(error)}`,
        ok: false,
        path: profilePath(profile)
      };
    }
  });
  let result = status;
  if (mayRevokeProfileKey(profile, status, token)) {
    try {
      await reconcileProfileApiKeys(config);
    } catch (error) {
      console.error(`Failed to revoke the API key of restored profile ${profile.name || profile.id}: ${formatError(error)}`);
      result = { ...result, message: `${result.message} LLMR could not revoke this profile's API key, which still works: ${formatError(error)}`, ok: false };
    }
  }
  // The strip removes what LLMR wrote, not a copy of the key the user pasted into a setting of their own.
  if (result.ok && token && fileMayHold(profilePath(profile), token)) {
    result = { ...result, message: `${result.message} Your own settings in ${profilePath(profile)} still hold this profile's LLMR key, which no longer works.` };
  }
  try {
    await refreshRuntime(config);
  } catch (error) {
    console.error(`Failed to refresh the running gateway after restoring profile ${profile.name || profile.id}: ${formatError(error)}`);
    result = { ...result, message: `${result.message} LLMR could not refresh the running gateway: ${formatError(error)} Restart LLMR.`, ok: false };
  }
  return { config, status: result };
}

async function applyProfileConfigNow(
  config: AppConfig,
  options: ApplyProfileConfigOptions
): Promise<ProfileApplyResult> {
  const loadError = appConfigLoadError(config);
  if (loadError) {
    // The defaults hold no profiles, so syncing them would release every agent the user's real config takes over.
    throw new Error(`LLMR left agent profiles unchanged because its config failed to load: ${loadError}`);
  }
  cleanupGeneratedBinBackups();
  const appliedAt = new Date().toISOString();
  const excludedAgents = new Set(options.excludeAgents ?? []);
  const allProfiles = profileEntries(config);
  const profiles = allProfiles.filter((profile) => !excludedAgents.has(profile.agent));
  const released = await releaseDisabledProfileKeys(config, allProfiles);
  // A profile whose key was kept may still be pointed at by its agent, so its wrapper and helper files stay too,
  // and the passes below leave it to the release, which already restored and reported it.
  const keyIds = new Set(config.APIKEYS.map((apiKey) => apiKey.id));
  const keptKey = (profile: ProfileConfig) => !profile.enabled && keyIds.has(profileApiKeyId(profile));
  const holders = allProfiles.map((profile) => keptKey(profile) ? { ...profile, enabled: true } : profile);
  cleanupInactiveOpenCodeWrappers(holders);
  cleanupInactiveKiloWrappers(holders);
  cleanupInactiveClaudeCodeGeneratedFiles(holders);
  const result: ProfileApplyResult = {
    appliedAt,
    clients: released,
    enabled: profiles.some((profile) => profile.enabled)
  };
  const takeoverStatuses = synchronizeGlobalProfileTakeovers(
    profiles,
    result.enabled && hasAvailableGatewayModels(config),
    excludedAgents
  );

  if (!result.enabled) {
    result.clients.push(...profiles.map((profile) => disabledProfileStatus(profile)));
    result.clients.push(...takeoverStatuses);
    result.clients.push(...restoreInactiveGlobalProfileConfigs(profiles));
    return result;
  }

  if (!hasAvailableGatewayModels(config)) {
    const managedCleanupResult = cleanupManagedClaudeCodeToolHubArtifacts(profiles, { includeActive: true });
    result.clients.push(...profiles.filter((profile) => !keptKey(profile)).map((profile) => {
      const cleanupResult = profile.agent === "claude-code"
        ? cleanupClaudeCodeUnavailableProfileArtifacts(profile)
        : { ok: true };
      const status = profile.enabled
        ? unavailableModelStatus(profile, profilePath(profile))
        : disabledProfileStatus(profile);
      const cleanupMessage = [managedCleanupResult, cleanupResult]
        .filter((item) => !item.ok)
        .map((item) => item.message)
        .filter(Boolean)
        .join("; ");
      return cleanupMessage
        ? {
            ...status,
            message: `${status.message} Failed to clean stale ToolHub config: ${cleanupMessage}`
          }
        : status;
    }));
    result.clients.push(...takeoverStatuses);
    result.clients.push(...restoreInactiveGlobalProfileConfigs(profiles));
    return result;
  }

  const profileApiKeys = await ensureProfileApiKeys(config, profiles);

  for (const profile of profiles.filter((item) => !keptKey(item))) {
    const token = profileApiKeys.get(profile.id) ?? fallbackClientToken;
    result.clients.push(
      profile.agent === "claude-code"
        ? applyClaudeCodeProfile(config, profile, token, appliedAt)
        : profile.agent === "grok"
          ? applyGrokProfile(config, profile, token, appliedAt)
          : profile.agent === "kimi"
            ? applyKimiProfile(config, profile, token, appliedAt)
            : profile.agent === "pi"
              ? applyPiProfile(config, profile, token, appliedAt)
              : profile.agent === "opencode"
                ? applyOpenCodeProfile(config, profile, token, appliedAt)
                : profile.agent === "kilo"
                  ? applyKiloProfile(config, profile, token, appliedAt)
                  : profile.agent === "zcode"
                    ? applyZcodeProfile(config, profile, token, appliedAt)
                    : applyCodexProfile(config, profile, token, appliedAt)
    );
  }
  syncClaudeCodeManagedGatewaySettings(config, profiles);
  result.clients.push(...takeoverStatuses);
  cleanupManagedClaudeCodeToolHubArtifacts(profiles, { includeActive: false });
  result.clients.push(...restoreInactiveGlobalProfileConfigs(profiles));
  return result;
}

function cleanupManagedClaudeCodeToolHubArtifacts(
  profiles: ProfileConfig[],
  options: { includeActive: boolean }
): { changed?: boolean; message?: string; ok: boolean } {
  const activeToolHubFiles = new Set(profiles
    .filter((profile) => profile.agent === "claude-code")
    .map((profile) => normalizedFileKey(claudeCodeToolHubMcpConfigFile(profile))));
  const activeGeneratedSettingsFiles = new Set(profiles
    .filter((profile) => profile.agent === "claude-code" && isGeneratedProfileScope(profile.scope))
    .map((profile) => normalizedFileKey(resolveClaudeCodeSettingsFile(profile))));
  const errors: string[] = [];
  let changed = false;

  for (const file of managedClaudeCodeToolHubMcpConfigFiles()) {
    if (!options.includeActive && activeToolHubFiles.has(normalizedFileKey(file))) {
      continue;
    }
    try {
      rmSync(file, { force: true });
      changed = true;
    } catch (error) {
      errors.push(`${file}: ${formatError(error)}`);
    }
  }

  for (const file of managedClaudeCodeSettingsFiles()) {
    if (!options.includeActive && activeGeneratedSettingsFiles.has(normalizedFileKey(file))) {
      continue;
    }
    try {
      changed = cleanupClaudeCodeToolHubSettingsFile(file, { backup: false }).changed || changed;
    } catch (error) {
      errors.push(`${file}: ${formatError(error)}`);
    }
  }

  return errors.length > 0
    ? { changed, message: errors.join("; "), ok: false }
    : { changed, ok: true };
}

function managedClaudeCodeToolHubMcpConfigFiles(): string[] {
  return managedClaudeCodeGeneratedFiles("toolhub-mcp.json");
}

function managedClaudeCodeSettingsFiles(): string[] {
  return managedClaudeCodeGeneratedFiles("settings.json");
}

function managedClaudeCodeGeneratedFiles(fileName: string): string[] {
  const profilesDir = path.join(CONFIGDIR, "profiles");
  let entries;
  try {
    entries = readdirSync(profilesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const profileDir = path.join(profilesDir, entry.name);
    for (const file of [
      path.join(profileDir, "claude", fileName),
      path.join(profileDir, "custom", "claude", fileName)
    ]) {
      if (existsSync(file)) {
        files.push(file);
      }
    }
  }
  return files;
}

function normalizedFileKey(file: string): string {
  const normalized = path.resolve(file);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function cleanupClaudeCodeToolHubSettingsFile(
  file: string,
  options: { backup: boolean; isManagedContent?: (content: string) => boolean }
): { changed: boolean } {
  const settings = readJsonObject(file);
  const env = isRecord(settings.env) ? { ...settings.env } : {};
  if (!deleteClaudeCodeToolHubEnv(env)) {
    return { changed: false };
  }
  const content = `${JSON.stringify({ ...settings, env }, null, 2)}\n`;
  const writeResult = options.backup
    ? writeFileWithBackup(file, content, { contentForBackup: claudeCodeSettingsBackupContent, isManagedContent: options.isManagedContent, mode: privateFileMode })
    : writeGeneratedFileIfChanged(file, content, { mode: privateFileMode });
  return { changed: writeResult.changed };
}

function deleteClaudeCodeToolHubEnv(env: Record<string, unknown>): boolean {
  let changed = false;
  for (const key of [CLAUDE_CODE_MCP_CONFIG_ENV, ...STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS]) {
    if (key in env) {
      delete env[key];
      changed = true;
    }
  }
  return changed;
}

function cleanupClaudeCodeToolHubArtifacts(profile: ProfileConfig): { changed?: boolean; message?: string; ok: boolean } {
  try {
    let changed = false;
    const mcpConfigFile = claudeCodeToolHubMcpConfigFile(profile);
    if (existsSync(mcpConfigFile)) {
      rmSync(mcpConfigFile, { force: true });
      changed = true;
    }
    changed = cleanupClaudeCodeToolHubSettingsFile(resolveClaudeCodeSettingsFile(profile), { backup: true, isManagedContent: claudeCodeManagedContent(profile).isManagedContent }).changed || changed;
    return { changed, ok: true };
  } catch (error) {
    return {
      message: formatError(error),
      ok: false
    };
  }
}

function cleanupClaudeCodeUnavailableProfileArtifacts(profile: ProfileConfig): { changed?: boolean; message?: string; ok: boolean } {
  const toolHubResult = cleanupClaudeCodeToolHubArtifacts(profile);
  const generatedResult = cleanupClaudeCodeGeneratedFiles(profile);
  return {
    changed: Boolean(toolHubResult.changed || generatedResult.changed),
    message: toolHubResult.message,
    ok: toolHubResult.ok
  };
}

export function applyProfileRuntimeConfig(config: AppConfig, profile: ProfileConfig, token: string): ProfileClientApplyStatus {
  cleanupGeneratedBinBackups();
  const appliedAt = new Date().toISOString();
  return profile.agent === "claude-code"
    ? applyClaudeCodeProfile(config, profile, token, appliedAt)
    : profile.agent === "grok"
      ? applyGrokProfile(config, profile, token, appliedAt)
      : profile.agent === "kimi"
        ? applyKimiProfile(config, profile, token, appliedAt)
        : profile.agent === "pi"
          ? applyPiProfile(config, profile, token, appliedAt)
          : profile.agent === "opencode"
            ? applyOpenCodeProfile(config, profile, token, appliedAt)
            : profile.agent === "kilo"
              ? applyKiloProfile(config, profile, token, appliedAt)
              : profile.agent === "zcode"
                ? applyZcodeProfile(config, profile, token, appliedAt)
                : applyCodexProfile(config, profile, token, appliedAt);
}

function applyClaudeCodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const settingsFile = resolveClaudeCodeSettingsFile(profile);
  if (!profile.enabled) {
    cleanupClaudeCodeGeneratedFiles(profile);
    return restoreDisabledClaudeCodeProfile(profile, config.profile.profiles);
  }

  const sharedHome = claudeCodeUsesSharedHome(profile);
  const userSettingsFile = sharedHome ? path.join(process.env.CLAUDE_CONFIG_DIR?.trim() || resolveUserPath("~/.claude"), "settings.json") : undefined;
  const gatewayPolicy = readClaudeCodeGatewayLoginPolicy([
    ...claudeCodeManagedSettingsFiles(),
    settingsFile,
    ...(userSettingsFile ? [userSettingsFile] : [])
  ]);
  if (gatewayPolicy) {
    return refusedProfileStatus(profile, settingsFile, `Claude Code on this machine is pinned to a Claude apps gateway by ${gatewayPolicy.key} in ${gatewayPolicy.file}. LLMR did not change ${settingsFile}; sign Claude Code in to the gateway, or point the gateway's upstream at LLMR instead.`);
  }

  try {
    if (claudeProfileModelDiscoveryChanged(config, profile)) {
      invalidateClaudeCodeGatewayModelCache(settingsFile);
      invalidateClaudeAppModelDiscoveryCache(profile);
      rememberClaudeProfileModelDiscoveryFingerprint(config, profile);
    }

    const endpoint = gatewayEndpoint(config);
    const currentSettings = readClaudeCodeSettingsObject(settingsFile);
    const authMode = resolveClaudeCodeGatewayAuthMode(profile);
    const profileSettingsState = readClaudeCodeProfileSettingsState(profile);
    const displaced = claudeCodeDisplacedSettings(currentSettings, profileSettingsState, endpoint);
    const takeoverEndpoints = uniqueStrings([...profileSettingsState.endpoints, endpoint]);
    const profileSettings = claudeCodeProfileSettings(profile, authMode);
    const profileSettingsEnv = withoutBotGatewayEnv(Object.fromEntries(stringRecord(profileSettings.env)));
    delete profileSettings.env;
    const profileEnvValues = profileEnv(profile);
    const managedProfileEnvKeys = uniqueStrings([
      ...Object.keys(profileSettingsEnv),
      ...Object.keys(profileEnvValues)
    ]);
    const managedSettingPaths = claudeCodeProfileSettingsPaths(profileSettings);
    const managedSettingComparePaths = uniquePathStrings([
      ...profileSettingsState.paths,
      ...managedSettingPaths,
      ...(authMode === "api-key-helper" ? claudeCodeApiKeyHelperConflictPaths : [])
    ]);
    const compatibleCurrentSettings = withoutClaudeCodeApiKeyHelperAuthConflicts(currentSettings, authMode);
    const settings = removeClaudeCodeProfileSettings(compatibleCurrentSettings, profileSettingsState.paths, managedSettingPaths);
    const settingsEnv = removeClaudeCodeProfileEnv(
      withoutBotGatewayEnv(Object.fromEntries(stringRecord(settings.env))),
      profileSettingsState.envKeys,
      managedProfileEnvKeys
    );
    delete settingsEnv[CLAUDE_CODE_MCP_CONFIG_ENV];
    for (const key of STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS) {
      delete settingsEnv[key];
    }
    const env = {
      ...settingsEnv,
      ...profileSettingsEnv,
      ...profileEnvValues
    };
    env.ANTHROPIC_BASE_URL = endpoint;
    env.ANTHROPIC_API_BASE_URL = endpoint;
    env.CLAUDE_AGENT_API_BASE_URL = endpoint;
    const unreadableUserSettingsFile = applyClaudeCodeCustomHeadersEnv(env, authMode, token, managedProfileEnvKeys.includes(claudeCodeCustomHeadersEnvKey) ? undefined : userSettingsFile);
    applyGatewayNoProxyEnv(env, config);
    applyClaudeCodeGatewayCompatibilityEnv(env);
    for (const key of claudeCodeFirstPartyProviderEnvKeys) {
      delete env[key];
    }
    for (const key of claudeCodeWifEnvKeys) {
      delete env[key];
    }
    clearClaudeCodeManagedModelEnv(env);
    Object.assign(env, claudeCodeProfileModelEnv(config, profile));
    const toolHubMcpConfigResult = writeClaudeCodeToolHubMcpConfig(config, profile, token);
    const mcpConfigEnv = claudeCodeMcpConfigEnv(toolHubMcpConfigResult.file);
    const wifResult = writeClaudeCodeWifIdentityToken(profile, token);
    const wifEnv = authMode === "wif" ? claudeCodeWifEnv(wifResult.file) : {};
    Object.assign(env, mcpConfigEnv, wifEnv);
    if (sharedHome) {
      // The user's settings sit under --settings, so a key LLMR leaves unset needs a blank value to cancel theirs.
      for (const key of [...claudeCodeFirstPartyProviderEnvKeys, ...claudeCodeWifEnvKeys, ...CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS]) {
        env[key] ??= "";
      }
    }

    const helperResult = authMode === "api-key-helper" ? writeClaudeCodeApiKeyHelper(profile, token) : undefined;
    const legacyApiKeyHelperCleanupResult = authMode === "wif"
      ? cleanupClaudeCodeLegacyApiKeyHelper(profile)
      : { changed: false };
    const wrapperResult = writeClaudeCodeWrapper(config, profile, {
      remoteSyncApiKeyFile: wifResult.file,
      wifIdentityTokenFile: authMode === "wif" ? wifResult.file : undefined
    }, toolHubMcpConfigResult.file);
    const autoCompactResult = writeClaudeCodeAutoCompactWindowsCache(config, profile, settingsFile);
    const nextSettings = claudeCodeNextSettings(settings, profileSettings, env, authMode, helperResult?.file);
    const managedEnvKeys = claudeCodeManagedSettingsEnvKeys(profileEnvValues, profileSettingsEnv, mcpConfigEnv, wifEnv);
    for (const key of profileSettingsState.envKeys) {
      managedEnvKeys.add(key);
    }
    // Before the write, so a failure after it never leaves LLMR's values beside a record that says a restore gave the file back.
    unsettleClaudeCodeSettingsFile(settingsFile);
    const writeResult = writeClaudeCodeSettingsIfManagedChanged(settingsFile, currentSettings, nextSettings, managedEnvKeys, managedSettingComparePaths, claudeCodeManagedContent(profile).isManagedContent);
    const settingsStateResult = writeClaudeCodeSettingsStateFile(claudeCodeProfileSettingsStateFile(profile), {
      ...displaced,
      endpoints: takeoverEndpoints,
      envKeys: managedProfileEnvKeys,
      globalConfigCacheSha256: autoCompactResult.sha256,
      paths: managedSettingPaths,
      settingsFile
    });
    const changed = writeResult.changed ||
      settingsStateResult.changed ||
      Boolean(helperResult?.changed) ||
      wifResult.changed ||
      wrapperResult.changed ||
      toolHubMcpConfigResult.changed ||
      legacyApiKeyHelperCleanupResult.changed ||
      autoCompactResult.changed;
    return {
      appliedAt,
      backupFile: writeResult.backupFile ?? wrapperResult.backupFile ?? autoCompactResult.backupFile,
      client: "claude-code",
      enabled: true,
      message: [
        changed ? `Claude Code settings are managed by LLMR (wrapper ${wrapperResult.file}).` : "Claude Code settings already match LLMR.",
        ...(autoCompactResult.file ? [] : ["Claude Code uses its own auto-compact windows for this profile."]),
        ...(authMode === "claude-login" && claudeLoginProviderNames(config).length === 0
          ? ["Claude login mode needs the Claude Code API provider. Until one is on, this profile's requests take the normal route."]
          : []),
        ...(unreadableUserSettingsFile
          ? [`Your custom headers could not be read from ${unreadableUserSettingsFile}, so this profile keeps the ones from the last apply.`]
          : [])
      ].join(" "),
      ok: true,
      path: settingsFile
    };
  } catch (error) {
    return {
      client: "claude-code",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: settingsFile
    };
  }
}

function invalidateClaudeCodeGatewayModelCache(settingsFile: string): void {
  const cacheFile = path.join(path.dirname(settingsFile), "cache", "gateway-models.json");
  rmSync(cacheFile, { force: true });
}

function invalidateClaudeAppModelDiscoveryCache(profile: ProfileConfig): void {
  refreshClaudeAppModelDiscoveryCache(resolveClaudeAppProfileUserDataDir(CONFIGDIR, profile));
}

function claudeProfileModelDiscoveryChanged(config: AppConfig, profile: ProfileConfig): boolean {
  const fingerprint = claudeProfileModelDiscoveryFingerprint(config, profile);
  if (fingerprint === claudeProfileModelDiscoveryFingerprintState(profile.id)) {
    return false;
  }
  return true;
}

function claudeProfileModelDiscoveryFingerprint(config: AppConfig, profile: ProfileConfig): string {
  const contextArchiveConfig = contextArchiveConfigForProfile(config, profile);
  const payloads = claudeClientDiscoveryPayloads(config, {
    contextArchiveCompact: Boolean(contextArchiveConfig && contextArchiveMcpEnabled(contextArchiveConfig)),
    profile
  });
  return createHash("sha256")
    .update(JSON.stringify(payloads))
    .digest("hex");
}

function claudeProfileModelDiscoveryFingerprintState(profileId: string): string | undefined {
  const state = readClaudeModelDiscoveryFingerprintState();
  return isRecord(state) && typeof state[profileId] === "string" ? state[profileId] : undefined;
}

function rememberClaudeProfileModelDiscoveryFingerprint(config: AppConfig, profile: ProfileConfig): void {
  const state = readClaudeModelDiscoveryFingerprintState();
  const next = {
    ...(isRecord(state) ? state : {}),
    [profile.id]: claudeProfileModelDiscoveryFingerprint(config, profile)
  };
  writeClaudeModelDiscoveryFingerprintState(next);
}

function readClaudeModelDiscoveryFingerprintState(): Record<string, unknown> {
  if (!existsSync(claudeModelDiscoveryFingerprintStateFile)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(claudeModelDiscoveryFingerprintStateFile, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeClaudeModelDiscoveryFingerprintState(state: Record<string, unknown>): void {
  mkdirSync(path.dirname(claudeModelDiscoveryFingerprintStateFile), { recursive: true });
  writeFileAtomic(claudeModelDiscoveryFingerprintStateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: privateFileMode });
}

function applyCodexProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const clientName = codexCompatibleClientName(profile.agent);
  const configFile = resolveCodexConfigFile(profile);
  if (!profile.enabled) {
    // The apply loop reaches a disabled profile after the enabled one that shares its file, so restoring here would strip the owner's config.
    const owner = enabledOwnerOfFile(profile, config.profile.profiles);
    if (owner) {
      return stillManagedStatus(profile, owner, configFile);
    }
    return restoreDisabledCodexProfile(profile, configFile, config.profile.profiles);
  }
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "llm-router";
  if (profile.agent === "codex" && reservedCodexProviderIds.includes(providerId)) {
    return refusedProfileStatus(profile, configFile, `Codex does not start with a config that defines its built-in provider "${providerId}". Set this profile's providerId in LLM Router's config to another id. LLMR left ${configFile} unchanged.`);
  }

  try {
    const endpoint = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
    const providerName = profile.providerName?.trim() || "LLM Router";
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const source = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
    const configFormat = normalizeCodexConfigFormat(profile.configFormat);
    const modelCatalogFile = codexModelCatalogFile(configFile);
    const profileWithResolvedModel = { ...profile, model };
    const modelCatalogResult = writeFileWithBackup(
      modelCatalogFile,
      codexModelCatalogJson(withoutClaudeLoginProviders(config), model, { allowedModels: profileAllowedModels(profileWithResolvedModel) })
    );
    const appModelCatalogResult = writeCodexCompatibleAppModelCatalog(CONFIGDIR, profileWithResolvedModel, config);
    const showAllSessions = profile.agent === "zcode" || profile.agent === "workbuddy" ? false : Boolean(profile.showAllSessions);
    const toolHubMcpResult = writeCodexToolHubMcpRuntimeConfig(config, token);
    const contextArchiveMcp = profile.agent === "codex"
      ? codexContextArchiveMcpConfig(config, profile, token)
      : undefined;
    // No restore reaches a generated-scope config, so only a global one keeps a record.
    const recordsWrittenLines = isCodexFamily(profile.agent) && isGlobalProfile(profile);
    const sourceManaged = isManagedCodexConfigContent(source, providerId);
    // A record beside a file with nothing of LLMR's in it is left over from an earlier takeover.
    const previous = recordsWrittenLines && sourceManaged ? readCodexWrittenRecord(configFile) : undefined;
    const built = buildCodexConfigToml(source, {
      baseUrl: endpoint,
      contextArchiveMcp,
      modelCatalogFile,
      configFormat,
      managedWithoutRecord: sourceManaged && !previous,
      model,
      previous,
      providerId,
      providerName,
      showAllSessions,
      token,
      toolHubMcp: toolHubMcpResult.runtime
    });
    const nextConfig = built.content;
    if (recordsWrittenLines) {
      // Before the file: a crash between the two then leaves a record that is at worst too cautious (`edited` turns true), not a line of LLMR's recorded as the user's.
      const recordFile = codexWrittenRecordFile(configFile);
      mkdirSync(path.dirname(recordFile), { recursive: true });
      writeFileAtomic(recordFile, `${JSON.stringify({
        edited: previous ? previous.edited || sha256Hex(source) !== previous.sha256 : sourceManaged,
        file: normalizedFileKey(configFile),
        ...built.written,
        sha256: sha256Hex(nextConfig)
      } satisfies CodexWrittenRecord, null, 2)}\n`, { mode: privateFileMode });
    }
    const writeResult = recordsWrittenLines
      ? writeGlobalCodexConfig(configFile, nextConfig, providerId, previous)
      : writeFileWithBackup(configFile, nextConfig, {
          isManagedContent: (content) => isManagedCodexConfigContent(content, providerId),
          mode: privateFileMode
        });
    const separateProfileResult = maybeWriteSeparateCodexProfileFile(configFile, source, {
      configFormat,
      model,
      providerId,
      showAllSessions
    });
    const middlewareResult = profile.cliMiddleware
      ? writeCodexCliMiddleware(config, profile, {
          configFormat,
          configFile,
          modelCatalogFile,
          model,
          providerId
        })
      : undefined;
    const changed = writeResult.changed ||
      modelCatalogResult.changed ||
      appModelCatalogResult.changed ||
      toolHubMcpResult.changed ||
      Boolean(separateProfileResult?.changed) ||
      Boolean(middlewareResult?.changed);
    const extras = [
      modelCatalogFile ? `catalog ${modelCatalogFile}` : "",
      appModelCatalogResult.file ? `app catalog ${appModelCatalogResult.file}` : "",
      appModelCatalogResult.workbuddyModelsConfig?.file ? `workbuddy models ${appModelCatalogResult.workbuddyModelsConfig.file}` : "",
      toolHubMcpResult.file ? `toolhub runtime ${toolHubMcpResult.file}` : "",
      contextArchiveMcp ? "context archive MCP" : "",
      separateProfileResult?.file ? `profile ${separateProfileResult.file}` : "",
      middlewareResult?.file ? `middleware ${middlewareResult.file}` : ""
    ].filter(Boolean);
    return {
      appliedAt,
      backupFile: writeResult.backupFile,
      client: profile.agent,
      copy: separateProfileResult?.copy,
      enabled: true,
      message: `${changed
        ? `${clientName} config is managed by LLMR${extras.length ? ` (${extras.join(", ")})` : ""}.`
        : `${clientName} config already matches LLMR.`}${separateProfileResult?.copy
        ? ` The [profiles.${providerId}] table you added replaced your settings in ${separateProfileResult.file}, and LLMR kept the earlier ones at ${separateProfileResult.copy}.`
        : ""}`,
      ok: true,
      path: configFile
    };
  } catch (error) {
    return {
      client: profile.agent,
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function applyPiProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const wrapperFile = piWrapperPath(profile);
  if (!profile.enabled) {
    return disabledPiStatus(profile);
  }

  try {
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const wrapperResult = writePiWrapper(config, profile, token, model);
    return {
      appliedAt,
      backupFile: wrapperResult.backupFile,
      client: "pi",
      enabled: true,
      message: wrapperResult.changed
        ? `Pi is configured to use LLMR (config ${wrapperResult.configFile}, wrapper ${wrapperResult.file}).`
        : "Pi config already matches LLMR.",
      ok: true,
      path: wrapperResult.configFile
    };
  } catch (error) {
    return {
      client: "pi",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: wrapperFile
    };
  }
}

function applyOpenCodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const configFile = resolveOpenCodeConfigFile(CONFIGDIR, profile);
  if (!profile.enabled) {
    return disabledProfileStatus(profile, config.profile.profiles);
  }

  try {
    const configResult = writeOpenCodeGatewayConfig(CONFIGDIR, config, profile, token, {
      backup: true,
      write: isGlobalProfile(profile) ? writeGlobalProviderJsonConfig("opencode") : undefined
    });
    const wrapperResult = writeOpenCodeWrapper(profile, configResult.file, configResult.inlineConfig);
    return {
      appliedAt,
      backupFile: configResult.backupFile,
      client: "opencode",
      enabled: true,
      message: configResult.changed || wrapperResult.changed
        ? `OpenCode is configured to use LLMR (config ${configResult.file}, wrapper ${wrapperResult.file}).`
        : "OpenCode config already matches LLMR.",
      ok: true,
      path: configResult.file
    };
  } catch (error) {
    return {
      client: "opencode",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function applyKiloProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const configFile = resolveKiloConfigFile(CONFIGDIR, profile);
  if (!profile.enabled) {
    return disabledProfileStatus(profile, config.profile.profiles);
  }

  try {
    const configResult = writeKiloGatewayConfig(CONFIGDIR, config, profile, token, {
      backup: true,
      write: isGlobalProfile(profile) ? writeGlobalProviderJsonConfig("kilo") : undefined
    });
    const wrapperResult = writeKiloWrapper(profile, configResult.file, configResult.inlineConfig);
    return {
      appliedAt,
      backupFile: configResult.backupFile,
      client: "kilo",
      enabled: true,
      message: configResult.changed || wrapperResult.changed
        ? `Kilo CLI is configured to use LLMR (config ${configResult.file}, wrapper ${wrapperResult.file}).`
        : "Kilo CLI config already matches LLMR.",
      ok: true,
      path: configResult.file
    };
  } catch (error) {
    return {
      client: "kilo",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function applyZcodeProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const configFile = resolveZcodeConfigFile(profile);
  if (!profile.enabled) {
    return restoreDisabledZcodeProfile(profile, configFile);
  }

  try {
    const providerId = sanitizeCodexProviderId(profile.providerId || "") || "llm-router";
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const configResult = writeZcodeGatewayConfig(config, profile, token, {
      backup: true,
      isManagedContent: (content) => isManagedZcodeConfigContent(content, providerId)
    });
    const middlewareResult = profile.cliMiddleware
      ? writeCodexCliMiddleware(config, profile, {
          configFile,
          configFormat: normalizeCodexConfigFormat(profile.configFormat),
          model,
          modelCatalogFile: zcodeMiddlewareModelCatalogFile(configFile),
          providerId
        })
      : undefined;
    const changed = configResult.changed || Boolean(middlewareResult?.changed);
    const extras = [
      middlewareResult?.file ? `middleware ${middlewareResult.file}` : ""
    ].filter(Boolean);
    return {
      appliedAt,
      backupFile: configResult.backupFile,
      client: "zcode",
      enabled: true,
      message: changed
        ? `ZCode config is managed by LLMR${extras.length ? ` (${extras.join(", ")})` : ""}.`
        : "ZCode config already matches LLMR.",
      ok: true,
      path: configResult.file
    };
  } catch (error) {
    return {
      client: "zcode",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: configFile
    };
  }
}

function profileEntries(config: AppConfig): ProfileConfig[] {
  const profiles = enforceSingleEnabledGlobalProfilePerAgent(config.profile.profiles);
  if (config.profile.enabled !== false) {
    return profiles;
  }
  return profiles.map((profile) => profile.enabled ? { ...profile, enabled: false } : profile);
}

export async function reconcileProfileApiKeys(config: AppConfig): Promise<ProfileClientApplyStatus[]> {
  if (appConfigLoadError(config)) {
    return [];
  }
  const profiles = profileEntries(config);
  const released = await enqueueApply(() => releaseDisabledProfileKeys(config, profiles));
  // Most callers drop the statuses, so a failed restore is logged here or nowhere.
  warnProfileApplyFailures({ clients: released });
  if (hasAvailableGatewayModels(config)) {
    await ensureProfileApiKeys(config, profiles);
  }
  return released;
}

async function ensureProfileApiKeys(config: AppConfig, profiles: ProfileConfig[]): Promise<Map<string, string>> {
  let tokens = new Map<string, string>();
  config.APIKEYS = await updatePersistedApiKeys((current) => {
    const result = syncProfileApiKeys(current, profiles);
    tokens = result.tokens;
    return result.apiKeys;
  });
  config.APIKEY = config.APIKEYS[0]?.key ?? "";
  return tokens;
}

// Several passes of one save can touch one file, and the person is told about each file once: a failure first, then an apply, then a change.
export function mergeProfileStatuses(statuses: ProfileClientApplyStatus[]): ProfileClientApplyStatus[] {
  const groups = new Map<string, ProfileClientApplyStatus[]>();
  for (const status of statuses) {
    const resolved = resolveUserPath(status.path);
    const key = `${status.client}\0${process.platform === "win32" ? resolved.toLowerCase() : resolved}`;
    groups.set(key, [...(groups.get(key) ?? []), status]);
  }
  return [...groups.values()].map((group) => {
    const kept = group.find((status) => !status.ok) ?? group.find((status) => status.enabled) ?? group.find((status) => status.changed) ?? group[0];
    const named = kept.copy ? undefined : group.find((status) => status.copy);
    return named ? { ...kept, copy: named.copy, message: withSentence(kept.message, `LLMR kept a copy of what you had at ${named.copy}.`) } : kept;
  });
}

// A message can end in an error's own text, which carries no final period.
function withSentence(message: string, sentence: string): string {
  return `${message}${/[.!?]$/.test(message.trimEnd()) ? "" : "."} ${sentence}`;
}

export function warnProfileApplyFailures(result: Pick<ProfileApplyResult, "clients">, log: (line: string) => void = console.warn): void {
  for (const status of result.clients.filter((item) => !item.ok)) {
    log(`[profile:${status.client}] ${status.message}`);
  }
}

// Pruning first would leave an agent whose restore then fails pointed at LLMR with a key that answers 401.
async function releaseDisabledProfileKeys(config: AppConfig, profiles: ProfileConfig[]): Promise<ProfileClientApplyStatus[]> {
  const keys = new Map((await loadPersistedApiKeys()).map((apiKey) => [apiKey.id, apiKey.key]));
  const statuses: ProfileClientApplyStatus[] = [];
  const holders: ProfileConfig[] = [];
  for (const profile of profiles) {
    const id = profileApiKeyId(profile);
    if (profile.enabled || !keys.has(id) || !isGlobalProfile(profile) || enabledOwnerOfFile(profile, profiles)) {
      continue;
    }
    let status: ProfileClientApplyStatus;
    try {
      status = disabledProfileStatus(profile, profiles);
    } catch (error) {
      status = failedRestoreStatus(profile.agent, profilePath(profile), error);
    }
    if (!mayRevokeProfileKey(profile, status, keys.get(id))) {
      holders.push({ ...profile, enabled: true });
      status = { ...status, message: withSentence(status.message, "LLMR kept this profile's API key working, because the agent may still hold it.") };
    }
    statuses.push(status);
  }
  config.APIKEYS = await updatePersistedApiKeys((current) =>
    pruneInactiveProfileApiKeysFromList(current, [...profiles, ...holders]).apiKeys
  );
  config.APIKEY = config.APIKEYS[0]?.key ?? "";
  return statuses;
}

function enabledOwnerOfFile(profile: ProfileConfig, profiles: ProfileConfig[]): ProfileConfig | undefined {
  const file = profilePath(profile);
  return profiles.find((other) =>
    configFamily(other.agent) === configFamily(profile.agent) &&
    isEnabledGlobalProfile(other) &&
    sameFile(profilePath(other), file)
  );
}

// Agents of one family write one config format, so a profile of each can share a file.
function configFamily(agent: ProfileClientKind): ProfileClientKind {
  return isCodexFamily(agent) ? "codex" : agent === "kilo" ? "opencode" : agent;
}

// A linked folder gives one file two paths. A file that does not exist yet is found through its folder.
function sameFile(a: string, b: string): boolean {
  return canonicalFileKey(a) === canonicalFileKey(b);
}

function canonicalFileKey(file: string): string {
  const resolved = path.resolve(resolveUserPath(file));
  try {
    return normalizedFileKey(realpathSync(resolved));
  } catch {
    try {
      return normalizedFileKey(path.join(realpathSync(path.dirname(resolved)), path.basename(resolved)));
    } catch {
      return normalizedFileKey(resolved);
    }
  }
}

// Workbuddy writes Codex's config format, so a Codex and a Workbuddy profile can share one config.toml.
function isCodexFamily(agent: ProfileClientKind): boolean {
  return agent === "codex" || agent === "workbuddy";
}

function sharedWithEnabledProfile(profiles: ProfileConfig[], agent: ProfileClientKind, file: string): boolean {
  return profiles.some((profile) => configFamily(profile.agent) === configFamily(agent) && isEnabledGlobalProfile(profile) && sameFile(profilePath(profile), file));
}

// After a failed restore the agent can still hold the key, and revoking it would leave the agent with a dead one.
// Only Codex keeps its key in the config file itself, so only there can a failure after that file was settled be told apart.
function mayRevokeProfileKey(profile: ProfileConfig, status: ProfileClientApplyStatus, token: string | undefined): boolean {
  return status.ok || (profile.agent === "codex" && Boolean(token) && !fileMayHold(profilePath(profile), token ?? ""));
}

function profilePath(profile: ProfileConfig): string {
  return profile.agent === "claude-code"
    ? resolveClaudeCodeSettingsFile(profile)
    : profile.agent === "grok"
      ? grokWrapperPath(profile)
      : profile.agent === "kimi"
        ? kimiWrapperPath(profile)
        : profile.agent === "pi"
          ? piModelsFile(profile)
          : profile.agent === "opencode"
            ? resolveOpenCodeConfigFile(CONFIGDIR, profile)
            : profile.agent === "kilo"
              ? resolveKiloConfigFile(CONFIGDIR, profile)
              : resolveCodexConfigFile(profile);
}

function resolveClaudeCodeSettingsFile(profile: ProfileConfig): string {
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(llmrManagedProfileDir(profile), "claude", "settings.json");
  }
  return resolveUserPath(profile.settingsFile || "~/.claude/settings.json");
}

function claudeCodeToolHubMcpConfigFile(profile: ProfileConfig): string {
  return path.join(llmrManagedProfileDir(profile), "claude", "toolhub-mcp.json");
}

function claudeCodeProfileSettingsStateFile(profile: ProfileConfig): string {
  return path.join(llmrManagedProfileDir(profile), "claude", "settings-state.json");
}

type ClaudeCodeProfileSettingsState = {
  displacedEnv: Record<string, string>;
  endpoints: string[];
  envKeys: string[];
  globalConfigCacheSha256?: string;
  // The user's file had an env block when the takeover began, so one the strip empties stays, as `{}`.
  hadEnv?: true;
  paths: string[];
  // A restore gave settingsFile back and no apply has taken it over since.
  restored?: true;
  settingsFile?: string;
};

function readClaudeCodeProfileSettingsState(profile: ProfileConfig): ClaudeCodeProfileSettingsState {
  return readClaudeCodeSettingsStateFile(claudeCodeProfileSettingsStateFile(profile));
}

function readClaudeCodeSettingsStateFile(file: string): ClaudeCodeProfileSettingsState {
  const state = readStateJson(file);
  const paths = Array.isArray(state.paths)
    ? state.paths.filter((item): item is string => typeof item === "string")
    : [];
  const envKeys = Array.isArray(state.envKeys)
    ? state.envKeys.filter((item): item is string => typeof item === "string")
    : [];
  const endpoints = Array.isArray(state.endpoints)
    ? state.endpoints.filter((item): item is string => typeof item === "string")
    : [];
  return {
    displacedEnv: Object.fromEntries(stringRecord(state.displacedEnv)),
    endpoints: uniqueStrings(endpoints),
    envKeys: uniqueStrings(envKeys),
    ...(typeof state.globalConfigCacheSha256 === "string" ? { globalConfigCacheSha256: state.globalConfigCacheSha256 } : {}),
    ...(state.hadEnv === true ? { hadEnv: true } : {}),
    paths: uniquePathStrings(paths),
    ...(state.restored === true ? { restored: true } : {}),
    ...(typeof state.settingsFile === "string" ? { settingsFile: state.settingsFile } : {})
  };
}

// What of the user's an apply overwrites or deletes, so release can put it back: their provider, auth, base-URL, proxy and model env, and whether they had an env block.
function claudeCodeDisplacedSettings(
  currentSettings: Record<string, unknown>,
  stored: Pick<ClaudeCodeProfileSettingsState, "displacedEnv" | "endpoints" | "hadEnv">,
  endpoint: string
): Pick<ClaudeCodeProfileSettingsState, "displacedEnv" | "hadEnv"> {
  // On record the file is LLMR's until a restore releases it, so what the user removed from it since is still owed, and what is in it now may be LLMR's.
  if (stored.endpoints.length > 0) {
    return { displacedEnv: stored.displacedEnv, hadEnv: stored.hadEnv };
  }
  const env = Object.fromEntries(stringRecord(currentSettings.env));
  const routerWif = env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId;
  const gatewayKeyHeader = typeof env[claudeCodeCustomHeadersEnvKey] === "string" &&
    claudeCodeCustomHeadersWithoutGatewayKey(env[claudeCodeCustomHeadersEnvKey]) !== env[claudeCodeCustomHeadersEnvKey];
  // With the record lost, three alike base URLs are LLMR's only beside a mark each auth mode writes: the helper, the federation rule or the key header.
  if (
    claudeCodeGatewayEnvKeys.some((key) => env[key] === endpoint) ||
    (isClaudeCodeGatewayTakeoverEnv(env) && (isManagedClaudeCodeApiKeyHelper(currentSettings.apiKeyHelper) || routerWif || gatewayKeyHeader))
  ) {
    return { displacedEnv: {} };
  }
  const displacedEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    (claudeCodeFirstPartyProviderEnvKeys as readonly string[]).includes(key) ||
    (claudeCodeGatewayEnvKeys as readonly string[]).includes(key) ||
    (claudeCodeNoProxyEnvKeys as readonly string[]).includes(key) ||
    (claudeCodeGatewayCompatibilityEnvKeys as readonly string[]).includes(key) ||
    (!routerWif && isClaudeCodeWifEnvKey(key)) ||
    isClaudeCodeManagedModelEnvKey(key)
  ));
  return isRecord(currentSettings.env) ? { displacedEnv, hadEnv: true } : { displacedEnv };
}

// LLMR writes all three gateway keys to its endpoint; a user's own base URL rarely sets all three alike.
function isClaudeCodeGatewayTakeoverEnv(env: Record<string, unknown>): boolean {
  return claudeCodeGatewayEnvKeys.every((key) => typeof env[key] === "string" && env[key] === env.ANTHROPIC_BASE_URL);
}

function claudeCodeManagedSettingsScope(profile: ProfileConfig): ClaudeCodeProfileSettingsState {
  const profileSettings = claudeCodeProfileSettings(profile);
  delete profileSettings.env;
  const state = readClaudeCodeProfileSettingsState(profile);
  return {
    ...state,
    paths: uniquePathStrings([...state.paths, ...claudeCodeProfileSettingsPaths(profileSettings)])
  };
}

function claudeCodeManagedContent(profile: ProfileConfig): RestoreManagedContentMatchers {
  const scope = claudeCodeManagedSettingsScope(profile);
  const strip = (content: string) => stripManagedClaudeCodeSettingsContent(content, scope.envKeys, scope.paths, scope.displacedEnv, scope.endpoints, scope.hadEnv);
  return {
    contentForBackup: claudeCodeSettingsBackupContent,
    isManagedContent: (content) => isManagedClaudeCodeSettingsContent(content, scope.paths, scope.endpoints),
    onReleased: () => releaseClaudeCodeSettingsFile(resolveClaudeCodeSettingsFile(profile), [claudeCodeProfileSettingsStateFile(profile)]),
    stripManagedContent: strip,
    takeoverContent: (content) => claudeCodeTakeoverContent(content, scope.endpoints, strip)
  };
}

// Goes by the values LLMR writes, not key names: the user's own NO_PROXY or model env key is not a takeover.
// With no endpoint on record LLMR's own address cannot be told from the user's, so anything the stripper would change counts.
function claudeCodeTakeoverContent(
  content: string,
  endpoints: string[],
  strip: (content: string) => string | undefined
): TakeoverContent {
  const settings = parseJsonContent(content);
  if (!settings) {
    return "unparsed";
  }
  if (endpoints.length === 0) {
    return strip(content) === undefined ? "none" : "parsed";
  }
  const env = isRecord(settings.env) ? settings.env : {};
  return isManagedClaudeCodeApiKeyHelper(settings.apiKeyHelper) ||
    claudeCodeGatewayEnvKeys.some((key) => typeof env[key] === "string" && endpoints.includes(env[key] as string)) ||
    isClaudeCodeGatewayTakeoverEnv(env) ||
    env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId
    ? "parsed"
    : "none";
}

function hasClaudeCodeTakeoverState(state: ClaudeCodeProfileSettingsState): boolean {
  return state.endpoints.length > 0 || Object.keys(state.displacedEnv).length > 0;
}

function writeClaudeCodeSettingsStateFile(file: string, state: ClaudeCodeProfileSettingsState): { changed: boolean } {
  const content = `${JSON.stringify({
    version: 1,
    displacedEnv: state.displacedEnv,
    endpoints: state.endpoints,
    envKeys: uniqueStrings(state.envKeys),
    globalConfigCacheSha256: state.globalConfigCacheSha256,
    hadEnv: state.hadEnv,
    paths: uniquePathStrings(state.paths),
    restored: state.restored,
    settingsFile: state.settingsFile
  }, null, 2)}\n`;
  return writeGeneratedFileIfChanged(file, content, { mode: privateFileMode });
}

function claudeCodeSettingsStateFilesOf(settingsFile: string): string[] {
  return managedClaudeCodeGeneratedFiles("settings-state.json").filter((file) => {
    const state = readClaudeCodeSettingsStateFile(file);
    return state.settingsFile !== undefined && sameFile(state.settingsFile, settingsFile);
  });
}

// Every profile's record of the file is settled at once: the file is the user's again, whichever profile's restore gave it back.
// A profile with no state never took the file over, so it gets none: a flag there would hide leftovers from the sweep.
function releaseClaudeCodeSettingsFile(settingsFile: string, stateFiles: string[] = []): void {
  for (const file of new Set([...claudeCodeSettingsStateFilesOf(settingsFile), ...stateFiles.filter((stateFile) => existsSync(stateFile))])) {
    const state = readClaudeCodeSettingsStateFile(file);
    writeClaudeCodeSettingsStateFile(file, { ...state, displacedEnv: {}, endpoints: [], hadEnv: undefined, restored: true, settingsFile: state.settingsFile ?? settingsFile });
  }
}

// An apply takes the file over for every profile that names it, so no older restore of another one can settle it while this record is lost.
function unsettleClaudeCodeSettingsFile(settingsFile: string): void {
  for (const file of claudeCodeSettingsStateFilesOf(settingsFile)) {
    const state = readClaudeCodeSettingsStateFile(file);
    if (state.restored) {
      writeClaudeCodeSettingsStateFile(file, { ...state, restored: undefined });
    }
  }
}

// Whatever the file holds since a restore gave it back is the user's, so no later pass with the profile off touches it until an apply takes it over again.
function isRestoredClaudeCodeSettingsFile(settingsFile: string): boolean {
  return claudeCodeSettingsStateFilesOf(settingsFile).some((file) => readClaudeCodeSettingsStateFile(file).restored);
}

// A deleted profile has no owner in the config, but its state file outlives it and still holds what its takeover displaced.
function orphanedClaudeCodeManagedContent(settingsFile: string): RestoreManagedContentMatchers | undefined {
  const states = claudeCodeSettingsStateFilesOf(settingsFile).map(readClaudeCodeSettingsStateFile).filter(hasClaudeCodeTakeoverState);
  if (states.length === 0) {
    return undefined;
  }
  const paths = uniquePathStrings(states.flatMap((state) => state.paths));
  const envKeys = uniqueStrings(states.flatMap((state) => state.envKeys));
  const endpoints = uniqueStrings(states.flatMap((state) => state.endpoints));
  const displacedEnv = Object.assign({}, ...states.map((state) => state.displacedEnv)) as Record<string, string>;
  const strip = (content: string) => stripManagedClaudeCodeSettingsContent(content, envKeys, paths, displacedEnv, endpoints, states.some((state) => state.hadEnv));
  return {
    contentForBackup: claudeCodeSettingsBackupContent,
    isManagedContent: (content) => isManagedClaudeCodeSettingsContent(content, paths, endpoints),
    onReleased: () => releaseClaudeCodeSettingsFile(settingsFile),
    stripManagedContent: strip,
    takeoverContent: (content) => claudeCodeTakeoverContent(content, endpoints, strip)
  };
}

function writeClaudeCodeToolHubMcpConfig(config: AppConfig, profile: ProfileConfig, token: string): { changed: boolean; file?: string } {
  const file = claudeCodeToolHubMcpConfigFile(profile);
  const entryPath = path.join(CONFIGDIR, "bin", TOOL_HUB_MCP_RUNTIME_FILE_NAME);
  const toolHubMcpConfig = toolHubClaudeCodeMcpConfig(config, {
    entryPath,
    resolver: {
      apiKey: token,
      baseUrl: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
      model: toolHubResolverModel(config)
    }
  });
  const contextArchiveMcpConfig = claudeCodeContextArchiveMcpConfig(config, profile, token);
  const mcpServers = {
    ...(toolHubMcpConfig?.mcpServers ?? {}),
    ...(contextArchiveMcpConfig ? { [CONTEXT_ARCHIVE_MCP_SERVER_NAME]: contextArchiveMcpConfig } : {})
  };
  const mcpConfig = Object.keys(mcpServers).length > 0 ? { mcpServers } : undefined;
  if (!mcpConfig) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
      return { changed: true };
    }
    return { changed: false };
  }

  const runtimeResult = toolHubMcpConfig ? ensureToolHubMcpRuntimeFile(entryPath) : { changed: false };
  const writeResult = writeGeneratedFileIfChanged(file, `${JSON.stringify(mcpConfig, null, 2)}\n`, { mode: privateFileMode });
  return { changed: runtimeResult.changed || writeResult.changed, file };
}

function claudeCodeContextArchiveMcpConfig(config: AppConfig, profile: ProfileConfig, token: string): ClaudeCodeMcpServerConfig | undefined {
  const contextArchiveConfig = contextArchiveConfigForProfile(config, profile);
  if (!contextArchiveConfig) {
    return undefined;
  }
  const server = contextArchiveMcpServer(contextArchiveConfig, gatewayEndpoint(config), token);
  if (!server || !("url" in server)) {
    return undefined;
  }
  const headers = {
    ...(server.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  return {
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    type: "http",
    url: server.url
  };
}

function codexContextArchiveMcpConfig(config: AppConfig, profile: ProfileConfig, token: string): CodexContextArchiveMcpConfig | undefined {
  const contextArchiveConfig = contextArchiveConfigForProfile(config, profile);
  if (!contextArchiveConfig) {
    return undefined;
  }
  const server = contextArchiveMcpServer(contextArchiveConfig, gatewayEndpoint(config), token);
  if (!server || !("url" in server)) {
    return undefined;
  }
  const headers = {
    ...(server.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  return {
    headers,
    requestTimeoutMs: server.requestTimeoutMs,
    startupTimeoutMs: server.startupTimeoutMs,
    url: server.url
  };
}

function writeCodexToolHubMcpRuntimeConfig(config: AppConfig, token: string): { changed: boolean; file?: string; runtime?: ToolHubMcpRuntimeConfig } {
  const entryPath = path.join(CONFIGDIR, "bin", TOOL_HUB_MCP_RUNTIME_FILE_NAME);
  const runtime = toolHubMcpRuntimeConfig(config, undefined, {
    entryPath,
    resolver: {
      apiKey: token,
      baseUrl: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
      model: toolHubResolverModel(config)
    }
  });
  if (!runtime) {
    return { changed: false };
  }

  const runtimeResult = ensureToolHubMcpRuntimeFile(entryPath);
  return {
    changed: runtimeResult.changed,
    file: entryPath,
    runtime
  };
}

function ensureToolHubMcpRuntimeFile(file: string): { changed: boolean } {
  const source = bundledToolHubMcpEntryPathCandidates().find((candidate) => existsSync(candidate));
  if (!source) {
    throw new Error(`ToolHub MCP runtime was not found. Rebuild or reinstall LLMR and try again. Checked: ${bundledToolHubMcpEntryPathCandidates().join(", ")}`);
  }
  return writeGeneratedFileIfChanged(file, readFileSync(source, "utf8"), { mode: publicExecutableMode });
}

function resolveCodexConfigFile(profile: ProfileConfig): string {
  if (profile.agent === "zcode") {
    return resolveZcodeConfigFile(profile);
  }
  if (isGeneratedProfileScope(profile.scope)) {
    return path.join(llmrManagedProfileDir(profile), codexConfigSubdir(profile.agent), "config.toml");
  }
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return resolveUserPath(profile.configFile || defaultCodexConfigFile(profile.agent));
}

function codexModelCatalogFile(configFile: string): string {
  return path.join(path.dirname(configFile), "llmr-model-catalog.json");
}

function zcodeMiddlewareModelCatalogFile(configFile: string): string {
  return path.join(path.dirname(configFile), "llmr-zcode-middleware-model-catalog.json");
}

function llmrManagedProfileDir(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent);
  const baseDir = path.join(CONFIGDIR, "profiles", slug || "profile");
  return profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir;
}

function buildCodexConfigToml(
  source: string,
  values: {
    baseUrl: string;
    contextArchiveMcp?: CodexContextArchiveMcpConfig;
    modelCatalogFile: string;
    configFormat: "legacy" | "separate_profile_files";
    model: string;
    providerId: string;
    providerName: string;
    managedWithoutRecord?: boolean;
    previous?: CodexWrittenLines;
    showAllSessions: boolean;
    token: string;
    toolHubMcp?: ToolHubMcpRuntimeConfig;
  }
): { content: string; written: CodexWrittenLines } {
  let content = removeManagedMarkerLines(source);
  content = removeCodexProviderTable(content, values.providerId);
  content = removeCodexMcpServerTable(content, TOOL_HUB_MCP_SERVER_NAME, { includeChildTables: !values.toolHubMcp });
  content = removeCodexMcpServerTable(content, CONTEXT_ARCHIVE_MCP_SERVER_NAME, { includeChildTables: !values.contextArchiveMcp });
  if (values.configFormat === "separate_profile_files") {
    content = removeTomlTable(content, "profiles", values.providerId);
  }

  const firstTableIndex = firstCodexTableIndex(content);
  const rootSource = firstTableIndex === -1 ? content : content.slice(0, firstTableIndex);
  const restSource = firstTableIndex === -1 ? "" : content.slice(firstTableIndex);
  const rootLines = decideCodexRootLines({
    configuredModel: values.model,
    currentModelLine: rootTomlAssignment(rootSource, "model"),
    currentShowAllSessionsLine: rootTomlAssignment(rootSource, "show_all_sessions"),
    managedWithoutRecord: values.managedWithoutRecord,
    previous: values.previous,
    showAllSessionsInManagedBlock: isRootKeyInsideManagedBlock(source, "show_all_sessions"),
    previousConfiguredModel: managedConfiguredModel(rootSource),
    showAllSessions: values.showAllSessions
  });
  const cleanedRoot = removeManagedConfiguredModelLine(removeRootTomlKeys(
    rootSource,
    ["model", "model_catalog_json", "model_provider", "show_all_sessions"]
  ));
  const rootBlock = [
    managedRootStart,
    `model_provider = ${tomlString(values.providerId)}`,
    rootLines.modelLine,
    `model_catalog_json = ${tomlString(values.modelCatalogFile)}`,
    `${managedConfiguredModelPrefix}${tomlString(values.model)}`,
    ...(rootLines.showAllSessionsLine ? [rootLines.showAllSessionsLine] : []),
    managedRootEnd,
    ""
  ].join("\n");
  const providerBlock = [
    "",
    managedProviderStart,
    `[model_providers.${tomlKey(values.providerId)}]`,
    `name = ${tomlString(values.providerName)}`,
    `base_url = ${tomlString(values.baseUrl)}`,
    `experimental_bearer_token = ${tomlString(values.token)}`,
    'wire_api = "responses"',
    managedProviderEnd,
    ""
  ].join("\n");
  const toolHubMcpBlock = buildCodexToolHubMcpBlock(values.toolHubMcp);
  const contextArchiveMcpBlock = buildCodexContextArchiveMcpBlock(values.contextArchiveMcp);

  return {
    content: collapseBlankStatements(`${rootBlock}${trimLeadingBlankLines(cleanedRoot)}${restSource}${providerBlock}${toolHubMcpBlock}${contextArchiveMcpBlock}`),
    written: rootLines.written
  };
}

// `record` describes the file being replaced, not the one being written.
function writeGlobalCodexConfig(file: string, content: string, providerId: string, record: CodexWrittenRecord | undefined): { backupFile?: string; changed: boolean } {
  return writeGlobalManagedConfig(
    file,
    content,
    codexManagedContent("codex", [providerId], file),
    (previous, snapshot) => stripManagedCodexConfigContent(previous, [providerId], record, readCodexDisplacedConfig(snapshot ?? "", [providerId])),
    (previous) => isAsWritten(record, previous)
  );
}

function writeGlobalProviderJsonConfig(client: ProviderJsonClient): (file: string, content: string) => { backupFile?: string; changed: boolean } {
  return (file, content) => {
    const matchers = providerJsonManagedContent(client);
    const source = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    const result = writeGlobalManagedConfig(
      file,
      content,
      matchers,
      (previous, snapshot) => stripManagedProviderJsonContent(previous, { client }, snapshot),
      (previous) => isAsWritten(readCodexWrittenRecord(file), previous)
    );
    writeConfigRecord(file, source, source !== undefined && matchers.isManagedContent(source));
    return result;
  };
}

// After the file, unlike Codex's: a crash between the two leaves the old record, which no longer matches the file, so the next restore treats it as edited.
function writeConfigRecord(file: string, source: string | undefined, sourceManaged: boolean): void {
  // A record beside a file with nothing of LLMR's in it is left over from an earlier takeover.
  const previous = sourceManaged ? readCodexWrittenRecord(file) : undefined;
  const recordFile = codexWrittenRecordFile(file);
  mkdirSync(path.dirname(recordFile), { recursive: true });
  writeFileAtomic(recordFile, `${JSON.stringify({
    edited: previous ? previous.edited || sha256Hex(source ?? "") !== previous.sha256 : sourceManaged,
    file: normalizedFileKey(file),
    sha256: sha256Hex(readFileSync(file, "utf8"))
  } satisfies CodexWrittenRecord, null, 2)}\n`, { mode: privateFileMode });
}

function writeGlobalManagedConfig(
  file: string,
  content: string,
  matchers: RestoreManagedContentMatchers,
  stripPrevious: (previous: string, snapshot: string | undefined) => string | undefined,
  asWritten: (previous: string) => boolean
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodFileIfRequested(file, privateFileMode);
    return { changed: false };
  }
  const managed = previous !== undefined && matchers.isManagedContent(previous);
  if (!managed) {
    // A file LLMR already manages is nobody's original, and a copy of it would hold the token.
    ensureOriginalSnapshot(file, previous, privateFileMode, previous === undefined ? undefined : matchers.stripManagedContent?.(previous));
  }
  const noOriginal = existsSync(originalMissingFilePath(file)) && !existsSync(originalBackupFilePath(file));
  // With no original, what is left of a managed file after a strip would pass for the user's original at the next restore and be written back.
  // A managed file that is as LLMR wrote it holds nothing the snapshot lacks.
  let backupFile: string | undefined;
  if (previous !== undefined && !(managed && (noOriginal || asWritten(previous)))) {
    let snapshot: string | undefined;
    let snapshotRead = true;
    try {
      snapshot = originalSnapshotCandidate(file, matchers, noOriginal ? matchers.stripManagedContent : undefined)?.content;
    } catch (error) {
      // A snapshot that cannot be read must not stop the apply. A backup made without the user's displaced lines would be chosen over the original at the next restore, so what the file held goes to a safety copy, which no restore reads.
      console.error(`Failed to read the saved original of ${resolveUserPath(file)}: ${formatError(error)}`);
      snapshotRead = false;
      saveConfigSafetyCopy(file, previous);
    }
    if (snapshotRead) {
      const kept = managed
        ? stripPrevious(previous, snapshot)
        : matchers.stripManagedContent?.(previous) ?? previous;
      // A backup equal to the snapshot a restore would choose adds nothing.
      if (kept !== undefined && kept !== snapshot && !(managed && (matchers.isEmptyContent ?? isEmptyConfigContent)(kept))) {
        backupFile = backupContent(file, kept, { isManagedContent: matchers.isManagedContent, mode: privateFileMode });
      }
    }
  }
  writeFileAtomic(file, content, { mode: privateFileMode });
  return { backupFile, changed: true };
}

function isAsWritten(record: CodexWrittenRecord | undefined, content: string): boolean {
  return record !== undefined && !record.edited && record.sha256 === sha256Hex(content);
}

function codexWrittenRecordFile(file: string): string {
  const key = createHash("sha256").update(normalizedFileKey(file)).digest("hex").slice(0, 16);
  return path.join(CONFIGDIR, "agent-config-state", key, "written.json");
}

// Anything that is not a whole record for this file is no record: a wrong guess here would name a user's line as LLMR's.
function readCodexWrittenRecord(file: string): CodexWrittenRecord | undefined {
  const record = readJsonObject(codexWrittenRecordFile(file));
  const optionalLine = (value: unknown) => value === undefined || typeof value === "string";
  return typeof record.edited === "boolean" &&
    record.file === normalizedFileKey(file) &&
    typeof record.sha256 === "string" &&
    optionalLine(record.modelLine) &&
    optionalLine(record.showAllSessionsLine)
    ? record as CodexWrittenRecord
    : undefined;
}

function clearCodexWrittenRecord(file: string): void {
  try {
    rmSync(codexWrittenRecordFile(file), { force: true });
  } catch {
    // The restore has already happened and must not be reported as failed. A record left behind is ignored once the file holds nothing of LLMR's.
  }
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildCodexToolHubMcpBlock(runtime: ToolHubMcpRuntimeConfig | undefined): string {
  if (!runtime) {
    return "";
  }

  const serverTable = `mcp_servers.${tomlKey(TOOL_HUB_MCP_SERVER_NAME)}`;
  return [
    "",
    managedToolHubMcpStart,
    `[${serverTable}]`,
    `command = ${tomlString(runtime.command)}`,
    `args = ${tomlStringArray(runtime.args)}`,
    "",
    `[${serverTable}.env]`,
    ...Object.entries(runtime.env).map(([key, value]) => `${tomlKey(key)} = ${tomlString(value)}`),
    managedToolHubMcpEnd,
    ""
  ].join("\n");
}

function buildCodexContextArchiveMcpBlock(config: CodexContextArchiveMcpConfig | undefined): string {
  if (!config) {
    return "";
  }

  const serverTable = `mcp_servers.${tomlKey(CONTEXT_ARCHIVE_MCP_SERVER_NAME)}`;
  return [
    "",
    managedContextArchiveMcpStart,
    `[${serverTable}]`,
    `url = ${tomlString(config.url)}`,
    ...(Object.keys(config.headers).length > 0 ? [`http_headers = ${tomlInlineStringTable(config.headers)}`] : []),
    `startup_timeout_sec = ${Math.max(1, Math.ceil(config.startupTimeoutMs / 1000))}`,
    `tool_timeout_sec = ${Math.max(1, Math.ceil(config.requestTimeoutMs / 1000))}`,
    managedContextArchiveMcpEnd,
    ""
  ].join("\n");
}

function maybeWriteSeparateCodexProfileFile(
  configFile: string,
  source: string,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    model: string;
    providerId: string;
    showAllSessions: boolean;
  }
): { changed: boolean; copy?: string; file: string } | undefined {
  if (values.configFormat !== "separate_profile_files") {
    return undefined;
  }
  const file = path.join(path.dirname(configFile), `${values.providerId}.config.toml`);
  const moved = codexProfileTableBody(source, values.providerId);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  // The writer takes the user's `[profiles.<provider>]` table out of config.toml on every apply. One written while this file exists is their newest word, so it replaces what they had here, whole. Folding the two together means editing TOML line by line, which three attempts each got wrong for some input.
  const next = buildSeparateCodexProfileToml(moved || existing, values);
  // Compared as the user's content of each file, because the writer puts `model` first and `moved` would differ on every apply.
  const usersContent = codexProfileFileUsersContent(existing, values.providerId);
  let copy: string | undefined;
  if (moved && usersContent && usersContent !== codexProfileFileUsersContent(next, values.providerId)) {
    copy = saveConfigSafetyCopy(file, existing);
    console.warn(`[profiles] The [profiles.${values.providerId}] table added to ${resolveUserPath(configFile)} replaced your settings in ${resolveUserPath(file)}. The earlier ones are at ${copy}.`);
  }
  const writeResult = writeFileWithBackup(file, next, { mode: privateFileMode });
  return {
    changed: writeResult.changed,
    copy,
    file
  };
}

function buildSeparateCodexProfileToml(
  source: string,
  values: {
    model: string;
    providerId: string;
    showAllSessions: boolean;
  }
): string {
  const firstTableIndex = firstCodexTableIndex(source);
  const rootSource = firstTableIndex === -1 ? source : source.slice(0, firstTableIndex);
  let restSource = firstTableIndex === -1 ? "" : source.slice(firstTableIndex);
  restSource = removeCodexMcpServerTable(restSource, TOOL_HUB_MCP_SERVER_NAME, { includeChildTables: true });
  restSource = removeCodexMcpServerTable(restSource, CONTEXT_ARCHIVE_MCP_SERVER_NAME, { includeChildTables: true });
  const modelAssignment = managedModelAssignment(rootSource, values.model);
  const showAllSessionsAssignment = rootTomlAssignment(rootSource, "show_all_sessions")
    ?? (values.showAllSessions ? "show_all_sessions = true" : undefined);
  const cleanedRoot = removeManagedConfiguredModelLine(removeRootTomlKeys(
    rootSource,
    ["model", "model_provider", "show_all_sessions"]
  ));
  const rootBlock = [
    `model_provider = ${tomlString(values.providerId)}`,
    modelAssignment,
    `${managedConfiguredModelPrefix}${tomlString(values.model)}`,
    ...(showAllSessionsAssignment ? [showAllSessionsAssignment] : []),
    ""
  ].join("\n");
  return ensureTrailingNewline(collapseBlankStatements(`${rootBlock}${trimLeadingBlankLines(cleanedRoot)}${restSource}`));
}

function claudeCodeNextSettings(
  settings: Record<string, unknown>,
  profileSettings: Record<string, unknown>,
  env: Record<string, string>,
  authMode: ClaudeCodeGatewayAuthMode,
  apiKeyHelperFile: string | undefined
): Record<string, unknown> {
  const mergedSettings = mergeClaudeCodeSettings(settings, profileSettings);
  if (authMode === "api-key-helper" && apiKeyHelperFile) {
    return {
      ...mergedSettings,
      apiKeyHelper: process.platform === "win32" ? `"${apiKeyHelperFile}"` : apiKeyHelperFile,
      env
    };
  }
  return {
    ...withoutManagedClaudeCodeApiKeyHelper(mergedSettings),
    env
  };
}

function claudeCodeProfileSettings(
  profile: ProfileConfig,
  authMode = resolveClaudeCodeGatewayAuthMode(profile)
): Record<string, unknown> {
  return withoutClaudeCodeApiKeyHelperAuthConflicts(sanitizeClaudeCodeJsonObject(profile.claudeSettings), authMode);
}

function withoutClaudeCodeApiKeyHelperAuthConflicts(
  settings: Record<string, unknown>,
  authMode: ClaudeCodeGatewayAuthMode
): Record<string, unknown> {
  if (authMode !== "api-key-helper" || settings.autoMode !== true) {
    return settings;
  }
  const compatibleSettings = { ...settings };
  delete compatibleSettings.autoMode;
  return compatibleSettings;
}

function sanitizeClaudeCodeJsonObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const item = sanitizeClaudeCodeJsonValue(rawValue);
    if (item !== undefined) {
      result[key] = item;
    }
  }
  return result;
}

function sanitizeClaudeCodeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map(sanitizeClaudeCodeJsonValue)
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    return sanitizeClaudeCodeJsonObject(value);
  }
  return undefined;
}

function mergeClaudeCodeSettings(
  settings: Record<string, unknown>,
  profileSettings: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...settings };
  for (const [key, value] of Object.entries(profileSettings)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value)
      ? mergeClaudeCodeSettings(current, value)
      : value;
  }
  return merged;
}

function removeClaudeCodeProfileSettings(
  settings: Record<string, unknown>,
  previousPaths: string[],
  currentPaths: string[]
): Record<string, unknown> {
  const currentPathSet = new Set(currentPaths);
  const removedPaths = previousPaths.filter((item) => !currentPathSet.has(item));
  if (removedPaths.length === 0) {
    return settings;
  }

  const next = cloneJsonObject(settings);
  for (const item of removedPaths) {
    deleteJsonPath(next, parseClaudeCodeSettingsPath(item));
  }
  return next;
}

function removeClaudeCodeProfileEnv(
  env: Record<string, string>,
  previousKeys: string[],
  currentKeys: string[]
): Record<string, string> {
  const currentKeySet = new Set(currentKeys);
  const removedKeys = previousKeys.filter((key) => !currentKeySet.has(key));
  if (removedKeys.length === 0) {
    return env;
  }
  const next = { ...env };
  for (const key of removedKeys) {
    delete next[key];
  }
  return next;
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function claudeCodeProfileSettingsPaths(settings: Record<string, unknown>): string[] {
  return uniquePathStrings(collectClaudeCodeSettingsPaths(settings));
}

function collectClaudeCodeSettingsPaths(value: unknown, parent: string[] = []): string[] {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return parent.length ? [formatClaudeCodeSettingsPath(parent)] : [];
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const nextParent = [...parent, key];
    if (isRecord(item) && Object.keys(item).length > 0) {
      return collectClaudeCodeSettingsPaths(item, nextParent);
    }
    return [formatClaudeCodeSettingsPath(nextParent)];
  });
}

function formatClaudeCodeSettingsPath(pathParts: string[]): string {
  return pathParts.join(".");
}

function parseClaudeCodeSettingsPath(value: string): string[] {
  return value.split(".").map((part) => part.trim()).filter(Boolean);
}

function uniquePathStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = formatClaudeCodeSettingsPath(parseClaudeCodeSettingsPath(value));
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function deleteJsonPath(target: Record<string, unknown>, pathParts: string[]): boolean {
  if (pathParts.length === 0) {
    return false;
  }
  const [key, ...rest] = pathParts;
  if (!key || !hasOwn(target, key)) {
    return false;
  }
  if (rest.length === 0) {
    delete target[key];
    return true;
  }
  const child = target[key];
  if (!isRecord(child)) {
    return false;
  }
  const changed = deleteJsonPath(child, rest);
  if (changed && Object.keys(child).length === 0) {
    delete target[key];
  }
  return changed;
}

function writeClaudeCodeWifIdentityToken(profile: ProfileConfig, token: string): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const file = path.join(binDir, claudeCodeWifIdentityTokenFilename(profile));
  const writeResult = writeGeneratedFileIfChanged(file, `${token}\n`, { mode: privateFileMode });
  return {
    changed: writeResult.changed,
    file
  };
}

function claudeCodeWifIdentityTokenFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `llmr-claude-code-wif-token-${slug}.txt`
    : `llmr-claude-code-wif-token-${slug}`;
}

function writeClaudeCodeApiKeyHelper(profile: ProfileConfig, token: string): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const file = path.join(binDir, claudeCodeLegacyApiKeyHelperFilename(profile));
  const content = process.platform === "win32"
    ? claudeCodeApiKeyHelperCmdScript(token)
    : claudeCodeApiKeyHelperShellScript(token);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return {
    changed: writeResult.changed,
    file
  };
}

function cleanupClaudeCodeLegacyApiKeyHelper(profile: ProfileConfig): { changed: boolean } {
  const file = path.join(CONFIGDIR, "bin", claudeCodeLegacyApiKeyHelperFilename(profile));
  if (!existsSync(file)) {
    return { changed: false };
  }
  rmSync(file, { force: true });
  return { changed: true };
}

function claudeCodeLegacyApiKeyHelperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent) || "claude-code";
  return process.platform === "win32"
    ? `llmr-claude-code-api-key-${slug}.cmd`
    : `llmr-claude-code-api-key-${slug}`;
}

function claudeCodeApiKeyHelperShellScript(token: string): string {
  return [
    "#!/bin/sh",
    `printf '%s\\n' ${shellQuote(token)}`,
    ""
  ].join("\n");
}

function claudeCodeApiKeyHelperCmdScript(token: string): string {
  return [
    "@echo off",
    `echo ${cmdValue(token)}`,
    ""
  ].join("\r\n");
}

function cleanupClaudeCodeGeneratedFiles(profile: ProfileConfig): { changed: boolean } {
  const binDir = path.join(CONFIGDIR, "bin");
  let changed = false;
  for (const fileName of [claudeCodeLegacyApiKeyHelperFilename(profile), claudeCodeWifIdentityTokenFilename(profile), claudeCodeWrapperFilename(profile)]) {
    const file = path.join(binDir, fileName);
    if (!existsSync(file)) {
      continue;
    }
    rmSync(file, { force: true });
    changed = true;
  }
  return { changed };
}

function claudeCodeWifEnv(identityTokenFile: string): Record<string, string> {
  return {
    ANTHROPIC_FEDERATION_RULE_ID: claudeCodeWifFederationRuleId,
    ANTHROPIC_IDENTITY_TOKEN_FILE: identityTokenFile,
    ANTHROPIC_ORGANIZATION_ID: claudeCodeWifOrganizationId
  };
}

function writeClaudeCodeWrapper(
  config: AppConfig,
  profile: ProfileConfig,
  auth: { remoteSyncApiKeyFile: string; wifIdentityTokenFile?: string },
  mcpConfigFile: string | undefined
): { backupFile?: string; changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = writeGeneratedFileIfChanged(runtimeFile, codexCliMiddlewareRuntimeScript(), { mode: publicExecutableMode });
  const file = path.join(binDir, claudeCodeWrapperFilename(profile));
  const content = process.platform === "win32"
    ? claudeCodeWrapperCmdScript(config, profile, runtimeFile, auth, mcpConfigFile)
    : claudeCodeWrapperShellScript(config, profile, runtimeFile, auth, mcpConfigFile);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return {
    changed: writeResult.changed || runtimeResult.changed,
    file
  };
}

function claudeCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "claude-code";
  return process.platform === "win32"
    ? `llmr-claude-code-wrapper-${slug}.cmd`
    : `llmr-claude-code-wrapper-${slug}`;
}

function claudeCodeWrapperShellScript(
  config: AppConfig,
  profile: ProfileConfig,
  runtimeFile: string,
  auth: { remoteSyncApiKeyFile: string; wifIdentityTokenFile?: string },
  mcpConfigFile: string | undefined
): string {
  const realClaude = profile.env?.LLMR_CLAUDE_CODE_BIN?.trim() || "claude";
  const surface = normalizeProfileSurface(profile.surface);
  const remoteEndpoint = `${gatewayEndpoint(config)}/__llmr/remote`;
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "LLMR_CLAUDE_CODE_BIN" && !isClaudeCodeManagedModelEnvKey(key) && !isClaudeCodeFirstPartyProviderEnvKey(key) && !isClaudeCodeWifEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const botEnvExports = shellBotGatewayEnvExports(config, profile);
  return [
    "#!/bin/sh",
    ...envExports,
    ...[...claudeCodeFirstPartyProviderEnvKeys, ...claudeCodeHomeUnsetEnvKeys(profile, resolveClaudeCodeSettingsFile(profile))].map((key) => `unset ${key}`),
    ...shellEnvExports(claudeCodeRuntimeEnv(config, profile, auth.wifIdentityTokenFile)),
    ...shellEnvExports(claudeCodeMcpConfigEnv(mcpConfigFile)),
    `: "\${LLMR_PROFILE_SURFACE:=${surface}}"`,
    "export LLMR_PROFILE_SURFACE",
    ...botEnvExports,
    `export LLMR_CLAUDE_CODE_WRAPPER=1`,
    `export LLMR_REAL_CLAUDE_CODE_BIN=${shellQuote(realClaude)}`,
    `if [ -z "\${LLMR_REMOTE_SYNC_ENABLED:-}" ]; then LLMR_REMOTE_SYNC_ENABLED=1; fi`,
    `if [ -z "\${LLMR_REMOTE_SYNC_ENDPOINT:-}" ]; then LLMR_REMOTE_SYNC_ENDPOINT=${shellQuote(remoteEndpoint)}; fi`,
    `if [ -z "\${LLMR_REMOTE_SYNC_API_KEY_FILE:-}" ]; then LLMR_REMOTE_SYNC_API_KEY_FILE=${shellQuote(auth.remoteSyncApiKeyFile)}; fi`,
    `if [ -z "\${LLMR_REMOTE_SYNC_PROFILE_ID:-}" ]; then LLMR_REMOTE_SYNC_PROFILE_ID=${shellQuote(profile.id || profile.name || "claude-code")}; fi`,
    `if [ -z "\${LLMR_REMOTE_SYNC_PROFILE_NAME:-}" ]; then LLMR_REMOTE_SYNC_PROFILE_NAME=${shellQuote(profile.name || profile.id || "Claude Code")}; fi`,
    "export LLMR_REMOTE_SYNC_ENABLED LLMR_REMOTE_SYNC_ENDPOINT LLMR_REMOTE_SYNC_API_KEY_FILE LLMR_REMOTE_SYNC_PROFILE_ID LLMR_REMOTE_SYNC_PROFILE_NAME",
    ...nodeRuntimeShellExecLines(runtimeFile),
    ""
  ].join("\n");
}

function claudeCodeWrapperCmdScript(
  config: AppConfig,
  profile: ProfileConfig,
  runtimeFile: string,
  auth: { remoteSyncApiKeyFile: string; wifIdentityTokenFile?: string },
  mcpConfigFile: string | undefined
): string {
  const realClaude = profile.env?.LLMR_CLAUDE_CODE_BIN?.trim() || "claude";
  const surface = normalizeProfileSurface(profile.surface);
  const remoteEndpoint = `${gatewayEndpoint(config)}/__llmr/remote`;
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "LLMR_CLAUDE_CODE_BIN" && !isClaudeCodeManagedModelEnvKey(key) && !isClaudeCodeFirstPartyProviderEnvKey(key) && !isClaudeCodeWifEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  const botEnvExports = cmdBotGatewayEnvExports(config, profile);
  return [
    "@echo off",
    ...envExports,
    ...[...claudeCodeFirstPartyProviderEnvKeys, ...claudeCodeHomeUnsetEnvKeys(profile, resolveClaudeCodeSettingsFile(profile))].map((key) => cmdSetLine(key, "")),
    ...cmdEnvExports(claudeCodeRuntimeEnv(config, profile, auth.wifIdentityTokenFile)),
    ...cmdEnvExports(claudeCodeMcpConfigEnv(mcpConfigFile)),
    `if not defined LLMR_PROFILE_SURFACE ${cmdSetLine("LLMR_PROFILE_SURFACE", surface)}`,
    ...botEnvExports,
    cmdSetLine("LLMR_CLAUDE_CODE_WRAPPER", "1"),
    cmdSetLine("LLMR_REAL_CLAUDE_CODE_BIN", realClaude),
    `if not defined LLMR_REMOTE_SYNC_ENABLED ${cmdSetLine("LLMR_REMOTE_SYNC_ENABLED", "1")}`,
    `if not defined LLMR_REMOTE_SYNC_ENDPOINT ${cmdSetLine("LLMR_REMOTE_SYNC_ENDPOINT", remoteEndpoint)}`,
    `if not defined LLMR_REMOTE_SYNC_API_KEY_FILE ${cmdSetLine("LLMR_REMOTE_SYNC_API_KEY_FILE", auth.remoteSyncApiKeyFile)}`,
    `if not defined LLMR_REMOTE_SYNC_PROFILE_ID ${cmdSetLine("LLMR_REMOTE_SYNC_PROFILE_ID", profile.id || profile.name || "claude-code")}`,
    `if not defined LLMR_REMOTE_SYNC_PROFILE_NAME ${cmdSetLine("LLMR_REMOTE_SYNC_PROFILE_NAME", profile.name || profile.id || "Claude Code")}`,
    ...nodeRuntimeCmdExecLines(runtimeFile),
    ""
  ].join("\r\n");
}

function writeOpenCodeWrapper(
  profile: ProfileConfig,
  configFile: string,
  inlineConfig: string
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const file = openCodeWrapperPath(profile);
  const content = process.platform === "win32"
    ? openCodeWrapperCmdScript(profile, configFile, inlineConfig)
    : openCodeWrapperShellScript(profile, configFile, inlineConfig);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return { changed: writeResult.changed, file };
}

function openCodeWrapperPath(profile: ProfileConfig): string {
  return path.join(CONFIGDIR, "bin", openCodeWrapperFilename(profile));
}

function openCodeWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "opencode";
  return process.platform === "win32"
    ? `llmr-opencode-wrapper-${slug}.cmd`
    : `llmr-opencode-wrapper-${slug}`;
}

function openCodeWrapperShellScript(profile: ProfileConfig, configFile: string, inlineConfig: string): string {
  const realOpenCode = profile.env?.LLMR_OPENCODE_BIN?.trim() || profile.env?.OPENCODE_BIN?.trim() || "opencode";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isOpenCodeManagedEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  return [
    "#!/bin/sh",
    ...envExports,
    `export OPENCODE_CONFIG=${shellQuote(configFile)}`,
    `export OPENCODE_CONFIG_CONTENT=${shellQuote(inlineConfig)}`,
    "export OPENCODE_CLIENT=cli",
    "export LLMR_PROFILE_SURFACE=cli",
    `exec ${shellQuote(realOpenCode)} "$@"`,
    ""
  ].join("\n");
}

function openCodeWrapperCmdScript(profile: ProfileConfig, configFile: string, inlineConfig: string): string {
  const realOpenCode = profile.env?.LLMR_OPENCODE_BIN?.trim() || profile.env?.OPENCODE_BIN?.trim() || "opencode";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isOpenCodeManagedEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  return [
    "@echo off",
    ...envExports,
    cmdSetLine("OPENCODE_CONFIG", configFile),
    cmdSetLine("OPENCODE_CONFIG_CONTENT", inlineConfig),
    cmdSetLine("OPENCODE_CLIENT", "cli"),
    cmdSetLine("LLMR_PROFILE_SURFACE", "cli"),
    `${cmdQuote(realOpenCode)} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function isOpenCodeManagedEnvKey(key: string): boolean {
  return key === "LLMR_OPENCODE_BIN" ||
    key === "OPENCODE_BIN" ||
    key === "OPENCODE_CLIENT" ||
    key === "OPENCODE_CONFIG" ||
    key === "OPENCODE_CONFIG_CONTENT" ||
    key === "LLMR_PROFILE_SURFACE";
}

function writeKiloWrapper(
  profile: ProfileConfig,
  configFile: string,
  inlineConfig: string
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const file = kiloWrapperPath(profile);
  const content = process.platform === "win32"
    ? kiloWrapperCmdScript(profile, configFile, inlineConfig)
    : kiloWrapperShellScript(profile, configFile, inlineConfig);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return { changed: writeResult.changed, file };
}

function kiloWrapperPath(profile: ProfileConfig): string {
  return path.join(CONFIGDIR, "bin", kiloWrapperFilename(profile));
}

function kiloWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "kilo";
  return process.platform === "win32"
    ? `llmr-kilo-wrapper-${slug}.cmd`
    : `llmr-kilo-wrapper-${slug}`;
}

function kiloWrapperShellScript(profile: ProfileConfig, configFile: string, inlineConfig: string): string {
  const realKilo = profile.env?.LLMR_KILO_BIN?.trim() || profile.env?.KILO_BIN?.trim() || "kilo";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isKiloManagedEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  return [
    "#!/bin/sh",
    ...envExports,
    `export KILO_CONFIG=${shellQuote(configFile)}`,
    `export KILO_CONFIG_CONTENT=${shellQuote(inlineConfig)}`,
    "export LLMR_PROFILE_SURFACE=cli",
    `exec ${shellQuote(realKilo)} "$@"`,
    ""
  ].join("\n");
}

function kiloWrapperCmdScript(profile: ProfileConfig, configFile: string, inlineConfig: string): string {
  const realKilo = profile.env?.LLMR_KILO_BIN?.trim() || profile.env?.KILO_BIN?.trim() || "kilo";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isKiloManagedEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  return [
    "@echo off",
    ...envExports,
    cmdSetLine("KILO_CONFIG", configFile),
    cmdSetLine("KILO_CONFIG_CONTENT", inlineConfig),
    cmdSetLine("LLMR_PROFILE_SURFACE", "cli"),
    `${cmdQuote(realKilo)} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function isKiloManagedEnvKey(key: string): boolean {
  return key === "LLMR_KILO_BIN" ||
    key === "KILO_BIN" ||
    key === "KILO_CONFIG" ||
    key === "KILO_CONFIG_CONTENT" ||
    key === "KILO_CONFIG_DIR" ||
    key === "KILO_PROVIDER" ||
    key === "LLMR_PROFILE_SURFACE";
}

function writePiWrapper(
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  defaultModel: string
): { backupFile?: string; changed: boolean; configFile: string; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const configResult = writePiGatewayConfig(CONFIGDIR, config, profile, token, defaultModel);
  const file = piWrapperPath(profile);
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = process.platform === "win32"
    ? writeGeneratedFileIfChanged(runtimeFile, codexCliMiddlewareRuntimeScript(), { mode: publicExecutableMode })
    : { changed: false };
  const content = process.platform === "win32"
    ? piWrapperCmdScript(config, profile, configResult, runtimeFile)
    : piWrapperShellScript(config, profile, configResult);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return {
    backupFile: configResult.backupFile,
    changed: configResult.changed || writeResult.changed || runtimeResult.changed,
    configFile: configResult.file,
    file
  };
}

function piModelsFile(profile: ProfileConfig): string {
  return path.join(resolvePiAgentDir(CONFIGDIR, profile), "models.json");
}

function disabledPiStatus(profile: ProfileConfig): ProfileClientApplyStatus {
  if (!isGlobalProfile(profile)) {
    return disabledStatus("pi", piWrapperPath(profile), "Pi profile is disabled.");
  }
  const providerId = piProviderId(profile);
  const file = piModelsFile(profile);
  const restoreResult = restoreGlobalConfigFile(file, {
    isManagedContent: (content) => isManagedPiModelsContent(content, providerId),
    mode: privateFileMode
  });
  return toleratingMissingBackup(
    disabledRestoreStatus("pi", file, "Pi profile is disabled.", restoreResult, profile.name || profile.id || profile.agent, false),
    restoreResult
  );
}

// An install from before backups existed has no snapshot; failing would pin the takeover marker forever.
function toleratingMissingBackup(status: ProfileClientApplyStatus, restoreResult: RestoreFileResult): ProfileClientApplyStatus {
  return restoreResult.missingBackup ? { ...status, ok: true } : status;
}

function piWrapperPath(profile: ProfileConfig): string {
  return path.join(CONFIGDIR, "bin", piWrapperFilename(profile));
}

function piWrapperShellScript(
  config: AppConfig,
  profile: ProfileConfig,
  piConfig: { model: string; profileHome: string; providerId: string; sessionDir: string }
): string {
  const realPi = profile.env?.LLMR_PI_BIN?.trim() || profile.env?.PI_BIN?.trim() || "pi";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isPiManagedEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "#!/bin/sh",
    ...envExports,
    `if [ -n "\${NO_PROXY:-}" ]; then NO_PROXY="$NO_PROXY,${noProxyHosts}"; else NO_PROXY=${shellQuote(noProxyHosts)}; fi`,
    `if [ -n "\${no_proxy:-}" ]; then no_proxy="$no_proxy,${noProxyHosts}"; else no_proxy=${shellQuote(noProxyHosts)}; fi`,
    "export NO_PROXY no_proxy",
    `export PI_CODING_AGENT_DIR=${shellQuote(piConfig.profileHome)}`,
    `export PI_CODING_AGENT_SESSION_DIR=${shellQuote(piConfig.sessionDir)}`,
    `export PI_SKIP_VERSION_CHECK=${shellQuote(profile.env?.PI_SKIP_VERSION_CHECK?.trim() || "1")}`,
    "export LLMR_PROFILE_SURFACE=cli",
    `exec ${shellQuote(realPi)} --provider ${shellQuote(piConfig.providerId)} --model ${shellQuote(piConfig.model)} "$@"`,
    ""
  ].join("\n");
}

function piWrapperCmdScript(
  config: AppConfig,
  profile: ProfileConfig,
  piConfig: { model: string; profileHome: string; providerId: string; sessionDir: string },
  runtimeFile: string
): string {
  const realPi = profile.env?.LLMR_PI_BIN?.trim() || profile.env?.PI_BIN?.trim() || "pi";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isPiManagedEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "@echo off",
    "setlocal",
    ...envExports,
    `set "NO_PROXY=%NO_PROXY%,${cmdValue(noProxyHosts)}"`,
    `set "no_proxy=%no_proxy%,${cmdValue(noProxyHosts)}"`,
    cmdSetLine("PI_CODING_AGENT_DIR", piConfig.profileHome),
    cmdSetLine("PI_CODING_AGENT_SESSION_DIR", piConfig.sessionDir),
    cmdSetLine("PI_SKIP_VERSION_CHECK", profile.env?.PI_SKIP_VERSION_CHECK?.trim() || "1"),
    cmdSetLine("LLMR_PROFILE_SURFACE", "cli"),
    cmdSetLine("LLMR_PI_WRAPPER", "1"),
    cmdSetLine("LLMR_REAL_PI_BIN", realPi),
    cmdSetLine("LLMR_PI_PROVIDER", piConfig.providerId),
    cmdSetLine("LLMR_PI_MODEL", piConfig.model),
    ...nodeRuntimeCmdExecLines(runtimeFile),
    ""
  ].join("\r\n");
}

function isPiManagedEnvKey(key: string): boolean {
  return key === "LLMR_PI_BIN" ||
    key === "PI_BIN" ||
    key === "PI_CODING_AGENT_DIR" ||
    key === "PI_CODING_AGENT_SESSION_DIR" ||
    key === "PI_SKIP_VERSION_CHECK" ||
    key === "LLMR_PROFILE_SURFACE";
}

function applyGatewayNoProxyEnv(env: Record<string, string>, config: AppConfig): void {
  const hosts = gatewayNoProxyHosts(config).split(",");
  env.NO_PROXY = mergeNoProxyHosts(env.NO_PROXY, hosts);
  env.no_proxy = mergeNoProxyHosts(env.no_proxy, hosts);
}

function applyClaudeCodeGatewayCompatibilityEnv(env: Record<string, string>): void {
  env.CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT = "1";
}

function syncClaudeCodeManagedGatewaySettings(config: AppConfig, profiles: ProfileConfig[]): void {
  const claudeProfiles = profiles.filter((profile) => profile.agent === "claude-code");
  if (claudeProfiles.length === 0) {
    return;
  }
  const files = uniqueResolvedPaths([
    "~/.claude/settings.json",
    ...claudeProfiles.map((profile) => profile.settingsFile || ""),
    ...claudeProfiles.map(resolveClaudeCodeSettingsFile),
    ...managedClaudeCodeSettingsFiles()
  ]);
  for (const file of files) {
    syncClaudeCodeManagedGatewaySettingsFile(config, file);
  }
}

function syncClaudeCodeManagedGatewaySettingsFile(config: AppConfig, file: string): void {
  if (!existsSync(file)) {
    return;
  }
  let settings: Record<string, unknown>;
  try {
    settings = readClaudeCodeSettingsObject(file);
  } catch {
    return;
  }
  if (!isRecord(settings.env)) {
    return;
  }
  const env = Object.fromEntries(stringRecord(settings.env));
  if (!isManagedClaudeCodeGatewayEnv(env, config)) {
    return;
  }
  const nextEnv = { ...env };
  for (const key of claudeCodeGatewayEnvKeys) {
    nextEnv[key] = gatewayEndpoint(config);
  }
  applyGatewayNoProxyEnv(nextEnv, config);
  applyClaudeCodeGatewayCompatibilityEnv(nextEnv);
  const nextSettings = {
    ...settings,
    env: {
      ...settings.env,
      ...nextEnv
    }
  };
  if (!claudeCodeSettingsManagedFieldsChanged(settings, nextSettings, claudeCodeManagedGatewaySyncEnvKeys())) {
    chmodFileIfRequested(file, privateFileMode);
    return;
  }
  writeFileWithBackup(file, `${JSON.stringify(nextSettings, null, 2)}\n`, {
    contentForBackup: claudeCodeSettingsBackupContent,
    isManagedContent: (content) => isManagedClaudeCodeSettingsContent(content),
    mode: privateFileMode
  });
}

function claudeCodeManagedGatewaySyncEnvKeys(): Set<string> {
  return new Set([
    ...claudeCodeGatewayEnvKeys,
    ...claudeCodeNoProxyEnvKeys,
    ...claudeCodeGatewayCompatibilityEnvKeys
  ]);
}

function isManagedClaudeCodeGatewayEnv(env: Record<string, string>, config: AppConfig): boolean {
  const endpoint = normalizeUrlForMatch(gatewayEndpoint(config));
  const baseUrl = normalizeUrlForMatch(env.ANTHROPIC_BASE_URL);
  const apiBaseUrl = normalizeUrlForMatch(env.ANTHROPIC_API_BASE_URL);
  if (baseUrl === endpoint && apiBaseUrl === endpoint) {
    return true;
  }
  return env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId &&
    env.ANTHROPIC_ORGANIZATION_ID === claudeCodeWifOrganizationId &&
    [baseUrl, apiBaseUrl, normalizeUrlForMatch(env.CLAUDE_AGENT_API_BASE_URL)].includes(endpoint);
}

function mergeNoProxyHosts(current: string | undefined, hosts: string[]): string {
  const values = [
    ...(current ?? "").split(","),
    ...hosts
  ].map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].join(",");
}

function writeCodexCliMiddleware(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  }
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const runtimeFile = path.join(binDir, codexMiddlewareRuntimeFilename());
  const runtimeResult = writeGeneratedFileIfChanged(runtimeFile, codexCliMiddlewareRuntimeScript(), { mode: publicExecutableMode });
  const file = path.join(binDir, codexMiddlewareFilename(profile, values.providerId));
  const content = process.platform === "win32"
    ? codexMiddlewareCmdScript(config, profile, values, runtimeFile)
    : codexMiddlewareShellScript(config, profile, values, runtimeFile);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return {
    changed: writeResult.changed || runtimeResult.changed,
    file
  };
}

function claudeCodeRuntimeEnv(config: AppConfig, profile: ProfileConfig, wifIdentityTokenFile?: string): Record<string, string> {
  const endpoint = gatewayEndpoint(config);
  const env: Record<string, string> = {
    ANTHROPIC_API_BASE_URL: endpoint,
    ANTHROPIC_BASE_URL: endpoint,
    CLAUDE_AGENT_API_BASE_URL: endpoint,
    ...claudeCodeHomeEnv(profile, resolveClaudeCodeSettingsFile(profile))
  };
  if (wifIdentityTokenFile) {
    Object.assign(env, claudeCodeWifEnv(wifIdentityTokenFile));
  }
  Object.assign(env, claudeCodeProfileModelEnv(config, profile));
  applyGatewayNoProxyEnv(env, config);
  applyClaudeCodeGatewayCompatibilityEnv(env);
  return env;
}

function claudeCodeProfileModelEnv(config: AppConfig, profile: ProfileConfig): Record<string, string> {
  return claudeCodeModelEnv(claudeCodeProfileModelSelection(config, profile));
}

function claudeCodeProfileModelSelection(config: AppConfig, profile: ProfileConfig): ClaudeCodeModelSelection {
  const autoCompactWindows = createClaudeCliAutoCompactWindows(config);
  return {
    fableModel: claudeCodeOneMillionContextModel(autoCompactWindows, profile.fableModel),
    haikuModel: claudeCodeOneMillionContextModel(autoCompactWindows, profile.haikuModel),
    model: claudeCodeOneMillionContextModel(autoCompactWindows, profile.model),
    opusModel: claudeCodeOneMillionContextModel(autoCompactWindows, profile.opusModel),
    smallFastModel: claudeCodeOneMillionContextModel(autoCompactWindows, profile.smallFastModel),
    sonnetModel: claudeCodeOneMillionContextModel(autoCompactWindows, profile.sonnetModel)
  };
}

function claudeCodeOneMillionContextModel(autoCompactWindows: Record<string, number>, model: string | undefined): string | undefined {
  const normalized = normalizeClaudeCodeClientModel(model);
  if (!normalized) {
    return model;
  }
  if (hasClaudeCodeOneMillionContextSuffix(normalized)) {
    return normalized;
  }
  const compactWindow = autoCompactWindows[normalized] ?? autoCompactWindows[normalized.toLowerCase()];
  return compactWindow !== undefined && compactWindow >= 1_000_000
    ? `${normalized}${claudeCodeOneMillionContextSuffix}`
    : normalized;
}

function hasClaudeCodeOneMillionContextSuffix(model: string): boolean {
  return model.trim().toLowerCase().endsWith(claudeCodeOneMillionContextSuffix);
}

function writeClaudeCodeAutoCompactWindowsCache(
  config: AppConfig,
  profile: ProfileConfig,
  settingsFile: string
): { backupFile?: string; changed: boolean; file?: string; sha256?: string } {
  const file = claudeCodeGlobalConfigFile(profile, settingsFile);
  if (!file) {
    return { changed: false };
  }
  const current = readClaudeCodeGlobalConfigObject(file);
  const autoCompactWindowsCache = createClaudeCliAutoCompactWindows(config);
  const writeResult = writeFileWithBackup(file, `${JSON.stringify({ ...current, autoCompactWindowsCache }, null, 2)}\n`, { mode: privateFileMode });
  return { ...writeResult, file, sha256: sha256Hex(JSON.stringify(autoCompactWindowsCache)) };
}

// The writer and the restore share it, so neither ever touches the account file in the home folder.
function claudeCodeGlobalConfigFile(profile: ProfileConfig, settingsFile: string): string | undefined {
  const configDir = claudeCodeHomeEnv(profile, settingsFile)[CLAUDE_CODE_CONFIG_DIR_ENV];
  const file = configDir ? path.join(configDir, ".claude.json") : undefined;
  return file && !isClaudeCodeAccountFile(file) ? file : undefined;
}

// The live file holds the user's current account, so no copy of it is ever written back.
function restoreClaudeCodeGlobalConfigCache(profile: ProfileConfig, settingsFile: string, recordedSha256: string | undefined): void {
  const file = claudeCodeGlobalConfigFile(profile, settingsFile);
  if (!file) {
    return;
  }
  const originalFile = originalBackupFilePath(file);
  if (existsSync(file)) {
    const current = readClaudeCodeGlobalConfigObject(file);
    const next = { ...current };
    if (Object.hasOwn(current, "autoCompactWindowsCache") && sha256Hex(JSON.stringify(current.autoCompactWindowsCache)) === recordedSha256) {
      const original = existsSync(originalFile) ? readClaudeCodeGlobalConfigObject(originalFile) : {};
      if (Object.hasOwn(original, "autoCompactWindowsCache")) {
        next.autoCompactWindowsCache = original.autoCompactWindowsCache;
      } else {
        delete next.autoCompactWindowsCache;
      }
    }
    if (Object.keys(next).length === 0 && existsSync(originalMissingFilePath(file))) {
      rmSync(file, { force: true });
    } else if (!jsonValuesEqual(current, next)) {
      writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`, { mode: privateFileMode });
    }
  }
  for (const copy of [originalFile, originalMissingFilePath(file), ...backupFiles(file)]) {
    rmSync(copy, { force: true });
  }
  const stateFile = claudeCodeProfileSettingsStateFile(profile);
  const state = readClaudeCodeSettingsStateFile(stateFile);
  if (state.globalConfigCacheSha256 !== undefined) {
    writeClaudeCodeSettingsStateFile(stateFile, { ...state, globalConfigCacheSha256: undefined });
  }
}

function restoreDisabledClaudeCodeProfile(profile: ProfileConfig, others: ProfileConfig[] = [], staysDisabled = true): ProfileClientApplyStatus {
  const settingsFile = resolveClaudeCodeSettingsFile(profile);
  const owner = enabledOwnerOfFile(profile, others);
  if (owner) {
    return stillManagedStatus(profile, owner, settingsFile);
  }
  const recordedSha256 = readClaudeCodeProfileSettingsState(profile).globalConfigCacheSha256;
  const disabledMessage = "Claude Code profile is disabled.";
  const status = isGlobalProfile(profile) && isRestoredClaudeCodeSettingsFile(settingsFile)
    ? disabledRestoreStatus("claude-code", settingsFile, disabledMessage, { changed: false, file: settingsFile, missingBackup: false, restored: false }, profile.name || profile.id, staysDisabled)
    : restoreDisabledGlobalProfile(profile, settingsFile, disabledMessage, claudeCodeManagedContent(profile), staysDisabled);
  if (!status.ok) {
    return status;
  }
  const globalFile = claudeCodeGlobalConfigFile(profile, settingsFile);
  const sharer = globalFile && others.find((other) => {
    const otherFile = other.agent === "claude-code" && isEnabledGlobalProfile(other) ? claudeCodeGlobalConfigFile(other, resolveClaudeCodeSettingsFile(other)) : undefined;
    return otherFile !== undefined && sameFile(otherFile, globalFile);
  });
  if (sharer) {
    return { ...status, message: withSentence(status.message, `Profile "${sharer.name || sharer.id}" still uses ${globalFile}, so LLMR left it and its copies unchanged.`) };
  }
  try {
    restoreClaudeCodeGlobalConfigCache(profile, settingsFile, recordedSha256);
    return status;
  } catch (error) {
    // A quit and the takeover sync show no message, so the log is the only place this reaches.
    console.error(`Failed to restore ${globalFile}: ${formatError(error)}`);
    // The settings file no longer points at LLMR, so the restore stands, and the hash stays for a later pass to try again.
    return { ...status, message: `${status.message} ${formatError(error)} LLMR left that file and its copies unchanged.` };
  }
}

function stillManagedStatus(profile: ProfileConfig, owner: ProfileConfig, file: string): ProfileClientApplyStatus {
  return {
    client: profile.agent,
    enabled: false,
    message: `${codexCompatibleClientName(profile.agent)} profile is disabled. Profile "${owner.name || owner.id}" still manages ${file}, so LLMR left it unchanged.`,
    ok: true,
    path: file
  };
}

function readClaudeCodeGlobalConfigObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
    throw new Error("root value is not an object");
  } catch (error) {
    throw new Error(`Claude Code global config file is not valid JSON: ${file}. ${formatError(error)}`);
  }
}

function codexMiddlewareRuntimeFilename(): string {
  return "llmr-codex-cli-middleware.js";
}

function codexMiddlewareFilename(profile: ProfileConfig, providerId: string): string {
  const slug = sanitizeCodexProviderId(profile.id || profile.name || providerId) || "codex";
  return process.platform === "win32"
    ? `llmr-codex-cli-stdio-${slug}.cmd`
    : `llmr-codex-cli-stdio-${slug}`;
}

function shellProfileSurfaceExports(surface: "auto" | "cli" | "app"): string[] {
  return [
    "if [ -z \"${LLMR_PROFILE_SURFACE:-}\" ]; then",
    "  case \"${1:-}\" in",
    "    app|app-server) LLMR_PROFILE_SURFACE=app ;;",
    `    *) LLMR_PROFILE_SURFACE=${shellQuote(surface)} ;;`,
    "  esac",
    "fi",
    "export LLMR_PROFILE_SURFACE"
  ];
}

function nodeRuntimeShellExecLines(runtimeFile: string): string[] {
  return [
    "if [ -n \"${LLMR_NODE_BIN:-}\" ]; then",
    `  exec "$LLMR_NODE_BIN" ${shellQuote(runtimeFile)} "$@"`,
    "fi",
    "if command -v node >/dev/null 2>&1; then",
    `  exec node ${shellQuote(runtimeFile)} "$@"`,
    "fi",
    `ELECTRON_RUN_AS_NODE=1 exec ${shellQuote(process.execPath)} ${shellQuote(runtimeFile)} "$@"`
  ];
}

function codexMiddlewareShellScript(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || defaultCodexCliCommand(profile.agent);
  const codexHome = profile.codexHome?.trim() || defaultCodexCompatibleHome(profile.agent, values.configFile);
  const resolvedCodexHome = resolveUserPath(codexHome);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = profile.agent === "workbuddy" || profile.agent === "zcode" ? "app" : normalizeProfileSurface(profile.surface);
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const botEnvExports = shellBotGatewayEnvExports(config, profile);
  const agentEnvExports = profile.agent === "zcode"
    ? [
        `export ZCODE_HOME=${shellQuote(resolvedCodexHome)}`,
        `export ZCODE_STORAGE_DIR=${shellQuote(resolvedCodexHome)}`,
        "if [ -z \"${LLMR_REAL_ZCODE_CLI_PATH:-}\" ]; then",
        `  LLMR_REAL_ZCODE_CLI_PATH=${shellQuote(codexCli)}`,
        "fi",
        "export LLMR_REAL_ZCODE_CLI_PATH",
        `export LLMR_ZCODE_PROFILE=${shellQuote(values.providerId)}`,
        `export LLMR_ZCODE_MODEL=${shellQuote(values.model)}`,
        `export LLMR_ZCODE_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export LLMR_ZCODE_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export LLMR_ZCODE_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export LLMR_PROFILE_SCOPE=${shellQuote(normalizeProfileScope(profile.scope))}`,
        `export LLMR_ZCODE_REMOTE_FRONTEND_MODE=${shellQuote(remoteFrontendMode)}`,
        `export LLMR_ZCODE_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}`
      ]
    : [
        `export CODEX_HOME=${shellQuote(resolvedCodexHome)}`,
        ...(profile.agent === "workbuddy"
          ? [
              `export WORKBUDDY_HOME=${shellQuote(resolvedCodexHome)}`,
              `export WORKBUDDY_CONFIG_DIR=${shellQuote(resolvedCodexHome)}`,
              `export CODEBUDDY_CONFIG_DIR=${shellQuote(resolvedCodexHome)}`,
              `export CODEBUDDY_HOME=${shellQuote(resolvedCodexHome)}`
            ]
          : []),
        "if [ -z \"${LLMR_REAL_CODEX_CLI_PATH:-}\" ]; then",
        `  LLMR_REAL_CODEX_CLI_PATH=${shellQuote(codexCli)}`,
        "fi",
        "export LLMR_REAL_CODEX_CLI_PATH",
        "if [ -z \"${LLMR_BUNDLED_CODEX_CLI_PATH:-}\" ]; then",
        "  LLMR_BUNDLED_CODEX_CLI_PATH=$LLMR_REAL_CODEX_CLI_PATH",
        "fi",
        "export LLMR_BUNDLED_CODEX_CLI_PATH",
        `export LLMR_CODEX_PROFILE=${shellQuote(values.providerId)}`,
        `export LLMR_CODEX_MODEL=${shellQuote(values.model)}`,
        `export LLMR_CODEX_MODEL_CATALOG_FILE=${shellQuote(values.modelCatalogFile)}`,
        `export LLMR_CONFIG_DIR=${shellQuote(CONFIGDIR)}`,
        `export LLMR_INTERNAL_HOME_DIR=${shellQuote(resolveRuntimeAppPath("home"))}`,
        `export LLMR_CODEX_MODEL_PROVIDER=${shellQuote(values.providerId)}`,
        `export LLMR_CODEX_PROFILE_CONFIG_FORMAT=${shellQuote(values.configFormat)}`,
        `export LLMR_PROFILE_SCOPE=${shellQuote(normalizeProfileScope(profile.scope))}`,
        `export LLMR_CODEX_REMOTE_FRONTEND_MODE=${shellQuote(remoteFrontendMode)}`,
        `export LLMR_CODEX_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}`
      ];
  return [
    "#!/bin/sh",
    ...envExports,
    ...agentEnvExports,
    ...shellProfileSurfaceExports(surface),
    ...botEnvExports,
    ...(profile.agent === "codex" ? codexNativeHelperBypassShellLines() : []),
    ...nodeRuntimeShellExecLines(runtimeFile),
    ""
  ].join("\n");
}

function cmdProfileSurfaceExports(surface: "auto" | "cli" | "app"): string[] {
  return [
    "if not defined LLMR_PROFILE_SURFACE (",
    "  if \"%~1\"==\"app\" (",
    cmdSetLine("LLMR_PROFILE_SURFACE", "app", "    "),
    "  ) else if \"%~1\"==\"app-server\" (",
    cmdSetLine("LLMR_PROFILE_SURFACE", "app", "    "),
    "  ) else (",
    cmdSetLine("LLMR_PROFILE_SURFACE", surface, "    "),
    "  )",
    ")"
  ];
}

function codexNativeHelperBypassShellLines(): string[] {
  return [
    "# Browser's native-pipe authorizer requires helper processes to bypass the LLMR middleware.",
    "if [ \"${1:-}\" = 'sandbox' ] || { [ \"${1:-}\" = 'app-server' ] && [ \"${2:-}\" = '--listen' ] && [ \"${3:-}\" = 'stdio://' ]; }; then",
    "  unset CODEX_CLI_PATH",
    "  exec \"$LLMR_BUNDLED_CODEX_CLI_PATH\" \"$@\"",
    "fi"
  ];
}

function nodeRuntimeCmdExecLines(runtimeFile: string): string[] {
  const quotedRuntime = cmdQuote(runtimeFile);
  const quotedHost = cmdQuote(process.execPath);
  return [
    "if not defined LLMR_NODE_BIN goto llmr_try_system_node",
    `"%LLMR_NODE_BIN%" ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%",
    ":llmr_try_system_node",
    "where node >nul 2>nul",
    "if errorlevel 1 goto llmr_use_electron_node",
    `node ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%",
    ":llmr_use_electron_node",
    "set \"ELECTRON_RUN_AS_NODE=1\"",
    `${quotedHost} ${quotedRuntime} %*`,
    "exit /b %ERRORLEVEL%"
  ];
}

function codexMiddlewareCmdScript(
  config: AppConfig,
  profile: ProfileConfig,
  values: {
    configFormat: "legacy" | "separate_profile_files";
    configFile: string;
    modelCatalogFile: string;
    model: string;
    providerId: string;
  },
  runtimeFile: string
): string {
  const codexCli = profile.codexCliPath?.trim() || defaultCodexCliCommand(profile.agent);
  const codexHome = profile.codexHome?.trim() || defaultCodexCompatibleHome(profile.agent, values.configFile);
  const resolvedCodexHome = resolveUserPath(codexHome);
  const remoteFrontendMode = normalizeCodexRemoteFrontendMode(profile.remoteFrontendMode);
  const surface = profile.agent === "workbuddy" || profile.agent === "zcode" ? "app" : normalizeProfileSurface(profile.surface);
  const workspaceName = profile.name || values.providerId;
  const envExports = Object.entries(profileEnv(profile)).map(([key, value]) => cmdSetLine(key, value));
  const botEnvExports = cmdBotGatewayEnvExports(config, profile);
  const agentEnvExports = profile.agent === "zcode"
    ? [
        cmdSetLine("ZCODE_HOME", resolvedCodexHome),
        cmdSetLine("ZCODE_STORAGE_DIR", resolvedCodexHome),
        `if not defined LLMR_REAL_ZCODE_CLI_PATH ${cmdSetLine("LLMR_REAL_ZCODE_CLI_PATH", codexCli)}`,
        cmdSetLine("LLMR_ZCODE_PROFILE", values.providerId),
        cmdSetLine("LLMR_ZCODE_MODEL", values.model),
        cmdSetLine("LLMR_ZCODE_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("LLMR_ZCODE_MODEL_PROVIDER", values.providerId),
        cmdSetLine("LLMR_ZCODE_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("LLMR_PROFILE_SCOPE", normalizeProfileScope(profile.scope)),
        cmdSetLine("LLMR_ZCODE_REMOTE_FRONTEND_MODE", remoteFrontendMode),
        cmdSetLine("LLMR_ZCODE_WORKSPACE_NAME", workspaceName)
      ]
    : [
        cmdSetLine("CODEX_HOME", resolvedCodexHome),
        ...(profile.agent === "workbuddy"
          ? [
              cmdSetLine("WORKBUDDY_HOME", resolvedCodexHome),
              cmdSetLine("WORKBUDDY_CONFIG_DIR", resolvedCodexHome),
              cmdSetLine("CODEBUDDY_CONFIG_DIR", resolvedCodexHome),
              cmdSetLine("CODEBUDDY_HOME", resolvedCodexHome)
            ]
          : []),
        `if not defined LLMR_REAL_CODEX_CLI_PATH ${cmdSetLine("LLMR_REAL_CODEX_CLI_PATH", codexCli)}`,
        "if not defined LLMR_BUNDLED_CODEX_CLI_PATH set \"LLMR_BUNDLED_CODEX_CLI_PATH=%LLMR_REAL_CODEX_CLI_PATH%\"",
        cmdSetLine("LLMR_CODEX_PROFILE", values.providerId),
        cmdSetLine("LLMR_CODEX_MODEL", values.model),
        cmdSetLine("LLMR_CODEX_MODEL_CATALOG_FILE", values.modelCatalogFile),
        cmdSetLine("LLMR_CONFIG_DIR", CONFIGDIR),
        cmdSetLine("LLMR_INTERNAL_HOME_DIR", resolveRuntimeAppPath("home")),
        cmdSetLine("LLMR_CODEX_MODEL_PROVIDER", values.providerId),
        cmdSetLine("LLMR_CODEX_PROFILE_CONFIG_FORMAT", values.configFormat),
        cmdSetLine("LLMR_PROFILE_SCOPE", normalizeProfileScope(profile.scope)),
        cmdSetLine("LLMR_CODEX_REMOTE_FRONTEND_MODE", remoteFrontendMode),
        cmdSetLine("LLMR_CODEX_WORKSPACE_NAME", workspaceName)
      ];
  return [
    "@echo off",
    ...envExports,
    ...agentEnvExports,
    ...cmdProfileSurfaceExports(surface),
    ...botEnvExports,
    ...nodeRuntimeCmdExecLines(runtimeFile),
    ""
  ].join("\r\n");
}

function shellBotGatewayEnvExports(config: AppConfig, profile: ProfileConfig): string[] {
  return [
    'if [ "$LLMR_PROFILE_SURFACE" = "app" ]; then',
    ...Object.entries(botGatewayProfileEnv(config, profile, "app")).map(([key, value]) => `  export ${key}=${shellQuote(value)}`),
    "else",
    ...Object.entries(botGatewayProfileEnv(config, profile, "cli")).map(([key, value]) => `  export ${key}=${shellQuote(value)}`),
    "fi"
  ];
}

function shellEnvExports(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
}

function cmdBotGatewayEnvExports(config: AppConfig, profile: ProfileConfig): string[] {
  return [
    `if /I "%LLMR_PROFILE_SURFACE%"=="app" (`,
    ...Object.entries(botGatewayProfileEnv(config, profile, "app")).map(([key, value]) => cmdSetLine(key, value, "  ")),
    ") else (",
    ...Object.entries(botGatewayProfileEnv(config, profile, "cli")).map(([key, value]) => cmdSetLine(key, value, "  ")),
    ")"
  ];
}

function cmdEnvExports(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => cmdSetLine(key, value));
}

function withoutBotGatewayEnv(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isBotGatewayEnvKey(key)));
}

function isBotGatewayEnvKey(key: string): boolean {
  return key === "BOT_GATEWAY_STATE_DIR" ||
    key.startsWith("LLMR_BOT_") ||
    key.startsWith(STALE_BOT_GATEWAY_ENV_PREFIX) ||
    key === "LLMR_BOT_GATEWAY_SDK_MODULE";
}

function managedModelAssignment(source: string, configuredModel: string): string {
  const currentAssignment = rootTomlAssignment(source, "model");
  const previousConfiguredModel = managedConfiguredModel(source);
  const configuredModelChanged = previousConfiguredModel !== undefined && previousConfiguredModel !== tomlString(configuredModel);
  return currentAssignment && !configuredModelChanged
    ? currentAssignment
    : `model = ${tomlString(configuredModel)}`;
}

function readJsonObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readClaudeCodeSettingsObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
    throw new Error("root value is not an object");
  } catch (error) {
    throw new Error(`Claude Code settings file is not valid JSON: ${file}. ${formatError(error)}`);
  }
}

function writeClaudeCodeSettingsIfManagedChanged(
  file: string,
  settings: Record<string, unknown>,
  nextSettings: Record<string, unknown>,
  managedEnvKeys: Set<string>,
  managedSettingPaths: string[] = [],
  isManagedContent?: (content: string) => boolean
): { backupFile?: string; changed: boolean } {
  if (!claudeCodeSettingsManagedFieldsChanged(settings, nextSettings, managedEnvKeys, managedSettingPaths)) {
    chmodFileIfRequested(file, privateFileMode);
    return { changed: false };
  }
  return writeFileWithBackup(file, `${JSON.stringify(nextSettings, null, 2)}\n`, { contentForBackup: claudeCodeSettingsBackupContent, isManagedContent, mode: privateFileMode });
}

function claudeCodeSettingsManagedFieldsChanged(
  settings: Record<string, unknown>,
  nextSettings: Record<string, unknown>,
  managedEnvKeys: Set<string>,
  managedSettingPaths: string[] = []
): boolean {
  if (settings.apiKeyHelper !== nextSettings.apiKeyHelper) {
    return true;
  }

  const settingsEnv = isRecord(settings.env) ? settings.env : {};
  const nextEnv = isRecord(nextSettings.env) ? nextSettings.env : {};
  const envKeys = new Set(managedEnvKeys);
  for (const key of [...Object.keys(settingsEnv), ...Object.keys(nextEnv)]) {
    if (isManagedClaudeCodeSettingsEnvKey(key)) {
      envKeys.add(key);
    }
  }

  for (const key of envKeys) {
    if (settingsEnv[key] !== nextEnv[key]) {
      return true;
    }
  }

  for (const pathValue of managedSettingPaths) {
    const pathParts = parseClaudeCodeSettingsPath(pathValue);
    if (!jsonValuesEqual(readJsonPath(settings, pathParts), readJsonPath(nextSettings, pathParts))) {
      return true;
    }
  }
  return false;
}

function readJsonPath(value: Record<string, unknown>, pathParts: string[]): unknown {
  let current: unknown = value;
  for (const key of pathParts) {
    if (!isRecord(current) || !hasOwn(current, key)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutManagedClaudeCodeApiKeyHelper(settings: Record<string, unknown>): Record<string, unknown> {
  const nextSettings = { ...settings };
  if (isManagedClaudeCodeApiKeyHelper(nextSettings.apiKeyHelper)) {
    delete nextSettings.apiKeyHelper;
  }
  return nextSettings;
}

function isManagedClaudeCodeApiKeyHelper(value: unknown): boolean {
  return typeof value === "string" && value.includes("llmr-claude-code-api-key-");
}

function claudeCodeManagedSettingsEnvKeys(
  profileEnvValues: Record<string, string>,
  profileSettingsEnv: Record<string, string>,
  mcpConfigEnv: Record<string, string>,
  wifEnv: Record<string, string>
): Set<string> {
  return new Set([
    ...claudeCodeGatewayEnvKeys,
    ...claudeCodeNoProxyEnvKeys,
    ...claudeCodeGatewayCompatibilityEnvKeys,
    ...claudeCodeFirstPartyProviderEnvKeys,
    ...claudeCodeWifEnvKeys,
    ...Object.keys(profileEnvValues),
    ...Object.keys(profileSettingsEnv),
    ...Object.keys(mcpConfigEnv),
    ...Object.keys(wifEnv),
    CLAUDE_CODE_MCP_CONFIG_ENV,
    claudeCodeCustomHeadersEnvKey,
    ...STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS
  ]);
}

// A shared-home profile's file replaces the user's whole value, so the user's lines are read from their own file on every apply. The file is undefined when the profile's own env names the key.
// Returns the user's file when it exists and cannot be read as JSON.
function applyClaudeCodeCustomHeadersEnv(env: Record<string, string>, authMode: ClaudeCodeGatewayAuthMode, token: string, userSettingsFile: string | undefined): string | undefined {
  withoutClaudeCodeGatewayKeyHeader(env);
  if (authMode !== "claude-login") {
    return undefined;
  }
  let own: string | undefined = env[claudeCodeCustomHeadersEnvKey];
  let unreadable: string | undefined;
  if (userSettingsFile) {
    try {
      const settings: unknown = existsSync(userSettingsFile) ? JSON.parse(readFileSync(userSettingsFile, "utf8")) : {};
      const userEnv = isRecord(settings) ? settings.env : undefined;
      own = isRecord(userEnv) && typeof userEnv[claudeCodeCustomHeadersEnvKey] === "string" ? userEnv[claudeCodeCustomHeadersEnvKey] : undefined;
    } catch {
      unreadable = userSettingsFile;
    }
  }
  env[claudeCodeCustomHeadersEnvKey] = claudeCodeCustomHeadersWithGatewayKey(own, token);
  return unreadable;
}

function withoutClaudeCodeGatewayKeyHeader(env: Record<string, unknown>): void {
  const current = env[claudeCodeCustomHeadersEnvKey];
  if (typeof current !== "string") {
    return;
  }
  const own = claudeCodeCustomHeadersWithoutGatewayKey(current);
  if (own) {
    env[claudeCodeCustomHeadersEnvKey] = own;
  } else {
    delete env[claudeCodeCustomHeadersEnvKey];
  }
}

function claudeCodeCustomHeadersWithGatewayKey(current: string | undefined, token: string): string {
  const own = current === undefined ? "" : claudeCodeCustomHeadersWithoutGatewayKey(current);
  return [...(own ? [own] : []), `${llmrApiKeyHeader}: ${token}`].join("\n");
}

function claudeCodeSettingsBackupContent(content: string): string {
  const settings = parseJsonContent(content);
  if (!settings || !isRecord(settings.env)) {
    return content;
  }
  const env = { ...settings.env };
  withoutClaudeCodeGatewayKeyHeader(env);
  return env[claudeCodeCustomHeadersEnvKey] === settings.env[claudeCodeCustomHeadersEnvKey]
    ? content
    : `${JSON.stringify({ ...settings, env }, null, 2)}\n`;
}

function claudeCodeCustomHeadersWithoutGatewayKey(current: string): string {
  const lines = current.split(/\r?\n/);
  const own = lines.filter((line) => line.split(":")[0].trim().toLowerCase() !== llmrApiKeyHeader);
  return own.length === lines.length ? current : own.join("\n");
}

function isManagedClaudeCodeSettingsEnvKey(key: string): boolean {
  return (claudeCodeGatewayEnvKeys as readonly string[]).includes(key) ||
    (claudeCodeNoProxyEnvKeys as readonly string[]).includes(key) ||
    (claudeCodeGatewayCompatibilityEnvKeys as readonly string[]).includes(key) ||
    isClaudeCodeFirstPartyProviderEnvKey(key) ||
    isClaudeCodeWifEnvKey(key) ||
    key === CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV ||
    key === CLAUDE_CODE_MCP_CONFIG_ENV ||
    isStaleClaudeCodeSettingsEnvKey(key) ||
    isClaudeCodeManagedModelEnvKey(key) ||
    isBotGatewayEnvKey(key);
}

function isClaudeCodeFirstPartyProviderEnvKey(key: string): boolean {
  return (claudeCodeFirstPartyProviderEnvKeys as readonly string[]).includes(key);
}

function isClaudeCodeWifEnvKey(key: string): boolean {
  return (claudeCodeWifEnvKeys as readonly string[]).includes(key);
}

function writeFileWithBackup(
  file: string,
  content: string,
  options: BackupOptions = {}
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodFileIfRequested(file, options.mode);
    return { changed: false };
  }
  const backupFile = backupBeforeWrite(file, previous, options);
  writeFileAtomic(file, content, { mode: options.mode });
  return { backupFile, changed: true };
}

export function cleanupGeneratedBinBackups(configDir = CONFIGDIR): number {
  const binDir = path.join(configDir, "bin");
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    const baseName = generatedBinBackupBaseName(entry);
    if (!baseName || !isManagedGeneratedBinFile(baseName)) {
      continue;
    }
    try {
      rmSync(path.join(binDir, entry), { force: true });
      removed += 1;
    } catch {
      // Cleanup is best effort; stale backups should never block profile launch.
    }
  }
  return removed;
}

function cleanupInactiveOpenCodeWrappers(profiles: ProfileConfig[]): number {
  const binDir = path.join(CONFIGDIR, "bin");
  const activeFiles = new Set(profiles
    .filter((profile) => profile.agent === "opencode" && profile.enabled)
    .map(openCodeWrapperFilename));
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith("llmr-opencode-wrapper-") || activeFiles.has(entry)) {
      continue;
    }
    rmSync(path.join(binDir, entry), { force: true });
    removed += 1;
  }
  return removed;
}

function cleanupInactiveKiloWrappers(profiles: ProfileConfig[]): number {
  const binDir = path.join(CONFIGDIR, "bin");
  const activeFiles = new Set(profiles
    .filter((profile) => profile.agent === "kilo" && profile.enabled)
    .map(kiloWrapperFilename));
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith("llmr-kilo-wrapper-") || activeFiles.has(entry)) {
      continue;
    }
    rmSync(path.join(binDir, entry), { force: true });
    removed += 1;
  }
  return removed;
}

function cleanupInactiveClaudeCodeGeneratedFiles(profiles: ProfileConfig[]): number {
  const binDir = path.join(CONFIGDIR, "bin");
  const activeFiles = new Set(profiles
    .filter((profile) => profile.agent === "claude-code" && profile.enabled)
    .flatMap((profile) => [
      ...(resolveClaudeCodeGatewayAuthMode(profile) === "api-key-helper" ? [claudeCodeLegacyApiKeyHelperFilename(profile)] : []),
      claudeCodeWifIdentityTokenFilename(profile),
      claudeCodeWrapperFilename(profile)
    ]));
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!isClaudeCodeGeneratedRuntimeFile(entry) || activeFiles.has(entry)) {
      continue;
    }
    rmSync(path.join(binDir, entry), { force: true });
    removed += 1;
  }
  return removed;
}

function isClaudeCodeGeneratedRuntimeFile(fileName: string): boolean {
  return fileName.startsWith("llmr-claude-code-api-key-") ||
    fileName.startsWith("llmr-claude-code-wif-token-") ||
    fileName.startsWith("llmr-claude-code-wrapper-");
}

function generatedBinBackupBaseName(entry: string): string | undefined {
  const backupIndex = entry.indexOf(backupMarker);
  if (backupIndex !== -1) {
    return entry.slice(0, backupIndex);
  }
  for (const suffix of [originalMissingSuffix, originalBackupSuffix]) {
    if (entry.endsWith(suffix)) {
      return entry.slice(0, -suffix.length);
    }
  }
  return undefined;
}

function isManagedGeneratedBinFile(fileName: string): boolean {
  const normalized = fileName.replace(/\.cmd$/i, "");
  return normalized === "llmr" ||
    normalized === "llmr-cli.js" ||
    normalized === "llmr" ||
    normalized === "llmr-app" ||
    normalized === "llmr-cli.js" ||
    normalized === TOOL_HUB_MCP_RUNTIME_FILE_NAME ||
    normalized === codexMiddlewareRuntimeFilename() ||
    normalized.startsWith("llmr-claude-code-api-key-") ||
    normalized.startsWith("llmr-claude-code-wif-token-") ||
    normalized.startsWith("llmr-claude-code-wrapper-") ||
    normalized.startsWith("llmr-grok-cli-wrapper-") ||
    normalized.startsWith("llmr-kimi-cli-wrapper-") ||
    normalized.startsWith("llmr-pi-wrapper-") ||
    normalized.startsWith("llmr-opencode-wrapper-") ||
    normalized.startsWith("llmr-kilo-wrapper-") ||
    normalized.startsWith("llmr-codex-cli-stdio-");
}

type RestoreFileResult = {
  // The restore found no file and left none. With `restored`, LLMR's marker says none existed before it either.
  absent?: boolean;
  backupFile?: string;
  changed: boolean;
  file: string;
  missingBackup: boolean;
  removed?: boolean;
  restored: boolean;
  stripped?: boolean;
};

type RestoreManagedContentMatchers = {
  contentForBackup?: (content: string) => string;
  isEmptyContent?: (content: string) => boolean;
  isManagedContent: (content: string) => boolean;
  onReleased?: () => void;
  // Set where a live file that changed since LLMR wrote it is stripped in place, and the snapshot only supplies what the apply displaced. Such a file's token never goes into a backup.
  stripBeforeSnapshot?: boolean;
  stripLiveContent?: (content: string, snapshot?: string) => string | undefined;
  stripManagedContent?: (content: string) => string | undefined;
  takeoverContent?: (content: string) => TakeoverContent;
};

// "parsed": valid content that carries the marks of an LLMR takeover. "unparsed": content that is not valid for its format.
type TakeoverContent = "none" | "parsed" | "unparsed";

function restoreDisabledGlobalProfile(
  profile: ProfileConfig,
  file: string,
  disabledMessage: string,
  matchers: RestoreManagedContentMatchers,
  staysDisabled = true
): ProfileClientApplyStatus {
  if (!isGlobalProfile(profile)) {
    return disabledStatus(profile.agent, file, disabledMessage);
  }

  try {
    const restoreResult = restoreGlobalConfigFile(file, { ...matchers, mode: privateFileMode });
    // A pass that changed nothing still gave the file back: a record kept past it would be trusted by the next apply and used to strip every later save.
    if (
      matchers.onReleased &&
      (restoreResult.changed || restoreResult.restored ||
        (!restoreResult.missingBackup && (!existsSync(file) || matchers.takeoverContent?.(readFileSync(file, "utf8")) !== "unparsed")))
    ) {
      matchers.onReleased();
    }
    return disabledRestoreStatus(profile.agent, file, disabledMessage, restoreResult, profile.name || profile.id || profile.agent, staysDisabled);
  } catch (error) {
    return failedRestoreStatus(profile.agent, file, error);
  }
}

function restoreDisabledCodexProfile(profile: ProfileConfig, configFile: string, others: ProfileConfig[], staysDisabled = true): ProfileClientApplyStatus {
  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "llm-router";
  const status = restoreDisabledGlobalProfile(
    profile,
    configFile,
    `${codexCompatibleClientName(profile.agent)} profile is disabled.`,
    // A reserved id is never LLMR's, but the file may still hold what LLMR wrote under the id it had before.
    codexManagedContent(profile.agent, reservedCodexProviderIds.includes(providerId) ? codexCompatibleProviderIds(others) : [providerId], configFile),
    staysDisabled
  );
  const dir = path.dirname(configFile);
  // A config.toml that still holds LLMR's content still names the catalog, and another enabled profile in the directory still reads these files.
  if (
    !status.ok || !isCodexFamily(profile.agent) || !isGlobalProfile(profile) ||
    others.some((other) => isCodexFamily(other.agent) && other.enabled && sameFile(path.dirname(resolveCodexConfigFile(other)), dir))
  ) {
    return status;
  }
  const hadConfig = existsSync(configFile);
  const name = codexCompatibleClientName(profile.agent);
  const suffix = staysDisabled ? ` Profile is disabled. Switch it on to undo this. ${name} may ask you to log in.` : "";
  try {
    const { copy, returned } = restoreCodexSideFiles(profile, configFile, providerId);
    const base = suffix && status.message.endsWith(suffix) ? status.message.slice(0, -suffix.length) : status.message;
    const message = returned
      ? hadConfig
        ? `${base} Your own profile settings, which LLMR had moved to ${providerId}.config.toml, are in it again.${base === status.message ? "" : suffix}`
        : `${name} config now holds only your own profile settings, which LLMR had moved to ${providerId}.config.toml.${suffix}`
      : status.message;
    const changed = status.changed || returned;
    return copy ? { ...status, changed, copy, message: `${message} LLMR kept a copy of what else you had in ${providerId}.config.toml at ${copy}.` } : { ...status, changed, message };
  } catch (error) {
    // config.toml is settled by now, so the message keeps what happened to it and names the file that failed.
    console.error(`Failed to remove LLMR's files beside ${resolveUserPath(configFile)}: ${formatError(error)}`);
    return { ...status, message: `${status.message} LLMR could not remove all of its own files beside it: ${formatError(error)}`, ok: false };
  }
}

// Runs after config.toml is settled, so a profile table the snapshot already gave back is not written a second time.
function restoreCodexSideFiles(profile: ProfileConfig, configFile: string, providerId: string): { copy?: string; returned: boolean } {
  const dir = path.dirname(configFile);
  const profileFile = path.join(dir, `${providerId}.config.toml`);
  const result = returnCodexProfileTable(configFile, profileFile, providerId);
  restoreSideFile(profileFile);
  restoreSideFile(codexModelCatalogFile(configFile));
  const appCatalog = codexAppModelCatalogPath(dir, profile);
  rmSync(appCatalog, { force: true });
  // The Codex app keeps its own data in these directories, so each goes only when it is empty.
  for (let parent = path.dirname(appCatalog); parent !== dir; parent = path.dirname(parent)) {
    try {
      rmdirSync(parent);
    } catch (error) {
      if (!["ENOTEMPTY", "EEXIST", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        console.warn(`Left ${resolveUserPath(parent)} in place: ${formatError(error)}`);
      }
      break;
    }
  }
  return result;
}

// What the user has in the profile file is theirs: an apply moved their `[profiles.<provider>]` table into it, or they wrote there since.
// Whatever of it does not go back into config.toml is saved as a copy before the file goes.
function returnCodexProfileTable(configFile: string, profileFile: string, providerId: string): { copy?: string; returned: boolean } {
  if (!existsSync(profileFile)) {
    return { returned: false };
  }
  const current = readFileSync(profileFile, "utf8");
  const usersContent = (content: string) => codexProfileFileUsersContent(content, providerId);
  const kept = usersContent(current);
  const originalFile = originalBackupFilePath(profileFile);
  if (existsSync(originalFile)) {
    // The original is about to be written back over whatever was added to the file since.
    return { copy: kept !== usersContent(readFileSync(originalFile, "utf8")) ? saveConfigSafetyCopy(profileFile, current) : undefined, returned: false };
  }
  if (!kept || !existsSync(originalMissingFilePath(profileFile))) {
    return { returned: false };
  }
  const tableStart = firstCodexTableIndex(kept);
  const body = (tableStart === -1 ? kept : kept.slice(0, tableStart)).trim();
  const config = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
  const profileHeader = `profiles.${tomlKey(providerId)}`;
  const headerInConfig = scanTomlStatements(config).some(({ kind, table }) => kind === "header" && (table === profileHeader || table === `[[${profileHeader}]]`));
  // A table cannot be folded into the profile table. Keys cannot be added to a table config.toml already has without guessing which of two values the user means, unless they are the ones it holds.
  const settings = (text: string) => scanTomlStatements(text).filter(({ kind }) => kind === "assignment").map(({ lines }) => lines.join("").trim());
  const inConfig = new Set(settings(codexProfileTableBody(config, providerId)));
  const left = tableStart !== -1 || (headerInConfig && settings(body).some((setting) => !inConfig.has(setting)));
  const copy = left ? saveConfigSafetyCopy(profileFile, current) : undefined;
  if (!body || headerInConfig) {
    return { copy, returned: false };
  }
  writeFileAtomic(configFile, `${config.trim() ? `${config.trimEnd()}\n\n` : ""}[profiles.${tomlKey(providerId)}]\n${body}\n`, { mode: privateFileMode });
  return { copy, returned: true };
}

// LLMR's `show_all_sessions = true` carries no mark, so the first root key of that value counts as LLMR's.
function codexProfileFileUsersContent(content: string, providerId: string): string {
  const statements = scanTomlStatements(stripManagedCodexConfigContent(content, [providerId]) ?? content);
  const llmrsLine = statements.findIndex(({ key, table, value }) => table === "" && key === "show_all_sessions" && value === "true");
  return statements.filter((_, index) => index !== llmrsLine).flatMap(({ lines }) => lines).join("").trim();
}

// Only a file LLMR took over has an original or a marker beside it. Anything else is the user's and stays.
function restoreSideFile(file: string): void {
  const originalFile = originalBackupFilePath(file);
  if (existsSync(originalFile)) {
    writeFileAtomic(file, readFileSync(originalFile));
  } else if (existsSync(originalMissingFilePath(file))) {
    removeFileKeepingLink(file);
  } else {
    return;
  }
  forgetMissingOriginal(file);
  rmSync(originalFile, { force: true });
}

// A file that exists and cannot be read may hold it.
function fileMayHold(file: string, value: string): boolean {
  try {
    return readFileSync(file, "utf8").includes(value);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function disabledProfileStatus(profile: ProfileConfig, others: ProfileConfig[] = [], staysDisabled = true): ProfileClientApplyStatus {
  if (profile.agent === "claude-code") {
    return restoreDisabledClaudeCodeProfile(profile, others, staysDisabled);
  }
  if (profile.agent === "zcode") {
    return restoreDisabledZcodeProfile(profile, resolveZcodeConfigFile(profile));
  }
  if (profile.agent === "grok") {
    return disabledStatus("grok", grokWrapperPath(profile), "Grok CLI profile is disabled.");
  }
  if (profile.agent === "kimi") {
    return disabledStatus("kimi", kimiWrapperPath(profile), "Kimi CLI profile is disabled.");
  }
  if (profile.agent === "pi") {
    return disabledPiStatus(profile);
  }
  if (profile.agent === "opencode" || profile.agent === "kilo") {
    // The apply loop reaches a disabled profile after the enabled one that shares its file, so restoring here would strip the owner's config.
    const owner = enabledOwnerOfFile(profile, others);
    if (owner) {
      return stillManagedStatus(profile, owner, profilePath(profile));
    }
    return restoreDisabledGlobalProfile(
      profile,
      profilePath(profile),
      `${codexCompatibleClientName(profile.agent)} profile is disabled.`,
      providerJsonManagedContent(profile.agent),
      staysDisabled
    );
  }
  const clientName = codexCompatibleClientName(profile.agent);
  const configFile = resolveCodexConfigFile(profile);
  const status = restoreDisabledCodexProfile(profile, configFile, others, staysDisabled);
  if (profile.agent !== "workbuddy" || !isGlobalProfile(profile)) {
    return status;
  }
  const modelsResult = restoreGlobalConfigFile(workbuddyModelsFile(configFile), { isManagedContent: isManagedWorkbuddyModelsContent });
  // An install from before backups existed has no snapshot; warn instead of pinning the takeover marker.
  return modelsResult.missingBackup
    ? { ...status, message: `${status.message} No original ${clientName} models.json backup was found.` }
    : status;
}

function workbuddyModelsFile(configFile: string): string {
  return path.join(path.dirname(resolveUserPath(configFile)), "models.json");
}

export function restoreInactiveGlobalProfileConfigs(profiles: ProfileConfig[]): ProfileClientApplyStatus[] {
  const statuses: ProfileClientApplyStatus[] = [];
  const claudeProfiles = profiles.filter((profile) => profile.agent === "claude-code");
  const enabledClaudeProfiles = claudeProfiles.filter((profile) => profile.enabled);
  if (!enabledClaudeProfiles.some(isGlobalProfile)) {
    for (const file of uniqueResolvedPaths([
      "~/.claude/settings.json",
      ...claudeProfiles
        .map((profile) => profile.settingsFile || "")
        .filter(Boolean)
    ])) {
      try {
        if (isRestoredClaudeCodeSettingsFile(file)) {
          continue;
        }
        const owners = claudeProfiles.filter((profile) => resolveClaudeCodeSettingsFile(profile) === file);
        const liveOwner = owners.find((profile) => hasClaudeCodeTakeoverState(readClaudeCodeProfileSettingsState(profile)));
        const owner = liveOwner ?? owners[0];
        const matchers: RestoreManagedContentMatchers = (liveOwner ? undefined : orphanedClaudeCodeManagedContent(file)) ??
          (owner
            ? claudeCodeManagedContent(owner)
            : {
                contentForBackup: claudeCodeSettingsBackupContent,
                isManagedContent: isManagedClaudeCodeSettingsContent,
                stripManagedContent: stripManagedClaudeCodeSettingsContent,
                takeoverContent: (content) => claudeCodeTakeoverContent(content, [], stripManagedClaudeCodeSettingsContent)
              });
        const restoreResult = restoreGlobalConfigFile(file, {
          ...matchers,
          keepLiveFile: enabledClaudeProfiles.length > 0,
          mode: privateFileMode
        });
        if (restoreResult.changed || restoreResult.restored) {
          matchers.onReleased?.();
        }
        if (restoreResult.changed || restoreResult.missingBackup) {
          statuses.push(inactiveGlobalCleanupStatus("claude-code", file, restoreResult));
        }
      } catch (error) {
        statuses.push(failedRestoreStatus("claude-code", file, error));
      }
    }
  }
  const codexProfiles = profiles.filter((profile) => profile.agent === "codex");
  if (codexProfiles.length > 0 && !codexProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    const providerIds = codexCompatibleProviderIds(codexProfiles);
    for (const file of uniqueResolvedPaths([
      ...codexProfiles.map(globalCodexConfigCandidate)
    ])) {
      if (sharedWithEnabledProfile(profiles, "codex", file)) {
        continue;
      }
      try {
        const restoreResult = restoreGlobalConfigFile(file, { ...codexManagedContent("codex", providerIds, file), mode: privateFileMode });
        if (restoreResult.changed || restoreResult.missingBackup) {
          statuses.push(inactiveGlobalCleanupStatus("codex", file, restoreResult));
        }
      } catch (error) {
        statuses.push(failedRestoreStatus("codex", file, error));
      }
    }
  }
  const workbuddyProfiles = profiles.filter((profile) => profile.agent === "workbuddy");
  if (workbuddyProfiles.length > 0 && !workbuddyProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    const providerIds = codexCompatibleProviderIds(workbuddyProfiles);
    for (const file of uniqueResolvedPaths([
      ...workbuddyProfiles.map(globalCodexConfigCandidate)
    ])) {
      // The takeover sync still restores this profile's models.json from its record.
      if (sharedWithEnabledProfile(profiles, "workbuddy", file)) {
        continue;
      }
      const restoreResult = restoreGlobalConfigFile(file, { ...codexManagedContent("workbuddy", providerIds, file), mode: privateFileMode });
      if (restoreResult.changed || restoreResult.missingBackup) {
        statuses.push(inactiveGlobalCleanupStatus("workbuddy", file, restoreResult));
      }
      const modelsFile = workbuddyModelsFile(file);
      const modelsResult = restoreGlobalConfigFile(modelsFile, { isManagedContent: isManagedWorkbuddyModelsContent });
      if (modelsResult.changed || modelsResult.missingBackup) {
        statuses.push(toleratingMissingBackup(inactiveGlobalCleanupStatus("workbuddy", modelsFile, modelsResult), modelsResult));
      }
    }
  }
  const openCodeProfiles = profiles.filter((profile) => profile.agent === "opencode");
  if (openCodeProfiles.length > 0 && !openCodeProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    for (const file of uniqueResolvedPaths(openCodeProfiles.map(globalOpenCodeConfigCandidate))) {
      if (sharedWithEnabledProfile(profiles, "opencode", file)) {
        continue;
      }
      try {
        const restoreResult = restoreGlobalConfigFile(file, { ...providerJsonManagedContent("opencode"), mode: privateFileMode });
        if (restoreResult.changed || restoreResult.missingBackup) {
          statuses.push(inactiveGlobalCleanupStatus("opencode", file, restoreResult));
        }
      } catch (error) {
        statuses.push(failedRestoreStatus("opencode", file, error));
      }
    }
  }
  const kiloProfiles = profiles.filter((profile) => profile.agent === "kilo");
  if (kiloProfiles.length > 0 && !kiloProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    for (const file of uniqueResolvedPaths(kiloProfiles.map(globalKiloConfigCandidate))) {
      if (sharedWithEnabledProfile(profiles, "kilo", file)) {
        continue;
      }
      try {
        const restoreResult = restoreGlobalConfigFile(file, { ...providerJsonManagedContent("kilo"), mode: privateFileMode });
        if (restoreResult.changed || restoreResult.missingBackup) {
          statuses.push(inactiveGlobalCleanupStatus("kilo", file, restoreResult));
        }
      } catch (error) {
        statuses.push(failedRestoreStatus("kilo", file, error));
      }
    }
  }
  const piProfiles = profiles.filter((profile) => profile.agent === "pi");
  if (piProfiles.length > 0 && !piProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    const providerIds = [...new Set(["llm-router", ...piProfiles.map(piProviderId)])];
    for (const file of uniqueResolvedPaths(piProfiles.map((profile) => piModelsFile({ ...profile, scope: "global" })))) {
      // A user's own Pi config may name its provider llm-router; only a file LLMR snapshotted was ever taken over.
      if (!hasTakeoverSnapshot(file)) {
        continue;
      }
      const restoreResult = restoreGlobalConfigFile(file, {
        isManagedContent: (content) => providerIds.some((providerId) => isManagedPiModelsContent(content, providerId)),
        mode: privateFileMode
      });
      if (restoreResult.changed || restoreResult.missingBackup) {
        statuses.push(toleratingMissingBackup(inactiveGlobalCleanupStatus("pi", file, restoreResult), restoreResult));
      }
    }
  }
  const zcodeProfiles = profiles.filter((profile) => profile.agent === "zcode");
  if (zcodeProfiles.length > 0 && !zcodeProfiles.some((profile) => profile.enabled && isGlobalProfile(profile))) {
    const providerIds = [...new Set([
      "llm-router",
      ...zcodeProfiles.map((profile) => sanitizeCodexProviderId(profile.providerId || "")).filter(Boolean)
    ])];
    const configFiles = uniqueResolvedPaths([
      ...zcodeProfiles.map((profile) => resolveZcodeConfigFile(profile))
    ]);
    for (const configFile of configFiles) {
      const storageRoot = zcodeHomeFromConfigFile(configFile);
      for (const file of [
        configFile,
        path.join(storageRoot, "v2", "config.json"),
        path.join(storageRoot, "v2", "bots-model-cache.v2.json")
      ]) {
        const restoreResult = restoreGlobalConfigFile(file, {
          isManagedContent: (content) => providerIds.some((providerId) => isManagedZcodeConfigContent(content, providerId)),
          mode: privateFileMode
        });
        if (restoreResult.changed || restoreResult.missingBackup) {
          statuses.push(inactiveGlobalCleanupStatus("zcode", file, restoreResult));
        }
      }
    }
  }
  return statuses;
}

function globalCodexConfigCandidate(profile: ProfileConfig): string {
  const codexHome = profile.codexHome?.trim();
  if (codexHome) {
    return path.join(resolveUserPath(codexHome), "config.toml");
  }
  return profile.configFile || defaultCodexConfigFile(profile.agent);
}

// A reserved id is never LLMR's, since an apply refuses it, so a line of that id is the user's.
function codexCompatibleProviderIds(profiles: ProfileConfig[]): string[] {
  return [...new Set([
    "llm-router",
    ...profiles.map((profile) => sanitizeCodexProviderId(profile.providerId || "")).filter((id) => id && !reservedCodexProviderIds.includes(id))
  ])];
}

function globalOpenCodeConfigCandidate(profile: ProfileConfig): string {
  return resolveOpenCodeConfigFile(CONFIGDIR, { ...profile, scope: "global" });
}

function globalKiloConfigCandidate(profile: ProfileConfig): string {
  return resolveKiloConfigFile(CONFIGDIR, { ...profile, scope: "global" });
}

export function restoreGlobalProfileConfigsOnExit(
  profiles: ProfileConfig[],
  options: { manageMarker?: boolean } = {}
): ProfileClientApplyStatus[] {
  const manageMarker = options.manageMarker !== false;
  const records = dedupeGlobalProfileTakeovers([
    ...(manageMarker ? ownedGlobalProfileTakeovers ?? readGlobalProfileTakeoverMarker() : []),
    ...globalProfileTakeoverRecords(profiles)
  ]);
  const statuses = restoreGlobalProfileTakeoverRecords(records);
  if (manageMarker && statuses.every((status) => status.ok)) {
    clearGlobalProfileTakeoverMarker();
    ownedGlobalProfileTakeovers = [];
  }
  return statuses;
}

// Call after this process's gateway has stopped. A usable LLMR gateway still on the endpoint
// belongs to another process, so its takeovers stay. Never throws; stop and quit paths call it.
export async function restoreTakeoversWhenNoGatewayServes(): Promise<void> {
  let profiles: ProfileConfig[] = [];
  try {
    const config = await loadAppConfig();
    const loadError = appConfigLoadError(config);
    if (loadError) {
      // The fallback config has default profiles and endpoint, so skip the probe and restore only the marker's records.
      console.error(`LLMR config failed to load; skipped the gateway probe and restored the recorded takeovers only: ${loadError}`);
    } else {
      const probe = await probeExistingLlmrGateway(config, { attempts: 1 });
      if (probe.state === "usable") {
        console.warn(`Kept agent takeovers: an LLMR gateway still serves ${probe.endpoint}.`);
        return;
      }
      profiles = config.profile.profiles;
    }
  } catch (error) {
    console.error(`Failed to check for a serving LLMR gateway; restoring the recorded takeovers only: ${formatError(error)}`);
  }
  try {
    for (const status of restoreGlobalProfileConfigsOnExit(profiles)) {
      if (!status.ok) {
        console.error(`Failed to restore ${status.client} global profile config: ${status.message}`);
      }
    }
  } catch (error) {
    console.error(`Failed to restore global profile configs: ${formatError(error)}`);
  }
  try {
    restoreClaudeAppGatewayConfig();
  } catch (error) {
    console.error(`Failed to restore Claude App gateway config: ${formatError(error)}`);
  }
}

// The other side of restoreTakeoversWhenNoGatewayServes: another process restored the takeovers as it stopped, and this one serves now. Never throws.
export async function applyTakeoversAfterGatewayReplaced(): Promise<void> {
  let config: AppConfig;
  try {
    // From the store, as the restore reads it: the config this process holds can be older than a save the other process made, and an apply prunes the keys of profiles it does not list.
    config = await loadAppConfig();
  } catch (error) {
    console.error(`Skipped applying profiles after taking over the gateway: ${formatError(error)}`);
    return;
  }
  const loadError = appConfigLoadError(config);
  if (loadError) {
    console.error(`Skipped applying profiles after taking over the gateway: ${loadError}`);
    return;
  }
  let synced = config;
  try {
    synced = (await syncClaudeAppGatewayConfig(config)).config;
  } catch (error) {
    console.error(`Failed to sync Claude App gateway config after taking over the gateway: ${formatError(error)}`);
  }
  try {
    for (const client of (await applyProfileConfig(synced, { excludeAgents: ["zcode"] })).clients) {
      if (!client.ok) {
        console.error(`Failed to apply ${client.client} profile after taking over the gateway: ${client.message}`);
      }
    }
  } catch (error) {
    console.error(`Failed to apply profiles after taking over the gateway: ${formatError(error)}`);
  }
}

function synchronizeGlobalProfileTakeovers(
  profiles: ProfileConfig[],
  canTakeOver: boolean,
  excludedAgents: ReadonlySet<ProfileClientKind> = new Set()
): ProfileClientApplyStatus[] {
  const next = canTakeOver ? globalProfileTakeoverRecords(profiles) : [];
  const previous = ownedGlobalProfileTakeovers ?? readGlobalProfileTakeoverMarker();
  const preserved = previous.filter((record) => excludedAgents.has(record.agent));
  const restorable = previous.filter((record) => !excludedAgents.has(record.agent));
  if (JSON.stringify(restorable) === JSON.stringify(next)) {
    storeGlobalProfileTakeoverRecords(dedupeGlobalProfileTakeovers([...preserved, ...next]));
    return [];
  }

  const statuses = restorable.length > 0 ? restoreGlobalProfileTakeoverRecords(restorable) : [];
  const markerRecords = statuses.every((status) => status.ok)
    ? dedupeGlobalProfileTakeovers([...preserved, ...next])
    : dedupeGlobalProfileTakeovers([...preserved, ...restorable, ...next]);
  storeGlobalProfileTakeoverRecords(markerRecords);
  return statuses;
}

function storeGlobalProfileTakeoverRecords(records: GlobalProfileTakeoverRecord[]): void {
  const previous = ownedGlobalProfileTakeovers;
  ownedGlobalProfileTakeovers = records;
  // Another LLM Router process can clear the marker file as it stops, so matching records in memory do not show the file is there.
  if (JSON.stringify(previous) === JSON.stringify(records) && (records.length === 0) !== existsSync(globalProfileTakeoverFile)) {
    return;
  }
  if (records.length > 0) {
    writeGlobalProfileTakeoverMarker(records);
  } else {
    clearGlobalProfileTakeoverMarker();
  }
}

function globalProfileTakeoverRecords(profiles: ProfileConfig[]): GlobalProfileTakeoverRecord[] {
  return dedupeGlobalProfileTakeovers(profiles
    .filter((profile) => profile.enabled && isGlobalProfile(profile))
    .map((profile) => ({
      agent: profile.agent,
      codexHome: profile.codexHome?.trim() || undefined,
      configFile: profile.configFile?.trim() || undefined,
      id: profile.id,
      name: profile.name,
      providerId: profile.providerId?.trim() || undefined,
      settingsFile: profile.settingsFile?.trim() || undefined
    })));
}

function restoreGlobalProfileTakeoverRecords(records: GlobalProfileTakeoverRecord[]): ProfileClientApplyStatus[] {
  // A quit keeps the profile enabled, and the takeover sync applies it again at once.
  return records.map((record) => disabledProfileStatus({
    ...record,
    enabled: false,
    env: {},
    model: "",
    scope: "global",
    surface: "auto"
  }, [], false));
}

// One agent's failed restore is reported, not thrown: a throw stops every other agent being restored on a quit and being applied on a save.
function failedRestoreStatus(client: ProfileClientKind, file: string, error: unknown): ProfileClientApplyStatus {
  console.error(`Failed to restore ${resolveUserPath(file)}: ${formatError(error)}`);
  return {
    client,
    enabled: false,
    message: `LLMR could not restore ${resolveUserPath(file)}: ${formatError(error)}`,
    ok: false,
    path: resolveUserPath(file)
  };
}

function dedupeGlobalProfileTakeovers(records: GlobalProfileTakeoverRecord[]): GlobalProfileTakeoverRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = JSON.stringify(record);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readGlobalProfileTakeoverMarker(): GlobalProfileTakeoverRecord[] {
  const { profiles } = readStateJson(globalProfileTakeoverFile);
  if (!Array.isArray(profiles)) {
    return [];
  }
  return profiles.filter((value): value is GlobalProfileTakeoverRecord =>
    isRecord(value) &&
    (value.agent === "claude-code" || value.agent === "codex" || value.agent === "opencode" || value.agent === "kilo" || value.agent === "pi" || value.agent === "workbuddy" || value.agent === "zcode") &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

// An unparseable state file still holds what LLMR last recorded; move it aside so the next write cannot erase it.
function readStateJson(file: string): Record<string, unknown> {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    const kept = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      renameSync(file, kept);
      console.warn(`[profile] ${file} is not valid JSON; moved it to ${kept} and continued without it.`);
    } catch (renameError) {
      console.warn(`[profile] ${file} is not valid JSON and could not be moved aside (${formatError(renameError)}); continued without it.`);
    }
    return {};
  }
}

function writeGlobalProfileTakeoverMarker(records: GlobalProfileTakeoverRecord[]): void {
  mkdirSync(path.dirname(globalProfileTakeoverFile), { recursive: true });
  writeFileAtomic(globalProfileTakeoverFile, `${JSON.stringify({ profiles: records, version: 1 }, null, 2)}\n`, { mode: privateFileMode });
}

function clearGlobalProfileTakeoverMarker(): void {
  rmSync(globalProfileTakeoverFile, { force: true });
}

function inactiveGlobalCleanupStatus(
  client: ProfileClientKind,
  file: string,
  restoreResult: RestoreFileResult
): ProfileClientApplyStatus {
  return {
    backupFile: restoreResult.backupFile,
    client,
    enabled: false,
    message: restoreResult.missingBackup
      ? `No active global ${codexCompatibleClientName(client)} profile is configured, but the global config is managed by LLMR and no original backup was found.`
      : restoredConfigMessage(client, restoreResult) ?? (restoreResult.stripped
        ? `${codexCompatibleClientName(client)} global config had its LLMR-managed settings removed because no active global profile is configured.`
        : `${codexCompatibleClientName(client)} global config was restored because no active global profile is configured.`),
    ok: !restoreResult.missingBackup,
    path: resolveUserPath(file)
  };
}

function uniqueResolvedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const resolved = resolveUserPath(item);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

function restoreDisabledZcodeProfile(profile: ProfileConfig, configFile: string): ProfileClientApplyStatus {
  const disabledMessage = "ZCode profile is disabled.";
  if (!isGlobalProfile(profile)) {
    return disabledStatus("zcode", configFile, disabledMessage);
  }

  const providerId = sanitizeCodexProviderId(profile.providerId || "") || "llm-router";
  const storageRoot = zcodeHomeFromConfigFile(configFile);
  const files = [
    configFile,
    path.join(storageRoot, "v2", "config.json"),
    path.join(storageRoot, "v2", "bots-model-cache.v2.json")
  ];
  const results = files.map((file) =>
    restoreGlobalConfigFile(file, {
      isManagedContent: (content) => isManagedZcodeConfigContent(content, providerId),
      mode: privateFileMode
    })
  );
  const changed = results.some((result) => result.changed);
  const restored = results.some((result) => result.restored);
  const missingBackup = results.some((result) => result.missingBackup);
  return {
    backupFile: results.find((result) => result.backupFile)?.backupFile,
    changed,
    client: "zcode",
    enabled: false,
    message: missingBackup
      ? `${disabledMessage} No original ZCode config backup was found for ${profile.name || profile.id || "this profile"}.`
      : restored
        ? changed
          ? "ZCode config was restored from the LLMR backup because the global profile is disabled."
          : "ZCode config already matches the LLMR backup; profile is disabled."
        : disabledMessage,
    ok: !missingBackup,
    path: resolveUserPath(configFile)
  };
}

function disabledRestoreStatus(
  client: ProfileClientKind,
  file: string,
  disabledMessage: string,
  restoreResult: RestoreFileResult,
  profileName: string,
  staysDisabled: boolean
): ProfileClientApplyStatus {
  return {
    backupFile: restoreResult.backupFile,
    changed: restoreResult.changed,
    client,
    enabled: false,
    message: restoreResult.missingBackup
      ? `${disabledMessage} No original ${codexCompatibleClientName(client)} config backup was found for ${profileName}.`
      : restoredConfigMessage(client, restoreResult, staysDisabled) ?? (restoreResult.stripped
        ? `${codexCompatibleClientName(client)} config had its LLMR-managed settings removed because the global profile is disabled.`
        : restoreResult.restored
          ? restoreResult.changed
            ? `${codexCompatibleClientName(client)} config was restored from the LLMR backup because the global profile is disabled.`
            : `${codexCompatibleClientName(client)} config already matches the LLMR backup; profile is disabled.`
          : `${disabledMessage} LLMR found nothing to restore in ${resolveUserPath(file)} and left it unchanged.`),
    ok: !restoreResult.missingBackup,
    path: resolveUserPath(file)
  };
}

// A restore asks for no confirmation, so its message says what happened to the file and, when the profile stays disabled, how to undo it. Agents without a stripper keep the older wording.
function restoredConfigMessage(client: ProfileClientKind, result: Partial<RestoreFileResult>, staysDisabled = false): string | undefined {
  if (client !== "claude-code" && client !== "opencode" && client !== "kilo" && !isCodexFamily(client)) {
    return undefined;
  }
  const name = codexCompatibleClientName(client);
  const outcome = result.removed
    ? `${name} config was removed because it did not exist before LLMR.`
    : result.absent
      ? result.restored
        ? `${name} config is already absent, as before LLMR.`
        : `${name} config is absent, so LLMR had nothing to restore.`
      : result.stripped
        ? `LLMR's settings were removed from ${name} config and your own settings were kept.`
        : result.restored
          ? result.changed
            ? `${name} config was restored to what it was before LLMR.`
            : `${name} config already matches what it was before LLMR.`
          : undefined;
  return outcome && staysDisabled
    ? `${outcome} Profile is disabled. Switch it on to undo this. ${name} may ask you to log in.`
    : outcome;
}

function restoreGlobalConfigFile(
  file: string,
  options: RestoreManagedContentMatchers & { keepLiveFile?: boolean; mode?: number }
): RestoreFileResult {
  const result = restoreGlobalConfigFileContent(file, options);
  // Last, so a failure before it leaves the record for the next restore. Not through `onReleased`: the sweep for inactive Codex profiles never calls it. It runs for every agent's file and finds a record only for the agents that write one.
  if (!options.keepLiveFile && !result.missingBackup) {
    clearCodexWrittenRecord(file);
  }
  return result;
}

function restoreGlobalConfigFileContent(
  file: string,
  options: RestoreManagedContentMatchers & { keepLiveFile?: boolean; mode?: number }
): RestoreFileResult {
  const current = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const currentManaged = current !== undefined && options.isManagedContent(current);
  const strip = options.keepLiveFile ? undefined : options.stripLiveContent ?? options.stripManagedContent;
  const originalMissing = existsSync(originalMissingFilePath(file));
  const noOriginal = originalMissing && !existsSync(originalBackupFilePath(file));
  const findSnapshot = () => originalSnapshotCandidate(file, options, noOriginal && !options.keepLiveFile ? options.stripManagedContent : undefined);
  if (current !== undefined && !currentManaged) {
    const stripped = strip && hasTakeoverSnapshot(file)
      ? options.stripBeforeSnapshot ? options.stripLiveContent?.(current, findSnapshot()?.content) : strip(current)
      : undefined;
    if (strip && originalMissing) {
      if (stripped === undefined) {
        forgetMissingOriginal(file);
        return { changed: false, file, missingBackup: false, restored: false };
      }
      // This file holds content LLMR did not write, so the strip is a guess about someone else's file.
      saveConfigSafetyCopy(file, current);
      const result = writeStrippedConfigFile(file, stripped, options.mode, options.isEmptyContent);
      forgetMissingOriginal(file);
      return result;
    }
    if (stripped === undefined) {
      return { changed: false, file, missingBackup: false, restored: false };
    }
    if (options.stripBeforeSnapshot) {
      saveConfigSafetyCopy(file, current);
    }
    const backupFile = backupCurrentConfigFile(file, options);
    writeFileAtomic(file, stripped, { mode: options.mode });
    return { backupFile, changed: true, file, missingBackup: false, restored: false, stripped: true };
  }

  const snapshot = findSnapshot();
  if (snapshot) {
    if (current === snapshot.content) {
      chmodFileIfRequested(file, options.mode);
      return { changed: false, file, missingBackup: false, restored: true };
    }

    // The snapshot is byte-exact only for a file nobody touched. Anything else holds what the user or the agent wrote since, which the snapshot would discard.
    // No record counts as touched: nothing shows the file is as LLMR wrote it.
    if (options.stripBeforeSnapshot && current !== undefined && !isAsWritten(readCodexWrittenRecord(file), current)) {
      const stripped = options.stripLiveContent?.(current, snapshot.content);
      saveConfigSafetyCopy(file, current);
      if (stripped !== undefined) {
        writeFileAtomic(file, stripped, { mode: options.mode });
        return { changed: true, file, missingBackup: false, restored: false, stripped: true };
      }
    }

    const backupFile = current === undefined ? undefined : backupCurrentConfigFile(file, options);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, snapshot.content, { mode: options.mode });
    return { backupFile, changed: true, file, missingBackup: false, restored: true };
  }

  if (originalMissing) {
    if (strip) {
      const stripped = current === undefined ? undefined : strip(current);
      if (current !== undefined && stripped === undefined) {
        return { changed: false, file, missingBackup: false, restored: false };
      }
      // Each copy is saved before anything is changed or deleted, so a failed save leaves the restore to run again.
      if (current === undefined) {
        saveNewestUserBackupCopy(file, options.stripManagedContent ?? strip, options.isEmptyContent);
      } else if (!isUntouchedSinceWritten(file, current)) {
        saveConfigSafetyCopy(file, current);
      }
      const result: RestoreFileResult = stripped === undefined
        ? { absent: true, changed: false, file, missingBackup: false, restored: true }
        : writeStrippedConfigFile(file, stripped, options.mode, options.isEmptyContent);
      forgetMissingOriginal(file);
      return result;
    }
    if (currentManaged) {
      const backupFile = backupCurrentConfigFile(file, options);
      removeFileKeepingLink(file);
      return { backupFile, changed: true, file, missingBackup: false, restored: true };
    }
    return { changed: false, file, missingBackup: false, restored: current === undefined };
  }

  return {
    absent: current === undefined,
    changed: false,
    file,
    missingBackup: Boolean(currentManaged),
    restored: false
  };
}

function saveConfigSafetyCopy(file: string, content: string): string {
  return saveRemovedConfigCopy(path.dirname(codexWrittenRecordFile(file)), file, content);
}

// For a file that had no original. Only Codex, Workbuddy, OpenCode and Kilo have a record. A managed Claude Code file holds only LLMR's keys, and a file without a record cannot show an edit, so neither gets a copy here.
function isUntouchedSinceWritten(file: string, current: string): boolean {
  const record = readCodexWrittenRecord(file);
  return !record || isAsWritten(record, current);
}

// The user deleted the live file, so the backups about to go are the last place their settings are.
function saveNewestUserBackupCopy(file: string, strip: (content: string) => string | undefined, isEmptyContent = isEmptyConfigContent): void {
  for (const backup of backupFiles(file).reverse()) {
    const content = readFileSync(backup, "utf8");
    const kept = strip(content);
    if (kept !== undefined && !isEmptyContent(kept)) {
      saveConfigSafetyCopy(file, content);
      return;
    }
  }
}

// Only for a file that had no original. The caller has saved any safety copy. A backup beside the file would hold the profile's token, or would equal the stripped file, so this writes none.
function writeStrippedConfigFile(file: string, stripped: string, mode: number | undefined, isEmptyContent = isEmptyConfigContent): RestoreFileResult {
  if (isEmptyContent(stripped)) {
    removeFileKeepingLink(file);
    return { changed: true, file, missingBackup: false, removed: true, restored: true };
  }
  writeFileAtomic(file, stripped, { mode });
  return { changed: true, file, missingBackup: false, restored: false, stripped: true };
}

// Runs after the live file is settled, marker last, so a failure midway leaves a state the next restore still recognises.
// Every backup goes: each is a copy from LLMR's time, and a stripped one would later be taken for the user's original and written back.
function forgetMissingOriginal(file: string): void {
  for (const backup of backupFiles(file)) {
    rmSync(backup, { force: true });
  }
  rmSync(originalMissingFilePath(file), { force: true });
}

function isEmptyConfigContent(content: string): boolean {
  if (!content.trim()) {
    return true;
  }
  const settings = parseJsonContent(content);
  return settings !== undefined &&
    Object.keys(settings).every((key) => key === "env" && isRecord(settings.env) && Object.keys(settings.env).length === 0);
}

function hasTakeoverSnapshot(file: string): boolean {
  return backupFiles(file).length > 0 || existsSync(originalBackupFilePath(file)) || existsSync(originalMissingFilePath(file));
}

function originalSnapshotCandidate(
  file: string,
  matchers: RestoreManagedContentMatchers,
  stripWhenNoOriginal?: (content: string) => string | undefined
): { content: string; file: string } | undefined {
  // Prefer the most recent non-LLMR snapshot captured immediately before the
  // latest takeover. The permanent .llmr-original file can be stale when the
  // user changes the agent config between separate LLMR sessions.
  for (const candidate of [...backupFiles(file).reverse(), originalBackupFilePath(file)]) {
    if (!existsSync(candidate)) {
      continue;
    }
    const content = readFileSync(candidate, "utf8");
    // An apply never backs up a file it cannot parse, so an unparsed candidate is damage. With no original, a copy that carries a takeover can hold a setting the user has since deleted.
    const takeover = matchers.takeoverContent?.(content);
    if (takeover === "unparsed") {
      continue;
    }
    if (stripWhenNoOriginal && (takeover === undefined ? stripWhenNoOriginal(content) !== undefined : takeover === "parsed")) {
      continue;
    }
    if (!matchers.isManagedContent(content)) {
      // A backup taken at release can still hold the previous takeover's keys.
      return { content: matchers.stripManagedContent?.(content) ?? content, file: candidate };
    }
  }
  return undefined;
}

// A copy of a live file under `stripBeforeSnapshot` would hold the token. The snapshot or the safety copy already holds whatever of the user's is in it.
function backupCurrentConfigFile(file: string, options: RestoreManagedContentMatchers & { mode?: number }): string | undefined {
  return options.stripBeforeSnapshot
    ? undefined
    : backupCurrentFile(file, { contentForBackup: options.contentForBackup, isManagedContent: options.isManagedContent, mode: options.mode });
}

function originalBackupFilePath(file: string): string {
  return `${file}${originalBackupSuffix}`;
}

function originalMissingFilePath(file: string): string {
  return `${file}${originalMissingSuffix}`;
}

function unavailableModelStatus(profile: ProfileConfig, file: string): ProfileClientApplyStatus {
  return refusedProfileStatus(profile, file, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
}

function refusedProfileStatus(profile: ProfileConfig, file: string, message: string): ProfileClientApplyStatus {
  return {
    client: profile.agent,
    enabled: true,
    message,
    ok: false,
    path: resolveUserPath(file)
  };
}

function isGlobalProfile(profile: ProfileConfig): boolean {
  return normalizeProfileScope(profile.scope) === "global";
}

function isManagedClaudeCodeSettingsContent(content: string, managedSettingPaths: string[] = [], endpoints: string[] = []): boolean {
  const settings = parseJsonContent(content);
  if (!settings) {
    return false;
  }
  if (!isPureManagedClaudeCodeSettings(settings, managedSettingPaths)) {
    return false;
  }
  if (isManagedClaudeCodeApiKeyHelper(settings.apiKeyHelper)) {
    return true;
  }
  const env = isRecord(settings.env) ? settings.env : {};
  if (endpoints.length > 0) {
    return claudeCodeGatewayEnvKeys.some((key) => typeof env[key] === "string" && endpoints.includes(env[key]));
  }
  return typeof env.ANTHROPIC_BASE_URL === "string" &&
    typeof env.ANTHROPIC_API_BASE_URL === "string" &&
    typeof env.CLAUDE_AGENT_API_BASE_URL === "string";
}

function stripManagedClaudeCodeSettingsContent(
  content: string,
  managedEnvKeys: string[] = [],
  managedSettingPaths: string[] = [],
  displacedEnv: Record<string, string> = {},
  endpoints: string[] = [],
  keepEmptyEnv = false
): string | undefined {
  const settings = parseJsonContent(content);
  if (!settings) {
    return undefined;
  }
  const nextSettings = withoutManagedClaudeCodeApiKeyHelper(removeClaudeCodeProfileSettings(settings, managedSettingPaths, []));
  if (isRecord(nextSettings.env)) {
    const hadEnv = Object.keys(nextSettings.env).length > 0;
    const env = withoutManagedClaudeCodeEnv(nextSettings.env, managedEnvKeys, displacedEnv, endpoints);
    nextSettings.env = env;
    if (hadEnv && !keepEmptyEnv && Object.keys(env).length === 0) {
      delete nextSettings.env;
    }
  } else if (nextSettings.env === undefined && Object.keys(displacedEnv).length > 0) {
    nextSettings.env = { ...displacedEnv };
  }
  return jsonValuesEqual(settings, nextSettings) ? undefined : `${JSON.stringify(nextSettings, null, 2)}\n`;
}

function withoutManagedClaudeCodeEnv(
  env: Record<string, unknown>,
  managedEnvKeys: string[],
  displacedEnv: Record<string, string> = {},
  endpoints: string[] = []
): Record<string, unknown> {
  const routerWif = env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId;
  const onRecord = endpoints.length > 0;
  const trioIntact = isClaudeCodeGatewayTakeoverEnv(env);
  const takeoverActive = trioIntact || onRecord;
  const next = Object.fromEntries(Object.entries(env).filter(([key, value]) =>
    !managedEnvKeys.includes(key) &&
    !((claudeCodeGatewayEnvKeys as readonly string[]).includes(key) && (onRecord ? typeof value === "string" && endpoints.includes(value) : trioIntact)) &&
    !(claudeCodeNoProxyEnvKeys as readonly string[]).includes(key) &&
    !((claudeCodeGatewayCompatibilityEnvKeys as readonly string[]).includes(key) && (!onRecord || value === "1")) &&
    !(routerWif && isClaudeCodeWifEnvKey(key)) &&
    key !== CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV &&
    key !== CLAUDE_CODE_MCP_CONFIG_ENV &&
    !isStaleClaudeCodeSettingsEnvKey(key) &&
    !(takeoverActive && isClaudeCodeManagedModelEnvKey(key)) &&
    !isBotGatewayEnvKey(key)
  ));
  const endpointHosts = endpoints.filter((endpoint) => URL.canParse(endpoint)).map((endpoint) => new URL(endpoint).hostname.replace(/^\[|\]$/g, ""));
  const llmrHosts = [...gatewayLocalNoProxyHosts, ...endpointHosts];
  for (const key of claudeCodeNoProxyEnvKeys) {
    const usersHosts = onRecord ? noProxyHosts(displacedEnv[key] ?? "") : [];
    const remaining = typeof env[key] === "string"
      ? noProxyHosts(env[key]).filter((host) => !llmrHosts.includes(host) || usersHosts.includes(host)).join(",")
      : "";
    if (remaining) {
      next[key] = remaining;
    }
  }
  withoutClaudeCodeGatewayKeyHeader(next);
  return { ...displacedEnv, ...next };
}

function noProxyHosts(value: string): string[] {
  return value.split(",").map((host) => host.trim()).filter(Boolean);
}

function isPureManagedClaudeCodeSettings(settings: Record<string, unknown>, managedSettingPaths: string[] = []): boolean {
  const extraSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "apiKeyHelper" && key !== "env"));
  const extraPaths = collectClaudeCodeSettingsPaths(extraSettings);
  if (extraPaths.some((pathValue) => !isClaudeCodeProfileManagedSettingsPath(pathValue, managedSettingPaths))) {
    return false;
  }
  if ("apiKeyHelper" in settings && typeof settings.apiKeyHelper !== "string") {
    return false;
  }
  if (!("env" in settings)) {
    return true;
  }
  if (!isRecord(settings.env)) {
    return false;
  }
  return Object.keys(settings.env).every((key) => isManagedClaudeCodeSettingsEnvKey(key));
}

function isClaudeCodeProfileManagedSettingsPath(pathValue: string, managedSettingPaths: string[]): boolean {
  const normalized = formatClaudeCodeSettingsPath(parseClaudeCodeSettingsPath(pathValue));
  return Boolean(normalized) && uniquePathStrings(managedSettingPaths).some((managedPath) =>
    normalized === managedPath ||
    normalized.startsWith(`${managedPath}.`) ||
    managedPath.startsWith(`${normalized}.`)
  );
}

function codexManagedContent(agent: ProfileClientKind, providerIds: string[], file: string): RestoreManagedContentMatchers {
  const isManagedContent = (content: string) => providerIds.some((providerId) => isManagedCodexConfigContent(content, providerId));
  return {
    isManagedContent,
    ...(isCodexFamily(agent)
      ? {
          stripBeforeSnapshot: true,
          // The record describes the live file only: a backup or the original is stripped by its text.
          stripLiveContent: (content: string, snapshot?: string) =>
            stripManagedCodexConfigContent(
              content,
              providerIds,
              isManagedContent(content) ? readCodexWrittenRecord(file) : undefined,
              snapshot === undefined ? undefined : readCodexDisplacedConfig(snapshot, providerIds)
            ),
          stripManagedContent: (content: string) => stripManagedCodexConfigContent(content, providerIds)
        }
      : {})
  };
}

function providerJsonManagedContent(client: ProviderJsonClient): RestoreManagedContentMatchers {
  const schema = client === "kilo" ? kiloDefaultSchema : openCodeDefaultSchema;
  return {
    isEmptyContent: (content) => isEmptyProviderJsonContent(content, schema),
    isManagedContent: (content) => isManagedProviderJsonContent(content, client),
    stripBeforeSnapshot: true,
    stripLiveContent: (content, snapshot) => stripManagedProviderJsonContent(content, { client }, snapshot),
    stripManagedContent: (content) => stripManagedProviderJsonContent(content, { client })
  };
}

function isManagedZcodeConfigContent(content: string, providerId: string): boolean {
  const config = parseJsonContent(content);
  if (!config) {
    return false;
  }
  if (isRecord(config.provider) && hasOwn(config.provider, providerId)) {
    return true;
  }
  if (isRecord(config.model) && typeof config.model.main === "string" && config.model.main.startsWith(`${providerId}/`)) {
    return true;
  }
  for (const key of ["defaultModel", "lastUsed", "lastUsedModel"]) {
    const modelRef = config[key];
    if (isRecord(modelRef) && modelRef.providerId === providerId) {
      return true;
    }
  }
  return Array.isArray(config.providers) && config.providers.some((provider) =>
    isRecord(provider) && provider.id === providerId
  );
}

function parseJsonContent(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toolHubResolverModel(config: AppConfig): string {
  const model = config.toolHub.llm.model.trim();
  if (!model) {
    return "";
  }
  if (model.includes("/")) {
    return model;
  }
  const baseUrl = normalizeUrlForMatch(config.toolHub.llm.baseUrl);
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const provider = enabledProviders.find((candidate) =>
    candidate.models.includes(model) &&
    (!baseUrl || normalizeUrlForMatch(providerBaseUrl(candidate)) === baseUrl)
  ) ?? enabledProviders.find((candidate) => candidate.models.includes(model));
  return provider?.name ? `${provider.name}/${model}` : model;
}

function normalizeUrlForMatch(value: string | undefined): string {
  return (value || "").trim().replace(/\/+$/g, "");
}

// Codex's RESERVED_MODEL_PROVIDER_IDS, read at rust-v0.172.0.
const reservedCodexProviderIds = ["openai", "ollama", "lmstudio", "gcp", "amazon-bedrock", "amazon-bedrock-runtime"];

function sanitizeCodexProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeCodexConfigFormat(_value: ProfileConfig["configFormat"]): "legacy" | "separate_profile_files" {
  return "separate_profile_files";
}

function normalizeCodexRemoteFrontendMode(value: ProfileConfig["remoteFrontendMode"]): "app" | "cli" | "claude-code" {
  return value === "cli" || value === "claude-code" ? value : "app";
}

function normalizeProfileScope(value: ProfileConfig["scope"]): "llmr" | "global" | "custom" {
  return value === "llmr" || value === "custom" ? value : "global";
}

function isGeneratedProfileScope(value: ProfileConfig["scope"]): boolean {
  return value === "llmr" || value === "custom";
}

function normalizeProfileSurface(value: ProfileConfig["surface"]): "auto" | "cli" | "app" {
  return value === "cli" || value === "app" ? value : "auto";
}

function codexCompatibleClientName(agent: ProfileConfig["agent"]): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  if (agent === "grok") {
    return "Grok CLI";
  }
  if (agent === "kimi") {
    return "Kimi CLI";
  }
  if (agent === "opencode") {
    return "OpenCode";
  }
  if (agent === "kilo") {
    return "Kilo CLI";
  }
  if (agent === "pi") {
    return "Pi";
  }
  if (agent === "workbuddy") {
    return "Workbuddy";
  }
  return agent === "zcode" ? "ZCode" : "Codex";
}

function defaultCodexConfigFile(agent: ProfileConfig["agent"]): string {
  return agent === "zcode"
    ? "~/.zcode/cli/config.json"
    : agent === "kilo"
      ? "~/.config/kilo/kilo.jsonc"
      : agent === "workbuddy"
        ? "~/.workbuddy/config.toml"
        : agent === "pi"
          ? "~/.pi/agent"
          : "~/.codex/config.toml";
}

function codexConfigSubdir(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "zcode" : agent === "workbuddy" ? "workbuddy" : "codex";
}

function defaultCodexCliCommand(agent: ProfileConfig["agent"]): string {
  return agent === "zcode" ? "zcode" : agent === "workbuddy" ? "codebuddy" : "codex";
}

function defaultCodexCompatibleHome(agent: ProfileConfig["agent"], configFile: string): string {
  return agent === "zcode" ? zcodeHomeFromConfigFile(configFile) : path.dirname(configFile);
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((value) => tomlString(value)).join(", ")}]`;
}

function tomlInlineStringTable(values: Record<string, string>): string {
  return `{ ${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${tomlKey(key)} = ${tomlString(value)}`)
    .join(", ")} }`;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

