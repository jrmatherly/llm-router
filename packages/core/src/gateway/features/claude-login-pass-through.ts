import { resolveClaudeCodeGatewayAuthMode } from "@llmr/core/agents/claude-code/auth-mode";
import { isGatewayProviderEnabled, type ApiKeyConfig, type AppConfig, type GatewayProviderConfig, type RouterFallbackConfig } from "@llmr/core/contracts/app";
import { llmrCallerAuthorizationHeader } from "@llmr/core/gateway/core-runtime/router-plugin-contract";
import { llmrApiKeyHeader } from "@llmr/core/gateway/internal/shared";
import { stringValue } from "@llmr/core/gateway/internal/value";
import { profileForApiKey } from "@llmr/core/profiles/model-allowlist";
import { isLocalClaudeCodeOauthProviderPlugin } from "@llmr/core/providers/oauth-plugin";
import { sanitizeHeaderValue } from "@llmr/core/providers/runtime-topology";
import { normalizeRouteSelector, parseProviderModelSelector, providerRuntimeId } from "@llmr/core/routing/model-registry";

type ProviderConfig = Pick<AppConfig, "Providers" | "providerPlugins">;
type Headers = Record<string, unknown>;

export const claudeLoginRouteFallback: RouterFallbackConfig = { mode: "off", models: [], retryCount: 1 };

export const claudeLoginMissingMessage = "This provider forwards the Claude login that Claude Code sends, and this request carried none. Sign in with \"claude /login\" and use a Claude Code profile in Claude login mode, or route this request to another provider.";

export function claudeLoginProviderNames(config: ProviderConfig): string[] {
  return claudeLoginProviders(config).map((provider) => provider.name);
}

export function withoutClaudeLoginProviders<T extends ProviderConfig>(config: T): T {
  const names = new Set(claudeLoginProviderNames(config));
  return names.size === 0 ? config : { ...config, Providers: config.Providers.filter((provider) => !names.has(provider.name)) };
}

export function claudeLoginRoutedModel(config: ProviderConfig, model: string | undefined): string | undefined {
  const normalized = normalizeRouteSelector(model);
  const providers = claudeLoginProviders(config);
  if (!normalized || providers.length === 0) {
    return undefined;
  }
  const selector = parseProviderModelSelector(normalized);
  if (!selector) {
    return `${providers[0].name}/${normalized}`;
  }
  const provider = providerNamed(providers, selector.provider);
  return provider ? `${provider.name}/${selector.model}` : undefined;
}

export function claudeLoginRoutedProvider(
  config: ProviderConfig,
  headers: Headers | undefined,
  routedModel: string | undefined
): { model: string; provider: GatewayProviderConfig } | undefined {
  const selector = carriesClaudeLogin(headers) ? parseProviderModelSelector(routedModel) : undefined;
  const provider = selector ? providerNamed(claudeLoginProviders(config), selector.provider) : undefined;
  return selector && provider ? { model: selector.model, provider } : undefined;
}

export function claudeLoginPassThroughTarget(input: {
  apiKey: ApiKeyConfig | undefined;
  config: ProviderConfig & Pick<AppConfig, "profile">;
  headers: Headers;
  method: string;
  model: string | undefined;
  path: string;
}): string | undefined {
  if (input.method.toUpperCase() !== "POST" || input.path.split("?")[0] !== "/v1/messages") {
    return undefined;
  }
  if (!header(input.headers, llmrApiKeyHeader) || !header(input.headers, "authorization")?.startsWith("Bearer ")) {
    return undefined;
  }
  const profile = profileForApiKey(input.config, input.apiKey);
  if (profile?.agent !== "claude-code" || resolveClaudeCodeGatewayAuthMode(profile) !== "claude-login") {
    return undefined;
  }
  return claudeLoginRoutedModel(input.config, input.model);
}

export function carriesClaudeLogin(headers: Headers | undefined): boolean {
  return Boolean(header(headers, llmrCallerAuthorizationHeader));
}

function claudeLoginProviders(config: ProviderConfig): GatewayProviderConfig[] {
  const bound = new Set((config.providerPlugins ?? [])
    .filter(isLocalClaudeCodeOauthProviderPlugin)
    .map((plugin) => stringValue(plugin.providerName)?.toLowerCase()));
  return config.Providers.filter((provider) =>
    isGatewayProviderEnabled(provider) &&
    (bound.has(provider.name.toLowerCase()) || bound.has(providerRuntimeId(provider).toLowerCase())));
}

// A routed id read from a header has had its non-ASCII characters replaced.
function providerNamed(providers: GatewayProviderConfig[], name: string): GatewayProviderConfig | undefined {
  const wanted = name.toLowerCase();
  return providers.find((provider) =>
    provider.name.toLowerCase() === wanted || sanitizeHeaderValue(provider.name).toLowerCase() === wanted);
}

function header(headers: Headers | undefined, name: string): string | undefined {
  const value = headers?.[name];
  return typeof value === "string" ? value : Array.isArray(value) ? stringValue(value[0]) : undefined;
}
