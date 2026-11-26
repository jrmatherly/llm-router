import { CONTEXT_ARCHIVE_MCP_SERVER_NAME } from "@llmr/core/gateway/context-archive";
import { TOOL_HUB_MCP_SERVER_NAME } from "@llmr/core/mcp/toolhub-config";
import { tomlKey, tomlString, trimLeadingBlankLines } from "@llmr/core/profiles/apply-support";

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
  const comment = scanTomlStatements(source)
    .map(({ kind, lines, table }) => kind === "comment" && table === "" ? lines[0].trim() : "")
    .find((text) => text.startsWith(managedConfiguredModelPrefix));
  return comment?.slice(managedConfiguredModelPrefix.length) || undefined;
}

export function removeCodexProviderTable(source: string, providerId: string): string {
  return removeTomlTable(source, "model_providers", providerId);
}

export function removeCodexMcpServerTable(
  source: string,
  serverName: string,
  options: { includeChildTables?: boolean } = {}
): string {
  const table = `mcp_servers.${tomlKey(serverName)}`;
  const named = [table, `${table}.env`, `${table}.http_headers`, `${table}.env_http_headers`];
  return removeTablesOutsideValues(source, (header) =>
    named.includes(header) || (options.includeChildTables === true && header.startsWith(`${table}.`)));
}

export function removeTomlTable(source: string, section: string, name: string): string {
  return removeTablesOutsideValues(source, (header) => header === `${section}.${tomlKey(name)}`);
}

export type CodexWrittenRecord = {
  edited: boolean;
  file: string;
  modelLine?: string;
  sha256: string;
  showAllSessionsLine?: string;
};

// The root lines LLMR wrote. They are matched by value, so a formatter that realigns a line does not make it the user's.
export type CodexWrittenLines = Pick<CodexWrittenRecord, "modelLine" | "showAllSessionsLine">;

// Codex drops the configured-model comment and writes root keys inside LLMR's root block (codex-cli 0.171.0), so the text alone cannot say whose a line is. The record of what LLMR last wrote is the better witness.
export function decideCodexRootLines(input: {
  configuredModel: string;
  currentModelLine?: string;
  currentShowAllSessionsLine?: string;
  // True when LLMR already had the file but left no usable record, as after an upgrade.
  managedWithoutRecord?: boolean;
  // Only read with `managedWithoutRecord`: whether the show_all_sessions line sits inside LLMR's root block.
  showAllSessionsInManagedBlock?: boolean;
  previous?: CodexWrittenLines;
  previousConfiguredModel?: string;
  showAllSessions: boolean;
}): { modelLine: string; showAllSessionsLine?: string; written: CodexWrittenLines } {
  const configuredValue = tomlString(input.configuredModel);
  const ourModelLine = `model = ${configuredValue}`;
  const currentModel = input.currentModelLine;
  const configuredModelChanged = input.previousConfiguredModel !== undefined && input.previousConfiguredModel !== configuredValue;
  const currentValue = rootAssignmentValue(currentModel);
  const recordedAsOurs = input.previous !== undefined && sameRootAssignment(currentModel, input.previous.modelLine);
  // With no record the text has to do: the line is LLMR's when it holds the model LLMR named in its comment, or the one it would write to a file it already had.
  const matchesComment = input.previous === undefined && currentValue !== undefined &&
    (currentValue === input.previousConfiguredModel || (input.managedWithoutRecord === true && currentValue === configuredValue));
  const replaceModel = currentModel === undefined || configuredModelChanged || recordedAsOurs;
  const modelLine = replaceModel ? ourModelLine : currentModel;

  const currentShow = input.currentShowAllSessionsLine;
  // With no record, where the line sits is the only evidence, and it is the evidence the text strip goes by.
  const showRecordedAsOurs = sameRootAssignment(currentShow, input.previous?.showAllSessionsLine) ||
    (input.managedWithoutRecord === true && input.showAllSessionsInManagedBlock === true && currentShow !== undefined);
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

export function isRootKeyInsideManagedBlock(source: string, key: string): boolean {
  let inRootBlock = false;
  for (const statement of scanTomlStatements(source)) {
    if (statement.kind === "header") {
      return false;
    }
    if (isMarker(statement)) {
      inRootBlock = statement.lines[0].trim() === managedRootStart;
    } else if (inRootBlock && statement.key === key) {
      return true;
    }
  }
  return false;
}

function isMarker({ kind, lines }: TomlStatement): boolean {
  return kind === "comment" && codexManagedMarkers.includes(lines[0].trim());
}

function rootAssignmentValue(text: string | undefined): string | undefined {
  return text === undefined ? undefined : scanTomlStatements(text)[0]?.value;
}

export function sameRootAssignment(line: string | undefined, recorded: string | undefined): boolean {
  const value = rootAssignmentValue(line);
  return value !== undefined && value === rootAssignmentValue(recorded);
}

// What an apply took out of the user's file: whole lines and tables as the user wrote them.
export type CodexDisplacedConfig = {
  eol?: "\r\n";
  model?: string;
  modelCatalogJson?: string;
  modelProvider?: string;
  profileTables?: string[];
  showAllSessions?: string;
};

const displacedRootKeys = {
  model: "model",
  model_catalog_json: "modelCatalogJson",
  model_provider: "modelProvider",
  show_all_sessions: "showAllSessions"
} as const;

// Reads them the way the writer removes them, a root key with every line of its value and a table up to the next header, so what comes back is what went.
export function readCodexDisplacedConfig(snapshot: string, providerIds: string[]): CodexDisplacedConfig {
  const statements = scanTomlStatements(snapshot);
  const displaced: CodexDisplacedConfig = statements[0]?.eol === "\r\n" ? { eol: "\r\n" } : {};
  for (const [key, field] of Object.entries(displacedRootKeys)) {
    const statement = statements.find((item) => item.table === "" && item.key === key);
    if (statement !== undefined) {
      displaced[field] = statementText(statement);
    }
  }
  const headers = providerIds.map((providerId) => `profiles.${tomlKey(providerId)}`);
  const profileTables: string[] = [];
  let inTable = false;
  for (const { kind, lines, table } of statements) {
    if (kind === "header") {
      inTable = headers.includes(table);
      if (inTable) {
        profileTables.push("");
      }
    }
    if (inTable) {
      profileTables[profileTables.length - 1] += lines.join("");
    }
  }
  return profileTables.length > 0 ? { ...displaced, profileTables } : displaced;
}

function statementText({ eol, lines }: TomlStatement): string {
  const text = lines.join("");
  return text.slice(0, text.length - eol.length);
}

// Codex adds its own tables inside LLMR's last marker pair (codex-cli 0.171.0, `codex mcp add`), so the markers bound nothing: each line goes by what it holds.
// With `written`, a root `model` or `show_all_sessions` line goes only when it is the line LLMR recorded writing.
// A displaced root line comes back only in place of the line of LLMR's that took its place: where that line is gone or changed, the user has chosen since.
export function stripManagedCodexConfigContent(
  content: string,
  providerIds: string[],
  written?: CodexWrittenLines,
  displaced: CodexDisplacedConfig = {}
): string | undefined {
  const putBack = new Map<string, number>();
  const usersRootKeys = new Set<string>();
  const configuredModel = managedConfiguredModel(content);
  const providerValues = providerIds.flatMap((providerId) => [tomlString(providerId), `'${providerId}'`]);
  const eol = displaced.eol ?? "\n";
  const kept: string[] = [];
  let inRootBlock = false;
  for (const statement of scanTomlStatements(content)) {
    if (isMarker(statement)) {
      inRootBlock = statement.lines[0].trim() === managedRootStart;
      continue;
    }
    const inRoot = statement.table === "";
    const { key, value = "" } = inRoot ? statement : {};
    if (
      (inRoot && statement.kind === "comment" && statement.lines[0].trim().startsWith(managedConfiguredModelPrefix)) ||
      (key === "model_provider" && providerValues.includes(value)) ||
      (key === "model_catalog_json" && value.includes("llmr-model-catalog.json")) ||
      (key === "model" && (written ? sameRootAssignment(statement.lines[0], written.modelLine) : value === configuredModel)) ||
      (key === "show_all_sessions" && (written ? sameRootAssignment(statement.lines[0], written.showAllSessionsLine) : inRootBlock))
    ) {
      const usersLine = displaced[displacedRootKeys[key as keyof typeof displacedRootKeys]];
      if (key !== undefined && usersLine !== undefined && !putBack.has(key)) {
        putBack.set(key, kept.length);
        kept.push(`${usersLine}${eol}`);
      }
      continue;
    }
    if (key !== undefined) {
      usersRootKeys.add(key);
    }
    kept.push(...statement.lines);
  }
  // A line of that key the user wrote beside LLMR's is their choice, and a second one would stop the file loading.
  for (const [key, index] of putBack) {
    if (usersRootKeys.has(key)) {
      kept[index] = "";
    }
  }
  const providerHeaders = providerIds.map((providerId) => `model_providers.${tomlKey(providerId)}`);
  const mcpTables = [TOOL_HUB_MCP_SERVER_NAME, CONTEXT_ARCHIVE_MCP_SERVER_NAME].map((serverName) => `mcp_servers.${tomlKey(serverName)}`);
  const next = removeTablesOutsideValues(kept.join(""), (header) =>
    providerHeaders.includes(header) ||
    mcpTables.some((table) => header === table || header.startsWith(`${table}.`)));
  if (next === content) {
    return undefined;
  }
  const stripped = trimLeadingBlankLines(next).replace(/\n{2,}$/, "\n");
  // The writer moves the user's `[profiles.<provider>]` table into a file of its own, so one that is absent here was taken, not deleted.
  const present = new Set(scanTomlStatements(stripped).filter(({ kind }) => kind === "header").map(({ table }) => table));
  const missingTables = (displaced.profileTables ?? []).filter((table) => !present.has(scanTomlStatements(table)[0]?.table ?? ""));
  return missingTables.length === 0
    ? stripped
    : [stripped.trimEnd(), ...missingTables.map((table) => table.trimEnd())].filter(Boolean).join(`${eol}${eol}`).concat(eol);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type TomlScanState = { depth: number; multiline: "" | "\"\"\"" | "'''" };

// No TOML parser is installed and a parser could not make a line-preserving edit, so this tracks only what decides whether a line starts inside a value.
// The offset where the root section ends: the first `[` line that is a header, not a line of an array or a multi-line string.
// It starts at any blank lines above that header, as `firstTomlTableIndex` does, so the two give the same bytes for a file with no such value.
export function firstCodexTableIndex(content: string): number {
  const insideValue = new Set<number>();
  let offset = 0;
  for (const { inValue, line } of scanTomlLines(content)) {
    if (inValue) {
      insideValue.add(offset);
    }
    offset += line.length;
  }
  const header = /^\s*\[/gm;
  for (let match = header.exec(content); match; match = header.exec(content)) {
    const bracket = match.index + match[0].length - 1;
    if (!insideValue.has(content.lastIndexOf("\n", bracket) + 1)) {
      return match.index;
    }
  }
  return -1;
}

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

// A statement is a key with every line of its value, a table header, a comment or a blank line, so a line that starts with `[` inside a value is never a header.
export type TomlStatement = {
  eol: "" | "\n" | "\r\n";
  header?: string;
  key?: string;
  kind: "assignment" | "blank" | "comment" | "header";
  lines: string[];
  table: string;
  value?: string;
};

export function scanTomlStatements(content: string): TomlStatement[] {
  const statements: TomlStatement[] = [];
  let table = "";
  for (const { inValue, line } of scanTomlLines(content)) {
    const last = statements.at(-1);
    if (inValue && last) {
      last.lines.push(line);
      last.eol = lineEnd(line);
      continue;
    }
    const statement = readTomlStatement(line, table);
    table = statement.table;
    statements.push(statement);
  }
  return statements;
}

function readTomlStatement(line: string, table: string): TomlStatement {
  const trimmed = line.trim();
  const base = { eol: lineEnd(line), lines: [line], table };
  if (trimmed === "") {
    return { ...base, kind: "blank" };
  }
  if (trimmed.startsWith("#")) {
    return { ...base, kind: "comment" };
  }
  const code = trimmed.slice(0, scanTomlLine(trimmed, { depth: 0, multiline: "" })).trim();
  if (trimmed.startsWith("[")) {
    const width = code.startsWith("[[") && code.endsWith("]]") ? 2 : 1;
    const path = code.endsWith("]") ? readTomlKeyPath(code.slice(width, -width)) : undefined;
    const header = path?.end === code.length - 2 * width ? path.path : undefined;
    // A header with no readable path still starts a table, so the keys under it are never taken for root keys.
    return { ...base, header, kind: "header", table: header ?? trimmed };
  }
  const path = readTomlKeyPath(code);
  return path !== undefined && code[path.end] === "="
    ? { ...base, key: path.path, kind: "assignment", value: code.slice(path.end + 1).trim() }
    : { ...base, kind: "assignment" };
}

// Each segment is unquoted without decoding an escape, then written as `tomlKey` writes it, so a bare and a quoted spelling of a key give the same path.
function readTomlKeyPath(text: string): { end: number; path: string } | undefined {
  const segments: string[] = [];
  let index = skipBlanks(text, 0);
  for (;;) {
    const quote = text[index];
    if (quote === "\"" || quote === "'") {
      const end = oneLineStringEnd(text, index);
      if (end > text.length) {
        return undefined;
      }
      segments.push(text.slice(index + 1, end - 1));
      index = end;
    } else {
      const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(index))?.[0];
      if (bare === undefined) {
        return undefined;
      }
      segments.push(bare);
      index += bare.length;
    }
    index = skipBlanks(text, index);
    if (text[index] !== ".") {
      return { end: index, path: segments.map(tomlKey).join(".") };
    }
    index = skipBlanks(text, index + 1);
  }
}

function skipBlanks(text: string, start: number): number {
  let index = start;
  while (text[index] === " " || text[index] === "\t") {
    index += 1;
  }
  return index;
}

function lineEnd(line: string): TomlStatement["eol"] {
  return line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";
}

export function removeTablesOutsideValues(content: string, isRemoved: (header: string) => boolean): string {
  const kept: string[] = [];
  let removing = false;
  // A comment block set off by a blank line belongs to the table below it, not to the one being removed.
  let commentsAboveNextHeader: string[] = [];
  let blankSinceBody = false;
  for (const { kind, lines, table } of scanTomlStatements(content)) {
    if (kind === "header") {
      kept.push(...commentsAboveNextHeader);
      commentsAboveNextHeader = [];
      blankSinceBody = false;
      removing = isRemoved(table);
    }
    if (!removing) {
      kept.push(...lines);
    } else if (kind === "blank") {
      blankSinceBody = true;
      if (commentsAboveNextHeader.length > 0) {
        commentsAboveNextHeader.push(...lines);
      }
    } else if (kind === "comment" && blankSinceBody) {
      commentsAboveNextHeader.push(...lines);
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
