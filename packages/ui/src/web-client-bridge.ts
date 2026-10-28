type LlmrApi = NonNullable<Window["llmr"]>;

const rpcEndpoint = "/api/llmr/rpc";
const webAuthHeader = "x-llmr-web-auth";
const webAuthQueryParam = "llmr_web_token";
const webAuthStorageKey = "llmr.webAuthToken";
const webAuthToken = readWebAuthToken();

type RpcResponse =
  | { ok: true; value: unknown }
  | { error: { message: string; stack?: string }; ok: false };

async function rpc(method: string, args: unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcEndpoint, {
    body: JSON.stringify({ args: trimTrailingUndefined(args), method }),
    headers: {
      "content-type": "application/json",
      ...(webAuthToken ? { [webAuthHeader]: webAuthToken } : {})
    },
    method: "POST"
  });
  let payload: RpcResponse | undefined;
  try {
    payload = await response.json() as RpcResponse;
  } catch {
    payload = undefined;
  }
  if (!response.ok || !payload?.ok) {
    const message = payload && !payload.ok
      ? payload.error.message
      : response.status === 404
        ? "LLMR management service is unavailable. Make sure the LLMR app or llmr ui command is running, then retry."
        : `LLMR web API failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.value;
}

function trimTrailingUndefined(args: unknown[]): unknown[] {
  let end = args.length;
  while (end > 0 && args[end - 1] === undefined) {
    end -= 1;
  }
  return end === args.length ? args : args.slice(0, end);
}

function readWebAuthToken(): string {
  const tokenFromUrl = readWebAuthTokenFromUrl();
  if (tokenFromUrl) {
    writeStoredWebAuthToken(tokenFromUrl);
    return tokenFromUrl;
  }
  return readStoredWebAuthToken();
}

function readWebAuthTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get(webAuthQueryParam)?.trim() ?? "";
    if (!token) {
      return "";
    }
    url.searchParams.delete(webAuthQueryParam);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return token;
  } catch {
    return "";
  }
}

function readStoredWebAuthToken(): string {
  try {
    return window.sessionStorage.getItem(webAuthStorageKey)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeStoredWebAuthToken(token: string): void {
  try {
    window.sessionStorage.setItem(webAuthStorageKey, token);
  } catch {
    // The in-memory token still works for the current page load if storage is unavailable.
  }
}

function noopSubscription(): () => void {
  return () => undefined;
}

async function selectPluginDirectory(): Promise<unknown> {
  const directory = window.prompt("Plugin directory path");
  if (!directory?.trim()) {
    return undefined;
  }
  return rpc("selectPluginDirectory", [directory.trim()]);
}

function normalizeExternalHttpUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be opened.");
  }
  return url.toString();
}

const webClientBridge: LlmrApi = {
  applyClaudeAppGateway: (config) => rpc("applyClaudeAppGateway", [config]) as ReturnType<LlmrApi["applyClaudeAppGateway"]>,
  applyProfile: () => rpc("applyProfile") as ReturnType<LlmrApi["applyProfile"]>,
  cancelBotGatewayQrLogin: (request) => rpc("cancelBotGatewayQrLogin", [request]) as ReturnType<LlmrApi["cancelBotGatewayQrLogin"]>,
  checkProviderConnectivity: (request) => rpc("checkProviderConnectivity", [request]) as ReturnType<LlmrApi["checkProviderConnectivity"]>,
  clearProxyNetworkCaptures: () => rpc("clearProxyNetworkCaptures") as ReturnType<LlmrApi["clearProxyNetworkCaptures"]>,
  closeBotGatewayQrWindow: (request) => rpc("closeBotGatewayQrWindow", [request]) as ReturnType<LlmrApi["closeBotGatewayQrWindow"]>,
  closeTray: () => Promise.resolve(),
  detectProviderIcon: (request) => rpc("detectProviderIcon", [request]) as ReturnType<LlmrApi["detectProviderIcon"]>,
  exportData: () => rpc("exportData") as ReturnType<LlmrApi["exportData"]>,
  fetchProviderManifest: (request) => rpc("fetchProviderManifest", [request]) as ReturnType<LlmrApi["fetchProviderManifest"]>,
  getAgentAnalysis: (filter) => rpc("getAgentAnalysis", [filter]) as ReturnType<LlmrApi["getAgentAnalysis"]>,
  getAgentTracePayload: (request) => rpc("getAgentTracePayload", [request]) as ReturnType<LlmrApi["getAgentTracePayload"]>,
  getAppInfo: () => rpc("getAppInfo") as ReturnType<LlmrApi["getAppInfo"]>,
  getConfig: () => rpc("getConfig") as ReturnType<LlmrApi["getConfig"]>,
  getGatewayStatus: () => rpc("getGatewayStatus") as ReturnType<LlmrApi["getGatewayStatus"]>,
  getLocalAgentProviderCandidates: () => rpc("getLocalAgentProviderCandidates") as ReturnType<LlmrApi["getLocalAgentProviderCandidates"]>,
  getOnboardingFinished: () => rpc("getOnboardingFinished") as ReturnType<LlmrApi["getOnboardingFinished"]>,
  getPendingProviderDeepLinks: () => Promise.resolve([]),
  getPluginMarketplace: () => rpc("getPluginMarketplace") as ReturnType<LlmrApi["getPluginMarketplace"]>,
  getProfileOpenCommand: (request) => rpc("getProfileOpenCommand", [request]) as ReturnType<LlmrApi["getProfileOpenCommand"]>,
  getProfileRuntimeStatus: () => rpc("getProfileRuntimeStatus") as ReturnType<LlmrApi["getProfileRuntimeStatus"]>,
  getProviderAccountSnapshots: (provider, options) => rpc("getProviderAccountSnapshots", [provider, options]) as ReturnType<LlmrApi["getProviderAccountSnapshots"]>,
  getProviderCatalogModels: (request) => rpc("getProviderCatalogModels", [request]) as ReturnType<LlmrApi["getProviderCatalogModels"]>,
  getOpenRouterProviderCatalog: (request) => rpc("getOpenRouterProviderCatalog", [request]) as ReturnType<LlmrApi["getOpenRouterProviderCatalog"]>,
  getProviderPresets: () => rpc("getProviderPresets") as ReturnType<LlmrApi["getProviderPresets"]>,
  getProxyCertificateStatus: () => rpc("getProxyCertificateStatus") as ReturnType<LlmrApi["getProxyCertificateStatus"]>,
  getProxyNetworkCaptures: () => rpc("getProxyNetworkCaptures") as ReturnType<LlmrApi["getProxyNetworkCaptures"]>,
  getProxyStatus: () => rpc("getProxyStatus") as ReturnType<LlmrApi["getProxyStatus"]>,
  getRequestLogDetail: (request) => rpc("getRequestLogDetail", [request]) as ReturnType<LlmrApi["getRequestLogDetail"]>,
  getRequestLogBodyChunk: (request) => rpc("getRequestLogBodyChunk", [request]) as ReturnType<LlmrApi["getRequestLogBodyChunk"]>,
  getRequestLogs: (filter) => rpc("getRequestLogs", [filter]) as ReturnType<LlmrApi["getRequestLogs"]>,
  getUpdateStatus: () => rpc("getUpdateStatus") as ReturnType<LlmrApi["getUpdateStatus"]>,
  getUsageStats: (range, filter) => rpc("getUsageStats", [range, filter]) as ReturnType<LlmrApi["getUsageStats"]>,
  importLocalAgentProvider: (request) => rpc("importLocalAgentProvider", [request]) as ReturnType<LlmrApi["importLocalAgentProvider"]>,
  installProxyCertificate: () => rpc("installProxyCertificate") as ReturnType<LlmrApi["installProxyCertificate"]>,
  listMcpServerTools: (serverName) => rpc("listMcpServerTools", [serverName]) as ReturnType<LlmrApi["listMcpServerTools"]>,
  onBeforeQuit: noopSubscription,
  onOpenSettingsRequest: noopSubscription,
  onOpenUpdateRequest: noopSubscription,
  onProviderDeepLink: noopSubscription,
  onUpdateStatusChanged: noopSubscription,
  openBotGatewayQrWindow: (request) => rpc("openBotGatewayQrWindow", [request]) as ReturnType<LlmrApi["openBotGatewayQrWindow"]>,
  openBuiltInBrowser: (url) => rpc("openBuiltInBrowser", [url]) as ReturnType<LlmrApi["openBuiltInBrowser"]>,
  openExternal: async (url) => {
    window.open(normalizeExternalHttpUrl(url), "_blank", "noopener,noreferrer");
  },
  openProfile: (request) => rpc("openProfile", [request]) as ReturnType<LlmrApi["openProfile"]>,
  probeLocalAgentProvider: (request) => rpc("probeLocalAgentProvider", [request]) as ReturnType<NonNullable<LlmrApi["probeLocalAgentProvider"]>>,
  probeProvider: (request) => rpc("probeProvider", [request]) as ReturnType<LlmrApi["probeProvider"]>,
  probeProviderCandidates: (request) => rpc("probeProviderCandidates", [request]) as ReturnType<LlmrApi["probeProviderCandidates"]>,
  quitApp: () => rpc("quitApp") as ReturnType<LlmrApi["quitApp"]>,
  restartGateway: () => rpc("restartGateway") as ReturnType<LlmrApi["restartGateway"]>,
  restartProxy: () => rpc("restartProxy") as ReturnType<LlmrApi["restartProxy"]>,
  revealProxyCertificate: () => rpc("revealProxyCertificate") as ReturnType<LlmrApi["revealProxyCertificate"]>,
  resetCodexRateLimitCredit: (request) => rpc("resetCodexRateLimitCredit", [request]) as ReturnType<LlmrApi["resetCodexRateLimitCredit"]>,
  resetOverviewStatistics: () => rpc("resetOverviewStatistics") as ReturnType<LlmrApi["resetOverviewStatistics"]>,
  saveApiKeys: (apiKeys) => rpc("saveApiKeys", [apiKeys]) as ReturnType<LlmrApi["saveApiKeys"]>,
  saveConfig: (config, options) => rpc("saveConfig", [config, options]) as ReturnType<LlmrApi["saveConfig"]>,
  scanBotHandoffBluetoothTargets: () => rpc("scanBotHandoffBluetoothTargets") as ReturnType<LlmrApi["scanBotHandoffBluetoothTargets"]>,
  scanBotHandoffWifiTargets: () => rpc("scanBotHandoffWifiTargets") as ReturnType<LlmrApi["scanBotHandoffWifiTargets"]>,
  selectPluginDirectory: () => selectPluginDirectory() as ReturnType<LlmrApi["selectPluginDirectory"]>,
  setOnboardingFinished: () => rpc("setOnboardingFinished") as ReturnType<LlmrApi["setOnboardingFinished"]>,
  setProxyNetworkCaptureEnabled: (enabled) => rpc("setProxyNetworkCaptureEnabled", [enabled]) as ReturnType<LlmrApi["setProxyNetworkCaptureEnabled"]>,
  setTrayDetailOpen: () => Promise.resolve(),
  showMainWindow: () => Promise.resolve(),
  startBotGatewayQrLogin: (request) => rpc("startBotGatewayQrLogin", [request]) as ReturnType<LlmrApi["startBotGatewayQrLogin"]>,
  startGateway: () => rpc("startGateway") as ReturnType<LlmrApi["startGateway"]>,
  stopGateway: () => rpc("stopGateway") as ReturnType<LlmrApi["stopGateway"]>,
  stopProfile: (request) => rpc("stopProfile", [request]) as ReturnType<LlmrApi["stopProfile"]>,
  testProviderAccountConnector: (request) => rpc("testProviderAccountConnector", [request]) as ReturnType<LlmrApi["testProviderAccountConnector"]>,
  testRouteScript: (request) => rpc("testRouteScript", [request]) as ReturnType<LlmrApi["testRouteScript"]>,
  updateCheck: () => rpc("updateCheck") as ReturnType<LlmrApi["updateCheck"]>,
  updateDownload: () => rpc("updateDownload") as ReturnType<LlmrApi["updateDownload"]>,
  updateInstall: () => rpc("updateInstall") as ReturnType<LlmrApi["updateInstall"]>,
  validateRouteScript: (request) => rpc("validateRouteScript", [request]) as ReturnType<LlmrApi["validateRouteScript"]>,
  waitBotGatewayQrLogin: (request) => rpc("waitBotGatewayQrLogin", [request]) as ReturnType<LlmrApi["waitBotGatewayQrLogin"]>
};

if (!window.llmr) {
  window.llmr = webClientBridge;
}
