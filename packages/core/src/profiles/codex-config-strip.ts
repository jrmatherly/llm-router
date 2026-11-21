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

function isCodexMcpServerChildTable(trimmedLine: string, serverName: string, enabled: boolean): boolean {
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

export type CodexWrittenRecord = {
  edited: boolean;
  file: string;
  modelLine?: string;
  sha256: string;
  showAllSessionsLine?: string;
};

// The root lines that are LLMR's own. A line of the user's is never in here, even when it holds the value LLMR would write.
export type CodexWrittenLines = Pick<CodexWrittenRecord, "modelLine" | "showAllSessionsLine">;

// Codex drops the configured-model comment and writes root keys inside LLMR's root block (codex-cli 0.171.0), so the text alone cannot say whose a line is. The record of what LLMR last wrote can.
export function decideCodexRootLines(input: {
  configuredModel: string;
  currentModelLine?: string;
  currentShowAllSessionsLine?: string;
  previous?: CodexWrittenLines;
  previousConfiguredModel?: string;
  showAllSessions: boolean;
}): { modelLine: string; showAllSessionsLine?: string; written: CodexWrittenLines } {
  const configuredValue = tomlString(input.configuredModel);
  const ourModelLine = `model = ${configuredValue}`;
  const currentModel = input.currentModelLine;
  const configuredModelChanged = input.previousConfiguredModel !== undefined && input.previousConfiguredModel !== configuredValue;
  const recordedAsOurs = input.previous !== undefined && currentModel !== undefined && currentModel === input.previous.modelLine;
  const matchesComment = input.previous === undefined && currentModel !== undefined &&
    input.previousConfiguredModel !== undefined && rootAssignmentValue(currentModel) === input.previousConfiguredModel;
  const replaceModel = currentModel === undefined || configuredModelChanged || recordedAsOurs;
  const modelLine = replaceModel ? ourModelLine : currentModel;

  const currentShow = input.currentShowAllSessionsLine;
  const showRecordedAsOurs = currentShow !== undefined && currentShow === input.previous?.showAllSessionsLine;
  const ourShowLine = input.showAllSessions ? "show_all_sessions = true" : undefined;
  const keepUsersShow = currentShow !== undefined && !showRecordedAsOurs;
  const showAllSessionsLine = keepUsersShow ? currentShow : ourShowLine;

  return {
    modelLine,
    ...(showAllSessionsLine === undefined ? {} : { showAllSessionsLine }),
    written: {
      ...(replaceModel || matchesComment ? { modelLine } : {}),
      ...(showAllSessionsLine !== undefined && !keepUsersShow ? { showAllSessionsLine } : {})
    }
  };
}

function rootAssignmentValue(line: string): string | undefined {
  return /^[A-Za-z_]+\s*=\s*(.*?)(?:\s+#.*)?$/.exec(line.trim())?.[1];
}

// Codex adds its own tables inside LLMR's last marker pair (codex-cli 0.171.0, `codex mcp add`), so the markers bound nothing: each line goes by what it holds.
// With `written`, a root `model` or `show_all_sessions` line goes only when it is the line LLMR recorded writing.
export function stripManagedCodexConfigContent(content: string, providerIds: string[], written?: CodexWrittenLines): string | undefined {
  const configuredModel = managedConfiguredModel(content);
  const providerValues = providerIds.flatMap((providerId) => [tomlString(providerId), `'${providerId}'`]);
  const kept: string[] = [];
  let inRoot = true;
  let inRootBlock = false;
  for (const { inValue, line } of scanTomlLines(content)) {
    if (inValue) {
      kept.push(line);
      continue;
    }
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
      (key === "model" && (written ? trimmed === written.modelLine : value === configuredModel)) ||
      (key === "show_all_sessions" && (written ? trimmed === written.showAllSessionsLine : inRootBlock))
    ) {
      continue;
    }
    kept.push(line);
  }
  const providerHeaders = providerIds.flatMap((providerId) => [`[model_providers.${providerId}]`, `[model_providers.${tomlQuotedKey(providerId)}]`]);
  const mcpPrefixes = [TOOL_HUB_MCP_SERVER_NAME, CONTEXT_ARCHIVE_MCP_SERVER_NAME]
    .flatMap((serverName) => [`[mcp_servers.${serverName}`, `[mcp_servers.${tomlQuotedKey(serverName)}`]);
  const next = removeTablesOutsideValues(kept.join(""), (header) =>
    providerHeaders.includes(header) ||
    mcpPrefixes.some((prefix) => header === `${prefix}]` || header.startsWith(`${prefix}.`)));
  return next === content ? undefined : trimLeadingBlankLines(next).replace(/\n{2,}$/, "\n");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type TomlScanState = { depth: number; multiline: "" | "\"\"\"" | "'''" };

// No TOML parser is installed and a parser could not make a line-preserving edit, so this tracks only what decides whether a line starts inside a value.
export function scanTomlLines(content: string): Array<{ inValue: boolean; line: string }> {
  const state: TomlScanState = { depth: 0, multiline: "" };
  const lines = content.split(/(?<=\n)/).map((line) => {
    const inValue = state.multiline !== "" || state.depth > 0;
    scanTomlLine(line, state);
    return { inValue, line };
  });
  // A value still open at the end means the file is not valid TOML. Trusting the scan there would hide LLMR's own lines, token included, behind the user's typo.
  return state.multiline !== "" || state.depth > 0 ? lines.map(({ line }) => ({ inValue: false, line })) : lines;
}

export function removeTablesOutsideValues(content: string, isHeader: (header: string) => boolean): string {
  const kept: string[] = [];
  let removing = false;
  // A comment block set off by a blank line belongs to the table below it, not to the one being removed.
  let commentsAboveNextHeader: string[] = [];
  let blankSinceBody = false;
  for (const { inValue, line } of scanTomlLines(content)) {
    const trimmed = line.trim();
    if (!inValue && trimmed.startsWith("[")) {
      kept.push(...commentsAboveNextHeader);
      commentsAboveNextHeader = [];
      blankSinceBody = false;
      removing = isHeader(trimmed.slice(0, scanTomlLine(trimmed, { depth: 0, multiline: "" })).trim());
    }
    if (!removing) {
      kept.push(line);
    } else if (!inValue && trimmed === "") {
      blankSinceBody = true;
      if (commentsAboveNextHeader.length > 0) {
        commentsAboveNextHeader.push(line);
      }
    } else if (!inValue && blankSinceBody && trimmed.startsWith("#")) {
      commentsAboveNextHeader.push(line);
    } else {
      commentsAboveNextHeader = [];
      blankSinceBody = false;
    }
  }
  return [...kept, ...commentsAboveNextHeader].join("");
}

// Returns where the line's comment starts, or its length.
function scanTomlLine(line: string, state: TomlScanState): number {
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (state.multiline) {
      if (char === "\\" && state.multiline === "\"\"\"") {
        index += 2;
      } else if (line.startsWith(state.multiline, index)) {
        index += 3;
        // The string's own text may end in up to two quotes, so the closing run is up to five.
        for (let extra = 0; extra < 2 && line[index] === char; extra += 1) {
          index += 1;
        }
        state.multiline = "";
      } else {
        index += 1;
      }
    } else if (char === "#") {
      return index;
    } else if (line.startsWith("\"\"\"", index) || line.startsWith("'''", index)) {
      state.multiline = char === "'" ? "'''" : "\"\"\"";
      index += 3;
    } else if (char === "\"" || char === "'") {
      index = oneLineStringEnd(line, index);
    } else {
      if (char === "[" || char === "{") {
        state.depth += 1;
      } else if (char === "]" || char === "}") {
        state.depth = Math.max(0, state.depth - 1);
      }
      index += 1;
    }
  }
  return line.length;
}

function oneLineStringEnd(line: string, start: number): number {
  const quote = line[start];
  let index = start + 1;
  while (index < line.length && line[index] !== quote && line[index] !== "\n") {
    index += quote === "\"" && line[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}
