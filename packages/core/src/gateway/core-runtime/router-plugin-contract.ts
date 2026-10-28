import type { RouterFallbackConfig } from "@llmr/core/contracts/app";

export const ccrRouterPluginKey = "llm-router";
export const ccrRouterRequestTransformKey = "llm-router-request-transform";
export const ccrAnthropicReasoningResponseHookKey = "ccr-anthropic-reasoning-response-hook";
export const ccrCodexBridgeRequestTransformKey = "ccr-codex-bridge-request-transform";
export const ccrCodexBridgeResponseHookKey = "ccr-codex-bridge-response-hook";
export const ccrCodexBridgeStreamHookKey = "ccr-codex-bridge-stream-hook";
export const ccrOpenRouterDiscountFinalizeResponseHookKey = "ccr-openrouter-discount-finalize-response-hook";
export const ccrOpenRouterDiscountFinalizeStreamHookKey = "ccr-openrouter-discount-finalize-stream-hook";
export const ccrRouterRouteResolverKey = "llm-router-route-resolver";
export const ccrRouterHttpRouteKey = "llm-router-route";
export const ccrRouterHttpRoutePath = "/__llmr/route";
export const ccrRawTraceSyncAckRouteKey = "ccr-raw-trace-sync-ack";
export const ccrRuntimeConfigReloadMessageType = "llmr:runtime-config-reload";
export const ccrLiveTokenRateConfigMessageType = "llmr:live-token-rate-config";
export const ccrLiveTokenRateSnapshotMessageType = "llmr:live-token-rate-snapshot";
export const ccrLiveTokenRateStreamHookKey = "ccr-live-token-rate-stream-hook";

export type CcrLiveTokenRateConfigMessage = {
  enabled: boolean;
  protocolVersion: 1;
  type: typeof ccrLiveTokenRateConfigMessageType;
};

export type CcrLiveTokenRateSnapshotMessage = {
  activeRequests: number;
  protocolVersion: 1;
  tokensPerSecond: number;
  type: typeof ccrLiveTokenRateSnapshotMessageType;
};

export const ccrRouteStageHeader = "x-llmr-route-stage";
export const ccrRouteReasonHeader = "x-llmr-route-reason";
export const ccrRouteSourceHeader = "x-llmr-route-source";
export const ccrRouteDiagnosticsHeader = "x-llmr-route-diagnostics";
export const ccrRoutedModelHeader = "x-llmr-routed-model";
export const ccrRouteFallbackHeader = "x-llmr-route-fallback";
export const ccrRouteSessionIdHeader = "x-llmr-route-session-id";
export const ccrRouteTokenCountHeader = "x-llmr-route-token-count";
export const ccrCodexApplyPatchBridgeHeader = "x-llmr-codex-apply-patch-bridge";
export const ccrCodexMultiAgentBridgeHeader = "x-llmr-codex-multi-agent-bridge";
export const ccrOpenRouterDiscountRequestIdHeader = "x-llmr-openrouter-discount-request-id";
export const ccrRouteHeaderNames = [
  ccrCodexApplyPatchBridgeHeader,
  ccrCodexMultiAgentBridgeHeader,
  ccrOpenRouterDiscountRequestIdHeader,
  ccrRouteDiagnosticsHeader,
  ccrRouteFallbackHeader,
  ccrRouteReasonHeader,
  ccrRouteSessionIdHeader,
  ccrRouteSourceHeader,
  ccrRouteStageHeader,
  ccrRouteTokenCountHeader,
  ccrRoutedModelHeader
] as const;

export type CcrRouterPluginRouteRequest = {
  body: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
};

export type CcrRouterPluginRouteResponse = {
  body: Record<string, unknown>;
  decision: {
    diagnostics: unknown[];
    fallback: RouterFallbackConfig;
    model?: string;
    reason: string;
    sessionId?: string;
    source: string;
    tokenCount: number;
  };
};

export function encodeCcrRouteFallbackHeader(fallback: RouterFallbackConfig): string {
  return Buffer.from(JSON.stringify(fallback), "utf8").toString("base64url");
}

export function decodeCcrRouteFallbackHeader(value: string | undefined): RouterFallbackConfig | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    return isRouterFallbackConfig(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRouterFallbackConfig(value: unknown): value is RouterFallbackConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as RouterFallbackConfig;
  return (
    (candidate.mode === "off" || candidate.mode === "retry" || candidate.mode === "model-chain") &&
    Array.isArray(candidate.models) &&
    candidate.models.every((model) => typeof model === "string") &&
    typeof candidate.retryCount === "number" &&
    Number.isFinite(candidate.retryCount)
  );
}
