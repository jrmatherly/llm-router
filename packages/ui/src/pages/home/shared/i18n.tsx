import { formatErrorMessage } from "@ccr/core/contracts/error-message";

type NavigationId = "onboarding" | "overview" | "observability" | "api-keys" | "server" | "profile" | "networking" | "logs" | "providers" | "models" | "routing" | "virtual-models" | "extensions";

export type AppCopy = {
  navigation: Record<NavigationId, string>;
  settings: {
    agentAnalysis: string;
    agentAnalysisDescription: string;
    appearance: string;
    bots: string;
    button: string;
    close: string;
    data: string;
    done: string;
    general: string;
    launchAtLogin: string;
    launchAtLoginDescription: string;
    observability: string;
    proxy: string;
    requestLogs: string;
    requestLogsDescription: string;
    theme: string;
    themeDark: string;
    themeLight: string;
    themeSystem: string;
    toolHub: string;
    toolHubBrowserAutomation: string;
    toolHubBrowserAutomationDescription: string;
    toolHubDescription: string;
    toolHubEnabled: string;
    toolHubEnabledDescription: string;
    toolHubMaxTools: string;
    toolHubModel: string;
    toolHubModelPlaceholder: string;
    toolHubTimeout: string;
    tray: string;
    trayBalanceProgressAccount: string;
    trayBalanceProgressData: string;
    trayBalanceProgressNoData: string;
    trayBalanceProgressRequired: string;
    trayIcon: string;
    trayIconCyan: string;
    trayIconOrange: string;
    trayIconProgress: string;
    trayIconRandom: string;
    trayIconViolet: string;
    trayComponentAccount: string;
    trayComponentArc: string;
    trayComponentArea: string;
    trayComponentBar: string;
    trayComponentBars: string;
    trayComponentCards: string;
    trayComponentCompact: string;
    trayComponentDonut: string;
    trayComponentFlow: string;
    trayComponentGauges: string;
    trayComponentLine: string;
    trayComponentList: string;
    trayComponentModelShare: string;
    trayComponentPie: string;
    trayComponentPills: string;
    trayComponentRing: string;
    trayComponentRings: string;
    trayComponentSparkline: string;
    trayComponentStacked: string;
    trayComponentStats: string;
    trayComponentStyles: string;
    trayComponentEnabled: string;
    trayComponentProperties: string;
    trayComponentStyle: string;
    trayComponents: string;
    trayComponentTokenMix: string;
    trayModuleActivity: string;
    trayModuleAccount: string;
    trayModuleFooter: string;
    trayModuleHeader: string;
    trayModuleModelShare: string;
    trayModuleRings: string;
    trayModuleSourceTabs: string;
    trayModuleStats: string;
    trayModuleTokenFlow: string;
    trayModuleTokenMix: string;
    trayPreview: string;
    trayPreviewEmpty: string;
    trayProgressTarget: string;
    trayTokenRate: string;
    trayTokenRateDescription: string;
    trayWindowModules: string;
    title: string;
  };
  sidebar: {
    collapse: string;
    expand: string;
    primaryNavigation: string;
  };
};

export const appCopy: AppCopy = {
  navigation: {
    onboarding: "Onboarding",
    "api-keys": "API Keys",
    extensions: "Extensions",
    logs: "Logs",
    networking: "Networking",
    observability: "Observability",
    overview: "Overview",
    profile: "Agent Profiles",
    providers: "Providers",
    models: "Models",
    routing: "Global Routing",
    server: "Server",
    "virtual-models": "Fusion"
  },
  settings: {
    agentAnalysis: "Agent observability",
    agentAnalysisDescription: "Record request metadata needed for the observability page.",
    appearance: "Appearance",
    bots: "Bots",
    button: "Settings",
    close: "Close",
    data: "Data",
    done: "Done",
    general: "General",
    launchAtLogin: "Launch at login",
    launchAtLoginDescription: "Open LLM Router automatically when you sign in to this computer.",
    observability: "Logs & Observability",
    proxy: "Proxy",
    requestLogs: "Request logs",
    requestLogsDescription: "Record gateway requests and show the Logs page.",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
    toolHub: "ToolHub",
    toolHubBrowserAutomation: "Built-in browser automation",
    toolHubBrowserAutomationDescription: "Expose LLMR Desktop's built-in browser automation tools through ToolHub.",
    toolHubDescription: "Route configured MCP servers through ToolHub, where the model finds the tools needed for each task.",
    toolHubEnabled: "Enable ToolHub",
    toolHubEnabledDescription: "Expose a compact ToolHub MCP server instead of all configured MCP tools.",
    toolHubMaxTools: "Max tools",
    toolHubModel: "Resolver model",
    toolHubModelPlaceholder: "Select a configured model",
    toolHubTimeout: "Timeout ms",
    tray: "Tray",
    trayBalanceProgressAccount: "Account",
    trayBalanceProgressData: "Data",
    trayBalanceProgressNoData: "No account data is available. Enable account monitoring on a provider first.",
    trayBalanceProgressRequired: "Choose an account and data to enable balance progress.",
    trayIcon: "Tray mascot",
    trayIconCyan: "Auralis",
    trayIconOrange: "Solara",
    trayIconProgress: "Balance progress",
    trayIconRandom: "Random",
    trayIconViolet: "Vesper",
    trayComponentAccount: "Account meter",
    trayComponentArc: "Arc",
    trayComponentArea: "Area",
    trayComponentBar: "Bar",
    trayComponentBars: "Bars",
    trayComponentCards: "Cards",
    trayComponentCompact: "Compact",
    trayComponentDonut: "Donut",
    trayComponentFlow: "Flow chart",
    trayComponentGauges: "Gauges",
    trayComponentLine: "Line",
    trayComponentList: "List",
    trayComponentModelShare: "Model share",
    trayComponentPie: "Pie",
    trayComponentPills: "Pills",
    trayComponentRing: "Ring",
    trayComponentRings: "Rings",
    trayComponentSparkline: "Sparkline",
    trayComponentStacked: "Stacked",
    trayComponentStats: "Stats",
    trayComponentStyles: "Component styles",
    trayComponentEnabled: "Enabled",
    trayComponentProperties: "Component properties",
    trayComponentStyle: "Style",
    trayComponents: "Components",
    trayComponentTokenMix: "Token mix",
    trayModuleActivity: "Token activity",
    trayModuleAccount: "Account balance",
    trayModuleFooter: "Footer actions",
    trayModuleHeader: "Title and status",
    trayModuleModelShare: "Model share",
    trayModuleRings: "Circular metrics",
    trayModuleSourceTabs: "Provider tabs",
    trayModuleStats: "Token stats",
    trayModuleTokenFlow: "Token flow chart",
    trayModuleTokenMix: "Token mix",
    trayPreview: "Preview",
    trayPreviewEmpty: "No tray modules enabled",
    trayProgressTarget: "Progress target",
    trayTokenRate: "Live output speed",
    trayTokenRateDescription: "Show the estimated combined token rate of all active streams in the macOS menu bar.",
    trayWindowModules: "Tray window modules",
    title: "Settings"
  },
  sidebar: {
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    primaryNavigation: "Primary navigation"
  }
};

// Upstream 401 body from a provider that answers in Chinese.
const upstreamErrorMessages: Record<string, string> = {
  "Header\u4e2d\u672a\u6536\u5230Authorization\u53c2\u6570\uff0c\u65e0\u6cd5\u8fdb\u884c\u8eab\u4efd\u9a8c\u8bc1\u3002": "Missing Authorization header, so authentication could not be performed."
};

export function appErrorMessage(value: string): string {
  const message = formatErrorMessage(value);
  return upstreamErrorMessages[message] ?? message;
}

export function formatAppError(error: unknown): string {
  return appErrorMessage(error instanceof Error ? error.message : String(error));
}
