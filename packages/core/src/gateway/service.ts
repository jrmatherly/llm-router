/**
 * Public gateway facade.
 *
 * Runtime orchestration and protocol features live in focused modules; this file keeps
 * the historical import surface stable for Electron, CLI, web management, and tests.
 */
export { gatewayService } from "@llmr/core/gateway/application/gateway-service";
export { prepareCodexApplyPatchBridgeRequest, transformCodexApplyPatchBridgeRequestBody, transformCodexApplyPatchBridgeResponseValue, transformCodexApplyPatchBridgeSseEvent } from "@llmr/core/gateway/features/codex-patch-bridge";
export { prepareCodexMultiAgentBridgeRequest, transformCodexMultiAgentBridgeRequestBody, transformCodexMultiAgentBridgeResponseValue, transformCodexMultiAgentBridgeSseEvent } from "@llmr/core/gateway/features/codex-multi-agent-bridge";
export { appendContextArchiveToolOutputsForTest, contextArchiveFunctionCallsForTest, parseContextArchiveToolResponseBodyForTest, prepareCodexCompactCompatRequest, prepareContextArchiveToolContinuationRequestForTest } from "@llmr/core/gateway/features/context-archive-continuation";
export { normalizeClaudeCodeOauthProviderPlugins, normalizeCoreGatewayVirtualModelProfiles } from "@llmr/core/gateway/core-runtime/config-compiler";
export { fusionBuiltinToolArtifactsForTest, fusionFallbackToolDefinitions, fusionToolNamesBackedByMcpServers } from "@llmr/core/mcp/fusion-config";
export type { BrowserAutomationMcpIntegration, BrowserWebSearchMcpIntegration, BrowserWebSearchMcpRegistration, BrowserWebSearchProtocolRecord, BrowserWebSearchProtocolResult } from "@llmr/core/gateway/internal/shared";
export { prepareGatewayUpstreamAttemptForTest } from "@llmr/core/gateway/upstream/executor";
export { fallbackRetryDelayAfterNetworkErrorForTest, fallbackRetryDelayAfterStatusForTest } from "@llmr/core/gateway/upstream/retry-policy";
export { createClaudeCodeModelsResponseForTest } from "@llmr/core/gateway/features/model-discovery";
export { shouldApplyGatewayRouting } from "@llmr/core/routing/protocol-endpoints";
export { extractHostedWebSearchQueryHint, fusionWebSearchToolNameForRequest, hostedWebSearchProtocolResponseStream, prepareAnthropicWebSearchProtocolRequestBody, prepareClaudeCodeWebSearchContinuationRequestBody, prepareHostedWebSearchProtocolRequestBody, selectHostedWebSearchProtocolRecords, transformAnthropicWebSearchProtocolResponseValue, transformAnthropicWebSearchProtocolSseText, transformGeminiHostedWebSearchResponseValue, transformGeminiHostedWebSearchSseText, transformOpenAiChatHostedWebSearchResponseValue, transformOpenAiChatHostedWebSearchSseText, transformOpenAiResponsesHostedWebSearchResponseValue, transformOpenAiResponsesHostedWebSearchSseText } from "@llmr/core/gateway/features/hosted-web-search/index";
