/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig, GatewayStatus, RouteScriptTestRequest, RouteScriptTestResult, RouteScriptValidationRequest, RouteScriptValidationResult, RouterRule } from "@llmr/core/contracts/app";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, hasAvailableGatewayModels } from "@llmr/core/contracts/app";
import { appConfigLoadError, loadAppConfig } from "@llmr/core/config/config";
import { loadPersistedApiKeys } from "@llmr/core/config/config-repository";
import { backendService } from "@llmr/core/plugins/backend-service";
import { getSystemProxyUrlForProtocol } from "@llmr/core/proxy/system-proxy-fetch";
import { pluginService } from "@llmr/core/plugins/service";
import { proxyService } from "@llmr/core/proxy/service";
import { LLMRouterPlugin } from "@llmr/core/gateway/llm-router-plugin";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler";
import { existingGatewayPredatesManagerKey, isAddressInUseMessage, probeExistingLlmrGateway, reloadExistingLlmrGatewayConfig } from "@llmr/core/gateway/existing-gateway-probe";
import { closeServer, formatError, sendGatewayError } from "@llmr/core/gateway/http/io";
import { RawTraceSynchronizer } from "@llmr/core/observability/raw-trace-sync";
import { GatewayBillingSynchronizer } from "@llmr/core/usage/billing-sync";
import { assertLoopbackCoreHost, endpoint, formatCoreGatewayChildExit, gatewayNetworkEndpoints, gatewayRuntimeSupportsRouterPlugin, generateCoreGatewayAuthToken, isCoreGatewayHealthy, loopbackCoreHostError, removeManagedCoreGatewayMarker, shouldRunGatewayRuntime, shouldRunUnifiedServer, spawnGatewayProcess, stopPreviousManagedCoreGateway, waitForCoreGatewayStop, waitForManagedCoreGatewayReady, writeManagedCoreGatewayMarker } from "@llmr/core/gateway/core-runtime/supervisor";
import { coreGatewayAuthHeader } from "@llmr/core/gateway/internal/shared";
import { foldChildRefusedKeyRequests, mergeChildRefusedKeyRequests, refusedKeyRequests } from "@llmr/core/gateway/auth/refused-key-requests";
import type { BrowserAutomationMcpIntegration, BrowserWebSearchMcpIntegration, GatewayStopOptions } from "@llmr/core/gateway/internal/shared";
import {
  llmrLiveTokenRateConfigMessageType,
  llmrLiveTokenRateSnapshotMessageType,
  llmrRefusedKeyRequestsMessageType,
  llmrRuntimeConfigReloadMessageType,
  type LlmrRefusedKeyRequestsMessage
} from "@llmr/core/gateway/core-runtime/router-plugin-contract";
import { GatewayRequestPipeline } from "@llmr/core/gateway/request/pipeline";
import { preloadUsagePriceCatalog } from "@llmr/core/models/pricing-service";
import { GatewayHttpRequestHandler } from "@llmr/core/gateway/http/request-handler";
import { gatewayRuntimeConfigRevision } from "@llmr/core/gateway/runtime-config-control";
import { runtimeGatewayConfigSignature } from "@llmr/core/gateway/runtime-change";
import { RouteScriptRuntime } from "@llmr/core/routing/route-script-runtime";
import { buildRouteScriptInput } from "@llmr/core/routing/route-script-context";
import { compileRouterConfig } from "@llmr/core/routing/config-compiler";
import { normalizeRouteScriptResult, scriptResultPreview } from "@llmr/core/routing/route-script-result";
import { mediaService } from "@llmr/core/media/service";
import { mediaToolsGatewayEndpoint } from "@llmr/core/mcp/grok-media-config";
import { browserAutomationMcpEnabled } from "@llmr/core/mcp/toolhub-config";
import { installSocketTypeOfServiceCompat } from "@llmr/core/platform/socket-compat";
import { profileApiKeyId } from "@llmr/core/profiles/api-key";
import { setExternalLiveTokenRateSnapshot } from "@llmr/core/observability/stream-experience";

installSocketTypeOfServiceCompat();

const coreGatewayLiveTokenRateSourceId = "core-gateway";
const storedApiKeysPollMs = 1000;
const storedApiKeysRetryMs = 60_000;
// Never equal to a stored list's JSON, so the poll reloads again.
const unappliedStoredApiKeys = "";
let warnedMalformedRefusedKeyMessage = false;

type RouteScriptTestHeaders = Record<string, string | string[] | undefined>;
type SingleGatewayRuntimeBlockerOptions = {
  gatewayRuntimeSupportsRouterPlugin?: () => boolean;
  hasGatewayRequestTransforms?: () => boolean;
  hasGatewayRoutes?: () => boolean;
};

function routeScriptTestProfileId(
  config: AppConfig,
  headers: RouteScriptTestHeaders
): string | undefined {
  if (config.profile?.enabled === false) {
    return undefined;
  }
  const apiKeyId = readRouteScriptTestHeader(headers, "x-auth-api-key-id")?.trim();
  if (!apiKeyId) {
    return undefined;
  }
  return config.profile?.profiles.find((profile) =>
    profile.enabled && profileApiKeyId(profile) === apiKeyId
  )?.id;
}

function readRouteScriptTestHeader(
  headers: RouteScriptTestHeaders,
  name: string
): string | undefined {
  const normalized = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized)?.[1];
  return Array.isArray(entry) ? entry[0] : entry;
}

class GatewayService {
  private readonly requestHandler = new GatewayHttpRequestHandler({
    getBrowserAutomationMcpIntegration: () => this.browserAutomationMcpIntegration,
    getConfig: () => this.config,
    getPlugin: () => this.plugin,
    getRuntimeConfigControlStatus: () => ({
      ...(this.runtimeConfigReloadError ? { lastError: this.runtimeConfigReloadError } : {}),
      revision: gatewayRuntimeConfigRevision(this.config)
    }),
    getStatus: () => ({
      coreEndpoint: this.status.coreEndpoint,
      coreManagedExternally: this.status.coreManagedExternally,
      endpoint: this.status.endpoint,
      state: this.status.state
    }),
    handleRawTraceSync: (request, response) => this.rawTraceSynchronizer.handle(request, response),
    handleBillingUsageSync: (request, response) => this.billingSynchronizer.handle(request, response),
    proxyRequest: (request, response, path, apiKey) => this.proxyRequest(request, response, path, apiKey),
    requestRuntimeConfigReload: (expectedRevision, forceRestart) => {
      this.schedulePersistedRuntimeConfigReload(expectedRevision, forceRestart);
    },
    replayContextArchive: (input) => this.requestPipeline.replayContextArchive(input)
  });

  private readonly requestPipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => this.browserWebSearchMcpIntegration,
    getConfig: () => this.config,
    getCoreAuthToken: () => this.coreAuthToken,
    getPlugin: () => this.plugin,
    getStatus: () => ({ coreEndpoint: this.status.coreEndpoint, endpoint: this.status.endpoint }),
    refreshUsagePriceCatalog: () => {
      void preloadUsagePriceCatalog();
    }
  });

  private browserAutomationMcpIntegration?: BrowserAutomationMcpIntegration;
  private browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration;
  private readonly billingSynchronizer = new GatewayBillingSynchronizer({
    getConfig: () => this.config,
    getGlobalBillingConfig: () => pluginService.getCoreGatewayConfig().billing
  });
  private child?: ChildProcess;
  private coreRestartAttempts = 0;
  private coreRestartGeneration = 0;
  private coreRestartTimer?: NodeJS.Timeout;
  private coreRecovery?: Promise<GatewayStatus>;
  private config?: AppConfig;
  private runtimeConfigSignature?: string;
  private coreAuthToken = "";
  private externalGatewayApiKey?: string;
  private plugin?: LLMRouterPlugin;
  private readonly rawTraceSynchronizer = new RawTraceSynchronizer({
    allowStandaloneRequestLogs: () => {
      const config = this.config;
      return Boolean(config && shouldUseSingleGatewayRuntime(config));
    },
    getConfig: () => this.config
  });
  private readonly routeScriptRuntime = new RouteScriptRuntime();
  private runtimeConfigReloadError?: string;
  private runtimeConfigReloadQueue: Promise<void> = Promise.resolve();
  private server?: Server;
  private status: GatewayStatus = {
    coreEndpoint: "",
    endpoint: "",
    networkEndpoints: [],
    state: "stopped"
  };
  private storedApiKeysBaseline?: string;
  private storedApiKeysPending?: string;
  private storedApiKeysReadFailed = false;
  private storedApiKeysReloadFailure?: string;
  private storedApiKeysRetryAt = 0;
  private storedApiKeysTimer?: NodeJS.Timeout;

  setBrowserWebSearchMcpIntegration(integration: BrowserWebSearchMcpIntegration): void {
    this.browserWebSearchMcpIntegration = integration;
  }

  setBrowserAutomationMcpIntegration(integration: BrowserAutomationMcpIntegration): void {
    this.browserAutomationMcpIntegration = integration;
  }

  async start(config: AppConfig): Promise<GatewayStatus> {
    this.cancelCoreRestart();
    await this.coreRecovery?.catch(() => undefined);
    return this.startGateway(config);
  }

  private async startGateway(config: AppConfig, recoveryGeneration?: number): Promise<GatewayStatus> {
    const coreHostError = loopbackCoreHostError(config.gateway.coreHost);
    if (coreHostError) {
      this.status = {
        ...this.getStatus(),
        lastError: coreHostError,
        state: "error"
      };
      return this.getStatus();
    }
    // Read before the old child stops: a key written from here on stays outside the baseline, so the poll sees it once the gateway runs.
    if (recoveryGeneration === undefined) await this.rememberStoredApiKeys();
    await this.stopGateway({ nextConfig: config });
    if (recoveryGeneration !== undefined && recoveryGeneration !== this.coreRestartGeneration) return this.getStatus();
    this.holdConfig(config);
    const coreAuthToken = generateCoreGatewayAuthToken();
    const scriptValidationErrors = await this.routeScriptRuntime.prepare(config.Router.rules);
    this.plugin = new LLMRouterPlugin(config, {
      scriptRuntime: this.routeScriptRuntime,
      scriptValidationErrors
    });
    this.status = {
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
      state: "starting"
    };

    try {
      await pluginService.start(config);
      const singleGatewayRuntime = shouldUseSingleGatewayRuntime(config);
      if (!singleGatewayRuntime && shouldRunGatewayRuntime(config) && config.gateway.enabled) {
        console.info(`[gateway] Using compatibility gateway server: ${singleGatewayRuntimeBlockers(config).join(", ") || "unknown blocker"}`);
      }
      const runtimeHost = singleGatewayRuntime ? config.gateway.host : config.gateway.coreHost;
      const runtimePort = singleGatewayRuntime ? config.gateway.port : config.gateway.corePort;
      this.status = {
        ...this.status,
        coreEndpoint: endpoint(runtimeHost, runtimePort)
      };
      mediaService.start(config, mediaToolsGatewayEndpoint(config), {
        authHeader: coreGatewayAuthHeader,
        authToken: coreAuthToken,
        baseUrl: this.status.coreEndpoint
      });
      const shouldRunServer = !singleGatewayRuntime &&
        (shouldRunUnifiedServer(config) || pluginService.hasGatewayRoutes() || config.mediaTools.enabled);
      const shouldRunGateway = shouldRunGatewayRuntime(config);
      if (shouldRunGateway && !hasAvailableGatewayModels(config)) {
        await this.stopGateway();
        console.info(`[gateway] Not started: ${NO_AVAILABLE_GATEWAY_MODELS_MESSAGE}`);
        this.status = {
          ...this.status,
          lastError: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE,
          state: "stopped"
        };
        return this.getStatus();
      }
      if (!shouldRunServer && !shouldRunGateway) {
        await mediaService.stop();
        await pluginService.stop();
        await backendService.stopAll();
        this.coreAuthToken = "";
        this.status = {
          ...this.status,
          state: "stopped"
        };
        return this.getStatus();
      }

      await this.rawTraceSynchronizer.start();
      if (shouldRunServer) {
        await this.listen(config);
      }
      if (this.server) {
        const proxyStatus = await proxyService.attach(config, this.server);
        if (proxyStatus.state === "error" && !config.gateway.enabled) {
          throw new Error(proxyStatus.lastError || "Proxy service failed to start.");
        }
      }

      if (shouldRunGateway) {
        await proxyService.refreshUpstreamProxyFromCurrentSystem();
        const upstreamProxyUrl = proxyService.getUpstreamProxyUrl("https") ?? await getSystemProxyUrlForProtocol("https", config);
        const coreGatewayConfig = await compileCoreGatewayConfig(
          config,
          this.rawTraceSynchronizer.token,
          this.billingSynchronizer.token,
          coreAuthToken,
          this.browserWebSearchMcpIntegration,
          upstreamProxyUrl,
          {
            publicGatewayMode: singleGatewayRuntime,
            runtimeHost,
            runtimePort
          }
        );
        await stopPreviousManagedCoreGateway(this.status.coreEndpoint);
        if (await isCoreGatewayHealthy(this.status.coreEndpoint)) {
          throw new Error(`Core gateway endpoint is already in use: ${this.status.coreEndpoint}`);
        }
        if (recoveryGeneration !== undefined && recoveryGeneration !== this.coreRestartGeneration) return this.getStatus();
        const runtimeId = randomUUID();
        const spawnedGateway = spawnGatewayProcess(
          withCoreRuntimeEndpoint(config, runtimeHost, runtimePort),
          coreGatewayConfig,
          upstreamProxyUrl,
          runtimeId,
          coreAuthToken
        );
        this.adoptCoreGatewayChild(spawnedGateway.child);
        this.coreAuthToken = coreAuthToken;
        const managedChild = spawnedGateway.child;
        const onChildMessage = (message: unknown) => this.handleCoreGatewayMessage(managedChild, message);
        let markerWritePromise: Promise<void> | undefined;
        let startupFailure: Error | undefined;
        managedChild.on("message", onChildMessage);
        managedChild.stdout?.on("data", (chunk) => console.info(`[gateway] ${chunk.toString().trimEnd()}`));
        managedChild.stderr?.on("data", (chunk) => console.warn(`[gateway] ${chunk.toString().trimEnd()}`));
        managedChild.once("error", (error) => {
          startupFailure ??= new Error(`Core gateway failed to start: ${formatError(error)}`);
          void this.handleCoreGatewayTermination(managedChild, markerWritePromise, startupFailure.message);
        });
        managedChild.once("exit", (code, signal) => {
          managedChild.off("message", onChildMessage);
          startupFailure ??= new Error(formatCoreGatewayChildExit(managedChild, code, signal));
          void this.handleCoreGatewayTermination(managedChild, markerWritePromise, startupFailure.message);
        });
        markerWritePromise = writeManagedCoreGatewayMarker(managedChild, runtimeId);
        await Promise.all([markerWritePromise, spawnedGateway.configAccepted]);
        assertManagedGatewayStartupContinues(managedChild, startupFailure);
        await waitForManagedCoreGatewayReady(this.status.coreEndpoint, runtimeId, managedChild);
        assertManagedGatewayStartupContinues(managedChild, startupFailure);
      }

      if (recoveryGeneration !== undefined && recoveryGeneration !== this.coreRestartGeneration) return this.getStatus();
      this.status = {
        ...this.status,
        coreManagedExternally: this.status.coreManagedExternally,
        gatewayManagedExternally: undefined,
        lastStartedAt: new Date().toISOString(),
        pid: this.child?.pid,
        state: "running"
      };
      clearInterval(this.storedApiKeysTimer);
      this.storedApiKeysTimer = setInterval(() => { void this.checkStoredApiKeys(); }, storedApiKeysPollMs).unref();
      this.runtimeConfigReloadError = undefined;
      return this.getStatus();
    } catch (error) {
      if (recoveryGeneration !== undefined && recoveryGeneration !== this.coreRestartGeneration) return this.getStatus();
      await this.stopGateway();
      this.status = {
        ...this.status,
        lastError: formatError(error),
        state: "error"
      };
      return this.getStatus();
    }
  }

  async ensureStarted(config: AppConfig): Promise<GatewayStatus> {
    const desiredEndpoint = endpoint(config.gateway.host, config.gateway.port);
    const currentStatus = this.getStatus();
    if (currentStatus.state === "running" && currentStatus.endpoint === desiredEndpoint) {
      if (currentStatus.gatewayManagedExternally) {
        const existingGateway = await probeExistingLlmrGateway(config);
        if (existingGateway.state === "usable") {
          return this.adoptExternalGateway(config, existingGateway.endpoint, existingGateway.apiKey);
        }
      }
      if (!currentStatus.gatewayManagedExternally) {
        await this.updateConfig(config);
        return this.getStatus();
      }
    }

    // A separately managed single runtime can exit without exposing its bind
    // error to this process. Reuse an authenticated gateway before spawning a
    // competing runtime instead of depending on an EADDRINUSE log message.
    let existingGateway = await probeExistingLlmrGateway(config);
    if (existingGateway.state === "usable") {
      await this.stop({ nextConfig: config });
    } else {
      const status = await this.start(config);
      if (status.state !== "error" || !isAddressInUseMessage(status.lastError)) {
        return status;
      }
      existingGateway = await probeExistingLlmrGateway(config);
      if (existingGateway.state !== "usable") {
        return status;
      }
    }

    return this.adoptExternalGateway(config, existingGateway.endpoint, existingGateway.apiKey);
  }

  private async adoptExternalGateway(config: AppConfig, externalEndpoint: string, apiKey?: string): Promise<GatewayStatus> {
    if (await existingGatewayPredatesManagerKey(externalEndpoint, apiKey ?? "")) {
      this.holdConfig(config);
      this.externalGatewayApiKey = undefined;
      this.status = {
        coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
        endpoint: externalEndpoint,
        lastError: `A running LLM Router gateway from an older version holds ${externalEndpoint}. Quit it, then start LLM Router again.`,
        networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
        state: "error"
      };
      return this.getStatus();
    }
    this.markExternalGatewayRunning(config, externalEndpoint, apiKey);
    try {
      await this.reloadExternalGatewayConfig(config, false);
    } catch {
      // reloadExternalGatewayConfig records its own failure in the status.
    }
    return this.getStatus();
  }

  async restart(config: AppConfig): Promise<GatewayStatus> {
    if (this.status.gatewayManagedExternally) {
      await this.reloadExternalGatewayConfig(config, true);
      return this.getStatus();
    }
    return this.start(config);
  }

  async stop(options: GatewayStopOptions = {}): Promise<GatewayStatus> {
    this.cancelCoreRestart();
    // Recovery may have started resources before observing cancellation. Finish
    // that attempt before cleanup so it cannot recreate resources after stop.
    await this.coreRecovery?.catch(() => undefined);
    return this.stopGateway(options);
  }

  private async stopGateway(options: GatewayStopOptions = {}): Promise<GatewayStatus> {
    clearInterval(this.storedApiKeysTimer);
    this.storedApiKeysTimer = undefined;
    const child = this.child;
    const childCoreEndpoint = child ? this.status.coreEndpoint : "";
    this.child = undefined;
    setExternalLiveTokenRateSnapshot(coreGatewayLiveTokenRateSourceId);
    this.coreAuthToken = "";
    this.externalGatewayApiKey = undefined;
    if (child && !child.killed) {
      child.kill();
    }
    if (child) {
      await waitForCoreGatewayStop(childCoreEndpoint);
      await removeManagedCoreGatewayMarkerBestEffort();
    }

    const server = this.server;
    this.server = undefined;
    if (server) {
      await closeServer(server);
    }
    await this.rawTraceSynchronizer.stop();
    await this.routeScriptRuntime.close();
    await mediaService.stop();

    await proxyService.stop(options.proxyRestoreTimeoutMs);
    await pluginService.stop(options.nextConfig ? { nextConfig: options.nextConfig } : {});
    await backendService.stopAll();
    await this.browserWebSearchMcpIntegration?.stopBrowserWebSearchMcpServers().catch((error) => {
      console.warn(`[gateway] Failed to stop browser web search MCP: ${formatError(error)}`);
    });
    await this.browserAutomationMcpIntegration?.stopBrowserAutomationMcpServer().catch((error) => {
      console.warn(`[gateway] Failed to stop browser automation MCP: ${formatError(error)}`);
    });

    this.status = {
      ...this.status,
      coreManagedExternally: undefined,
      gatewayManagedExternally: undefined,
      pid: undefined,
      state: "stopped"
    };
    return this.getStatus();
  }

  getStatus(): GatewayStatus {
    const refusedForKey = refusedKeyRequests();
    // this.status can hold an earlier getStatus() copy (start() spreads one in), so its refusedForKey gives way to the live one.
    const { refusedForKey: _stale, ...status } = this.status;
    return {
      ...status,
      networkEndpoints: this.config
        ? gatewayNetworkEndpoints(this.config.gateway.host, this.config.gateway.port)
        : this.status.networkEndpoints,
      ...(refusedForKey.count > 0 ? { refusedForKey } : {})
    };
  }

  private adoptCoreGatewayChild(child: ChildProcess): void {
    foldChildRefusedKeyRequests();
    this.child = child;
  }

  // The held config is mutated in place by callers, so a restart is decided against the signature taken when it was held.
  private holdConfig(config: AppConfig): void {
    this.config = config;
    this.runtimeConfigSignature = runtimeGatewayConfigSignature(config);
  }

  async updateConfig(config: AppConfig): Promise<void> {
    assertLoopbackCoreHost(config.gateway.coreHost);
    if (this.status.gatewayManagedExternally) {
      await this.reloadExternalGatewayConfig(config, false);
      return;
    }
    if (this.config && this.status.state === "running" &&
      this.runtimeConfigSignature !== runtimeGatewayConfigSignature(config)) {
      await this.start(config);
      return;
    }

    await this.rememberStoredApiKeys();
    const scriptValidationErrors = await this.routeScriptRuntime.prepare(config.Router.rules);
    const nextPlugin = new LLMRouterPlugin(config, {
      scriptRuntime: this.routeScriptRuntime,
      scriptValidationErrors
    });
    this.holdConfig(config);
    this.plugin = nextPlugin;
    const singleGatewayRuntime = Boolean(this.child && !this.server && shouldRunGatewayRuntime(config));
    const runtimeCoreEndpoint = singleGatewayRuntime
      ? endpoint(config.gateway.host, config.gateway.port)
      : endpoint(config.gateway.coreHost, config.gateway.corePort);
    mediaService.updateConfig(config, mediaToolsGatewayEndpoint(config), {
      authHeader: coreGatewayAuthHeader,
      authToken: this.coreAuthToken,
      baseUrl: runtimeCoreEndpoint
    });
    proxyService.updateConfig(config);
    this.status = {
      ...this.status,
      coreEndpoint: runtimeCoreEndpoint,
      endpoint: endpoint(config.gateway.host, config.gateway.port),
      gatewayManagedExternally: undefined,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port)
    };
    this.sendCoreGatewayLiveTokenRateConfig(config.trayShowTokenRate);
  }

  validateRouteScript(request: RouteScriptValidationRequest): Promise<RouteScriptValidationResult> {
    return this.routeScriptRuntime.validate(request.script);
  }

  async testRouteScript(config: AppConfig, request: RouteScriptTestRequest): Promise<RouteScriptTestResult> {
    const validation = await this.routeScriptRuntime.validate(request.script);
    if (!validation.ok) return { ...validation, matched: false };
    const rule: RouterRule = {
      enabled: true,
      id: "route-script-test",
      name: "Route script test",
      script: request.script,
      type: "script"
    };
    const testConfig: AppConfig = {
      ...config,
      Router: { ...config.Router, rules: [rule] }
    };
    const compiled = compileRouterConfig(testConfig);
    const compiledRule = compiled.rules[0];
    const routeRequest = {
      body: request.request.body,
      headers: request.request.headers ?? {},
      log: console,
      method: request.request.method ?? "POST",
      sessionId: request.request.sessionId,
      tokenCount: request.request.tokenCount ?? 0,
      url: request.request.url ?? "/v1/messages"
    };
    const context = buildRouteScriptInput(routeRequest, {
      profileId: routeScriptTestProfileId(config, routeRequest.headers)
    });
    const execution = await this.routeScriptRuntime.execute(rule.id, request.script, context, {
      circuitBreaker: false
    });
    if (execution.status !== "ok") {
      return {
        diagnostics: [{
          code: execution.status === "timeout" ? "script-timeout" : "script-runtime-error",
          message: execution.error ?? execution.status
        }],
        durationMs: execution.durationMs,
        matched: false,
        ok: false
      };
    }
    const normalized = normalizeRouteScriptResult({
      compiledRule,
      defaultFallback: compiled.fallback,
      modelRegistry: compiled.modelRegistry,
      value: execution.value
    });
    return {
      diagnostics: normalized.diagnostics.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message })),
      durationMs: execution.durationMs,
      matched: normalized.matched,
      ok: normalized.diagnostics.length === 0,
      output: scriptResultPreview(execution.value)
    };
  }

  private async listen(config: AppConfig): Promise<void> {
    this.server = createServer((request, response) => {
      if (proxyService.shouldHandleHttpRequest(request)) {
        void proxyService.handleHttpRequest(request, response).catch((error) => sendGatewayError(response, error));
        return;
      }

      void this.handleRequest(request, response).catch((error) => sendGatewayError(response, error));
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(config.gateway.port, config.gateway.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  private async handleCoreGatewayTermination(
    child: ChildProcess,
    markerWritePromise: Promise<void> | undefined,
    message: string
  ): Promise<void> {
    await markerWritePromise?.catch(() => undefined);
    if (this.child !== child || this.status.state === "stopped") {
      return;
    }
    const wasRunning = this.status.state === "running";
    const generation = this.coreRestartGeneration;
    if (this.status.lastStartedAt && Date.now() - Date.parse(this.status.lastStartedAt) >= 60_000) {
      this.coreRestartAttempts = 0;
    }
    this.child = undefined;
    setExternalLiveTokenRateSnapshot(coreGatewayLiveTokenRateSourceId);
    this.coreAuthToken = "";
    await removeManagedCoreGatewayMarkerBestEffort();
    if (generation !== this.coreRestartGeneration) return;
    this.status = {
      ...this.status,
      coreManagedExternally: undefined,
      lastError: message,
      pid: undefined,
      state: "error"
    };
    if (wasRunning && this.config) this.scheduleCoreRestart(generation);
  }

  private cancelCoreRestart(): void {
    this.coreRestartGeneration += 1;
    this.coreRestartAttempts = 0;
    if (this.coreRestartTimer) clearTimeout(this.coreRestartTimer);
    this.coreRestartTimer = undefined;
  }

  private scheduleCoreRestart(generation: number): void {
    if (generation !== this.coreRestartGeneration || this.coreRestartTimer) return;
    const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(this.coreRestartAttempts++, 5));
    console.warn(`[gateway] Core gateway exited unexpectedly; restarting in ${delayMs}ms.`);
    this.coreRestartTimer = setTimeout(async () => {
      this.coreRestartTimer = undefined;
      if (generation !== this.coreRestartGeneration || !this.config) return;
      const recovery = this.startGateway(this.config, generation);
      this.coreRecovery = recovery;
      try {
        const status = await recovery;
        if (status.state === "error") this.scheduleCoreRestart(generation);
      } catch (error) {
        console.warn(`[gateway] Core gateway restart failed: ${formatError(error)}`);
        this.scheduleCoreRestart(generation);
      } finally {
        if (this.coreRecovery === recovery) this.coreRecovery = undefined;
      }
    }, delayMs);
  }

  private handleCoreGatewayMessage(child: ChildProcess, message: unknown): void {
    if (this.child !== child) {
      return;
    }
    if (isLiveTokenRateSnapshotMessage(message)) {
      setExternalLiveTokenRateSnapshot(coreGatewayLiveTokenRateSourceId, {
        activeRequests: message.activeRequests,
        tokensPerSecond: message.tokensPerSecond
      });
      return;
    }
    if (isRefusedKeyRequestsMessage(message)) {
      mergeChildRefusedKeyRequests(message);
      return;
    }
    if ((message as { type?: unknown } | null)?.type === llmrRefusedKeyRequestsMessageType) {
      if (!warnedMalformedRefusedKeyMessage) {
        warnedMalformedRefusedKeyMessage = true;
        console.warn("[gateway] Ignored a malformed refused-key requests message from the core gateway.");
      }
      return;
    }
    if (isRuntimeConfigReloadMessage(message)) {
      this.schedulePersistedRuntimeConfigReload(message.configRevision, message.forceRestart === true);
    }
  }

  private sendCoreGatewayLiveTokenRateConfig(enabled: boolean): void {
    if (!this.child?.connected || !this.child.send) {
      return;
    }
    try {
      this.child.send({
        enabled,
        protocolVersion: 1,
        type: llmrLiveTokenRateConfigMessageType
      });
    } catch {
      // The runtime may exit between the connected check and send().
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    return this.requestHandler.handleRequest(request, response);
  }

  private async proxyRequest(request: IncomingMessage, response: ServerResponse, path: string, apiKey?: ApiKeyConfig): Promise<void> {
    return this.requestPipeline.proxyRequest(request, response, path, apiKey);
  }

  private async reloadExternalGatewayConfig(config: AppConfig, forceRestart: boolean): Promise<void> {
    const currentEndpoint = this.status.endpoint || endpoint(config.gateway.host, config.gateway.port);
    try {
      const externalGateway = await reloadExistingLlmrGatewayConfig(
        currentEndpoint,
        config,
        this.externalGatewayApiKey,
        { forceRestart }
      );
      this.markExternalGatewayRunning(config, externalGateway.endpoint, externalGateway.apiKey);
    } catch (error) {
      const message = `Failed to update the externally managed LLMR gateway: ${formatError(error)}`;
      this.status = {
        ...this.status,
        lastError: message,
        state: "error"
      };
      throw new Error(message, { cause: error });
    }
  }

  private async readStoredApiKeys(): Promise<string | undefined> {
    try {
      const stored = JSON.stringify(await loadPersistedApiKeys());
      this.storedApiKeysReadFailed = false;
      return stored;
    } catch (error) {
      if (!this.storedApiKeysReadFailed) console.warn(`[gateway] Failed to read the stored API keys: ${formatError(error)}`);
      this.storedApiKeysReadFailed = true;
      return undefined;
    }
  }

  private async rememberStoredApiKeys(): Promise<void> {
    this.storedApiKeysPending = undefined;
    this.storedApiKeysRetryAt = 0;
    // A failed read keeps the older baseline, so a change is reloaded later and not taken as applied.
    this.storedApiKeysBaseline = await this.readStoredApiKeys() ?? this.storedApiKeysBaseline;
  }

  // Compared with the stored list as of the last config taken, not with the held config, which callers mutate and which may hold keys never stored.
  private async checkStoredApiKeys(): Promise<void> {
    if (this.status.state !== "running" || this.status.gatewayManagedExternally || !(this.child || this.server)) return;
    if (Date.now() < this.storedApiKeysRetryAt) return;
    const seen = await this.readStoredApiKeys();
    if (seen === undefined) return;
    if (this.storedApiKeysBaseline === undefined) {
      this.storedApiKeysBaseline = seen;
    } else if (seen === this.storedApiKeysBaseline) {
      this.storedApiKeysPending = undefined;
    } else if (seen !== this.storedApiKeysPending) {
      // A save handler writes keys and then calls updateConfig; waiting for a second tick keeps a tick between the two from restarting twice.
      this.storedApiKeysPending = seen;
    } else {
      this.storedApiKeysBaseline = seen;
      this.storedApiKeysPending = undefined;
      this.schedulePersistedRuntimeConfigReload(undefined, false);
    }
  }

  private schedulePersistedRuntimeConfigReload(expectedRevision: string | undefined, forceRestart: boolean): void {
    if (expectedRevision !== undefined) this.runtimeConfigReloadError = undefined;
    this.runtimeConfigReloadQueue = this.runtimeConfigReloadQueue.then(
      () => this.reloadPersistedRuntimeConfig(expectedRevision, forceRestart),
      () => this.reloadPersistedRuntimeConfig(expectedRevision, forceRestart)
    );
  }

  // With no revision the reload is the key poll's own, and it keeps its failures apart from the ones a requested reload reports to its caller.
  private async reloadPersistedRuntimeConfig(expectedRevision: string | undefined, forceRestart: boolean): Promise<void> {
    const keyPoll = expectedRevision === undefined;
    try {
      const nextConfig = await loadAppConfig();
      const loadError = appConfigLoadError(nextConfig);
      if (loadError) throw new Error(loadError);
      const actualRevision = gatewayRuntimeConfigRevision(nextConfig);
      if (!keyPoll && actualRevision !== expectedRevision) {
        throw new Error(`Persisted configuration revision ${actualRevision || "(missing)"} does not match the requested revision ${expectedRevision}.`);
      }
      if (keyPoll && this.child && !(shouldRunGatewayRuntime(nextConfig) && hasAvailableGatewayModels(nextConfig))) {
        throw new Error("The stored configuration would not run the gateway, so the running gateway keeps the API keys it started with.");
      }
      const restartRequired = forceRestart || !this.config ||
        this.runtimeConfigSignature !== runtimeGatewayConfigSignature(nextConfig);
      if (restartRequired) {
        const status = await this.start(nextConfig);
        if (status.state === "error") {
          throw new Error(status.lastError || "LLMR gateway failed to restart with the updated configuration.");
        }
      } else {
        await this.updateConfig(nextConfig);
      }
      if (keyPoll) {
        this.storedApiKeysReloadFailure = undefined;
      } else {
        this.runtimeConfigReloadError = undefined;
      }
    } catch (error) {
      const message = formatError(error);
      if (!keyPoll) {
        this.runtimeConfigReloadError = message;
        console.error(`[gateway] Failed to reload persisted runtime configuration: ${message}`);
        return;
      }
      // While the gateway still runs, the reload is tried again a minute later, and the same failure is logged once.
      this.storedApiKeysBaseline = unappliedStoredApiKeys;
      this.storedApiKeysRetryAt = Date.now() + storedApiKeysRetryMs;
      if (message !== this.storedApiKeysReloadFailure) console.error(`[gateway] Failed to reload after a stored API key change: ${message}`);
      this.storedApiKeysReloadFailure = message;
    }
  }

  private markExternalGatewayRunning(config: AppConfig, externalEndpoint: string, apiKey?: string): void {
    this.holdConfig(config);
    this.child = undefined;
    this.server = undefined;
    this.coreAuthToken = "";
    setExternalLiveTokenRateSnapshot(coreGatewayLiveTokenRateSourceId);
    this.externalGatewayApiKey = apiKey;
    this.status = {
      coreEndpoint: endpoint(config.gateway.coreHost, config.gateway.corePort),
      endpoint: externalEndpoint,
      gatewayManagedExternally: true,
      networkEndpoints: gatewayNetworkEndpoints(config.gateway.host, config.gateway.port),
      state: "running"
    };
  }

}

function assertManagedGatewayStartupContinues(child: ChildProcess, startupFailure: Error | undefined): void {
  if (startupFailure || child.exitCode !== null || child.signalCode !== null || child.killed) {
    throw startupFailure ?? new Error(formatCoreGatewayChildExit(child));
  }
}

async function removeManagedCoreGatewayMarkerBestEffort(): Promise<void> {
  await removeManagedCoreGatewayMarker().catch((error) => {
    console.warn(`[gateway] Failed to remove gateway runtime marker: ${formatError(error)}`);
  });
}

function shouldUseSingleGatewayRuntime(config: AppConfig): boolean {
  return singleGatewayRuntimeBlockers(config).length === 0;
}

function singleGatewayRuntimeBlockers(config: AppConfig, options: SingleGatewayRuntimeBlockerOptions = {}): string[] {
  const blockers: string[] = [];
  if (!shouldRunGatewayRuntime(config)) blockers.push("gateway-runtime-disabled");
  if (!config.gateway.enabled) blockers.push("public-gateway-disabled");
  if (!(options.gatewayRuntimeSupportsRouterPlugin ?? gatewayRuntimeSupportsRouterPlugin)()) {
    blockers.push("core-runtime-missing-router-plugin-support");
  }
  blockers.push(...unifiedServerFallbackFeatureBlockers(config));
  if (hasActiveRouterFallback(config)) blockers.push("router-fallback");
  if (config.mediaTools.enabled) blockers.push("media-tools");
  if (browserAutomationMcpEnabled(config)) blockers.push("browser-automation-mcp");
  if ((options.hasGatewayRoutes ?? (() => pluginService.hasGatewayRoutes()))()) blockers.push("plugin-gateway-routes");
  if ((options.hasGatewayRequestTransforms ?? (() => pluginService.hasGatewayRequestTransforms({ includeBuiltIns: false })))()) {
    blockers.push("plugin-gateway-request-transforms");
  }
  if (hasApiKeyLimits(config)) blockers.push("api-key-limits");
  return blockers;
}

function unifiedServerFallbackFeatureBlockers(config: AppConfig): string[] {
  return [
    config.proxy.enabled ? "proxy" : undefined,
    config.proxy.captureNetwork ? "network-capture" : undefined,
    config.contextArchive.enabled ? "context-archive" : undefined
  ].filter((blocker): blocker is string => Boolean(blocker));
}

function hasActiveRouterFallback(config: AppConfig): boolean {
  return routerFallbackRequiresWrapper(config.Router.fallback) ||
    (config.Router.rules ?? []).some((rule) =>
      rule.enabled && routerFallbackRequiresWrapper(rule.fallback)
    ) ||
    (config.profile?.enabled !== false && (config.profile?.profiles ?? []).some((profile) =>
      profile.enabled &&
      profile.routing?.enabled !== false &&
      (profile.routing?.rules ?? []).some((rule) =>
        rule.enabled && routerFallbackRequiresWrapper(rule.fallback)
      )
    ));
}

function routerFallbackRequiresWrapper(fallback: AppConfig["Router"]["fallback"] | undefined): boolean {
  if (!fallback || fallback.mode === "off") {
    return false;
  }
  if (fallback.mode === "retry") {
    return fallback.retryCount > 0;
  }
  return fallback.models.some((model) => model.trim());
}

function hasApiKeyLimits(config: AppConfig): boolean {
  return configuredApiKeysFromConfig(config).some((apiKey) =>
    apiKey.limits && Object.keys(apiKey.limits).length > 0
  );
}

function configuredApiKeysFromConfig(config: AppConfig): ApiKeyConfig[] {
  return [
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS : []),
    ...(config.APIKEY ? [{ createdAt: new Date(0).toISOString(), id: "legacy", key: config.APIKEY }] : [])
  ];
}

function isRuntimeConfigReloadMessage(message: unknown): message is { configRevision: string; forceRestart?: boolean } {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const record = message as Record<string, unknown>;
  return record.type === llmrRuntimeConfigReloadMessageType &&
    record.protocolVersion === 1 &&
    typeof record.configRevision === "string" &&
    /^[a-f0-9]{64}$/i.test(record.configRevision) &&
    (record.forceRestart === undefined || typeof record.forceRestart === "boolean");
}

function isLiveTokenRateSnapshotMessage(
  message: unknown
): message is { activeRequests: number; tokensPerSecond: number } {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const record = message as Record<string, unknown>;
  return record.type === llmrLiveTokenRateSnapshotMessageType &&
    record.protocolVersion === 1 &&
    typeof record.activeRequests === "number" && Number.isFinite(record.activeRequests) &&
    typeof record.tokensPerSecond === "number" && Number.isFinite(record.tokensPerSecond);
}

function isRefusedKeyRequestsMessage(message: unknown): message is LlmrRefusedKeyRequestsMessage {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const record = message as Record<string, unknown>;
  return record.type === llmrRefusedKeyRequestsMessageType &&
    record.protocolVersion === 1 &&
    typeof record.count === "number" && Number.isFinite(record.count) &&
    Array.isArray(record.recent) &&
    record.recent.every((entry) => {
      const item = entry as Record<string, unknown> | null;
      return Boolean(item) && ["at", "client", "reason", "route"].every((key) => typeof item?.[key] === "string");
    });
}

function withCoreRuntimeEndpoint(config: AppConfig, host: string, port: number): AppConfig {
  return {
    ...config,
    gateway: {
      ...config.gateway,
      coreHost: host,
      corePort: port
    }
  };
}

export const gatewayService = new GatewayService();

export function singleGatewayRuntimeBlockersForTest(
  config: AppConfig,
  options: SingleGatewayRuntimeBlockerOptions = {}
): string[] {
  return singleGatewayRuntimeBlockers(config, options);
}
