import type { RouterFallbackConfig } from "@llmr/core/contracts/app";

export const llmrRouterPluginKey = "llm-router";
export const llmrRouterRequestTransformKey = "llm-router-request-transform";
export const llmrAnthropicReasoningResponseHookKey = "llmr-anthropic-reasoning-response-hook";
export const llmrCodexBridgeRequestTransformKey = "llmr-codex-bridge-request-transform";
export const llmrCodexBridgeResponseHookKey = "llmr-codex-bridge-response-hook";
export const llmrCodexBridgeStreamHookKey = "llmr-codex-bridge-stream-hook";
export const llmrOpenRouterDiscountFinalizeResponseHookKey = "llmr-openrouter-discount-finalize-response-hook";
export const llmrOpenRouterDiscountFinalizeStreamHookKey = "llmr-openrouter-discount-finalize-stream-hook";
export const llmrRouterRouteResolverKey = "llm-router-route-resolver";
export const llmrRouterHttpRouteKey = "llm-router-route";
export const llmrRouterHttpRoutePath = "/__llmr/route";
export const llmrRawTraceSyncAckRouteKey = "llmr-raw-trace-sync-ack";
export const llmrRuntimeConfigReloadMessageType = "llmr:runtime-config-reload";
export const llmrLiveTokenRateConfigMessageType = "llmr:live-token-rate-config";
export const llmrLiveTokenRateSnapshotMessageType = "llmr:live-token-rate-snapshot";
export const llmrLiveTokenRateStreamHookKey = "llmr-live-token-rate-stream-hook";

export type LlmrLiveTokenRateConfigMessage = {
  enabled: boolean;
  protocolVersion: 1;
  type: typeof llmrLiveTokenRateConfigMessageType;
};

export type LlmrLiveTokenRateSnapshotMessage = {
  activeRequests: number;
  protocolVersion: 1;
  tokensPerSecond: number;
  type: typeof llmrLiveTokenRateSnapshotMessageType;
};

export const llmrRouteStageHeader = "x-llmr-route-stage";
export const llmrRouteReasonHeader = "x-llmr-route-reason";
export const llmrRouteSourceHeader = "x-llmr-route-source";
export const llmrRouteDiagnosticsHeader = "x-llmr-route-diagnostics";
export const llmrRoutedModelHeader = "x-llmr-routed-model";
export const llmrRouteFallbackHeader = "x-llmr-route-fallback";
export const llmrRouteSessionIdHeader = "x-llmr-route-session-id";
export const llmrRouteTokenCountHeader = "x-llmr-route-token-count";
export const llmrCodexApplyPatchBridgeHeader = "x-llmr-codex-apply-patch-bridge";
export const llmrCodexMultiAgentBridgeHeader = "x-llmr-codex-multi-agent-bridge";
export const llmrOpenRouterDiscountRequestIdHeader = "x-llmr-openrouter-discount-request-id";
export const llmrRouteHeaderNames = [
  llmrCodexApplyPatchBridgeHeader,
  llmrCodexMultiAgentBridgeHeader,
  llmrOpenRouterDiscountRequestIdHeader,
  llmrRouteDiagnosticsHeader,
  llmrRouteFallbackHeader,
  llmrRouteReasonHeader,
  llmrRouteSessionIdHeader,
  llmrRouteSourceHeader,
  llmrRouteStageHeader,
  llmrRouteTokenCountHeader,
  llmrRoutedModelHeader
] as const;

export type LlmrRouterPluginRouteRequest = {
  body: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
};

export type LlmrRouterPluginRouteResponse = {
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

export function encodeLlmrRouteFallbackHeader(fallback: RouterFallbackConfig): string {
  return Buffer.from(JSON.stringify(fallback), "utf8").toString("base64url");
}

export function decodeLlmrRouteFallbackHeader(value: string | undefined): RouterFallbackConfig | undefined {
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
