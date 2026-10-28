import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildCodexModelCatalog, type CodexModelCatalogItem } from "@llmr/core/agents/codex/model-catalog";
import { parseJsoncRecord } from "@llmr/core/agents/local-providers/shared";
import { isGatewayProviderEnabled, type AppConfig, type GatewayProviderConfig, type ProfileConfig, type ProviderModelMetadata } from "@llmr/core/contracts/app";
import { findModelCatalogEntry, findProviderModelCatalogEntry, type ModelCatalogEntry, modelCatalogMaxInputTokens, modelCatalogMaxOutputTokens } from "@llmr/core/gateway/model-catalog";
import { backupBeforeWrite, backupMarker, originalBackupSuffix, originalMissingSuffix, writeFileAtomic } from "@llmr/core/profiles/backup-files";
import { modelRegistryForConfig } from "@llmr/core/routing/model-registry";
import { resolveUsageModelAttribution } from "@llmr/core/usage/model-attribution";
import { profileAllowedModels } from "@llmr/core/profiles/model-allowlist";
import { resolveRuntimeAppPath, resolveUserPath } from "@llmr/core/runtime/app-paths";

export type OpenCodeProfileConfigWriteResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
  inlineConfig: string;
};

const defaultOpenCodeContextWindow = 128_000;
const defaultOpenCodeMaxOutputTokens = 8_192;

type OpenCodeModelResolutionConfig = Pick<AppConfig, "Providers" | "virtualModelProfiles">;

type OpenCodeResolvedModelMetadata = {
  catalogEntry?: ModelCatalogEntry;
  providerMetadata?: ProviderModelMetadata;
};

export function resolveOpenCodeConfigFile(configDir: string, profile: ProfileConfig): string {
  if (profile.scope === "llmr" || profile.scope === "custom") {
    const slug = sanitizePathSegment(profile.id || profile.name || "opencode") || "opencode";
    const baseDir = path.join(configDir, "profiles", slug);
    return path.join(profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir, "opencode", "opencode.jsonc");
  }

  const configured = profile.configFile?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const root = path.join(openCodeXdgRoot("XDG_CONFIG_HOME", ".config"), "opencode");
  const jsonc = path.join(root, "opencode.jsonc");
  const json = path.join(root, "opencode.json");
  return existsSync(jsonc) || !existsSync(json) ? jsonc : json;
}

export function writeOpenCodeGatewayConfig(
  configDir: string,
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  options: { backup?: boolean } = {}
): OpenCodeProfileConfigWriteResult {
  const file = resolveOpenCodeConfigFile(configDir, profile);
  const source = readJsoncObject(file);
  const overrides = openCodeGatewayOverrides(config, profile, token);
  const providers = isRecord(source.provider) ? { ...source.provider } : {};
  const providerId = openCodeProviderId(profile);
  providers[providerId] = (overrides.provider as Record<string, unknown>)[providerId];
  const next = {
    ...source,
    $schema: typeof source.$schema === "string" && source.$schema.trim()
      ? source.$schema
      : "https://opencode.ai/config.json",
    model: overrides.model,
    provider: providers,
    small_model: overrides.small_model
  };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const writeResult = writeJsonFile(file, content, options, (candidate) => isManagedOpenCodeConfigContent(candidate, providerId));
  return {
    ...writeResult,
    file,
    inlineConfig: JSON.stringify(overrides)
  };
}

export function isManagedOpenCodeConfigContent(content: string, providerId: string): boolean {
  const config = parseJsoncRecord(content);
  if (!config || !isRecord(config.provider)) {
    return false;
  }
  const provider = config.provider[providerId];
  if (!isRecord(provider) || !isRecord(provider.options)) {
    return false;
  }
  const headers = isRecord(provider.options.headers) ? provider.options.headers : {};
  return headers["x-llmr-client"] === "opencode" || headers["X-LLMR-Client"] === "opencode";
}

export function openCodeProviderId(profile: Pick<ProfileConfig, "providerId">): string {
  return sanitizeProviderId(profile.providerId || "") || "claude-code-router";
}

function openCodeGatewayOverrides(config: AppConfig, profile: ProfileConfig, token: string): Record<string, unknown> {
  const providerId = openCodeProviderId(profile);
  const providerName = profile.providerName?.trim() || "LLM Router";
  const model = normalizeClientModel(profile.model) || defaultClientModel(config);
  const modelRef = `${providerId}/${model}`;
  const models = openCodeModelConfigs(config, { ...profile, model }, model);
  return {
    $schema: "https://opencode.ai/config.json",
    model: modelRef,
    provider: {
      [providerId]: {
        models,
        name: providerName,
        npm: "@ai-sdk/openai-compatible",
        options: {
          apiKey: token,
          baseURL: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
          headers: {
            "x-llmr-client": "opencode",
            "x-llmr-profile": profile.id || profile.name || "opencode"
          }
        }
      }
    },
    small_model: modelRef
  };
}

function openCodeModelConfigs(config: AppConfig, profile: ProfileConfig, selectedModel: string): Record<string, unknown> {
  const catalog = buildCodexModelCatalog(config, selectedModel, { allowedModels: profileAllowedModels(profile) });
  const resolutionConfig: OpenCodeModelResolutionConfig = {
    Providers: config.Providers ?? [],
    virtualModelProfiles: config.virtualModelProfiles ?? []
  };
  return Object.fromEntries(catalog.models.map((item) => [
    item.slug,
    openCodeModelConfig(item, resolutionConfig)
  ]));
}

function openCodeModelConfig(item: CodexModelCatalogItem, config: OpenCodeModelResolutionConfig): Record<string, unknown> {
  const resolved = openCodeResolvedModelMetadata(config, item.slug);
  const contextWindow = Math.max(
    item.context_window,
    modelCatalogMaxInputTokens(resolved.catalogEntry)
  );
  const maxOutputTokens = positiveNumber(resolved.providerMetadata?.maxOutputTokens)
    ?? modelCatalogMaxOutputTokens(resolved.catalogEntry);
  return {
    name: item.slug,
    limit: {
      context: positiveNumber(contextWindow) ?? defaultOpenCodeContextWindow,
      output: positiveNumber(maxOutputTokens) ?? defaultOpenCodeMaxOutputTokens
    },
    modalities: {
      input: openCodeInputModalities(item.input_modalities),
      output: ["text"]
    }
  };
}

function openCodeResolvedModelMetadata(
  config: OpenCodeModelResolutionConfig | undefined,
  model: string
): OpenCodeResolvedModelMetadata {
  if (!config) {
    return { catalogEntry: findModelCatalogEntry(model) };
  }

  const registry = modelRegistryForConfig(config);
  const attribution = resolveUsageModelAttribution(config, model);
  const physicalModel = attribution.model?.trim();
  const physicalProvider = registry.findProvider(attribution.provider);
  if (physicalProvider && physicalModel) {
    return {
      catalogEntry: findProviderModelCatalogEntry(physicalProvider, physicalModel, [model]),
      providerMetadata: providerModelMetadataFor(physicalProvider, physicalModel)
    };
  }

  if (registry.resolve(model)?.kind === "gateway") {
    return {};
  }

  return { catalogEntry: findModelCatalogEntry(physicalModel || model) };
}

function providerModelMetadataFor(provider: GatewayProviderConfig, model: string): ProviderModelMetadata | undefined {
  const metadata = provider.modelMetadata ?? {};
  const direct = metadata[model];
  if (direct) {
    return direct;
  }
  const normalized = model.trim().toLowerCase();
  const match = Object.entries(metadata).find(([candidate]) => candidate.trim().toLowerCase() === normalized);
  return match?.[1];
}

function openCodeInputModalities(values: string[]): string[] {
  const normalized = new Set<string>(["text"]);
  for (const value of values) {
    const modality = value.trim().toLowerCase();
    if (modality) {
      normalized.add(modality);
    }
  }
  return [...normalized];
}

function readJsoncObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    return {};
  }
  try {
    return parseJsoncRecord(readFileSync(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function writeJsonFile(
  file: string,
  content: string,
  options: { backup?: boolean },
  isManagedContent: (content: string) => boolean
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  chmodPrivateConfigArtifacts(file);
  if (previous === content) {
    return { changed: false };
  }
  const backupFile = options.backup === false ? undefined : backupBeforeWrite(file, previous, { isManagedContent, mode: 0o600 });
  writeFileAtomic(file, content, { mode: 0o600 });
  return { backupFile, changed: true };
}

function chmodPrivateFile(file: string): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  chmodSync(file, 0o600);
}

function chmodPrivateConfigArtifacts(file: string): void {
  chmodPrivateFile(file);
  if (process.platform === "win32") {
    return;
  }
  const basename = path.basename(file);
  let entries: string[];
  try {
    entries = readdirSync(path.dirname(file));
  } catch {
    // The config write can still proceed if artifact discovery is unavailable.
    return;
  }
  for (const entry of entries) {
    if (
      entry === `${basename}${originalBackupSuffix}` ||
      entry === `${basename}${originalMissingSuffix}` ||
      entry.startsWith(`${basename}${backupMarker}`)
    ) {
      chmodPrivateFile(path.join(path.dirname(file), entry));
    }
  }
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" || config.gateway.host === "::" ? "127.0.0.1" : config.gateway.host;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${normalizedHost}:${config.gateway.port}`;
}

function defaultClientModel(config: AppConfig): string {
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const provider = enabledProviders.find((item) => item.name === config.preferredProvider) ?? enabledProviders[0];
  const model = provider?.models[0] ?? "default";
  return provider?.name ? `${provider.name}/${model}` : model;
}

function normalizeClientModel(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function openCodeXdgRoot(environmentName: "XDG_CONFIG_HOME", fallback: string): string {
  const internalHome = process.env.LLMR_INTERNAL_HOME_DIR?.trim();
  if (internalHome) {
    return path.join(internalHome, fallback);
  }
  const configured = process.env[environmentName]?.trim();
  return configured ? resolveUserPath(configured) : path.join(resolveRuntimeAppPath("home"), fallback);
}

function sanitizeProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
