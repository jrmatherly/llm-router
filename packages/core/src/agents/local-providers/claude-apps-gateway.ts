import type { LocalAgentProviderCandidate, LocalAgentProviderImportResult } from "@llmr/core/contracts/app";
import {
  ClaudeAppsGatewayAuthError,
  claudeAppsGatewaySessionExpired,
  claudeAppsGatewaySlug,
  fetchClaudeAppsGatewayModels,
  listClaudeAppsGatewaySessions,
  resolveClaudeAppsGatewaySession,
  type ClaudeAppsGatewaySession
} from "@llmr/core/agents/claude-apps-gateway/session-store";
import {
  bearerAuthPlugin,
  modelDisplayNamesForModels,
  providerInternalNamePlaceholder,
  providerPayload,
  uniqueProviderName
} from "@llmr/core/agents/local-providers/shared";

export function claudeAppsGatewayCandidateId(gatewayUrl: string): string {
  return `claude-apps-gateway:${claudeAppsGatewaySlug(gatewayUrl)}`;
}

export function claudeAppsGatewayCandidates(configDir?: string): LocalAgentProviderCandidate[] {
  return listClaudeAppsGatewaySessions(configDir).map(claudeAppsGatewayCandidate);
}

export async function importClaudeAppsGatewayProvider(
  candidate: LocalAgentProviderCandidate,
  providerNames: string[],
  configDir?: string
): Promise<LocalAgentProviderImportResult> {
  const stored = listClaudeAppsGatewaySessions(configDir).find((item) => claudeAppsGatewayCandidateId(item.gatewayUrl) === candidate.id);
  const signInAgain = "Claude apps gateway session was not found or is expired. Sign in again.";
  const session = stored
    ? await resolveClaudeAppsGatewaySession(stored.gatewayUrl, configDir).catch((error: unknown) => {
      throw error instanceof ClaudeAppsGatewayAuthError ? new Error(signInAgain) : error;
    })
    : undefined;
  if (!session || claudeAppsGatewaySessionExpired(session, undefined, 0)) {
    throw new Error(signInAgain);
  }
  let catalogError: unknown;
  const catalog = await fetchClaudeAppsGatewayModels(session).catch((error: unknown) => {
    catalogError = error;
    return undefined;
  });
  const models = catalog?.models.length ? catalog.models : session.models;
  if (models.length === 0) {
    throw catalogError ?? new Error("Claude apps gateway offers no models to this account.");
  }
  const nextCandidate: LocalAgentProviderCandidate = {
    ...candidate,
    modelDisplayNames: modelDisplayNamesForModels(catalog?.models.length ? catalog.modelDisplayNames : session.modelDisplayNames, models),
    models
  };
  const plugin = { claudeAppsGateway: { url: session.gatewayUrl } };
  return {
    candidate: nextCandidate,
    provider: providerPayload(nextCandidate, uniqueProviderName(providerNames, candidate.name), session.gatewayUrl),
    providerPlugins: [
      { ...bearerAuthPlugin("claude-apps-gateway-oauth", session.accessToken), ...plugin },
      { ...bearerAuthPlugin("claude-apps-gateway-oauth-internal", session.accessToken, {}, providerInternalNamePlaceholder), ...plugin }
    ]
  };
}

function claudeAppsGatewayCandidate(session: ClaudeAppsGatewaySession): LocalAgentProviderCandidate {
  const importable = Boolean(session.refreshToken) || !claudeAppsGatewaySessionExpired(session);
  return {
    detail: importable
      ? "Signed in. Click Import to add it as a gateway provider."
      : "Gateway session expired. Sign in again.",
    id: claudeAppsGatewayCandidateId(session.gatewayUrl),
    importable,
    kind: "claude-apps-gateway",
    modelDisplayNames: modelDisplayNamesForModels(session.modelDisplayNames, session.models),
    models: session.models,
    name: `Claude apps gateway (${new URL(session.gatewayUrl).host})`,
    protocol: "anthropic_messages",
    sourceFile: session.sourceFile,
    status: importable ? "available" : "locked"
  };
}
