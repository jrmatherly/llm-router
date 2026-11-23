import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult
} from "@llmr/core/contracts/app";
import {
  providerInternalNamePlaceholder,
  providerNamePlaceholder,
  providerNameSlugPlaceholder,
  providerPayload,
  uniqueProviderName
} from "@llmr/core/agents/local-providers/shared";

export function claudeCodeCandidate(): LocalAgentProviderCandidate {
  return {
    detail: "Forwards the login Claude Code sends. Usable only from a Claude Code profile in Claude login mode. Nothing is stored.",
    id: "claude-code-api",
    importable: true,
    kind: "claude-code",
    models: ["claude-sonnet-5"],
    name: "Claude Code API",
    protocol: "anthropic_messages",
    status: "available"
  };
}

// The two entries only bind the pass-through hook to the provider by name.
export async function importClaudeCodeProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): Promise<LocalAgentProviderImportResult> {
  return {
    candidate,
    provider: providerPayload(candidate, uniqueProviderName(providerNames, "Claude Code API"), "https://api.anthropic.com"),
    providerPlugins: [
      { key: `llmr-local-agent-${providerNameSlugPlaceholder}-claude-code-oauth`, providerName: providerNamePlaceholder },
      { key: `llmr-local-agent-${providerNameSlugPlaceholder}-claude-code-oauth-internal`, providerName: providerInternalNamePlaceholder }
    ]
  };
}
