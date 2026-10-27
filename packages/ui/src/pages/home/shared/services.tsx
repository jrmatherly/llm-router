import type { GatewayStatus } from "@ccr/core/contracts/app";

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

export function translateProxyCertificateMessage(message: string | undefined, translate: (value: string) => string): string {
  if (!message) {
    return "";
  }

  const notTrustedPrefix = "Proxy CA certificate is not trusted: ";
  if (message.startsWith(notTrustedPrefix)) {
    return `${translate("Proxy CA certificate is not trusted:")} ${message.slice(notTrustedPrefix.length)}`;
  }

  const macosAuthorizationPrefix = "macOS did not allow LLMR to request administrator authorization: ";
  if (message.startsWith(macosAuthorizationPrefix)) {
    return `${translate("macOS did not allow LLMR to request administrator authorization:")} ${translateMacosAuthorizationDetail(message.slice(macosAuthorizationPrefix.length), translate)}`;
  }

  return translate(message);
}

export function translateMacosAuthorizationDetail(detail: string, translate: (value: string) => string): string {
  return detail
    .replace(" Opened Terminal installer:", ` ${translate("Opened Terminal installer:")}`)
    .replace(" Could not open Terminal installer:", ` ${translate("Could not open Terminal installer:")}`);
}
