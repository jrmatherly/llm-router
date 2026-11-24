import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONFIGDIR } from "@llmr/core/config/constants";
import { availableGatewayModelIds, isGatewayProviderEnabled, type AppConfig, type ProfileClientApplyStatus, type ProfileConfig } from "@llmr/core/contracts/app";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, readCatalogCapability, type ModelCatalogEntry } from "@llmr/core/gateway/model-catalog";
import { withoutClaudeLoginProviders } from "@llmr/core/gateway/features/claude-login-pass-through";
import { windowsBatchEscapeValue as cmdValue, windowsBatchSetLine as cmdSetLine } from "@llmr/core/platform/windows-batch";
import { cmdQuote, defaultClientModel, disabledStatus, firstTomlTableIndex, formatError, gatewayEndpoint, gatewayNoProxyHosts, linkProfileHomeEntry, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, providerBaseUrl, sanitizeProfilePathSegment, shellQuote, tomlQuotedKey, tomlString, trimLeadingBlankLines, uniqueOrderedStrings, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
import { getProviderCatalogModels } from "@llmr/core/providers/model-catalog";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";
import { resolveUsageModelAttribution } from "@llmr/core/usage/model-attribution";

export function applyKimiProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const wrapperFile = kimiWrapperPath(profile);
  if (!profile.enabled) {
    return disabledStatus("kimi", wrapperFile, "Kimi CLI profile is disabled.");
  }

  try {
    const models = kimiProfileModels(config, profile);
    const model = models[0];
    const wrapperResult = writeKimiWrapper(config, profile, token, model, models);
    return {
      appliedAt,
      client: "kimi",
      enabled: true,
      message: wrapperResult.changed
        ? `Kimi CLI is configured to use LLMR (wrapper ${wrapperResult.file}).`
        : "Kimi CLI already points to LLMR.",
      ok: true,
      path: wrapperResult.file
    };
  } catch (error) {
    return {
      client: "kimi",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: wrapperFile
    };
  }
}

function writeKimiWrapper(
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  model: string,
  models: string[]
): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const profileHome = ensureKimiProfileHome(profile);
  const configResult = writeKimiProfileConfig(config, profile, token, model, models, profileHome);
  const file = kimiWrapperPath(profile);
  const content = process.platform === "win32"
    ? kimiWrapperCmdScript(config, profile, profileHome)
    : kimiWrapperShellScript(config, profile, profileHome);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return { changed: configResult.changed || writeResult.changed, file };
}

export function kimiWrapperPath(profile: ProfileConfig): string {
  return path.join(CONFIGDIR, "bin", kimiWrapperFilename(profile));
}

function kimiWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "kimi";
  return process.platform === "win32"
    ? `llmr-kimi-cli-wrapper-${slug}.cmd`
    : `llmr-kimi-cli-wrapper-${slug}`;
}

function kimiWrapperShellScript(config: AppConfig, profile: ProfileConfig, profileHome: string): string {
  const realKimi = profile.env?.LLMR_KIMI_BIN?.trim() || profile.env?.KIMI_BIN?.trim() || "kimi";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isKimiManagedEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "#!/bin/sh",
    ...envExports,
    `if [ -n "\${NO_PROXY:-}" ]; then NO_PROXY="$NO_PROXY,${noProxyHosts}"; else NO_PROXY=${shellQuote(noProxyHosts)}; fi`,
    `if [ -n "\${no_proxy:-}" ]; then no_proxy="$no_proxy,${noProxyHosts}"; else no_proxy=${shellQuote(noProxyHosts)}; fi`,
    "export NO_PROXY no_proxy",
    `unset ${kimiSingleModelEnvNames.join(" ")}`,
    `export KIMI_CODE_HOME=${shellQuote(profileHome)}`,
    "export LLMR_PROFILE_SURFACE=cli",
    `exec ${shellQuote(realKimi)} "$@"`,
    ""
  ].join("\n");
}

function kimiWrapperCmdScript(config: AppConfig, profile: ProfileConfig, profileHome: string): string {
  const realKimi = profile.env?.LLMR_KIMI_BIN?.trim() || profile.env?.KIMI_BIN?.trim() || "kimi";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => !isKimiManagedEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "@echo off",
    ...envExports,
    `set "NO_PROXY=%NO_PROXY%,${cmdValue(noProxyHosts)}"`,
    `set "no_proxy=%no_proxy%,${cmdValue(noProxyHosts)}"`,
    ...kimiSingleModelEnvNames.map((key) => cmdSetLine(key, "")),
    cmdSetLine("KIMI_CODE_HOME", profileHome),
    cmdSetLine("LLMR_PROFILE_SURFACE", "cli"),
    `${cmdQuote(realKimi)} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

const kimiSingleModelEnvNames = [
  "KIMI_MODEL_NAME",
  "KIMI_MODEL_API_KEY",
  "KIMI_MODEL_PROVIDER_TYPE",
  "KIMI_MODEL_BASE_URL",
  "KIMI_MODEL_MAX_CONTEXT_SIZE",
  "KIMI_MODEL_CAPABILITIES",
  "KIMI_MODEL_DISPLAY_NAME",
  "KIMI_MODEL_MAX_OUTPUT_SIZE",
  "KIMI_MODEL_REASONING_KEY",
  "KIMI_MODEL_THINKING_EFFORT",
  "KIMI_MODEL_ADAPTIVE_THINKING",
  "KIMI_MODEL_THINKING_KEEP",
  "KIMI_CODE_CUSTOM_HEADERS"
] as const;

function isKimiManagedEnvKey(key: string): boolean {
  return key === "LLMR_KIMI_BIN" ||
    key === "KIMI_BIN" ||
    key === "LLMR_KIMI_SOURCE_HOME" ||
    key === "KIMI_CODE_HOME" ||
    kimiSingleModelEnvNames.some((name) => key === name) ||
    key === "LLMR_PROFILE_SURFACE";
}

function kimiProfileModels(config: AppConfig, profile: ProfileConfig): string[] {
  const configured = (profile.availableModels ?? [])
    .map((candidate) => normalizeClientModel(candidate))
    .filter(Boolean);
  const available = configured.length > 0 ? configured : availableGatewayModelIds(withoutClaudeLoginProviders(config));
  const defaultModel = normalizeClientModel(profile.model) || available[0] || defaultClientModel(config);
  return uniqueOrderedStrings([defaultModel, ...available]);
}

function writeKimiProfileConfig(
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  defaultModel: string,
  models: string[],
  profileHome: string
): { changed: boolean; file: string } {
  const sourceConfig = path.join(resolveKimiSourceHome(profile), "config.toml");
  const source = existsSync(sourceConfig) ? readFileSync(sourceConfig, "utf8") : "";
  const content = buildKimiProfileConfigToml(source, config, profile, token, defaultModel, models);
  const file = path.join(profileHome, "config.toml");
  const result = writeGeneratedFileIfChanged(file, content, { mode: privateFileMode });
  return { changed: result.changed, file };
}

function buildKimiProfileConfigToml(
  source: string,
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  defaultModel: string,
  models: string[]
): string {
  const preserved = stripKimiProviderAndModelConfig(source);
  const firstTableIndex = firstTomlTableIndex(preserved);
  const rootSource = firstTableIndex === -1 ? preserved : preserved.slice(0, firstTableIndex);
  const restSource = firstTableIndex === -1 ? "" : preserved.slice(firstTableIndex);
  const providerId = "llm-router";
  const baseUrl = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
  const headers = kimiProfileCustomHeaderEntries(profile);
  const providerBlock = [
    `[providers.${tomlQuotedKey(providerId)}]`,
    'type = "openai"',
    `base_url = ${tomlString(baseUrl)}`,
    `api_key = ${tomlString(token)}`,
    "",
    `[providers.${tomlQuotedKey(providerId)}.custom_headers]`,
    ...Object.entries(headers).map(([key, value]) => `${tomlQuotedKey(key)} = ${tomlString(value)}`),
    ""
  ];
  const modelBlocks = models.flatMap((model) => {
    const metadata = kimiProfileModelMetadata(config, model);
    return [
      `[models.${tomlQuotedKey(model)}]`,
      `provider = ${tomlString(providerId)}`,
      `model = ${tomlString(model)}`,
      `max_context_size = ${metadata.contextWindow}`,
      `capabilities = [${metadata.capabilities.map((capability) => tomlString(capability)).join(", ")}]`,
      ...(metadata.supportEfforts.length > 0
        ? [`support_efforts = [${metadata.supportEfforts.map((effort) => tomlString(effort)).join(", ")}]`]
        : []),
      ...(metadata.defaultEffort ? [`default_effort = ${tomlString(metadata.defaultEffort)}`] : []),
      `display_name = ${tomlString(metadata.displayName)}`,
      ""
    ];
  });
  return [
    "# Generated by LLM Router for this Kimi CLI profile.",
    `default_model = ${tomlString(defaultModel)}`,
    trimLeadingBlankLines(rootSource).trimEnd(),
    "",
    ...providerBlock,
    ...modelBlocks,
    trimLeadingBlankLines(restSource).trimEnd(),
    ""
  ].filter((line, index, values) => line !== "" || index === values.length - 1 || values[index - 1] !== "").join("\n");
}

function stripKimiProviderAndModelConfig(source: string): string {
  const kept: string[] = [];
  let inRoot = true;
  let skipTable = false;
  for (const line of source.split(/(?<=\n)/)) {
    const trimmed = line.trim();
    const table = trimmed.match(/^\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
    if (table) {
      inRoot = false;
      skipTable = /^(?:providers|models)(?:\.|$)/.test(table[1]);
      if (!skipTable) {
        kept.push(line);
      }
      continue;
    }
    if (skipTable || (inRoot && /^default_model\s*=/.test(trimmed))) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("");
}

function kimiProfileCustomHeaderEntries(profile: ProfileConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of profile.env?.KIMI_CODE_CUSTOM_HEADERS?.split(/\r?\n/) ?? []) {
    const separator = line.indexOf(":");
    const key = separator > 0 ? line.slice(0, separator).trim() : "";
    const value = separator > 0 ? line.slice(separator + 1).trim() : "";
    if (key && value) {
      headers[key] = value;
    }
  }
  headers["x-llmr-client"] = "kimi";
  headers["x-llmr-profile"] = profile.id || profile.name || "kimi";
  return headers;
}

function kimiProfileModelMetadata(config: AppConfig, selector: string): {
  capabilities: string[];
  contextWindow: number;
  defaultEffort?: string;
  displayName: string;
  supportEfforts: string[];
} {
  const attribution = resolveUsageModelAttribution(config, selector);
  const provider = config.Providers.find((candidate) =>
    isGatewayProviderEnabled(candidate) &&
    candidate.name.toLowerCase() === attribution.provider?.toLowerCase()
  );
  const model = attribution.model?.trim() || selector;
  const metadata = providerModelMetadataForKimi(provider, model);
  const configuredContextWindow = kimiPositiveInteger(metadata?.maxContextWindow ?? metadata?.contextWindow);
  const physicalSelector = provider ? `${provider.name}/${model}` : selector;
  const catalogProvider = provider
    ? getProviderCatalogModels({ baseUrl: providerBaseUrl(provider), name: provider.name }).provider
    : undefined;
  const catalogSelectors = uniqueOrderedStrings([
    catalogProvider ? `${catalogProvider}/${model}` : "",
    physicalSelector,
    selector
  ]);
  const catalogEntries = catalogSelectors
    .map((candidate) => findModelCatalogEntry(candidate))
    .filter((entry): entry is ModelCatalogEntry => entry !== undefined);
  const catalogContextWindow = catalogEntries.reduce((resolved, entry) =>
    resolved || modelCatalogMaxInputTokens(entry), 0
  );
  const contextWindow = configuredContextWindow ?? (catalogContextWindow > 0 ? catalogContextWindow : 262_144);
  const reasoning = kimiProfileReasoningMetadata(metadata, catalogEntries[0]);

  const logicalProvider = config.Providers.find((candidate) =>
    isGatewayProviderEnabled(candidate) &&
    selector.toLowerCase().startsWith(`${candidate.name}/`.toLowerCase())
  );
  if (!logicalProvider) {
    return { contextWindow, displayName: selector, ...reasoning };
  }
  const logicalModel = selector.slice(logicalProvider.name.length + 1);
  const modelName = providerModelDisplayNameForKimi(logicalProvider, logicalModel) || logicalModel;
  return { contextWindow, displayName: `${logicalProvider.name} / ${modelName}`, ...reasoning };
}

function kimiProfileReasoningMetadata(
  metadata: ReturnType<typeof providerModelMetadataForKimi>,
  catalogEntry: ModelCatalogEntry | undefined
): { capabilities: string[]; defaultEffort?: string; supportEfforts: string[] } {
  const configuredEfforts = metadata?.supportedReasoningLevels === undefined
    ? []
    : uniqueOrderedStrings(metadata.supportedReasoningLevels
        .map((level) => level.effort.trim().toLowerCase())
        .filter((effort) => effort !== "off" && effort !== "none"));
  const catalogCapabilities = catalogEntry?.capabilities ?? {};
  const catalogInputModalities = new Set(
    (catalogEntry?.modalities?.input ?? []).map((modality) => modality.trim().toLowerCase())
  );
  const supportsImageInput = metadata?.capabilities?.imageInput ??
    (
      readCatalogCapability(catalogCapabilities, "imageInput") ||
      readCatalogCapability(catalogCapabilities, "vision") ||
      catalogInputModalities.has("image")
    );
  const capabilities = [
    "tool_use",
    ...(supportsImageInput ? ["image_in"] : [])
  ];
  const supportsReasoning = metadata?.supportsReasoningSummaries ??
    (configuredEfforts.length > 0 || readCatalogCapability(catalogCapabilities, "reasoning"));
  if (!supportsReasoning) {
    return { capabilities, supportEfforts: [] };
  }

  capabilities.push(catalogCapabilities.noneReasoningEffort === false ? "always_thinking" : "thinking");
  const configuredDefault = metadata?.defaultReasoningLevel?.trim().toLowerCase();
  const defaultEffort = configuredDefault && configuredEfforts.includes(configuredDefault)
    ? configuredDefault
    : undefined;
  return {
    capabilities,
    ...(defaultEffort ? { defaultEffort } : {}),
    supportEfforts: configuredEfforts
  };
}

function providerModelMetadataForKimi(provider: AppConfig["Providers"][number] | undefined, model: string) {
  const entries = Object.entries(provider?.modelMetadata ?? {});
  return entries.find(([candidate]) => candidate.trim().toLowerCase() === model.toLowerCase())?.[1];
}

function providerModelDisplayNameForKimi(provider: AppConfig["Providers"][number], model: string): string | undefined {
  return Object.entries(provider.modelDisplayNames ?? {})
    .find(([candidate]) => candidate.trim().toLowerCase() === model.toLowerCase())?.[1]
    ?.trim();
}

function kimiPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function ensureKimiProfileHome(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "kimi";
  const profileHome = path.join(CONFIGDIR, "profiles", slug, "kimi");
  const sourceHome = resolveKimiSourceHome(profile);
  mkdirSync(profileHome, { mode: privateDirMode, recursive: true });
  if (path.resolve(sourceHome) === path.resolve(profileHome)) {
    return profileHome;
  }
  for (const entry of [
    "AGENTS.md",
    "tui.toml",
    "mcp.json",
    "skills",
    "plugins",
    "session_index.jsonl",
    "credentials",
    "sessions",
    "bin",
    "logs",
    "updates",
    "user-history",
    "device_id"
  ]) {
    linkProfileHomeEntry(path.join(sourceHome, entry), path.join(profileHome, entry));
  }
  return profileHome;
}

export function resolveKimiSourceHome(profile: Pick<ProfileConfig, "env">): string {
  const explicitRoot = profile.env?.LLMR_KIMI_SOURCE_HOME?.trim() ||
    profile.env?.KIMI_CODE_HOME?.trim() ||
    process.env.KIMI_CODE_HOME?.trim();
  if (explicitRoot) {
    return resolveUserPath(explicitRoot);
  }
  return resolveUserPath("~/.kimi-code");
}
