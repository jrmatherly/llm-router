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
  let result = value;
  if (Object.hasOwn(value, "defer_loading")) {
    const { defer_loading: _deferLoading, ...rest } = value;
    result = rest;
  }
  if (isRecord(value.function)) {
    const fn = stripTool(value.function);
    if (fn !== value.function) result = { ...result, function: fn };
  }
  if (Array.isArray(value.tools)) {
    const tools = stripTools(value.tools);
    if (tools !== value.tools) result = { ...result, tools };
  }
  return result;
}
