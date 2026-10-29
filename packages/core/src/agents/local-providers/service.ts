import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportRequest,
  LocalAgentProviderImportResult,
  LocalAgentProviderProbeRequest,
  LocalAgentProviderProbeResult
} from "@llmr/core/contracts/app";
import { claudeCodeCandidate, importClaudeCodeProvider } from "@llmr/core/agents/local-providers/claude-code";
import { codexCandidate, importCodexProvider, probeCodexProvider } from "@llmr/core/agents/local-providers/codex";
import { grokCandidate, importGrokProvider } from "@llmr/core/agents/local-providers/grok";
import { importKimiProvider, kimiCandidates } from "@llmr/core/agents/local-providers/kimi";
import { importOpenCodeProvider, opencodeCandidates } from "@llmr/core/agents/local-providers/opencode";
import { importZcodeProvider, zcodeCandidate } from "@llmr/core/agents/local-providers/zcode";

export { codexDefaultBaseUrl, readCodexAuth } from "@llmr/core/agents/local-providers/codex";
export { ClaudeCodeRefreshAuthError, claudeCodeAccessTokenExpired, readClaudeCodeOauth, resolveClaudeCodeAuth, resolveClaudeCodeAuthOrStored } from "@llmr/core/agents/local-providers/claude-code";
export { grokDefaultBaseUrl, readGrokAuth, resolveGrokAuth } from "@llmr/core/agents/local-providers/grok";
export { kimiAccessTokenExpired, kimiIdentityHeaders, readKimiAuth, resolveKimiAuth } from "@llmr/core/agents/local-providers/kimi";
export { readZcodeLocalProviderCredential, zcodeDefaultBaseUrl } from "@llmr/core/agents/local-providers/zcode";
export { localAgentProviderApiKey, type OAuthTokenSet } from "@llmr/core/agents/local-providers/shared";

export function getLocalAgentProviderCandidates(): LocalAgentProviderCandidate[] {
  return [
    codexCandidate(),
    claudeCodeCandidate(),
    grokCandidate(),
    ...kimiCandidates(),
    ...opencodeCandidates(),
    zcodeCandidate()
  ].filter((candidate) => candidate.status !== "missing");
}

export async function importLocalAgentProvider(request: LocalAgentProviderImportRequest): Promise<LocalAgentProviderImportResult> {
  const candidate = getLocalAgentProviderCandidates().find((item) => item.id === request.id);
  if (!candidate) {
    throw new Error("Local agent provider was not found.");
  }
  if (!candidate.importable) {
    throw new Error(candidate.detail || "Local agent login is not importable.");
  }

  if (candidate.kind === "codex") {
    return importCodexProvider(candidate, request.providerNames ?? []);
  }
  if (candidate.kind === "claude-code") {
    return await importClaudeCodeProvider(candidate, request.providerNames ?? []);
  }
  if (candidate.kind === "grok") {
    return importGrokProvider(candidate, request.providerNames ?? []);
  }
  if (candidate.kind === "kimi") {
    return importKimiProvider(candidate, request.providerNames ?? []);
  }
  if (candidate.kind === "opencode") {
    return importOpenCodeProvider(candidate, request.providerNames ?? []);
  }
  return importZcodeProvider(candidate, request.providerNames ?? []);
}

export async function probeLocalAgentProvider(request: LocalAgentProviderProbeRequest): Promise<LocalAgentProviderProbeResult> {
  const candidate = getLocalAgentProviderCandidates().find((item) => item.id === request.id);
  if (!candidate) {
    throw new Error("Local agent provider was not found.");
  }
  if (candidate.kind === "codex") {
    return probeCodexProvider(candidate);
  }
  throw new Error("Local agent provider model probing is not supported.");
}
