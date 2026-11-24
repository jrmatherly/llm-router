import { isRecord, stringValue } from "@llmr/core/gateway/internal/value";

export function isLocalClaudeCodeOauthProviderPlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const key = stringValue(value.key)?.toLowerCase() ?? "";
  return key.startsWith("llmr-local-agent-") && key.includes("claude-code-oauth");
}

// A config saved by an earlier version holds a token in these entries. It is dropped, never sent.
export function withoutClaudeCodeStoredLogin(providerPlugins: unknown[]): unknown[] {
  return providerPlugins.map((plugin) => {
    if (!isLocalClaudeCodeOauthProviderPlugin(plugin)) {
      return plugin;
    }
    const { auth: _auth, ...rest } = plugin;
    return rest;
  });
}
