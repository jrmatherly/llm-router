import {
  ROUTER_FALLBACK_MAX_RETRY_COUNT,
  ROUTER_SCRIPT_API_VERSION,
  ROUTER_SCRIPT_DEFAULT_TIMEOUT_MS,
  ROUTER_SCRIPT_MAX_TIMEOUT_MS
} from "@llmr/core/contracts/app";
import type {
  AppConfig,
  RouteScriptSampleRequest,
  RouterBuiltInRulesConfig,
  RouterConfig,
  RouterFallbackConfig,
  RouterFallbackMode,
  RouterRule,
  RouterRuleCondition,
  RouterRuleOperator,
  RouterRuleRewrite,
  RouterRuleRewriteOperation,
  RouterRuleType
} from "@llmr/core/contracts/app";
import {
  fallbackConfig
} from "./fallbacks";
import {
  legacyRouterRuleTypes,
  removedLegacyRouterRuleIds,
  routerFallbackModeOptions,
  routerRewriteOperationOptions,
  routerRuleOperatorOptions,
  routerRuleTypeOptions
} from "./options";

import { clampNumber, isPlainRecord, normalizeProviderModelSelector, stringValue, uniqueStrings } from "./common";
import { formatRouterRuleCondition, formatRouterRuleTarget, routerRuleTypeLabel } from "./providers";
import type { RoutingRuleRow } from "./types";

export function normalizeRouterConfig(value: Partial<RouterConfig> | undefined): RouterConfig {
  const router = {
    ...fallbackConfig.Router,
    ...(value || {})
  } as RouterConfig & { default?: unknown };
  const { default: _legacyDefault, ...routerWithoutLegacyDefault } = router;
  const rules = normalizeRouterRules((value as Record<string, unknown> | undefined)?.rules) ?? [];
  return {
    ...routerWithoutLegacyDefault,
    builtInRules: normalizeRouterBuiltInRules((value as Record<string, unknown> | undefined)?.builtInRules),
    fallback: normalizeRouterFallbackConfig((value as Record<string, unknown> | undefined)?.fallback),
    rules
  };
}

export function normalizeRouterBuiltInRules(value: unknown): RouterBuiltInRulesConfig {
  const record = isPlainRecord(value) ? value : {};
  return {
    "claude-code": normalizeRouterBuiltInAgentRule(record["claude-code"] ?? record.claudeCode ?? record.claude),
    codex: normalizeRouterBuiltInAgentRule(record.codex)
  };
}

function normalizeRouterBuiltInAgentRule(value: unknown): { enabled: boolean } {
  if (typeof value === "boolean") {
    return { enabled: value };
  }
  const record = isPlainRecord(value) ? value : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : true
  };
}

export function normalizeRouterFallbackConfig(value: Partial<RouterFallbackConfig> | unknown): RouterFallbackConfig {
  const record = isPlainRecord(value) ? value : {};
  const mode = parseRouterFallbackMode(record.mode) ?? fallbackConfig.Router.fallback.mode;
  const retryCount = clampNumber(Number(record.retryCount), 0, ROUTER_FALLBACK_MAX_RETRY_COUNT);
  const models = Array.isArray(record.models)
    ? uniqueStrings(
      record.models
        .map((model) => normalizeProviderModelSelector(stringValue(model)))
        .filter(Boolean)
    )
    : [];

  return {
    mode,
    models,
    retryCount: Number.isFinite(retryCount) ? retryCount : fallbackConfig.Router.fallback.retryCount
  };
}

export function parseRouterFallbackMode(value: unknown): RouterFallbackMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return routerFallbackModeOptions.some((option) => option.value === normalized)
    ? normalized as RouterFallbackMode
    : undefined;
}

export function normalizeRouterRules(value: unknown): RouterRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index): RouterRule | undefined => {
      if (!isPlainRecord(item)) {
        return undefined;
      }
      const type = parseRouterRuleType(item.type);
      if (!type) {
        return undefined;
      }
      const name = stringValue(item.name) || routerRuleTypeLabel(type);
      const id = stringValue(item.id) || `rule-${index + 1}`;
      if (removedLegacyRouterRuleIds.has(id)) {
        return undefined;
      }
      const pattern = stringValue(item.pattern);
      const target = normalizeProviderModelSelector(stringValue(item.target));
      const threshold = Number(item.threshold);
      const condition = normalizeRouterRuleCondition(item.condition ?? item) ?? routerRuleConditionFromLegacy(type, {
        pattern
      });
      const rewrites = normalizeRouterRuleRewrites(item);
      const script = type === "script" ? normalizeRouterRuleScript(item.script ?? item) : undefined;
      const rawFallback = item.fallback ?? item.failureFallback ?? item.fallbackStrategy;
      const fallback = isPlainRecord(rawFallback) ? normalizeRouterFallbackConfig(rawFallback) : undefined;
      return {
        ...(condition ? { condition } : {}),
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        ...(fallback ? { fallback } : {}),
        id,
        name,
        ...(pattern ? { pattern } : {}),
        ...(rewrites.length === 1 ? { rewrite: rewrites[0] } : {}),
        ...(rewrites.length > 0 ? { rewrites } : {}),
        ...(script ? { script } : {}),
        ...(target ? { target } : {}),
        ...(Number.isFinite(threshold) && threshold > 0 ? { threshold: Math.trunc(threshold) } : {}),
        type: type === "script" ? "script" : condition ? "condition" : type
      };
    })
    .filter((item): item is RouterRule => Boolean(item));
}

export function normalizeRouterRuleScript(value: unknown): RouterRule["script"] | undefined {
  if (!isPlainRecord(value)) return undefined;
  const file = stringValue(value.file ?? value.filePath ?? value.path);
  const source = typeof value.source === "string"
    ? value.source
    : typeof value.code === "string"
      ? value.code
      : undefined;
  if (!file && source === undefined) return undefined;
  const language = stringValue(value.language)?.toLowerCase();
  if (language && language !== "javascript" && language !== "js") return undefined;
  const apiVersion = Number(value.apiVersion ?? value.version ?? ROUTER_SCRIPT_API_VERSION);
  if (apiVersion !== ROUTER_SCRIPT_API_VERSION) return undefined;
  const rawTimeout = Number(value.timeoutMs ?? value.timeout ?? ROUTER_SCRIPT_DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout)
    ? Math.max(10, Math.min(ROUTER_SCRIPT_MAX_TIMEOUT_MS, Math.trunc(rawTimeout)))
    : ROUTER_SCRIPT_DEFAULT_TIMEOUT_MS;
  return {
    apiVersion: ROUTER_SCRIPT_API_VERSION,
    ...(file ? { file } : {}),
    language: "javascript",
    ...(source !== undefined ? { source } : {}),
    timeoutMs
  };
}

export function normalizeRouteScriptSampleRequest(value: unknown): RouteScriptSampleRequest {
  if (!isPlainRecord(value) || !isPlainRecord(value.body)) {
    throw new Error("Sample must be a JSON object with an object body");
  }
  const headers = normalizeRouteScriptSampleHeaders(value.headers);
  return {
    body: value.body,
    headers,
    ...(typeof value.method === "string" ? { method: value.method } : {}),
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
    ...(typeof value.tokenCount === "number" ? { tokenCount: value.tokenCount } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {})
  };
}

function normalizeRouteScriptSampleHeaders(value: unknown): Record<string, string | string[]> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new Error("Sample headers must be a JSON object containing string or string-array values");
  }
  const headers: Record<string, string | string[]> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") {
      headers[name] = headerValue;
      continue;
    }
    if (Array.isArray(headerValue) && headerValue.every((entry) => typeof entry === "string")) {
      headers[name] = headerValue;
      continue;
    }
    throw new Error("Sample headers must be a JSON object containing string or string-array values");
  }
  return headers;
}

export function normalizeRouterRuleCondition(value: unknown): RouterRuleCondition | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const left =
    stringValue(value.left) ??
    stringValue(value.path) ??
    stringValue(value.field) ??
    stringValue(value.parameter);
  const operator = parseRouterRuleOperator(value.operator ?? value.op);
  const right = typeof value.right === "string"
    ? value.right.trim()
    : typeof value.value === "string"
      ? value.value.trim()
      : value.right !== undefined
        ? String(value.right)
        : value.value !== undefined
          ? String(value.value)
          : undefined;

  return left && operator && right !== undefined
    ? { left, operator, right }
    : undefined;
}

export function parseRouterRuleOperator(value: unknown): RouterRuleOperator | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return routerRuleOperatorOptions.some((option) => option.value === normalized)
    ? normalized as RouterRuleOperator
    : undefined;
}

function routerRuleConditionFromLegacy(
  type: RouterRuleType,
  input: { pattern?: string }
): RouterRuleCondition | undefined {
  if (type === "model-prefix" && input.pattern) {
    return {
      left: "request.body.model",
      operator: "starts-with",
      right: input.pattern
    };
  }
  return undefined;
}

export function normalizeRouterRuleRewrites(rule: Record<string, unknown>): RouterRuleRewrite[] {
  if (Array.isArray(rule.rewrites)) {
    return rule.rewrites
        .map((item) => normalizeRouterRuleRewrite(item))
        .filter((item): item is RouterRuleRewrite => Boolean(item));
  }
  const rewrite = normalizeRouterRuleRewrite(rule.rewrite ?? rule.action);
  const target = normalizeProviderModelSelector(stringValue(rule.target));
  return [
    ...(rewrite ? [rewrite] : []),
    ...(target ? [{ key: "request.body.model", operation: "set" as const, value: target }] : [])
  ];
}

export function normalizeRouterRuleRewrite(value: unknown): RouterRuleRewrite | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const key =
    stringValue(value.key) ??
    stringValue(value.path) ??
    stringValue(value.field) ??
    stringValue(value.parameter);
  const operation = parseRouterRewriteOperation(value.operation ?? value.op ?? value.type) ?? "set";
  const rewriteValue = normalizeRouterRewriteValue(key, stringifyRewriteValue(value.value));
  const match = stringifyRewriteValue(value.match);

  if (!key) {
    return undefined;
  }
  if (operation === "delete") {
    return { key, operation };
  }
  if (operation === "array-replace") {
    return match !== undefined && rewriteValue !== undefined
      ? { key, match, operation, value: rewriteValue }
      : undefined;
  }
  return rewriteValue !== undefined
    ? { key, operation, value: rewriteValue }
    : undefined;
}

export function parseRouterRewriteOperation(value: unknown): RouterRuleRewriteOperation | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return routerRewriteOperationOptions.some((option) => option.value === normalized)
    ? normalized as RouterRuleRewriteOperation
    : undefined;
}

function stringifyRewriteValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  return value !== undefined ? String(value) : undefined;
}

function normalizeRouterRewriteValue(key: string | undefined, value: string | undefined): string | undefined {
  if (key?.trim() !== "request.body.model" || value === undefined) {
    return value;
  }
  return normalizeProviderModelSelector(value);
}

export function parseRouterRuleType(value: unknown): RouterRuleType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isRouterRuleType(normalized) ? normalized : undefined;
}

export function isRouterRuleType(value: string): value is RouterRuleType {
  return routerRuleTypeOptions.some((option) => option.value === value) || legacyRouterRuleTypes.includes(value as RouterRuleType);
}

export type KnownWrapperPluginConfig<TId extends string> = AppConfig["plugins"][number] & { id: TId };

export function isCursorProxyPluginConfig(item: unknown): item is KnownWrapperPluginConfig<"cursor-proxy"> {
  if (!isPlainRecord(item)) {
    return false;
  }
  const id = stringValue(item.id) || stringValue(item.key);
  return id === "cursor-proxy";
}

export function buildRoutingRuleRows(config: AppConfig): RoutingRuleRow[] {
  return config.Router.rules.map((rule, index): RoutingRuleRow => ({
    condition: formatRouterRuleCondition(rule),
    enabled: rule.enabled,
    index,
    key: `router-${rule.id}-${index}`,
    name: rule.name || "Unnamed",
    readonly: false,
    ruleCount: config.Router.rules.length,
    ruleId: rule.id,
    sourceLabel: "Router",
    target: formatRouterRuleTarget(rule),
    typeLabel: routerRuleTypeLabel(rule.type)
  }));
}

export function composeRouteTargetValue(providerValue: unknown, modelValue: unknown): string | undefined {
  const provider = stringValue(providerValue);
  const model = stringValue(modelValue);
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model || provider;
}
