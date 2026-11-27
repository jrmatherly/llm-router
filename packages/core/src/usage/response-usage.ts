export type ResponseUsage = {
  cacheReadTokens?: number;
  cacheWrite1hTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWriteTokens?: number;
  inputIncludesCacheTokens?: boolean;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export function extractUsageFromBody(text: string): ResponseUsage | undefined {
  const snapshots: ResponseUsage[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = parseJson(trimmed);
  if (parsed !== undefined) {
    const snapshot = extractUsageSnapshot(parsed);
    return snapshot && hasUsageNumbers(snapshot) ? snapshot : undefined;
  }

  for (const payload of parseStreamPayloads(trimmed)) {
    const snapshot = extractUsageSnapshot(payload);
    if (snapshot && hasUsageNumbers(snapshot)) {
      snapshots.push(snapshot);
    }
  }

  let merged: ResponseUsage | undefined;
  for (const snapshot of snapshots) {
    merged = mergeUsageSnapshots(snapshot, merged);
  }
  return merged;
}

export function hasUsageNumbers(usage: ResponseUsage): boolean {
  return [
    usage.cacheReadTokens,
    usage.cacheWrite1hTokens,
    usage.cacheWrite5mTokens,
    usage.cacheWriteTokens,
    usage.inputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.totalTokens
  ].some((value) => value !== undefined);
}

export function mergeUsageSnapshots(primary: ResponseUsage | undefined, fallback: ResponseUsage | undefined): ResponseUsage | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    ...fallback,
    ...Object.fromEntries(Object.entries(primary).filter(([, value]) => value !== undefined))
  };
}

function sumOptionalNumbers(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : undefined;
}

export function parseStreamPayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line.startsWith("{") ? line : "";
    if (!payload || payload === "[DONE]") {
      continue;
    }
    const parsed = parseJson(payload);
    if (parsed !== undefined) {
      payloads.push(parsed);
    }
  }
  return payloads;
}

function extractUsageSnapshot(payload: unknown): ResponseUsage | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const response = isRecord(payload.response) ? payload.response : payload;
  const message = isRecord(payload.message) ? payload.message : undefined;
  const usage = isRecord(response.usage)
    ? response.usage
    : isRecord(payload.usage)
      ? payload.usage
      : isRecord(message?.usage)
        ? message.usage
      : undefined;
  const usageMetadata = isRecord(response.usageMetadata)
    ? response.usageMetadata
    : isRecord(payload.usageMetadata)
      ? payload.usageMetadata
      : undefined;

  if (usageMetadata) {
    return {
      cacheReadTokens: asNumber(usageMetadata.cachedContentTokenCount),
      inputIncludesCacheTokens: true,
      inputTokens: asNumber(usageMetadata.promptTokenCount),
      model: asString(response.modelVersion) ?? asString(payload.modelVersion),
      outputTokens: asNumber(usageMetadata.candidatesTokenCount),
      totalTokens: asNumber(usageMetadata.totalTokenCount)
    };
  }

  if (!usage) {
    return undefined;
  }

  const inputDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : isRecord(usage.prompt_tokens_details)
      ? usage.prompt_tokens_details
      : undefined;
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : undefined;
  const hasAnthropicCacheFields =
    usage.cache_read_input_tokens !== undefined ||
    usage.cache_creation_input_tokens !== undefined;
  const hasOpenAiCacheFields =
    inputDetails?.cached_tokens !== undefined ||
    inputDetails?.cache_creation_tokens !== undefined ||
    usage.cached_tokens !== undefined ||
    usage.prompt_cache_hit_tokens !== undefined ||
    usage.prompt_tokens !== undefined;
  const cacheCreation = isRecord(usage.cache_creation) ? usage.cache_creation : undefined;
  const cacheWrite5mTokens = asNumber(cacheCreation?.ephemeral_5m_input_tokens);
  const cacheWrite1hTokens = asNumber(cacheCreation?.ephemeral_1h_input_tokens);

  return {
    cacheReadTokens:
      asNumber(usage.cache_read_tokens) ??
      asNumber(usage.cache_read_input_tokens) ??
      asNumber(usage.cached_tokens) ??
      asNumber(inputDetails?.cached_tokens) ??
      asNumber(usage.prompt_cache_hit_tokens),
    cacheWrite1hTokens,
    cacheWrite5mTokens,
    cacheWriteTokens:
      asNumber(usage.cache_write_tokens) ??
      asNumber(usage.cache_creation_tokens) ??
      asNumber(usage.cache_creation_input_tokens) ??
      asNumber(inputDetails?.cache_creation_tokens) ??
      sumOptionalNumbers(cacheWrite5mTokens, cacheWrite1hTokens),
    inputIncludesCacheTokens: hasAnthropicCacheFields ? false : hasOpenAiCacheFields ? true : undefined,
    inputTokens: asNumber(usage.input_tokens) ?? asNumber(usage.prompt_tokens),
    model:
      asString(response.model) ??
      asString(payload.model) ??
      asString(message?.model) ??
      asString(response.modelVersion) ??
      asString(payload.modelVersion),
    outputTokens: asNumber(usage.output_tokens) ?? asNumber(usage.completion_tokens),
    reasoningTokens:
      asNumber(outputDetails?.reasoning_tokens) ??
      asNumber(outputDetails?.thinking_tokens) ??
      asNumber(usage.reasoning_tokens) ??
      asNumber(usage.thinking_tokens),
    totalTokens: asNumber(usage.total_tokens)
  };
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
