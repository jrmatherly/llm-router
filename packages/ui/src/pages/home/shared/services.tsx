import type { GatewayStatus } from "@llmr/core/contracts/app";
import { formatAppError } from "./i18n";

export function endpointFromHostPort(host: string, port: number): string {
  const trimmedHost = host.trim() || "127.0.0.1";
  const endpointHost = trimmedHost === "0.0.0.0" ? "127.0.0.1" : trimmedHost;
  const formattedHost = endpointHost.includes(":") && !endpointHost.startsWith("[") ? `[${endpointHost}]` : endpointHost;
  return `http://${formattedHost}:${port}`;
}

export function gatewayServiceMessage(status: GatewayStatus, stopped: boolean): string {
  if (stopped) {
    return "Service paused.";
  }
  if (status.state === "running") {
    return "Service started.";
  }
  return status.lastError || "Service did not start.";
}

export function openExternalUrl(url: string, onError: (message: string) => void) {
  if (window.llmr?.openExternal) {
    void window.llmr.openExternal(url).catch((error) => onError(formatAppError(error)));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
