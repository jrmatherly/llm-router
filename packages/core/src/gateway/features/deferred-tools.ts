import { isRecord } from "@llmr/core/gateway/internal/value";

export function withoutDeferredToolFlags(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) return body;
  const tools = stripTools(body.tools);
  return tools === body.tools ? body : { ...body, tools };
}

function stripTools(tools: unknown[]): unknown[] {
  const stripped = tools.map(stripTool);
  return stripped.some((tool, index) => tool !== tools[index]) ? stripped : tools;
}

function stripTool(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let result = stripFlag(value) as Record<string, unknown>;
  for (const key of ["default_config", "function"]) {
    const nested = stripFlag(value[key]);
    if (nested !== value[key]) result = { ...result, [key]: nested };
  }
  if (isRecord(value.configs)) {
    const configs = value.configs;
    const entries = Object.entries(configs).map(([name, config]) => [name, stripFlag(config)] as const);
    if (entries.some(([name, config]) => config !== configs[name])) result = { ...result, configs: Object.fromEntries(entries) };
  }
  if (Array.isArray(value.tools)) {
    const tools = stripTools(value.tools);
    if (tools !== value.tools) result = { ...result, tools };
  }
  return result;
}

function stripFlag(value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, "defer_loading")) return value;
  const { defer_loading: _deferLoading, ...rest } = value;
  return rest;
}
