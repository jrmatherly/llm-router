import { parseJsoncRecord } from "@llmr/core/agents/local-providers/shared";
import { isRecord } from "@llmr/core/profiles/apply-support";
import { profileTokenPrefix } from "@llmr/core/profiles/backup-files";

export type ProviderJsonClient = "kilo" | "opencode";

export type ProviderJsonStripOptions = { client: ProviderJsonClient };

// The client header is LLMR's mark, so a provider of the user's own under LLMR's id is theirs, and LLMR's provider is found under any id.
function llmrProviderIds(config: Record<string, unknown>, client: ProviderJsonClient): string[] {
  const providers = isRecord(config.provider) ? config.provider : {};
  return Object.keys(providers).filter((id) => {
    const options = isRecord(providers[id]) ? providers[id].options : undefined;
    const headers = isRecord(options) && isRecord(options.headers) ? options.headers : {};
    return headers["x-llmr-client"] === client || headers["X-LLMR-Client"] === client;
  });
}

export function isManagedProviderJsonContent(content: string, client: ProviderJsonClient): boolean {
  const config = parseJsoncRecord(content);
  return config !== undefined && llmrProviderIds(config, client).length > 0;
}

export function stripManagedProviderJsonContent(content: string, options: ProviderJsonStripOptions, snapshot?: string): string | undefined {
  const config = parseJsoncRecord(content);
  const ids = config ? llmrProviderIds(config, options.client) : [];
  if (!config || ids.length === 0) {
    return undefined;
  }
  const original = snapshot === undefined ? undefined : parseJsoncRecord(snapshot);
  const originalProviders = original && isRecord(original.provider) ? original.provider : {};
  const next: Record<string, unknown> = { ...config };
  const providers = { ...(config.provider as Record<string, unknown>) };
  for (const id of ids) {
    if (Object.hasOwn(originalProviders, id)) {
      providers[id] = originalProviders[id];
    } else {
      delete providers[id];
    }
  }
  if (Object.keys(providers).length === 0) {
    delete next.provider;
  } else {
    next.provider = providers;
  }
  for (const key of ["model", "small_model"]) {
    const value = config[key];
    if (typeof value !== "string" || !ids.some((id) => value.startsWith(`${id}/`))) {
      continue;
    }
    if (original && Object.hasOwn(original, key)) {
      next[key] = original[key];
    } else {
      delete next[key];
    }
  }
  return `${JSON.stringify(next, null, 2)}\n`;
}

// A user's own provider may be named llm-router, so only the client header marks LLMR's.
export function isLlmrPiProvider(value: unknown): boolean {
  return isRecord(value) && isRecord(value.headers) && value.headers["x-llmr-client"] === "pi";
}

export function stripManagedPiModelsContent(content: string, providerIds: string[], snapshot?: string): string | undefined {
  const models = parseJsoncRecord(content);
  const providers = models && isRecord(models.providers) ? { ...models.providers } : {};
  const ids = providerIds.filter((id) => isLlmrPiProvider(providers[id]));
  if (!models || ids.length === 0) {
    return undefined;
  }
  const original = snapshot === undefined ? undefined : parseJsoncRecord(snapshot);
  const originalProviders = original && isRecord(original.providers) ? original.providers : {};
  for (const id of ids) {
    if (Object.hasOwn(originalProviders, id)) {
      providers[id] = originalProviders[id];
    } else {
      delete providers[id];
    }
  }
  return `${JSON.stringify({ ...models, providers }, null, 2)}\n`;
}

export function isEmptyPiModelsContent(content: string): boolean {
  const models = parseJsoncRecord(content);
  return models !== undefined && Object.entries(models).every(([key, value]) =>
    key === "providers" && isRecord(value) && Object.keys(value).length === 0
  );
}

export function isEmptyProviderJsonContent(content: string, schema: string): boolean {
  const config = parseJsoncRecord(content);
  return config !== undefined && Object.entries(config).every(([key, value]) =>
    (key === "$schema" && value === schema) || (key === "provider" && isRecord(value) && Object.keys(value).length === 0)
  );
}

const zcodeSchema = "https://opencode.ai/config.json";
const zcodeModelRefKeys = ["defaultModel", "lastUsed", "lastUsedModel"];

// ZCode's entries carry no header, so the profile key LLMR wrote is its only mark. "llmr-local" is the key of a profile that has none of its own.
export function zcodeManagedProviderIds(content: string, providerIds: string[]): string[] {
  const config = parseJsoncRecord(content);
  const providers = config && isRecord(config.provider) ? config.provider : {};
  return providerIds.filter((id) => {
    const options = isRecord(providers[id]) ? providers[id].options : undefined;
    const apiKey = isRecord(options) ? options.apiKey : undefined;
    return typeof apiKey === "string" && (apiKey.startsWith(profileTokenPrefix) || apiKey === "llmr-local");
  });
}

export function stripManagedZcodeConfigContent(content: string, providerIds: string[], snapshot?: string): string | undefined {
  const config = parseJsoncRecord(content);
  const ids = zcodeManagedProviderIds(content, providerIds);
  if (!config || ids.length === 0) {
    return undefined;
  }
  const original = snapshot === undefined ? undefined : parseJsoncRecord(snapshot);
  const originalProviders = original && isRecord(original.provider) ? original.provider : {};
  const originalModel = original && isRecord(original.model) ? original.model : {};
  const next: Record<string, unknown> = { ...config };
  const providers = { ...(config.provider as Record<string, unknown>) };
  for (const id of ids) {
    if (Object.hasOwn(originalProviders, id)) {
      providers[id] = originalProviders[id];
    } else {
      delete providers[id];
    }
  }
  setOrDropEmpty(next, "provider", providers);
  if (isRecord(config.model)) {
    const model = { ...config.model };
    const main = model.main;
    if (typeof main === "string" && ids.some((id) => main.startsWith(`${id}/`))) {
      if (Object.hasOwn(originalModel, "main")) {
        model.main = originalModel.main;
      } else {
        delete model.main;
      }
    }
    setOrDropEmpty(next, "model", model);
  }
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function stripManagedZcodeModelCacheContent(content: string, ownedIds: string[], snapshot?: string): string | undefined {
  const cache = parseJsoncRecord(content);
  if (!cache || ownedIds.length === 0) {
    return undefined;
  }
  const owned = (value: unknown) => isRecord(value) && typeof value.id === "string" && ownedIds.includes(value.id);
  const ownedRef = (value: unknown) => isRecord(value) && typeof value.providerId === "string" && ownedIds.includes(value.providerId);
  const entries = Array.isArray(cache.providers) ? cache.providers : [];
  const refKeys = zcodeModelRefKeys.filter((key) => ownedRef(cache[key]));
  if (!entries.some(owned) && refKeys.length === 0) {
    return undefined;
  }
  const original = snapshot === undefined ? undefined : parseJsoncRecord(snapshot);
  const originalEntries = original && Array.isArray(original.providers) ? original.providers.filter(owned) : [];
  const next: Record<string, unknown> = { ...cache };
  if (Array.isArray(cache.providers)) {
    next.providers = [...entries.filter((entry) => !owned(entry)), ...originalEntries];
  }
  for (const key of refKeys) {
    if (original && Object.hasOwn(original, key)) {
      next[key] = original[key];
    } else {
      delete next[key];
    }
  }
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function isEmptyZcodeConfigContent(content: string): boolean {
  const config = parseJsoncRecord(content);
  return config !== undefined && Object.entries(config).every(([key, value]) =>
    (key === "$schema" && value === zcodeSchema) ||
    ((key === "provider" || key === "model") && isRecord(value) && Object.keys(value).length === 0)
  );
}

export function isEmptyZcodeModelCacheContent(content: string): boolean {
  const cache = parseJsoncRecord(content);
  return cache !== undefined &&
    Array.isArray(cache.providers) &&
    cache.providers.length === 0 &&
    Object.keys(cache).every((key) => key === "providers" || key === "revision" || key === "updatedAt" || key === "version");
}

// An object the strip itself emptied goes with it.
function setOrDropEmpty(target: Record<string, unknown>, key: string, value: Record<string, unknown>): void {
  if (Object.keys(value).length === 0) {
    delete target[key];
  } else {
    target[key] = value;
  }
}
