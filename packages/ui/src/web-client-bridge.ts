type LlmrApi = NonNullable<Window["llmr"]>;

const rpcEndpoint = "/api/llmr/rpc";
const webAuthHeader = "x-llmr-web-auth";
const webAuthFragmentParam = "llmr_web_token";
const webAuthStorageKey = "llmr.webAuthToken";
let webAuthToken = readWebAuthToken();
let webAuthPrompt: Promise<never> | undefined;

type RpcResponse =
  | { ok: true; value: unknown }
  | { error: { message: string; stack?: string }; ok: false };

async function rpc(method: string, args: unknown[] = []): Promise<unknown> {
  if (!webAuthToken) {
    return requestWebAuthToken("Enter the LLMR management token.");
  }
  const response = await fetch(rpcEndpoint, {
    body: JSON.stringify({ args: trimTrailingUndefined(args), method }),
    headers: {
      "content-type": "application/json",
      [webAuthHeader]: webAuthToken
    },
    method: "POST"
  });
  if (response.status === 401) {
    webAuthToken = "";
    removeStoredWebAuthToken();
    return requestWebAuthToken("That token was not accepted. Enter the LLMR management token.");
  }
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
    const prefix = `${webAuthFragmentParam}=`;
    const params = window.location.hash.slice(1).split("&");
    const raw = params.find((param) => param.startsWith(prefix));
    if (raw === undefined) {
      return "";
    }
    const rest = params.filter((param) => param !== raw).join("&");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
    // Not URLSearchParams: it would turn a "+" in the token into a space.
    return decodeURIComponent(raw.slice(prefix.length)).trim();
  } catch {
    return "";
  }
}

function requestWebAuthToken(message: string): Promise<never> {
  webAuthPrompt ??= new Promise<never>(() => {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const button = document.createElement("button");
    label.textContent = message;
    // Inline styles: the app stylesheet resets dialog, input and button to bare text.
    dialog.style.cssText = "margin:auto;padding:24px;border:1px solid GrayText;border-radius:8px;background:Canvas;color:CanvasText;font:14px system-ui,sans-serif";
    label.style.display = "block";
    input.type = "password";
    input.autocomplete = "off";
    input.required = true;
    input.style.cssText = "display:block;box-sizing:border-box;margin:12px 0;padding:6px 8px;width:320px;max-width:100%;border:1px solid GrayText;border-radius:4px;background:Field;color:FieldText";
    button.type = "submit";
    button.textContent = "Sign in";
    button.style.cssText = "padding:6px 14px;border:1px solid GrayText;border-radius:4px;background:ButtonFace;color:ButtonText;cursor:pointer";
    label.append(input);
    form.append(label, button);
    dialog.append(form);
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    // A second Escape closes a dialog whatever "cancel" says.
    dialog.addEventListener("close", () => dialog.showModal());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const token = input.value.trim();
      if (!token) {
        return;
      }
      if (!writeStoredWebAuthToken(token)) {
        // Storage is blocked: carry the token over the reload in the fragment.
        window.location.hash = `${webAuthFragmentParam}=${encodeURIComponent(token)}`;
      }
      window.location.reload();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
  return webAuthPrompt;
}

function readStoredWebAuthToken(): string {
  try {
    return window.sessionStorage.getItem(webAuthStorageKey)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeStoredWebAuthToken(token: string): boolean {
  try {
    window.sessionStorage.setItem(webAuthStorageKey, token);
    return true;
  } catch {
    // The in-memory token still works for the current page load if storage is unavailable.
    return false;
  }
}

function removeStoredWebAuthToken(): void {
  try {
    window.sessionStorage.removeItem(webAuthStorageKey);
  } catch {
    // Nothing stored means nothing to remove.
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
  cancelClaudeAppsGatewayLogin: (request) => rpc("cancelClaudeAppsGatewayLogin", [request]) as ReturnType<LlmrApi["cancelClaudeAppsGatewayLogin"]>,
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
  openProfileInTerminal: (request) => rpc("openProfileInTerminal", [request]) as ReturnType<LlmrApi["openProfileInTerminal"]>,
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
  startClaudeAppsGatewayLogin: (request) => rpc("startClaudeAppsGatewayLogin", [request]) as ReturnType<LlmrApi["startClaudeAppsGatewayLogin"]>,
  startGateway: () => rpc("startGateway") as ReturnType<LlmrApi["startGateway"]>,
  stopGateway: () => rpc("stopGateway") as ReturnType<LlmrApi["stopGateway"]>,
  stopProfile: (request) => rpc("stopProfile", [request]) as ReturnType<LlmrApi["stopProfile"]>,
  testProviderAccountConnector: (request) => rpc("testProviderAccountConnector", [request]) as ReturnType<LlmrApi["testProviderAccountConnector"]>,
  testRouteScript: (request) => rpc("testRouteScript", [request]) as ReturnType<LlmrApi["testRouteScript"]>,
  updateCheck: () => rpc("updateCheck") as ReturnType<LlmrApi["updateCheck"]>,
  updateDownload: () => rpc("updateDownload") as ReturnType<LlmrApi["updateDownload"]>,
  updateInstall: () => rpc("updateInstall") as ReturnType<LlmrApi["updateInstall"]>,
  validateRouteScript: (request) => rpc("validateRouteScript", [request]) as ReturnType<LlmrApi["validateRouteScript"]>,
  waitBotGatewayQrLogin: (request) => rpc("waitBotGatewayQrLogin", [request]) as ReturnType<LlmrApi["waitBotGatewayQrLogin"]>,
  waitClaudeAppsGatewayLogin: (request) => rpc("waitClaudeAppsGatewayLogin", [request]) as ReturnType<LlmrApi["waitClaudeAppsGatewayLogin"]>
};

if (!window.llmr) {
  window.llmr = webClientBridge;
}
