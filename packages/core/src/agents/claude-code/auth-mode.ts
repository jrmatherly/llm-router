export const CLAUDE_CODE_AUTH_MODE_ENV = "LLMR_CLAUDE_CODE_AUTH_MODE";

export type ClaudeCodeGatewayAuthMode = "api-key-helper" | "claude-login" | "wif";
export type ClaudeCodeGatewayAuthModePreference = ClaudeCodeGatewayAuthMode | "auto";

type ClaudeCodeAuthProfile = {
  env?: Record<string, string>;
};

export function resolveClaudeCodeGatewayAuthMode(profile: ClaudeCodeAuthProfile): ClaudeCodeGatewayAuthMode {
  const preference = claudeCodeGatewayAuthModePreference(profile);
  if (preference !== "auto") {
    return preference;
  }

  // A CLI version does not establish that federation mode is configured.
  return "api-key-helper";
}

export function claudeCodeGatewayAuthModePreference(profile: ClaudeCodeAuthProfile): ClaudeCodeGatewayAuthModePreference {
  const own = profile.env?.[CLAUDE_CODE_AUTH_MODE_ENV];
  const preference = normalizeClaudeCodeGatewayAuthMode(own || process.env[CLAUDE_CODE_AUTH_MODE_ENV]);
  // One process variable must not move every profile to the Claude login.
  return preference === "claude-login" && !own ? "auto" : preference;
}

export function normalizeClaudeCodeGatewayAuthMode(value: string | undefined): ClaudeCodeGatewayAuthModePreference {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-") || "";
  if (normalized === "wif" || normalized === "workload-identity" || normalized === "workload-identity-federation") {
    return "wif";
  }
  if (normalized === "helper" || normalized === "api-key-helper" || normalized === "apikey-helper" || normalized === "legacy") {
    return "api-key-helper";
  }
  if (normalized === "claude-login" || normalized === "login") {
    return "claude-login";
  }
  return "auto";
}
