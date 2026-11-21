import { CONTEXT_ARCHIVE_MCP_SERVER_NAME } from "@llmr/core/gateway/context-archive";
import { TOOL_HUB_MCP_SERVER_NAME } from "@llmr/core/mcp/toolhub-config";
import { tomlQuotedKey, tomlString, trimLeadingBlankLines } from "@llmr/core/profiles/apply-support";

export const managedRootStart = "# BEGIN LLMR managed profile";
export const managedRootEnd = "# END LLMR managed profile";
export const managedProviderStart = "# BEGIN LLMR managed Codex provider";
export const managedProviderEnd = "# END LLMR managed Codex provider";
export const managedToolHubMcpStart = "# BEGIN LLMR managed ToolHub MCP";
export const managedToolHubMcpEnd = "# END LLMR managed ToolHub MCP";
export const managedContextArchiveMcpStart = "# BEGIN LLMR managed Context Archive MCP";
export const managedContextArchiveMcpEnd = "# END LLMR managed Context Archive MCP";
export const managedConfiguredModelPrefix = "# LLMR configured model = ";
export const codexManagedMarkers = [
  managedRootStart,
  managedRootEnd,
  managedProviderStart,
  managedProviderEnd,
  managedToolHubMcpStart,
  managedToolHubMcpEnd,
  managedContextArchiveMcpStart,
  managedContextArchiveMcpEnd
];

export function managedConfiguredModel(source: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(managedConfiguredModelPrefix)}(.+?)\\s*$`, "m");
  return source.match(pattern)?.[1];
}

export function removeCodexProviderTable(source: string, providerId: string): string {
  return removeTomlTable(source, "model_providers", providerId);
}

export function removeCodexMcpServerTable(
  source: string,
  serverName: string,
  options: { includeChildTables?: boolean } = {}
): string {
  const lines = source.split(/(?<=\n)/);
  const headers = new Set([
    `[mcp_servers.${serverName}]`,
    `[mcp_servers.${tomlQuotedKey(serverName)}]`,
    `[mcp_servers.${serverName}.env]`,
    `[mcp_servers.${tomlQuotedKey(serverName)}.env]`,
    `[mcp_servers.${serverName}.http_headers]`,
    `[mcp_servers.${tomlQuotedKey(serverName)}.http_headers]`,
    `[mcp_servers.${serverName}.env_http_headers]`,
    `[mcp_servers.${tomlQuotedKey(serverName)}.env_http_headers]`
  ]);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!headers.has(trimmed) && !isCodexMcpServerChildTable(trimmed, serverName, Boolean(options.includeChildTables))) {
      kept.push(line);
      continue;
    }

    index += 1;
    while (index < lines.length && !/^\s*\[/.test(lines[index])) {
      index += 1;
    }
    index -= 1;
  }
  return kept.join("");
}

export function isCodexMcpServerChildTable(trimmedLine: string, serverName: string, enabled: boolean): boolean {
  if (!enabled) {
    return false;
  }
  return trimmedLine.startsWith(`[mcp_servers.${serverName}.`) ||
    trimmedLine.startsWith(`[mcp_servers.${tomlQuotedKey(serverName)}.`);
}

export function removeTomlTable(source: string, section: string, name: string): string {
  const lines = source.split(/(?<=\n)/);
  const headers = new Set([
    `[${section}.${name}]`,
    `[${section}.${tomlQuotedKey(name)}]`
  ]);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!headers.has(line.trim())) {
      kept.push(line);
      continue;
    }

    index += 1;
    while (index < lines.length && !/^\s*\[/.test(lines[index])) {
      index += 1;
    }
    index -= 1;
  }
  return kept.join("");
}

// Codex adds its own tables inside LLMR's last marker pair (codex-cli 0.171.0, `codex mcp add`), so the markers bound nothing: each line goes by what it holds.
export function stripManagedCodexConfigContent(content: string, providerIds: string[]): string | undefined {
  const configuredModel = managedConfiguredModel(content);
  const providerValues = providerIds.flatMap((providerId) => [tomlString(providerId), `'${providerId}'`]);
  const kept: string[] = [];
  let inRoot = true;
  let inRootBlock = false;
  for (const line of content.split(/(?<=\n)/)) {
    const trimmed = line.trim();
    if (codexManagedMarkers.includes(trimmed)) {
      inRootBlock = trimmed === managedRootStart;
      continue;
    }
    inRoot = inRoot && !trimmed.startsWith("[");
    const [, key, value] = (inRoot ? /^([A-Za-z_]+)\s*=\s*(.*?)(?:\s+#.*)?$/.exec(trimmed) : null) ?? [];
    if (
      (inRoot && trimmed.startsWith(managedConfiguredModelPrefix)) ||
      (key === "model_provider" && providerValues.includes(value)) ||
      (key === "model_catalog_json" && value.includes("llmr-model-catalog.json")) ||
      (key === "model" && value === configuredModel) ||
      (key === "show_all_sessions" && inRootBlock)
    ) {
      continue;
    }
    kept.push(line);
  }
  let next = kept.join("");
  for (const providerId of providerIds) {
    next = removeCodexProviderTable(next, providerId);
  }
  next = removeCodexMcpServerTable(next, TOOL_HUB_MCP_SERVER_NAME, { includeChildTables: true });
  next = removeCodexMcpServerTable(next, CONTEXT_ARCHIVE_MCP_SERVER_NAME, { includeChildTables: true });
  return next === content ? undefined : trimLeadingBlankLines(next).replace(/\n{2,}$/, "\n");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
