import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync } from "node:fs";
import path from "node:path";
import { CLAUDE_CODE_AUTH_MODE_ENV } from "@llmr/core/agents/claude-code/auth-mode";
import { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV, isGatewayProviderEnabled, type AppConfig, type ProfileClientApplyStatus, type ProfileClientKind, type ProfileConfig } from "@llmr/core/contracts/app";
import { normalizeRouteSelector } from "@llmr/core/gateway/llm-router-plugin";
import { windowsBatchEscapeValue as cmdValue } from "@llmr/core/platform/windows-batch";
import { chmodFileIfRequested, writeFileAtomic } from "@llmr/core/profiles/backup-files";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";

export const privateDirMode = 0o700;

export const privateExecutableMode = 0o700;

export const privateFileMode = 0o600;

export function gatewayNoProxyHosts(config: AppConfig): string {
  const configuredHost = config.gateway.host === "0.0.0.0" || config.gateway.host === "::"
    ? "127.0.0.1"
    : config.gateway.host?.trim().replace(/^\[|\]$/g, "") || "127.0.0.1";
  return [...new Set([configuredHost, "127.0.0.1", "localhost", "::1"])].join(",");
}

export function linkProfileHomeEntry(source: string, target: string): void {
  if (!existsSync(source) || pathEntryExists(target)) {
    return;
  }
  const sourceStat = statSync(source);
  try {
    symlinkSync(source, target, sourceStat.isDirectory() && process.platform === "win32" ? "junction" : undefined);
  } catch {
    if (sourceStat.isFile()) {
      copyFileSync(source, target);
      chmodSync(target, privateFileMode);
    }
  }
}

function pathEntryExists(file: string): boolean {
  try {
    const stat = lstatSync(file);
    if (!stat.isSymbolicLink()) {
      return true;
    }
    const target = readlinkSync(file);
    return Boolean(target);
  } catch {
    return false;
  }
}

export function firstTomlTableIndex(source: string): number {
  const match = source.match(/^\s*\[/m);
  return match?.index ?? -1;
}

export function writeGeneratedFileIfChanged(
  file: string,
  content: string,
  options: { mode?: number } = {}
): { changed: boolean } {
  mkdirSync(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (previous === content) {
    chmodFileIfRequested(file, options.mode);
    return { changed: false };
  }
  writeFileAtomic(file, content, { mode: options.mode });
  return { changed: true };
}

export function uniqueOrderedStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function disabledStatus(client: ProfileClientKind, file: string, message: string): ProfileClientApplyStatus {
  return {
    client,
    enabled: false,
    message,
    ok: true,
    path: resolveUserPath(file)
  };
}

export function gatewayEndpoint(config: AppConfig): string {
  const host = config.gateway.host === "0.0.0.0" ? "127.0.0.1" : config.gateway.host || "127.0.0.1";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${config.gateway.port}`;
}

export function defaultClientModel(config: AppConfig): string {
  const enabledProviders = config.Providers.filter(isGatewayProviderEnabled);
  const preferred = enabledProviders.find((provider) => provider.name === config.preferredProvider) ?? enabledProviders[0];
  if (preferred?.name && preferred.models[0]) {
    return `${preferred.name}/${preferred.models[0]}`;
  }
  return "gpt-5-codex";
}

export function providerBaseUrl(provider: AppConfig["Providers"][number]): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

export function normalizeClientModel(value: string | undefined): string {
  return normalizeRouteSelector(value)?.trim() || "";
}

export function sanitizeProfilePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function profileEnv(profile: ProfileConfig): Record<string, string> {
  return stringRecord(profile.env).filter(([key]) => isEnvName(key)).reduce<Record<string, string>>((result, [key, value]) => {
    if (key === CLAUDE_CODE_AUTH_MODE_ENV) {
      return result;
    }
    if (profile.agent !== "claude-code" && key === CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV) {
      return result;
    }
    result[key] = value;
    return result;
  }, {});
}

export function stringRecord(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value)
    .map(([key, itemValue]) => [key.trim(), itemValue] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string");
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function tomlQuotedKey(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function cmdQuote(value: string): string {
  return `"${cmdValue(value)}"`;
}

export function trimLeadingBlankLines(value: string): string {
  return value.replace(/^\s*\n/g, "");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
