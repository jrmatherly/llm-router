import { parseJsoncRecord } from "@llmr/core/agents/local-providers/shared";
import { isRecord } from "@llmr/core/profiles/apply-support";

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

export function isEmptyProviderJsonContent(content: string, schema: string): boolean {
  const config = parseJsoncRecord(content);
  return config !== undefined && Object.entries(config).every(([key, value]) =>
    (key === "$schema" && value === schema) || (key === "provider" && isRecord(value) && Object.keys(value).length === 0)
  );
}
