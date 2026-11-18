import { appDeepLinkProtocol } from "@llmr/core/contracts/deep-link";
import type { AppConfig } from "@llmr/core/contracts/app";

export type PluginDeepLinkRequest = {
  appId?: string;
  pluginId: string;
  rawUrl: string;
};

export function parsePluginDeepLinkRequest(rawUrl: string): PluginDeepLinkRequest | undefined {
  const url = new URL(rawUrl.trim());
  if (url.protocol !== `${appDeepLinkProtocol}:`) {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const isPluginHost = host === "plugin";
  const isPluginPath = pathSegments[0]?.toLowerCase() === "plugin";
  if (!isPluginHost && !isPluginPath) {
    return undefined;
  }

  const pluginId = boundedPluginId(
    url.searchParams.get("plugin") ||
      url.searchParams.get("pluginId") ||
      (isPluginHost ? pathSegments[0] : pathSegments[1])
  );
  const action = (isPluginHost ? pathSegments[1] : pathSegments[2])?.toLowerCase();
  if (action && action !== "open") {
    throw new Error(`Unsupported plugin link action: ${action}`);
  }

  const appId = boundedPluginId(url.searchParams.get("app") || url.searchParams.get("appId"), true);
  return {
    ...(appId ? { appId } : {}),
    pluginId,
    rawUrl
  };
}

function boundedPluginId(value: string | null | undefined, optional = false): string {
  const normalized = value?.trim();
  if (!normalized) {
    if (optional) {
      return "";
    }
    throw new Error("Plugin id is required.");
  }
  if (normalized.length > 120 || !/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new Error(`Invalid plugin id: ${normalized}`);
  }
  return normalized;
}

export function resolveGatewayPluginAppUrl(config: AppConfig, url: string): string {
  const trimmed = normalizePluginAppUrl(url);
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const urlPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const host = normalizeGatewayPluginAppHost(config.gateway?.host || config.HOST || "127.0.0.1");
  const port = config.gateway?.port || config.PORT || 3456;
  return `http://${host}:${port}${urlPath}`;
}

function normalizePluginAppUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Plugin app URL is required.");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed).toString();
  }
  if (trimmed.startsWith("//")) {
    throw new Error("Plugin app URL cannot be protocol-relative.");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new Error("Plugin app URL must be an http(s) URL or an LLMR gateway path.");
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeGatewayPluginAppHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1";
  }
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}
