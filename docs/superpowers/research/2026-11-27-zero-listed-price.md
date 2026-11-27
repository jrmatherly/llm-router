# A model the catalog lists at zero, 2026-11-27

Research for finding F-PRICE-3 in [`2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md). The owner decides. No product code changed.

## Recommendation

**Option (b), with "marks the model as free" defined by the rule and not by a name.** A listed price of 0 and 0 counts as a price only when it is the offer of the provider the request went to, which is step 1 (OpenRouter's own entry) and step 2 (the mapped catalog provider) of `catalogRuleSteps`. The request stores a cost of 0 under a source of its own, shows `$0.00`, reads "Listed at no charge", and the rule stops there. A zero found at any later step (maker, sole offer, LiteLLM, median) stays "no price here", as today.

**The reason in one sentence.** A zero is true only for the provider that lists it, and of the 744 bundled zero offers 275 are for a model that costs money somewhere else, so honouring every zero would turn paid requests into `$0.00` while honouring none makes the one case that is certainly free read as a missing price.

This changes the last sentence of V-21 ("Only a price the user set can yield a cost of 0"). That sentence is the plan author's and not the owner's, by V-21's own row (read, `plans/completed/2026-11-21-v8-clean-vm-fixes.md:46`). Its stated reason was that 38 of 312 providers list every model at 0 and a stored 0 from them "would be permanent and labelled as a price" (read, same file, Step 6). PR 177 removed half of that reason, since a stored row now carries its basis and a label.

A second fault was found on the way and is not part of this decision. See "Gaps" 1.

## The options

| | (a) Keep as built | (b) Own-provider zero is `$0.00` | (c) Every listed zero is `$0.00` | (d) Keep the dash, change the words |
|---|---|---|---|---|
| OpenRouter `:free` request | `-`, "No price found" | `$0.00`, "Listed at no charge" | `$0.00` | `-`, "Listed at no charge" |
| Subscription plan on a preset (Z.AI coding plan) | a maker's price or `-` (run) | `$0.00`, "Listed at no charge" | `$0.00` | `-` or a maker's price |
| Same model name on a custom provider | paid price or `-` | unchanged | `$0.00` for 55 names that have a paid price today (run) | unchanged |
| Totals | tilde, "N requests without a price" | no tilde, not counted | no tilde | tilde stays, or a third caption part |
| Rule | unchanged | steps 1 and 2 may return a zero | every step may, and the median includes zeros | a new outcome with no cost |
| V-21 | holds | last sentence changes | last sentence removed | holds |
| Size | none | small, core and one label | smaller in code, wrong for users | as large as (b), without the number |
| Live zero offers it changes | 0 | 80 on 8 presets (run) | all 699 | at most the same 80 |

## How this was checked

- **Run** is a script's output on 2026-11-27. **Read** is the code at `main` `b504d153` or a fetched page. **Inferred** is neither.
- The bundled `packages/core/models.json` was generated on 2026-11-17 (read, its `generatedAt`).
- The three live catalogs were fetched once at 17:58 UTC with plain GETs and a generic client name. LiteLLM 7,190 entries, models.dev 10,084 offers on 327 providers, OpenRouter 477 models (run).
- The built rule was run on the live files. `pricing-service.ts` was bundled with esbuild into the scratch folder, `fetch` was replaced by a reader of the saved files, and `HOME` was a temp folder. Nothing in the repo or the real home was written (run, `git status` and a `find -mmin` over the app's folders).
- Scripts and saved catalogs are in the session scratch folder, which a reboot clears. The classifier is in this note. The two resolver scripts are described where their numbers appear.

## 1. Who are the 758

The audit's figure reproduces (run). 14,084 bundled offers hold an input or an output price, and 758 of them hold nothing above 0. Of those, 744 list both sides at 0, which is the case the rule's filter in `addCatalogEntry` tests. The other 14 lack one side and are dropped as incomplete for a different reason. By catalog the 744 are models.dev 584, LiteLLM 143 and OpenRouter 17.

The classes below are the script's. The first match wins, in the order of the table. Only `free-by-id` and `plan-billed` rest on something the catalog itself says (a name). `provider-free-tier` rests on a list of providers the author knows to have a free tier, so it is inferred.

| Class | What the zero means | Count | LiteLLM | models.dev | OpenRouter | Paid elsewhere | Five examples |
|---|---|---|---|---|---|---|---|
| free-by-id | The id says free (`:free`, `-free`) | 156 | 2 | 139 | 15 | 0 | `opencode-go minimax-m3.1-flash-free`, `opencode_go beam-free`, `kilo cohere/north-mini-code:free`, `commandcode reflection/beam:free`, `bothub gemma-4-31b-it:free` |
| plan-billed | The provider id is a subscription or plan, so the fee is not per token | 231 | 1 | 230 | 0 | 148 | `kimi-code-plan-cn k3`, `minimax-coding-plan MiniMax-M2`, `minimax-cn-coding-plan MiniMax-M2`, `microsoft_365_copilot chat`, `gitlab duo-chat-fable-5` |
| local-or-self-hosted | The user runs it, or pays for the machine | 59 | 40 | 19 | 0 | 18 | `ollama qwen3-coder:480b-cloud`, `lemonade Qwen3-4B-Instruct-2507-GGUF`, `lmstudio qwen/qwen3-30b-a3b-2507`, `nan qwen3.6`, `atomic-chat Qwen3_5-9B-MLX-4bit` |
| other-unit | Billed per query, image, second or page, or a rerank, embedding, audio or moderation model | 94 | 59 | 33 | 2 | 9 | `azure_ai cohere-rerank-v4.0-fast`, `bedrock amazon.rerank-v1:0`, `ovhcloud qwen3guard-gen-0.6b`, `cortecs qwen3guard-gen-0.6b`, `inferx Qwen3-Embedding-8B` |
| preview | Preview, experimental, alpha, beta or labs in the name | 14 | 4 | 10 | 0 | 5 | `regolo-ai brick-v1-beta`, `nvidia flux_1-kontext-dev`, `mistral labs-devstral-small-2512`, `gemini gemini-exp-1114`, `amd DeepSeek-V4-Flash-Vision-Exp` |
| router-alias | A router's own alias, priced by the model it picks | 7 | 0 | 7 | 0 | 3 | `orcarouter auto`, `nano-gpt auto-model`, `lynkr lynkr-auto`, `llmgateway auto`, `kilo openrouter/auto` |
| provider-free-tier | A provider with a free tier, no marker in the id (inferred) | 83 | 21 | 62 | 0 | 46 | `kilo humansand/ampersand-v0.1`, `groq allam-2-7b`, `gemini gemma-4-26b-a4b-it`, `google gemma-4-26b-a4b-it`, `siliconflow-cn Qwen/Qwen2.5-7B-Instruct` |
| unexplained | Nothing in the record says why. A missing price entered as 0 would land here | 100 | 16 | 84 | 0 | 46 | `cohere_chat command-a-plus-05-2026`, `nova nova-2-lite-v1`, `iteracompute qwen/qwen3.8-27b`, `hetzner Qwen/Qwen3.6-35B-A3B-FP8`, `agnes agnes-2.0-flash` |

A missing price entered as 0 cannot be told from a free model by the record alone, so that class has no count of its own. Its upper bound is the 100 unexplained.

```python
# Classifies the offers a bundled models.json lists at 0 input and 0 output.
# Usage: python3 zero_offers.py packages/core/models.json
import collections, json, re, sys

TOKEN_KEYS = {"source", "provider", "model", "sourceUrl", "sourceUnit", "per1MTokens", "extra", "tiered", "other"}
OTHER_MODES = {"rerank", "embedding", "image_generation", "audio_transcription", "audio_speech", "moderation", "evaluation"}
LOCAL = {"ollama", "lmstudio", "lemonade", "atomic-chat", "qvac", "sagemaker", "nan"}
PLAN = re.compile(r"plan|^opencode[-_]go$|^gitlab$|copilot|^poe$")
FREE_ID = re.compile(r"(:free|[-/_]free)(\b|$)", re.I)
ROUTER_ALIAS = re.compile(r"(^|/)(auto|auto-model|custom|free|lynkr-auto|nano-gpt-help)$", re.I)
OTHER_NAME = re.compile(r"rerank|embed|whisper|transcribe|tts|voice|image|i2v|t2v|r2v|lyria|ocr|guard|moderation|mini_lm", re.I)
PREVIEW = re.compile(r"preview|(^|[-/_])(exp|experimental|alpha|beta|labs)([-/_]|$)", re.I)
# Providers the author knows to serve these models free on a rate-limited tier. No catalog field says so.
FREE_TIER = {"nvidia", "nvidia_nim", "modelscope", "gemini", "google", "publicai", "cloudflare", "groq", "zai", "zhipuai",
             "siliconflow-cn", "codestral", "text-completion-codestral", "mistral", "openrouter", "kilo", "opencode"}


def classify(offer, mode):  # first match wins
    provider, model = offer["provider"], offer["model"]
    if FREE_ID.search(model): return "free-by-id"
    if PLAN.search(provider): return "plan-billed"
    if provider in LOCAL: return "local-or-self-hosted"
    if ROUTER_ALIAS.search(model): return "router-alias"
    if any(key not in TOKEN_KEYS for key in offer) or mode in OTHER_MODES or OTHER_NAME.search(model): return "other-unit"
    if PREVIEW.search(model): return "preview"
    if provider in FREE_TIER: return "provider-free-tier"
    return "unexplained"


def bare(value):  # the rule's normalizeKey over the last path segment
    return re.sub(r"-+", "-", re.sub(r"[\s:_]+", "-", value.strip("/").split("/")[-1].strip().lower()))


models = json.load(open(sys.argv[1]))["models"]
offers = [(m, o) for m in models for o in (m.get("pricing") or {}).get("offers", [])]
tokens = lambda o: o.get("per1MTokens") or {}
complete = [(m, o) for m, o in offers if "input" in tokens(o) and "output" in tokens(o)]
is_zero = lambda o: tokens(o)["input"] == 0 and tokens(o)["output"] == 0
zero = [(m, o) for m, o in complete if is_zero(o)]
audit = [o for m, o in offers if {"input", "output"} & set(tokens(o))]
print(f"offers {len(offers)}; with input or output {len(audit)}, none above 0 in {sum(1 for o in audit if not tokens(o).get('input') and not tokens(o).get('output'))}; "
      f"with both {len(complete)}, zero on both {len(zero)}")

classes = collections.defaultdict(list)
for m, o in zero:
    classes[classify(o, m.get("mode"))].append(o)
assert sum(len(v) for v in classes.values()) == len(zero)
paid_by_bare = collections.defaultdict(set)
for m, o in complete:
    if not is_zero(o): paid_by_bare[bare(o["model"])].add(o["source"])
for name, items in sorted(classes.items(), key=lambda kv: -len(kv[1])):
    by_source = collections.Counter(o["source"] for o in items)
    paid_elsewhere = sum(1 for o in items if paid_by_bare.get(bare(o["model"])))
    examples = list({o["provider"]: f'{o["provider"]} {o["model"]}' for o in reversed(items)}.values())[-5:]
    print(f'{name}: {len(items)} (litellm {by_source["litellm"]}, models.dev {by_source["models.dev"]}, openrouter {by_source["openrouter"]}), '
          f'{paid_elsewhere} with a paid offer under the same bare name. ' + "; ".join(examples))

same_record = sum(1 for m, o in zero if any("input" in tokens(p) and "output" in tokens(p) and not is_zero(p) for p in m["pricing"]["offers"]))
same_bare = [o for m, o in zero if paid_by_bare.get(bare(o["model"]))]
other_catalog = sum(1 for o in same_bare if paid_by_bare[bare(o["model"])] - {o["source"]})
names = {bare(o["model"]) for m, o in zero}
print(f"zero offers with a paid offer in the same merged record {same_record}; under the same bare name {len(same_bare)} "
      f"({other_catalog} of them paid in another catalog); bare names {len(names)}, also paid somewhere {len(names & set(paid_by_bare))}")
```

## 2. What a zero means in each catalog today

No catalog has a field that says "free" (run, a key census of all three live files).

- **OpenRouter models API.** `pricing.prompt` and `pricing.completion` are strings and present on all 477 models. 13 are `"0"` on both. 10 of the 13 end in `:free`, and every `:free` id is zero. The other 3 are `google/lyria-3-pro-preview`, `google/lyria-3-clip-preview` and the router `openrouter/free`. 5 router models carry `"-1"`, which `readNumber` rejects, so they get no entry (run and read). OpenRouter documents `:free` as a catalog variant that is "its own entry" in the models API with its own pricing (read, `openrouter.ai/docs/guides/routing/model-variants/free.md`). So on OpenRouter the suffix is a reliable marker and a zero is a statement of price. The same page warns that a fallback from a `:free` model to a paid one is billed.
- **models.dev `api.json`.** `cost` is absent on 463 offers and present with `input` and `output` on 9,621, of which 534 are 0 and 0. So "unknown" and "zero" are distinct in the data. The README lists `cost.input` and `cost.output` as plain numbers and says nothing on what 0 means (read, `sst/models.dev` README). A zero carries no marker. 137 of the 534 have "free" in the model key, 120 have `status: "deprecated"`, and 38 of the 78 providers with a zero offer list every model at zero, which are the plan and local providers (run). One offer with "free" in its key is paid.
- **LiteLLM `model_prices_and_context_window.json`.** 2,150 entries have no token price key, mostly image and video models, and 151 list both at 0. So a missing key is "not token priced" and an explicit 0 is deliberate. But the 151 mix local runtimes (`ollama` 29), free tiers (`gemini` 12), and models billed by another unit. 26 of the 151 carry a non-zero cost in another field, such as a per-query price (run). LiteLLM's own docs treat an entry with every rate at 0 as "free" (read, section 5).

## 3. How often a listed zero is wrong

Bundled file, by the classifier script (run).

- 275 of the 744 zero offers share a bare model name with an offer that has a real price. 228 of those have the paid offer in a different catalog. As names, 138 of 493.
- 215 have the paid offer inside the same merged model record.
- By class, 148 of the 275 are plan-billed, 46 provider-free-tier, 46 unexplained, 18 local, 9 other-unit, 5 preview, 3 router-alias and 0 free-by-id.
- Only 1 offer is zero and paid for the same provider and model. LiteLLM lists `gemini/gemini-exp-1206` at 0 and `gemini-exp-1206` at 0.3 and 2.5.

So a zero almost never contradicts another listing for the same provider. It is wrong when it is carried to a different provider, which is what the later rule steps do. That is the case for limiting a zero to steps 1 and 2.

## 4. What each option changes

Symbols are in `packages/core/src/models/pricing-service.ts` unless named. No code is written here.

**(a) Keep as built.** Nothing changes. A request to OpenRouter `:free` shows `-` and "No price found", counts in "N requests without a price", and puts a tilde on every total that holds it (read, `totalCostBasis` in `contracts/app.ts`). 9.0.0's `$0.00` was not information either, since `formatUsdCost` printed it for every missing cost (read, the pricing plan's Task 5).

**(b) Own-provider zero is `$0.00`.**
- `addCatalogEntry` keeps a 0 and 0 offer, marked, in place of dropping it. `openRouterEntry` and `mappedProviderEntry` may return it. `makerEntry`, `soleOfferEntry`, `liteLlmEntry` and `medianOfferEntry` must not see it, and `medianOfferEntry`'s comment states that `byKey` holds no zero.
- The guard in `estimateUsageCostFromPricing` (`amountUsd === 0 && source !== "custom"`) admits the new source. `CatalogPricingSource`, `pricingSources` and `UsagePricingSource` gain it.
- If the new source joins `listedCostSources` in `contracts/app.ts`, then `costBasisFor`, the SQL in `usage/store.ts` near line 999 and `formatCost` need no change. The row is "listed", shows `$0.00`, counts as priced and adds no tilde.
- One new line in `priceSourceLabels` (`packages/ui/src/pages/home/shared/usage.ts`), for example "Listed at no charge".
- A stored 0 is not NULL, so both back-fills skip it (read, `usage/store.ts:339`). The request is still priced once and by rule.
- A subscription user on a preset whose catalog entry is all zeros sees `$0.00` and "Listed at no charge", which is true per request. A user on a local model sees no change and still sets a user price of 0.
- Rows already stored as `unpriced` keep the dash. Nothing re-prices them.
- Reach, on the live catalogs: 80 zero offers sit on a base URL that maps to their own catalog id, on 8 presets. `nvidia` 41, `openrouter` 13, `zai-coding-plan` 8, `zhipuai-coding-plan` 5, `siliconflow-cn` 5, `zai` 3, `zhipuai` 3, `alibaba-cn` 2 (run, `catalogProviderIdsForBaseUrl` over each models.dev provider's `api`).

**(c) Every listed zero is `$0.00`.** Remove the filter in `addCatalogEntry` and the guard. Measured with a patched scratch copy of the built rule, over the 2,934 model names in live models.dev on a custom provider that maps to no catalog id (run). 55 names that have a paid price today become `$0.00`, among them `gemma-4-31b-it`, `glm-4.7-flash` and `laguna-xs-2.1`. 181 names go from unpriced to `$0.00`, 109 of them through the median. A median of zero is an estimate of free, shown with a tilde. This is the outcome V-21's Step 6 was written to prevent.

**(d) Keep the dash, change the words.** The rule returns one `unpriced` state for "no offer" and "a zero offer", so new words need a new outcome and a new `cost_source` with a NULL cost, plus the label. That is the plumbing of (b) without the number. Totals keep the tilde unless `totalCostBasis` and `totalCostCaption` learn a third kind of request. V-21 holds.

## 5. What comparable tools do

- **LiteLLM proxy.** A model whose every rate is 0 is free by definition. Its docs say a request that prices to 0 on an entry with a non-zero rate is flagged, and that free models, where every rate the request used is 0, are not flagged. To fix a missing key they say to set the rate "or set every rate to 0 to mark the model free" (read, `docs.litellm.ai/docs/proxy/cost_tracking`). The custom pricing page has a "Zero-Cost Models" section for on-premises and free models (read, `docs.litellm.ai/docs/proxy/custom_pricing`). So LiteLLM is option (c), and it tells free from missing by an absent key.
- **OpenRouter.** The API returns the charge itself in `usage.cost`, "the total amount charged to your account" (read, `openrouter.ai/docs/use-cases/usage-accounting.md`). It does not estimate. What its activity page prints for a free request was not fetched.
- **Langfuse.** Cost is ingested or inferred from a matching model definition. With no match the documented result is "No match, no inferred cost", and the UI shows "no cost" on the generation (read, `langfuse.com/docs/observability/features/token-and-cost-tracking`). That is the dash. The page does not say how a definition priced at 0 displays.
- **Helicone.** A model it cannot price shows "cost not supported" (read, `docs.helicone.ai/guides/cookbooks/cost-tracking`). The page does not cover free models.

Langfuse and Helicone show a missing price as words and not as a number. LiteLLM stores a spend of 0 for a missing rate and flags it, and treats an all-zero entry as free without a flag.

## 6. Gaps

1. **Today 318 of the 699 live zero offers get a paid price, and 207 of those read as a list price with no tilde** (run, the built rule asked for each zero offer on its own provider). The finding's text, "reads No price found", holds for the other 381. Examples of the 207. `opencode minimax-m2.5-free` at 0.3 and 1.2, `unorouter glm-5.2:free` at 1.195 and 4.183, `gitlab duo-chat-opus-5-5` at 4 and 20, all labelled "models.dev list price". 32 of the 207 have "free" in the id and 137 are on a plan provider. Cause (read, then inferred). `fetchModelsDevPrices` records an offer's `canonical_model_id` and key in `byBareName` before `addCatalogEntry` drops the zero, so `makerEntry` follows the free offer to its maker's paid entry. Option (b) fixes it only for the 80 offers on a mapped preset. The rest need their own decision, and it is the larger fault.
2. **The sole-offer step counts zero offers.** `soleOfferEntry` tests `offerKeys.size`, which includes dropped zeros, so one paid offer beside one free offer is not "sole" and falls to LiteLLM or the median (read).
3. **A priced request can still come to 0.** The guard returns no cost when the amount is 0 for a catalog source. A request of only cache-read tokens on an offer with `cache_read: 0` does that, and 5 live models.dev offers have a paid input and a zero cache read. 75 live models.dev offers and 220 LiteLLM entries are zero on one side only. Such a row would have no cost and an empty `cost_source`, so it reads "Not priced yet" and the sweep takes it up again each time (inferred from `usage/store.ts:247`, not run).
4. **A user price of 0 works** and is the way to mark a local model free. `resolveRequestPrice` returns it first and the guard exempts `custom` (read, and the plan's "user zero" test). A user price with one side missing is ignored whole, which is F-PRICE-31.
5. **An OpenRouter `:free` request can be billed** when a fallback list names a paid model (read, OpenRouter's page). `resolveRequestPrice` is called with `target.model` in `pipeline.ts:290`. Whether that is the requested or the answering model was not traced.
6. **Router aliases at zero are wrong zeros.** models.dev lists `openrouter/auto` under `kilo` at 0 and 0. Under (b) they show `$0.00` only for a mapped preset, and none of the 7 bundled aliases is on one of the 8 presets above (run for the presets, inferred for the join).

## Not checked

- No option was built, and no UI was opened. The label text and the `listedCostSources` shortcut in (b) are read from the code, not run.
- The classes "provider-free-tier" and "unexplained" rest on the author's provider list. No provider's pricing page was fetched to confirm a free tier.
- Whether the two Lyria previews on OpenRouter are free or billed by another unit.
- The live classification by class. Section 1 is the bundled file, as asked. The live totals in section 2 and the resolver runs are live.
- The resolver runs used one provider per request with the catalog's own `api` URL. A user's real provider names can reach `firstPartyProviderIds`, which the run did not vary.
- OpenRouter's activity page, Helicone's cost code and LiteLLM's code path for an unmapped model. Only the pages cited were read.
- The reported-cost path (`usage.cost` from OpenRouter). The pricing plan says a reported 0 counts as absent, and this note did not test it.
