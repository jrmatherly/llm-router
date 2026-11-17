import { isRecord } from "@llmr/core/gateway/internal/value";

export function calculateTokenCount(messages: unknown, system: unknown, tools: unknown): number {
  return countMessageTokens(messages) + countSystemTokens(system) + countToolTokens(tools);
}

function countMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((total, message) => total + countUnknownTokens(message), 0);
}

function countSystemTokens(system: unknown): number {
  return countUnknownTokens(system);
}

function countToolTokens(tools: unknown): number {
  if (!Array.isArray(tools)) {
    return 0;
  }
  return tools.reduce((total, tool) => total + countUnknownTokens(tool), 0);
}

function countUnknownTokens(value: unknown): number {
  if (typeof value === "string") {
    return estimateTextTokens(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countUnknownTokens(item), 0);
  }

  if (!isRecord(value)) {
    return 0;
  }

  let total = 0;
  for (const [key, item] of Object.entries(value)) {
    total += estimateTextTokens(key);
    total += countUnknownTokens(item);
  }
  return total;
}

function estimateTextTokens(text: string): number {
  if (text.length <= 1024 * 1024) {
    const words = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
    const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    return Math.max(1, Math.ceil((words + cjk) * 1.15));
  }
  // Count large strings without retaining an array proportional to the request size.
  let asciiWords = 0;
  let cjkChars = 0;
  const words = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g;
  const cjk = /[\u3400-\u9fff]/g;
  while (words.exec(text) !== null) asciiWords += 1;
  while (cjk.exec(text) !== null) cjkChars += 1;
  return Math.max(1, Math.ceil((asciiWords + cjkChars) * 1.15));
}
