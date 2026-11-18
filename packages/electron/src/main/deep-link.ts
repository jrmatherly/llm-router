import { app, dialog } from "electron";
import { appDeepLinkProtocol, createProviderDeepLinkRequest as createSharedProviderDeepLinkRequest, isAppDeepLinkUrl } from "@llmr/core/contracts/deep-link";
import type { AppConfig, GatewayPluginAppConfig, ProviderDeepLinkRequest } from "@llmr/core/contracts/app";
import { IPC_CHANNELS } from "@llmr/core/config/constants";
import { loadAppConfig } from "@llmr/core/config/config";
import { syncClaudeAppGatewayConfig } from "@llmr/core/agents/claude-app/gateway-service";
import { gatewayService } from "@llmr/core/gateway/service";
import { providerIdentitySafetyIssue } from "@llmr/core/providers/presets/index";
import { parsePluginDeepLinkRequest, resolveGatewayPluginAppUrl, type PluginDeepLinkRequest } from "./deep-link-url";
import windowsManager from "./windows";

const pluginAppExistingGatewayProbeTimeoutMs = 2_000;
const pluginAppStartupProbeTimeoutMs = 12_000;
const pluginAppProbeIntervalMs = 250;
const pluginAppProbeRequestTimeoutMs = 1_200;

class DeepLinkService {
  private pendingProviderRequests: ProviderDeepLinkRequest[] = [];
  private pendingPluginRequests: PluginDeepLinkRequest[] = [];
  private openingPluginRequests = new Set<string>();

  register(): void {
    this.registerProtocolClient();

    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.handleUrl(url);
    });

    void app.whenReady().then(() => this.flushPendingPluginRequests());
  }

  consumePendingProviderRequests(): ProviderDeepLinkRequest[] {
    const requests = [...this.pendingProviderRequests];
    this.pendingProviderRequests = [];
    return requests;
  }

  handleArgv(argv: string[]): boolean {
    const urls = argv.filter((item) => isAppDeepLinkUrl(item));
    for (const url of urls) {
      this.handleUrl(url);
    }
    return urls.length > 0;
  }

  handleUrl(url: string): void {
    let pluginRequest: PluginDeepLinkRequest | undefined;
    try {
      pluginRequest = parsePluginDeepLinkRequest(url);
    } catch (error) {
      const detail = formatError(error);
      console.error(`[deep-link] Invalid plugin link ${url}: ${detail}`);
      if (app.isReady()) {
        try {
          dialog.showErrorBox("Invalid LLMR plugin link", detail);
        } catch {
          // The console error above remains available when the dialog API is unavailable.
        }
      }
      return;
    }
    if (pluginRequest) {
      logDeepLinkDiagnostic(
        `[deep-link] Received plugin link for ${pluginRequest.pluginId}` +
          (pluginRequest.appId ? `/${pluginRequest.appId}` : "")
      );
      this.handlePluginRequest(pluginRequest);
      return;
    }

    const request = createProviderDeepLinkRequest(url);
    this.pendingProviderRequests.push(request);
    if (this.pendingProviderRequests.length > 20) {
      this.pendingProviderRequests = this.pendingProviderRequests.slice(-20);
    }

    if (!app.isReady()) {
      return;
    }

    windowsManager.showMainWindow();
    windowsManager.broadcast(IPC_CHANNELS.appProviderDeepLink, request);
  }

  openPluginApp(pluginId: string, appId?: string): Promise<void> {
    return this.openPluginRequest({
      ...(appId ? { appId } : {}),
      pluginId,
      rawUrl: `${appDeepLinkProtocol}://plugin/${encodeURIComponent(pluginId)}/open`
    }, { confirmGatewayStart: false });
  }

  private handlePluginRequest(request: PluginDeepLinkRequest): void {
    if (!app.isReady()) {
      this.pendingPluginRequests.push(request);
      this.pendingPluginRequests = this.pendingPluginRequests.slice(-20);
      return;
    }

    void this.openPluginRequest(request, { confirmGatewayStart: true });
  }

  private flushPendingPluginRequests(): void {
    const requests = [...this.pendingPluginRequests];
    this.pendingPluginRequests = [];
    for (const request of requests) {
      void this.openPluginRequest(request, { confirmGatewayStart: true });
    }
  }

  private async openPluginRequest(request: PluginDeepLinkRequest, options: { confirmGatewayStart: boolean }): Promise<void> {
    const requestKey = `${request.pluginId}:${request.appId || ""}`;
    if (this.openingPluginRequests.has(requestKey)) {
      return;
    }
    this.openingPluginRequests.add(requestKey);

    try {
      const { config } = await syncClaudeAppGatewayConfig(await loadAppConfig());
      const pluginApp = resolvePluginApp(config, request);
      if (!pluginApp) {
        throw new Error(`Plugin app is not configured or enabled: ${request.pluginId}`);
      }

      const currentStatus = gatewayService.getStatus();
      const startedGateway = currentStatus.state !== "running";
      if (startedGateway && options.confirmGatewayStart) {
        const { response } = await dialog.showMessageBox({
          buttons: ["Start gateway", "Cancel"],
          cancelId: 1,
          defaultId: 1,
          detail: "A link asked LLM Router to open this plugin app. The gateway is stopped and has to start first.",
          message: `Open the plugin app "${pluginApp.name}"?`,
          type: "question"
        });
        if (response !== 0) {
          return;
        }
      }
      const status = startedGateway ? await gatewayService.start(config) : currentStatus;
      if (status.state !== "running") {
        throw new Error(status.lastError || "LLMR gateway did not start.");
      }
      const appUrl = resolveGatewayPluginAppUrl(config, pluginApp.url);
      await ensurePluginAppUrlAvailable(config, appUrl, startedGateway);
      logDeepLinkDiagnostic(`[deep-link] Opening plugin app ${request.pluginId}/${pluginApp.id || pluginApp.name} at ${safeUrlForLog(appUrl)}`);

      windowsManager.openPluginAppWindow({
        id: `${request.pluginId}:${pluginApp.id || pluginApp.name}`,
        title: pluginApp.name,
        url: appUrl
      });
    } catch (error) {
      const detail = formatError(error);
      console.error(`[deep-link] Failed to open plugin app from ${request.rawUrl}: ${detail}`);
      try {
        dialog.showErrorBox("Failed to open LLMR plugin app", detail);
      } catch {
        // The console error above remains available when the dialog API is unavailable.
      }
      windowsManager.showMainWindow();
    } finally {
      this.openingPluginRequests.delete(requestKey);
    }
  }

  private registerProtocolClient(): void {
    // A dev or e2e run would otherwise take the scheme from the installed app, and the binding outlives the run.
    if (!app.isPackaged) {
      return;
    }
    try {
      app.setAsDefaultProtocolClient(appDeepLinkProtocol);
    } catch (error) {
      console.warn(`[deep-link] Failed to register ${appDeepLinkProtocol} protocol: ${formatError(error)}`);
    }
  }
}

async function ensurePluginAppUrlAvailable(config: AppConfig, appUrl: string, startedGateway: boolean): Promise<void> {
  try {
    await waitForPluginAppUrl(
      appUrl,
      startedGateway ? pluginAppStartupProbeTimeoutMs : pluginAppExistingGatewayProbeTimeoutMs
    );
    return;
  } catch (error) {
    if (startedGateway) {
      throw error;
    }
    console.warn(`[deep-link] Plugin app URL was not reachable on the running gateway; restarting gateway once. ${formatError(error)}`);
  }

  const restartedStatus = await gatewayService.start(config);
  if (restartedStatus.state !== "running") {
    throw new Error(restartedStatus.lastError || "LLMR gateway did not restart.");
  }
  await waitForPluginAppUrl(appUrl, pluginAppStartupProbeTimeoutMs);
}

async function waitForPluginAppUrl(appUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = "timeout";

  while (Date.now() <= deadline) {
    const probe = await probePluginAppUrl(appUrl);
    if (probe.ok) {
      return;
    }
    lastProbe = probe.detail;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await delay(Math.min(pluginAppProbeIntervalMs, remainingMs));
  }

  throw new Error(`Plugin app did not become available at ${appUrl}. Last probe: ${lastProbe}`);
}

async function probePluginAppUrl(appUrl: string): Promise<{ ok: true } | { detail: string; ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), pluginAppProbeRequestTimeoutMs);
  try {
    const response = await fetch(appUrl, {
      cache: "no-store",
      method: "HEAD",
      signal: controller.signal
    });
    if (response.ok) {
      return { ok: true };
    }
    return {
      detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      ok: false
    };
  } catch (error) {
    return {
      detail: formatError(error),
      ok: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logDeepLinkDiagnostic(message: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info(message);
  }
}

function safeUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.search) {
      url.search = "?...";
    }
    if (url.hash) {
      url.hash = "#...";
    }
    return url.toString();
  } catch {
    return "<invalid-url>";
  }
}

function resolvePluginApp(config: Pick<AppConfig, "plugins">, request: PluginDeepLinkRequest): GatewayPluginAppConfig | undefined {
  const apps = config.plugins.find((candidate) => candidate.enabled !== false && candidate.id === request.pluginId)?.apps ?? [];
  if (request.appId) {
    return apps.find((app) => (app.id || app.name) === request.appId);
  }
  return apps[0];
}

function createProviderDeepLinkRequest(rawUrl: string): ProviderDeepLinkRequest {
  const request = createSharedProviderDeepLinkRequest(rawUrl);
  if (!request.provider) {
    return request;
  }

  const identityIssue = providerIdentitySafetyIssue({
    baseUrl: request.provider.baseUrl,
    name: request.provider.name
  });
  if (!identityIssue) {
    return request;
  }

  return {
    error: identityIssue.message,
    id: request.id,
    rawUrl: request.rawUrl,
    receivedAt: request.receivedAt
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const deepLinkService = new DeepLinkService();
