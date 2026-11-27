import { fetchWithSystemProxy } from "@llmr/core/proxy/system-proxy-fetch";
import type { AppConfig, PriceSourceStatus, ProviderModelPricing } from "@llmr/core/contracts/app";
import { catalogProviderIdsForBaseUrl } from "@llmr/core/providers/model-catalog";
import { modelRegistryForConfig } from "@llmr/core/routing/model-registry";

type ModelPricingSource = "litellm" | "models.dev" | "openrouter";
// "models.dev-median" is an estimate from reseller offers, never a listed price.
type CatalogPricingSource = ModelPricingSource | "models.dev-median";
export type UsagePricingSource = CatalogPricingSource | "custom";

export type CompleteModelPricing = ProviderModelPricing & {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type ResolvedModelPrice = {
  pricing: CompleteModelPricing;
  source: UsagePricingSource;
};

// "unpriced": every catalog source loaded and none holds a price, so the usage
// sweep marks the row and never resolves it again. "no-catalog": nothing was
// searched, or nothing was found while a source is failing, so the row waits
// with no cost until the sweep prices it and sends the price update to Logs.
export type RequestPriceOutcome =
  | { price: ResolvedModelPrice; state: "priced" }
  | { state: "unpriced" }
  | { state: "no-catalog" };

export type RequestPriceInput = {
  price?: RequestPriceOutcome;
};

export type UsageCostInput = {
  cacheReadTokens?: number;
  cacheWrite1hTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWriteTokens?: number;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
  pricing?: ProviderModelPricing;
  pricingSource?: UsagePricingSource;
  provider?: string;
};

export type UsageCostEstimate = {
  amountUsd: number;
  model: string;
  source: UsagePricingSource;
};

// Stored in cost_source for a row resolved as "unpriced", so the sweep and a price update leave it.
export const unpricedCostSource = "unpriced";

export type WritePricing =
  | { estimate: false }
  | { estimate: true; pricing?: ProviderModelPricing; pricingSource?: UsagePricingSource };

type CatalogEntry = {
  canonicalModelId?: string;
  model: string;
  pricing: CompleteModelPricing;
  source: CatalogPricingSource;
};

type BareNameOffers = {
  canonicalIds: Set<string>;
  offerKeys: Set<string>;
};

// byKey holds "<provider id>/<model key>" for models.dev and the source's own
// key otherwise, and no bare-name keys: models.dev orders providers differently
// on each fetch, so a first-wins bare key would change between loads.
// byBareName lists every offer instead.
type PriceIndex = {
  byBareName: Map<string, BareNameOffers>;
  byKey: Map<string, CatalogEntry>;
};

type SourcePrices = {
  expiresAt: number;
  failed: boolean;
  index: PriceIndex;
  loadedAt?: number;
};

type PriceCatalog = Map<ModelPricingSource, SourcePrices>;

type CatalogRuleContext = {
  bare: string;
  catalog: PriceCatalog;
  catalogProviderIds: string[];
  model: string;
  provider: string;
};

const catalogTtlMs = 24 * 60 * 60 * 1000;
const failedSourceRetryMs = 5 * 60 * 1000;
const fetchTimeoutMs = 5000;
const liteLlmPricesUrl = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const modelsDevPricesUrl = "https://models.dev/api.json";
const openRouterModelsUrl = "https://openrouter.ai/api/v1/models";
const pricingSources = new Set(Object.keys({
  custom: true,
  litellm: true,
  "models.dev": true,
  "models.dev-median": true,
  openrouter: true
} satisfies Record<UsagePricingSource, true>));

let catalog: PriceCatalog | undefined;
let catalogPromise: Promise<PriceCatalog> | undefined;

/** Loads the remote catalog without holding a caller's database transaction. */
export async function preloadUsagePriceCatalog(options: { forceRefresh?: boolean } = {}): Promise<void> {
  if (options.forceRefresh) {
    catalog = undefined;
    catalogPromise = undefined;
  }
  await getPriceCatalog();
}

export function usagePriceCatalogNeedsRefresh(): boolean {
  const now = Date.now();
  return !catalog || Array.from(catalog.values()).some((source) => now >= source.expiresAt);
}

export function usagePriceCatalogStatus(): PriceSourceStatus[] {
  return Array.from(catalog ?? [], ([source, { failed, loadedAt }]) => ({
    ...(failed ? { failing: true as const } : {}),
    ...(loadedAt === undefined ? {} : { loadedAt: new Date(loadedAt).toISOString() }),
    source
  })).sort((left, right) => left.source.localeCompare(right.source));
}

/** Never reads the catalog: a cost comes only from a complete input.pricing. */
export function estimateUsageCost(input: UsageCostInput): UsageCostEstimate | undefined {
  if (!hasBillableUsage(input)) {
    return undefined;
  }
  const model = input.model?.trim();
  if (!model || model === "unknown") {
    return undefined;
  }
  return hasCompleteProviderModelPricing(input.pricing)
    ? estimateUsageCostFromPricing(input, model, input.pricing, input.pricingSource || "custom")
    : undefined;
}

/** Never loads the catalog: "no-catalog" means this process has none yet. */
export function resolveRequestPrice(
  config: Pick<AppConfig, "Providers"> | undefined,
  providerName: string | undefined,
  modelName: string | undefined
): RequestPriceOutcome {
  const userPricing = providerModelPricingForUsage(config, providerName, modelName);
  if (hasCompleteProviderModelPricing(userPricing)) {
    return { price: { pricing: userPricing, source: "custom" }, state: "priced" };
  }
  if (!catalog) {
    return { state: "no-catalog" };
  }
  const provider = config && providerName
    ? modelRegistryForConfig(config).findProvider(providerName)
    : undefined;
  const entry = modelName && findCatalogRulePrice(
    catalog,
    modelName,
    provider?.name ?? providerName,
    catalogProviderIdsForBaseUrl(provider?.baseurl || provider?.baseUrl || provider?.api_base_url)
  );
  if (entry) {
    return { price: { pricing: entry.pricing, source: entry.source }, state: "priced" };
  }
  // "unpriced" is stored and never swept again, so it needs every source: a source that failed may hold the price.
  return Array.from(catalog.values()).some((source) => source.failed) ? { state: "no-catalog" } : { state: "unpriced" };
}

/** "no-catalog" leaves the row with no cost, for the usage sweep and its price update to price. */
export function pricingForWrite(input: RequestPriceInput): WritePricing {
  if (input.price?.state === "priced") {
    return { estimate: true, pricing: input.price.price.pricing, pricingSource: input.price.price.source };
  }
  if (input.price?.state === "unpriced") {
    return { estimate: false };
  }
  return { estimate: true };
}

export function parseUsagePricingSource(value: unknown): UsagePricingSource | undefined {
  return typeof value === "string" && pricingSources.has(value) ? value as UsagePricingSource : undefined;
}

export function hasCompleteProviderModelPricing(
  pricing: ProviderModelPricing | undefined
): pricing is CompleteModelPricing {
  return normalizePrice(pricing?.inputUsdPerMillionTokens) !== undefined &&
    normalizePrice(pricing?.outputUsdPerMillionTokens) !== undefined;
}

export function providerModelPricingForUsage(
  config: Pick<AppConfig, "Providers"> | undefined,
  providerName: string | undefined,
  modelName: string | undefined
): ProviderModelPricing | undefined {
  const normalizedProvider = providerName?.trim().toLowerCase();
  const normalizedModel = modelName?.trim().toLowerCase();
  if (!config || !normalizedProvider || !normalizedModel) {
    return undefined;
  }
  const provider = modelRegistryForConfig(config).findProvider(normalizedProvider);
  if (!provider) {
    return undefined;
  }
  const model = modelWithoutRouteAndProvider(normalizedModel, normalizedProvider);
  const metadata = Object.entries(provider.modelMetadata ?? {})
    .find(([candidate]) => candidate.trim().toLowerCase() === model)?.[1];
  return metadata?.pricing;
}

function modelWithoutRouteAndProvider(model: string, provider: string | undefined): string {
  const unwrapped = unwrapRoutedModelName(model.trim());
  const selectorPrefix = provider?.trim() ? `${provider.trim().toLowerCase()}/` : undefined;
  return selectorPrefix && unwrapped.toLowerCase().startsWith(selectorPrefix)
    ? unwrapped.slice(selectorPrefix.length)
    : unwrapped;
}

function unwrapRoutedModelName(model: string): string {
  // Usage and request logs can hand us a route selector
  // ("<providerId>::<protocol>/<model>") rather than a plain model name.
  const routeSeparator = model.indexOf("::");
  if (routeSeparator < 0) {
    return model;
  }
  const modelStart = model.indexOf("/", routeSeparator);
  if (modelStart > 0 && modelStart < model.length - 1) {
    return model.slice(modelStart + 1);
  }
  return model;
}

function estimateUsageCostFromPricing(
  input: UsageCostInput,
  model: string,
  pricing: CompleteModelPricing,
  source: UsagePricingSource
): UsageCostEstimate | undefined {
  const inputUsdPerToken = pricing.inputUsdPerMillionTokens / 1_000_000;
  const outputUsdPerToken = pricing.outputUsdPerMillionTokens / 1_000_000;
  const cacheReadUsdPerToken = divideByMillion(pricing.cacheReadUsdPerMillionTokens);
  const inputTokens = normalizeCount(input.inputTokens);
  const outputTokens = normalizeCount(input.outputTokens);
  const cacheReadTokens = normalizeCount(input.cacheReadTokens);
  const cacheWrite5mTokens = normalizeCount(input.cacheWrite5mTokens);
  const cacheWrite1hTokens = normalizeCount(input.cacheWrite1hTokens);
  const classifiedCacheWriteTokens = cacheWrite5mTokens + cacheWrite1hTokens;
  const cacheWriteTokens = Math.max(normalizeCount(input.cacheWriteTokens), classifiedCacheWriteTokens);
  const unclassifiedCacheWriteTokens = Math.max(0, cacheWriteTokens - classifiedCacheWriteTokens);
  const cacheWrite5mUsdPerToken = divideByMillion(
    pricing.cacheWrite5mUsdPerMillionTokens ?? pricing.cacheWriteUsdPerMillionTokens
  ) ?? inputUsdPerToken;
  const cacheWrite1hUsdPerToken = divideByMillion(pricing.cacheWrite1hUsdPerMillionTokens) ?? cacheWrite5mUsdPerToken;
  const amountUsd =
    inputTokens * inputUsdPerToken +
    outputTokens * outputUsdPerToken +
    cacheReadTokens * (cacheReadUsdPerToken ?? inputUsdPerToken) +
    cacheWrite5mTokens * cacheWrite5mUsdPerToken +
    cacheWrite1hTokens * cacheWrite1hUsdPerToken +
    unclassifiedCacheWriteTokens * cacheWrite5mUsdPerToken;

  // Only a price the user set may come to zero. A catalog zero is a missing price.
  if (!Number.isFinite(amountUsd) || amountUsd < 0 || (amountUsd === 0 && source !== "custom")) {
    return undefined;
  }

  return { amountUsd, model, source };
}

function hasBillableUsage(input: UsageCostInput): boolean {
  return normalizeCount(input.inputTokens) +
    normalizeCount(input.outputTokens) +
    normalizeCount(input.cacheReadTokens) +
    normalizeCount(input.cacheWriteTokens) +
    normalizeCount(input.cacheWrite5mTokens) +
    normalizeCount(input.cacheWrite1hTokens) > 0;
}

const catalogRuleSteps: Array<(context: CatalogRuleContext) => CatalogEntry | undefined> = [
  openRouterEntry,
  mappedProviderEntry,
  makerEntry,
  soleOfferEntry,
  liteLlmEntry,
  medianOfferEntry
];

function findCatalogRulePrice(
  prices: PriceCatalog,
  modelName: string,
  provider: string | undefined,
  catalogProviderIds: string[]
): CatalogEntry | undefined {
  const model = normalizeKey(modelWithoutRouteAndProvider(modelName, provider));
  if (!model || model === "unknown") {
    return undefined;
  }
  const context: CatalogRuleContext = {
    bare: normalizeKey(lastPathSegment(model)),
    catalog: prices,
    catalogProviderIds,
    model,
    provider: normalizeKey(provider)
  };
  for (const step of catalogRuleSteps) {
    const entry = step(context);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function openRouterEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const isOpenRouter = context.catalogProviderIds.includes("openrouter") || context.provider.includes("openrouter");
  return isOpenRouter ? context.catalog.get("openrouter")?.index.byKey.get(context.model) : undefined;
}

function mappedProviderEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const modelsDev = context.catalog.get("models.dev")?.index;
  for (const id of context.catalogProviderIds) {
    const entry = modelsDev?.byKey.get(normalizeKey(`${id}/${context.model}`));
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function makerEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const modelsDev = context.catalog.get("models.dev")?.index;
  if (!modelsDev) {
    return undefined;
  }
  // An offer that names its maker is priced by the maker's entry or not at
  // all here: the reseller's own price is never the maker's.
  const follow = (entry: CatalogEntry | undefined) => entry?.canonicalModelId
    ? modelsDev.byKey.get(entry.canonicalModelId)
    : entry;
  const named = context.model.includes("/") ? follow(modelsDev.byKey.get(context.model)) : undefined;
  if (named) {
    return named;
  }
  const canonicalIds = modelsDev.byBareName.get(context.bare)?.canonicalIds;
  if (canonicalIds && canonicalIds.size > 1) {
    return undefined;
  }
  const [canonicalId] = canonicalIds ?? [];
  const canonical = canonicalId ? modelsDev.byKey.get(canonicalId) : undefined;
  if (canonical) {
    return canonical;
  }
  for (const prefix of firstPartyProviderIds(context.provider)) {
    const hinted = follow(modelsDev.byKey.get(`${prefix}/${context.bare}`));
    if (hinted) {
      return hinted;
    }
  }
  return undefined;
}

function soleOfferEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const modelsDev = context.catalog.get("models.dev")?.index;
  const offers = modelsDev?.byBareName.get(context.bare);
  if (!modelsDev || !offers || offers.canonicalIds.size > 0 || offers.offerKeys.size !== 1) {
    return undefined;
  }
  const [offerKey] = offers.offerKeys;
  return modelsDev.byKey.get(offerKey);
}

function liteLlmEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const liteLlm = context.catalog.get("litellm")?.index.byKey;
  return liteLlm?.get(context.model) ?? liteLlm?.get(context.bare);
}

// byKey holds only offers with an input and an output price, not both 0.
// Ordering by price, then key, keeps the pick independent of catalog order.
function medianOfferEntry(context: CatalogRuleContext): CatalogEntry | undefined {
  const modelsDev = context.catalog.get("models.dev")?.index;
  const offers = Array.from(modelsDev?.byBareName.get(context.bare)?.offerKeys ?? [])
    .flatMap((key) => {
      const entry = modelsDev?.byKey.get(key);
      return entry ? [{ entry, key }] : [];
    })
    .sort((a, b) =>
      a.entry.pricing.inputUsdPerMillionTokens - b.entry.pricing.inputUsdPerMillionTokens ||
      a.entry.pricing.outputUsdPerMillionTokens - b.entry.pricing.outputUsdPerMillionTokens ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const median = offers[Math.floor((offers.length - 1) / 2)]?.entry;
  return median && { ...median, source: "models.dev-median" };
}

async function getPriceCatalog(): Promise<PriceCatalog> {
  if (catalog && !usagePriceCatalogNeedsRefresh()) {
    return catalog;
  }

  catalogPromise ??= loadPriceCatalog(catalog);
  try {
    catalog = await catalogPromise;
    return catalog;
  } finally {
    catalogPromise = undefined;
  }
}

const priceSources: Record<ModelPricingSource, () => Promise<PriceIndex>> = {
  litellm: fetchLiteLlmPrices,
  "models.dev": fetchModelsDevPrices,
  openrouter: fetchOpenRouterPrices
};

// Refetches only the sources that expired. A source that fails or returns no
// prices keeps its previous prices and is retried after failedSourceRetryMs.
async function loadPriceCatalog(previous: PriceCatalog | undefined): Promise<PriceCatalog> {
  const now = Date.now();
  const next: PriceCatalog = new Map();
  await Promise.all(Object.entries(priceSources).map(async ([name, fetchPrices]) => {
    const source = name as ModelPricingSource;
    const cached = previous?.get(source);
    if (cached && now < cached.expiresAt) {
      next.set(source, cached);
      return;
    }
    const result: { index: PriceIndex } | { error: string } = await fetchPrices().then(
      (index) => index.byKey.size > 0 ? { index } : { error: "the response held no prices" },
      (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })
    );
    if ("index" in result) {
      next.set(source, { expiresAt: now + catalogTtlMs, failed: false, index: result.index, loadedAt: now });
      return;
    }
    if (!cached?.failed) {
      console.warn(`[usage] Could not load prices from ${source}: ${result.error}`);
    }
    next.set(source, { expiresAt: now + failedSourceRetryMs, failed: true, index: cached?.index ?? emptyPriceIndex(), loadedAt: cached?.loadedAt });
  }));
  return next;
}

function emptyPriceIndex(): PriceIndex {
  return { byBareName: new Map(), byKey: new Map() };
}

async function fetchLiteLlmPrices(): Promise<PriceIndex> {
  const index = emptyPriceIndex();
  const payload = await fetchJson(liteLlmPricesUrl);
  if (!isRecord(payload)) {
    return index;
  }

  for (const [model, value] of Object.entries(payload)) {
    if (model === "sample_spec" || !isRecord(value)) {
      continue;
    }
    const cacheWrite = firstNumber(value, [
      "cache_creation_input_token_cost",
      "input_cache_write_cost_per_token",
      "cache_write_cost_per_token"
    ]);
    addCatalogEntry(index, normalizeKey(model), model, "litellm", {
      cacheReadUsdPerMillionTokens: perMillion(firstNumber(value, [
        "cache_read_input_token_cost",
        "input_cache_read_cost_per_token",
        "cache_read_cost_per_token"
      ])),
      cacheWrite1hUsdPerMillionTokens: perMillion(firstNumber(value, [
        "cache_creation_input_token_cost_above_1hr",
        "input_cache_write_1h"
      ])),
      cacheWriteUsdPerMillionTokens: perMillion(cacheWrite),
      inputUsdPerMillionTokens: perMillion(firstNumber(value, [
        "input_cost_per_token",
        "prompt_cost_per_token"
      ])),
      outputUsdPerMillionTokens: perMillion(firstNumber(value, [
        "output_cost_per_token",
        "completion_cost_per_token",
        "output_cost_per_reasoning_token"
      ]))
    });
  }
  return index;
}

async function fetchModelsDevPrices(): Promise<PriceIndex> {
  const index = emptyPriceIndex();
  const payload = await fetchJson(modelsDevPricesUrl);
  if (!isRecord(payload)) {
    return index;
  }

  for (const [providerId, provider] of Object.entries(payload)) {
    if (!isRecord(provider) || !isRecord(provider.models)) {
      continue;
    }
    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isRecord(model)) {
        continue;
      }
      // canonical_model_id refers to another offer's "<provider id>/<model key>".
      const key = normalizeKey(`${providerId}/${modelKey}`);
      const canonicalModelId = normalizeKey(readString(model.canonical_model_id)) || undefined;
      const bare = normalizeKey(lastPathSegment(modelKey));
      const offers = index.byBareName.get(bare) ?? { canonicalIds: new Set(), offerKeys: new Set() };
      offers.offerKeys.add(key);
      if (canonicalModelId) offers.canonicalIds.add(canonicalModelId);
      index.byBareName.set(bare, offers);
      const cost = isRecord(model.cost) ? model.cost : {};
      addCatalogEntry(index, key, readString(model.id) || modelKey, "models.dev", {
        cacheReadUsdPerMillionTokens: readNumber(cost.cache_read),
        cacheWrite1hUsdPerMillionTokens: readNumber(cost.cache_write_1h),
        cacheWrite5mUsdPerMillionTokens: readNumber(cost.cache_write_5m),
        cacheWriteUsdPerMillionTokens: readNumber(cost.cache_write),
        inputUsdPerMillionTokens: readNumber(cost.input),
        outputUsdPerMillionTokens: readNumber(cost.output)
      }, canonicalModelId);
    }
  }
  return index;
}

async function fetchOpenRouterPrices(): Promise<PriceIndex> {
  const index = emptyPriceIndex();
  const payload = await fetchJson(openRouterModelsUrl);
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return index;
  }

  for (const model of payload.data) {
    if (!isRecord(model) || !isRecord(model.pricing)) {
      continue;
    }
    const id = readString(model.id) || readString(model.canonical_slug);
    if (!id) {
      continue;
    }
    const pricing = model.pricing;
    addCatalogEntry(index, normalizeKey(id), id, "openrouter", {
      cacheReadUsdPerMillionTokens: perMillion(readNumber(pricing.input_cache_read)),
      cacheWrite1hUsdPerMillionTokens: perMillion(readNumber(pricing.input_cache_write_1h)),
      cacheWriteUsdPerMillionTokens: perMillion(readNumber(pricing.input_cache_write)),
      inputUsdPerMillionTokens: perMillion(readNumber(pricing.prompt)),
      outputUsdPerMillionTokens: perMillion(readNumber(pricing.completion))
    });
  }
  return index;
}

// An entry needs an input and an output price. One that lists both at 0 is
// "no price here" (free tiers, subscription plans), so the rule goes on.
function addCatalogEntry(
  index: PriceIndex,
  key: string,
  model: string,
  source: ModelPricingSource,
  candidate: ProviderModelPricing,
  canonicalModelId?: string
): void {
  const pricing = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined)
  ) as ProviderModelPricing;
  if (
    !key ||
    !hasCompleteProviderModelPricing(pricing) ||
    (pricing.inputUsdPerMillionTokens === 0 && pricing.outputUsdPerMillionTokens === 0)
  ) {
    return;
  }
  index.byKey.set(key, { ...(canonicalModelId ? { canonicalModelId } : {}), model: model.trim(), pricing, source });
}

// Guesses the maker from the provider's name, for a provider whose base URL maps to no catalog id.
function firstPartyProviderIds(provider: string): string[] {
  const ids = new Set<string>();
  const add = (value: string) => ids.add(value);

  if (provider.includes("openai")) add("openai");
  if (provider.includes("anthropic") || provider.includes("claude")) add("anthropic");
  if (provider.includes("gemini") || provider.includes("google")) add("google");
  if (provider.includes("deepseek")) add("deepseek");
  if (provider.includes("moonshot") || provider.includes("kimi")) add("moonshotai");
  if (provider.includes("mistral")) add("mistral");
  if (provider.includes("zhipu") || provider.includes("bigmodel") || provider.includes("glm")) add("zhipuai");
  if (provider.includes("zai") || provider.includes("z-ai") || provider.includes("z.ai")) add("z-ai");
  if (provider.includes("qwen")) add("qwen");
  if (provider.includes("alibaba") || provider.includes("bailian") || provider.includes("dashscope")) add("alibaba");
  if (provider.includes("siliconflow")) add("siliconflow");

  return Array.from(ids);
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetchWithSystemProxy(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePrice(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function divideByMillion(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 1_000_000;
}

// toPrecision drops the float noise of the conversion (0.0000008 * 1e6).
function perMillion(usdPerToken: number | undefined): number | undefined {
  return usdPerToken === undefined ? undefined : Number((usdPerToken * 1_000_000).toPrecision(12));
}

function normalizeCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeKey(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s:_]+/g, "-").replace(/-+/g, "-") ?? "";
}

function lastPathSegment(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
