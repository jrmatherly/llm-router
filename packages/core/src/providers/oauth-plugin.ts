import { isRecord, stringValue } from "@llmr/core/gateway/internal/value";

export function isLocalClaudeCodeOauthProviderPlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("llmr-local-agent-") && key.includes("claude-code-oauth");
}
