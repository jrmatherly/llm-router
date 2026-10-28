import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildCodexModelCatalogIds } from "@llmr/core/agents/codex/model-catalog";
import type { AppConfig, GatewayProviderConfig, ProfileConfig, ProviderModelMetadata } from "@llmr/core/contracts/app";
import {
  findModelCatalogEntry,
  findProviderModelCatalogEntry,
  modelCatalogMaxInputTokens,
  type ModelCatalogEntry
} from "@llmr/core/gateway/model-catalog";
import { backupBeforeWrite, writeFileAtomic } from "@llmr/core/profiles/backup-files";
import { profileAllowedModels } from "@llmr/core/profiles/model-allowlist";
import { modelRegistryForConfig } from "@llmr/core/routing/model-registry";
import { resolveRuntimeAppPath, resolveUserPath } from "@llmr/core/runtime/app-paths";
import { resolveUsageModelAttribution } from "@llmr/core/usage/model-attribution";

export type PiProfileConfigWriteResult = {
  backupFile?: string;
  changed: boolean;
  file: string;
  model: string;
  profileHome: string;
  providerId: string;
  sessionDir: string;
};

const privateDirMode = 0o700;
const privateFileMode = 0o600;

type PiModelResolutionConfig = Pick<AppConfig, "Providers" | "virtualModelProfiles">;

type PiResolvedModelMetadata = {
  catalogEntry?: ModelCatalogEntry;
  providerMetadata?: ProviderModelMetadata;
};

export function resolvePiAgentDir(configDir: string, profile: ProfileConfig): string {
  if (isLlmrOwnedScope(profile)) {
    const slug = sanitizePathSegment(profile.id || profile.name || "pi") || "pi";
    const baseDir = path.join(configDir, "profiles", slug);
    return path.join(profile.scope === "custom" ? path.join(baseDir, "custom") : baseDir, "pi");
  }

  const configured = profile.configFile?.trim();
  return configured ? resolveUserPath(configured) : path.join(resolveRuntimeAppPath("home"), ".pi", "agent");
}

export function isManagedPiModelsContent(content: string, providerId: string): boolean {
  try {
    const providers = (JSON.parse(content) as { providers?: unknown })?.providers;
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
      return false;
    }
    const keys = Object.keys(providers);
    return keys.length === 1 && keys[0] === providerId;
  } catch {
    return false;
  }
}

export function piProviderId(profile: Pick<ProfileConfig, "providerId">): string {
  return sanitizeProviderId(profile.providerId || "") || "claude-code-router";
}

export function resolvePiSessionDir(configDir: string, profile: ProfileConfig): string {
  return path.join(resolvePiAgentDir(configDir, profile), "sessions");
}

export function piWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "pi";
  return process.platform === "win32"
    ? `ccr-pi-wrapper-${slug}.cmd`
    : `ccr-pi-wrapper-${slug}`;
}

export function writePiGatewayConfig(
  configDir: string,
  config: AppConfig,
  profile: ProfileConfig,
  token: string,
  defaultModel: string
): PiProfileConfigWriteResult {
  const profileHome = resolvePiAgentDir(configDir, profile);
  const sessionDir = resolvePiSessionDir(configDir, profile);
  const file = path.join(profileHome, "models.json");
  const providerId = piProviderId(profile);
  const models = piProfileModels(config, profile, defaultModel);
  const model = models.includes(defaultModel) ? defaultModel : models[0] || defaultModel || "default";
  const content = `${JSON.stringify(piModelsJson(config, profile, providerId, token, models), null, 2)}\n`;
  const { backupFile, changed } = writeJsonFileIfChanged(
    file,
    content,
    { backup: !isLlmrOwnedScope(profile), isManagedContent: (candidate) => isManagedPiModelsContent(candidate, providerId) }
  );
  mkdirSync(sessionDir, { mode: privateDirMode, recursive: true });
  chmodPrivateDir(profileHome);
  chmodPrivateDir(sessionDir);
  return {
    backupFile,
    changed,
    file,
    model,
    profileHome,
    providerId,
    sessionDir
  };
}

function piModelsJson(
  config: AppConfig,
  profile: ProfileConfig,
  providerId: string,
  token: string,
  models: string[]
): Record<string, unknown> {
  const resolutionConfig: PiModelResolutionConfig = {
    Providers: config.Providers ?? [],
    virtualModelProfiles: config.virtualModelProfiles ?? []
  };
  return {
    providers: {
      [providerId]: {
        api: "openai-responses",
        apiKey: token,
        authHeader: true,
        baseUrl: `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`,
        headers: {
          "x-ccr-client": "pi",
          "x-ccr-profile": profile.id || profile.name || "pi"
        },
        models: models.map((model) => piModelConfig(model, resolutionConfig))
      }
    }
  };
}

function piModelConfig(model: string, config: PiModelResolutionConfig): Record<string, unknown> {
  const metadata = piResolvedModelMetadata(config, model);
  const contextWindow = positiveNumber(metadata.providerMetadata?.contextWindow)
    ?? positiveNumber(metadata.providerMetadata?.maxContextWindow)
    ?? positiveNumber(modelCatalogMaxInputTokens(metadata.catalogEntry));
  const maxTokens = positiveNumber(metadata.providerMetadata?.maxOutputTokens)
    ?? piCatalogMaxTokens(metadata.catalogEntry);
  return {
    id: model,
    name: model,
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {})
  };
}

function piResolvedModelMetadata(config: PiModelResolutionConfig, model: string): PiResolvedModelMetadata {
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

function piCatalogMaxTokens(entry: ModelCatalogEntry | undefined): number | undefined {
  return positiveNumber(entry?.limits?.maxTokens)
    ?? positiveNumber(entry?.limits?.outputTokens);
}

function piProfileModels(config: AppConfig, profile: ProfileConfig, defaultModel: string): string[] {
  return uniqueStrings([
    defaultModel,
    ...buildCodexModelCatalogIds(config, defaultModel, { allowedModels: profileAllowedModels({ ...profile, model: defaultModel }) })
  ].filter(Boolean));
}

function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" || config.gateway.host === "::" ? "127.0.0.1" : config.gateway.host;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${normalizedHost}:${config.gateway.port}`;
}

function isLlmrOwnedScope(profile: ProfileConfig): boolean {
  return profile.scope === "ccr" || profile.scope === "custom";
}

// Only a user-owned models.json gets an original snapshot and a backup before LLMR writes it.
function writeJsonFileIfChanged(
  file: string,
  content: string,
  options: { backup: boolean; isManagedContent: (content: string) => boolean }
): { backupFile?: string; changed: boolean } {
  mkdirSync(path.dirname(file), { mode: privateDirMode, recursive: true });
  chmodPrivateDir(path.dirname(file));
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodPrivateFile(file);
    return { changed: false };
  }
  const backupFile = options.backup
    ? backupBeforeWrite(file, previous, { isManagedContent: options.isManagedContent, mode: privateFileMode })
    : undefined;
  writeFileAtomic(file, content, { mode: privateFileMode });
  return { backupFile, changed: true };
}

function chmodPrivateDir(dir: string): void {
  if (process.platform === "win32" || !existsSync(dir)) {
    return;
  }
  try {
    chmodSync(dir, privateDirMode);
  } catch {
    // Best-effort permissions only; config writes should not fail after success.
  }
}

function chmodPrivateFile(file: string): void {
  if (process.platform === "win32" || !existsSync(file)) {
    return;
  }
  try {
    chmodSync(file, privateFileMode);
  } catch {
    // Best-effort permissions only; config writes should not fail after success.
  }
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function sanitizeProviderId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}
