# The open pricing decisions, round two, 2026-11-27

Second-round research for F-PRICE-3, F-PRICE-36 and F-PRICE-7 (group B) and F-PRICE-4, F-PRICE-5, F-PRICE-6, F-PRICE-8 and F-PRICE-9 (group C) of [`2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md). Round one is [`2026-11-27-decisions-pricing.md`](2026-11-27-decisions-pricing.md) and [`2026-11-27-zero-listed-price.md`](2026-11-27-zero-listed-price.md). No product code changed and nothing was committed.

**Run** is a script or test run today in a throwaway worktree at `v9.1.0`. **Read** is the code at `v9.1.0` or a page fetched today with plain `curl` (not a summarising tool). **Inferred** is neither. The prototypes, scripts, raw outputs and the catalogs are in `private/research/2026-11-27-decisions-round-2/pricing/`, outside git.

## Summary

| ID | Round one | Round two | When | Confidence |
|---|---|---|---|---|
| F-PRICE-3 | Option (b): a zero the request's own provider lists is `$0.00`, "Listed at no charge" | Stands, with a change: fix the provider-name strip in the same PR, or 23 of the 96 own-provider zeros it targets stay unpriced | Remediation release | High |
| F-PRICE-36 | A zero offer adds no canonical id, in the same PR | Stands. Fresh numbers match round one exactly | Remediation release, same PR | High |
| F-PRICE-7 | Option C with two corrections | Stands with a change: a positive list per maker, and Google's tier is a response header | Remediation release | Medium |
| F-PRICE-4 | Keep the dash | Stands | No change | High |
| F-PRICE-5 | Leave both rules | Stands. No documented stream can send the chunk | No change | High |
| F-PRICE-6 | Drop P-5; if it returns, read the raw trace body before changing the fork | Stands with a correction: the trace body is the upstream's own only for a stream | Never, unless he uses the discount router | High |
| F-PRICE-8 | Keep as an estimate | Stands | No change | High |
| F-PRICE-9 | Keep a reported 0 as absent | Stands | With Task 6, if ever | High |

## F-PRICE-3 and F-PRICE-36, built together

1. **Re-measure.** The three catalogs were fetched fresh at 21:20 UTC: LiteLLM, models.dev and OpenRouter's 477 models (run). The prototype is option (b) plus F-PRICE-36's option B, in three source files.
   - `pricing-service.ts`: `PriceIndex` gains `zeroKeys`, where `addCatalogEntry` now puts a 0 and 0 offer in place of dropping it. A new `ownEntry` lets `openRouterEntry` and `mappedProviderEntry` return a zero as source `listed-free`. No later step reads `zeroKeys`, so `makerEntry`, `soleOfferEntry`, `liteLlmEntry` and the median are unchanged. `fetchModelsDevPrices` adds no canonical id for a zero offer. The zero guard in `estimateUsageCostFromPricing` admits `listed-free`, and `pricingSources` gains it.
   - `contracts/app.ts`: `listedCostSources` gains `listed-free`. That is the only change the stores need. `costBasisFor` gives `listed`, the SQL in `usage/store.ts` treats it as priced, `formatCost` prints `$0.00` with no tilde, and `totalCostBasis` adds no tilde (read, then run in the new test).
   - `packages/ui/src/pages/home/shared/usage.ts`: one line in `priceSourceLabels`, "Listed at no charge". No other UI string lists sources. The two docs pages that describe the rule (`configuration/providers.md:296`, `configuration/overview.md:127`) each need a sentence.
   - Size: 25 lines added and 13 removed across the three files. One new test fails without the change and passes with it. One existing test breaks on purpose: "a catalog entry priced 0 for input and output does not stop the rule" pins the old sentence of V-21. `npm run typecheck` passes, `test:core` has that one failure in 2,551, and `test:ui` passes 336 of 336 (run).
2. **The transition table, own provider** (run). Each of the 698 live zero offers was asked for on a provider named by its catalog id with its catalog's own base URL (models.dev's `api` field, OpenRouter's URL, none for LiteLLM). Round one counted 699 on the 17:58 files.

| Transition | Count | Five examples (price before, per million input/output) |
|---|---|---|
| unpriced to free | 36 | `zhipuai glm-4.5-flash`, `openrouter baidu/ernie-5.5-flash-preview:free`, `nvidia google/diffusiongemma-26b-a4b-it`, `alibaba-cn deepseek-r1-distill-qwen-1-5b`, `zai glm-4.5-flash` |
| median estimate to free | 23 | `zhipuai-coding-plan glm-5.4` (~1.20/4.19), `zhipuai glm-4.6v-flash` (~0.02/0.22), `zai-coding-plan glm-5.4`, `nvidia poolside/laguna-xs-2.1` (~0.06/0.12), `zai glm-4.6v-flash` |
| listed price to free | 14 | `zhipuai-coding-plan glm-5.3-highspeed` (1.20/4.18), `zai-coding-plan glm-5.3-highspeed`, `nvidia stepfun-ai/step-5-preview` (1.05/2.99); only three providers |
| listed price to unpriced | 74 | `kenari solar-mini4:free` (0.1/0.4), `aihubmix qwen3.8-max-free` (2/6), `orcarouter z-ai/glm-5.3-flash-free` (0.12/0.42), `umans-ai-coding-plan umans-qwen3.6-35b-a3b` (0.375/2.25), `tokenrouter z-ai/glm-5.3-free` (1.20/4.18) |
| unchanged, unpriced | 344 | `alibaba-token-plan-cn happyhorse-1.1-i2v`, `kenari nemotron-3-ultra-550b-a55b:free`, `requesty nemotron-3.5-lightning-30b-a3b`, `poolside poolside/laguna-m.1`, `merge-gateway nvidia/nemotron-3.5-lightning-30b-a3b` |
| unchanged, listed price | 119 | `alibaba-token-plan-cn glm-5` (0.60/2.69), `volcengine-coding-plan kimi-k3` (3/15), `sensenova kimi-k3` (3/15), `obscurify deepseek/deepseek-v4-flash` (LiteLLM 0.3/1.2), `modelscope ZhipuAI/GLM-4.6` (0.6/2.2) |
| unchanged, median estimate | 88 | `alibaba-token-plan-cn deepseek-v4.1-flash-1017` (~0.27/1), `cheapllm deepseek-v4.1-flash-1017`, `llmtr poolside/laguna-xs-2.1`, `requesty muse-glimmer-30b`, `poolside poolside/laguna-s-2.1` |

   Separated (run): option B alone moves 77 own-provider offers from a listed price to unpriced and 68 bare names on a custom provider the same way, which is round one's figure exactly. Option (b) alone moves 73. Together 147, so 3 are in both, as round one said. On a custom provider (`VM Custom`, a base URL that maps to nothing) the only change over 508 bare names is the 68, from a listed price to unpriced. The table is in `r2-before.json` and `r2-after.json`, made by `zz-transition.test.mjs` and `r2-analyze.py`.
3. **What the run showed that reading had not.**
   - **A provider named like the model's first path segment loses that segment** (run). `modelWithoutRouteAndProvider` strips `<provider name>/` from the model, so a provider named `NVIDIA` asking for `nvidia/nemotron-3.5-lightning-30b-a3b` looks up `nemotron-3.5-lightning-30b-a3b`, and a provider named `OpenRouter` asking for `openrouter/free` looks up `free`. Both preset default names are exactly these (`presets/nvidia/index.ts:17`, `presets/openrouter/index.ts:51`). Renamed to `NVIDIA NIM` or `My Router`, both resolve to `listed-free`. So of the 96 zero offers on a provider the rule recognises as their own, (b) fixes 73 and the strip keeps 23 unpriced or at a median (22 on NVIDIA, plus `openrouter/free`). The strip predates 9.1.0 and touches paid models too: 101 models.dev offers have a key that starts with their own provider id, 63 of them paid, though only a preset maps a base URL to them.
   - **A catalog that lists only zeros counts as failed.** `loadPriceCatalog` treats a source with `byKey.size === 0` as "the response held no prices", and the rule then answers `no-catalog`. The first version of the test hit it. No live catalog is all zeros, so it matters only to tests and to the prototype's `zeroKeys`, which must not count towards that size (inferred).
   - **What `target.model` is** (read). `priceFor` in `pipeline.ts` calls `resolveUsagePricingTarget` with `fallbackModel: routedModel` and no `responseModel`, and `target.model` is `fallbackAttribution.model ?? input.fallbackModel`. It is the model LLM Router routed, not the one that answered. OpenRouter documents that "Requests are priced using the model that was ultimately used" and that a `:free` model followed by a paid one in `models` is billed at the paid price (`openrouter.ai/docs/guides/routing/model-fallbacks.md`, `.../model-variants/free.md`). That needs the client to send a `models` array. Under (b) such a request reads `$0.00` with no tilde. Claude Code and Codex send no `models` array (inferred). LLM Router's own model-chain fallback was not traced for pricing.
4. **Attack.**
   - The 74 that move from a listed price to unpriced lose a figure. 69 are on providers no preset maps, where the figure was another provider's paid price for a model listed free here, and 5 are `kimi-code-plan-cn`, which the preset maps to `kimi-for-coding`. A user there sees `-` and "No price found" where 9.1.0 showed a paid price with no tilde. That is the honest direction.
   - The 207 that stay wrong (119 listed, 88 median) are all on providers the rule does not recognise (run, each case's `catalogProviderIdsForBaseUrl` is empty). No change at steps 1 and 2 can reach them. Only telling the provider apart can.
   - **The simpler rule, "a zero from any catalog provider whose base URL matches the request's".** That is round one's option D, and it is not simpler. 302 of 327 models.dev providers have an `api` URL, and 4 URLs are shared by 8 providers (run). Three of the four pairs are a coding plan and the pay-as-you-go service on the same URL: `minimax` and `minimax-coding-plan`, `minimax-cn` and `minimax-cn-coding-plan`, `umans-ai` and `umans-ai-coding-plan`. On those, a match by URL cannot tell the free plan from the paid service, which is the exact error F-PRICE-3 is about. Refusing shared URLs, D would reach 151 of the 207 and 213 of the 418 left unpriced (run, models.dev offers only). It also changes paid requests: step 2 would start pricing every model on such a provider by that provider's own offer, ahead of the maker. That may well be better, and it is a change to V-21's order that needs its own measurement. Later, and his call.
   - **Upgrade from 9.1.0.** Rows already stored as `unpriced` keep the dash. Nothing re-prices them (read, round one). A downgrade to 9.1.0 shows a `listed-free` row's source as "Not recorded" and its `$0.00` cost stays (inferred).
5. **Outside facts.** OpenRouter's `:free` page says the variant "appears as its own entry in the models API with its own pricing" and warns that fallbacks to paid models are billed (read). 13 OpenRouter models list 0 and 0; two are `google/lyria-3-*-preview` with audio output and no other price field, so whether they are free is still unknown (run).
6. **Verdict.** Both stand, as one PR in the remediation release. Add the strip fix to it, scoped to the pricing lookup: try the model as sent before the stripped form, or strip only when the provider's own model list holds the stripped name (inferred, not built). Without it the preset users (b) is for, NVIDIA and OpenRouter by their default names, see no change for 23 models. Confidence high. A live catalog where a zero offer on a preset's own id is not free would change my mind.

## F-PRICE-6. A provider's reported cost

1. **Re-measure.** Round one's option B said `usage.cost` "is in a body LLM Router parses today, translated request or not". It was read. I ran it.
   - Harness: the real `gatewayService` in both layouts, with the built gateway child `@the-next-ai/ai-gateway` 1.0.22-llmr.4, against a loopback mock. Providers `My OpenRouter` (`openai_chat_completions`) and `Anthro` (`anthropic_messages`). The chat completion carries `usage.cost: 0.0123`, `is_byok`, `cost_details` and a top-level `service_tier: "priority"`. A stream puts `usage` in a last chunk with `choices: []`. The Anthropic message carries `usage.service_tier: "priority"` and `usage.speed: "fast"`. A temporary hook in `extractUsageFromBody` logged every body LLM Router parses, with its caller. Each mock reply carries its request number in the text, so every parsed body is tied to its request. Test: `zz-reported-fields-wire.test.mjs`; hook: `wire-body-log-hook.patch`; output: `r2-bodies.jsonl`, `r2-wire-analyze.py`.
   - Result, for `usage.cost` (run). Y means the field is in the body that writer parsed.

| Request | Single layout, usage row and Logs | Compatibility layout, usage row | Compatibility layout, Logs after the trace |
|---|---|---|---|
| chat completions to OpenRouter | Y | Y | Y |
| the same, streamed | Y | Y | Y |
| Anthropic messages to OpenRouter (translated) | no | no | no |
| the same, streamed | Y | no | Y |

   - So the raw trace body is the upstream's own only for a stream, read from the `response_stream` part. For a non-streaming request the trace's body (`upstream_response`) is the gateway's translated reply. In the compatibility layout the usage row is written by the host from the body the client got, so only Logs learns the cost of a translated stream, and the two tables would disagree.
2. **Outside facts** (read, `openrouter.ai/docs/cookbook/administration/usage-accounting.md`, where the old address now redirects). Usage is returned on every response with no parameter. `include_usage` and `usage: { include: true }` are deprecated and do nothing. `cost` is "The total amount charged to your account". The page says cost is "in credits" and its examples print "credits". The chat completions example is a `chat.completion.chunk` with `cost` and `cost_details` and no `is_byok`. Only the Responses example shows `is_byok`. So Task 6's guard on `is_byok: true` rests on a field the chat completions example does not show (read). The page names Anthropic Messages only for `deferred_tools_details`, so whether OpenRouter's messages endpoint carries `cost` is still not stated.
3. **Where Task 6 would read it.** In `extractUsageSnapshot` in `usage/response-usage.ts`, one field on `ResponseUsage` beside `reasoningTokens`. For Claude Code to OpenRouter, which streams, the single layout then has the cost in both stores with no other read. The compatibility layout needs the usage row corrected from the trace, which Task 6 does not plan, and a non-streaming translated request needs the fork either way.
4. **Attack.** Round one's B is half right. It holds for streams in the single layout, which LLM Router uses whenever no feature needs the compatibility layout. It fails for non-streaming translated requests and for the compatibility usage row. Dropping P-5 remains the cheaper honest answer.
5. **Verdict.** Stands, with Task 6's Open question 2 corrected to this table. If he wants the charged figure, build Task 6 for streams first, then decide whether the remaining cases justify the fork. High.

## F-PRICE-7. A priority or flex request

1. **Re-measure the facts round one gave** (read, fetched with `curl` from each provider's markdown docs).
   - **OpenAI.** Confirmed. "Priority processing was renamed Fast mode on July 30, 2026", and `service_tier` accepts `priority` and `fast` (`developers.openai.com/api/docs/guides/priority-processing.md`, which now opens "# Fast mode"). The response's `service_tier` "identifies the tier used". A request downgraded by the ramp limit gets `default` and standard rates. For GPT-5.6 and earlier a `fast` request reports `priority`. The Chat Completions reference lists response values `auto`, `default`, `flex`, `scale`, `priority` and `fast`. `ultrafast` exists for four GPT-6 models. Flex is being wound down and is absent on GPT-6.2. New: background mode's discounted 2-hour and 8-hour windows (30% and more below standard) require `service_tier: "default"`, so a tier rule cannot see that discount (`.../guides/background.md`).
   - **Anthropic.** Confirmed. Service tiers are "legacy", and Priority Tier commitments "are no longer available for purchase". The Messages reference gives the response `usage.service_tier` as `"standard" or "priority" or "batch" or null`, and its example shows `"service_tier": "standard", "speed": "standard"`. `usage.speed` is `"fast"` or `"standard"`. Fast mode is a multiplier on standard rates: Opus 5.5 at $8 and $40, Fable 5.2 and Mythos 5.2 at $16 and $80 (`platform.claude.com/docs/en/api/messages/create.md`, `.../build-with-claude/fast-mode.md`).
   - **Google.** Corrected. Priority and Flex are set by `service_tier` on the Interactions API, and the tier that served a request comes back in the `x-gemini-service-tier` response header. A Priority request over its limit is downgraded to Standard and billed at the standard rate. Priority costs "75-100% more than Standard" and Flex 50% less (`ai.google.dev/gemini-api/docs/priority-inference.md.txt`, `flex-inference.md.txt`). LLM Router routes `gemini_interactions` (read, `routing/protocol-endpoints.ts:17`).
2. **Does the gateway keep the fields?** The same run as F-PRICE-6 (run). Same protocol, both layouts: `service_tier` and `usage.speed` reach every writer. Translated and not streamed: lost in every writer. Translated and streamed: kept in the single layout, lost in the compatibility usage row, and in Logs only through the trace. For chat completions to the Anthropic mock in the compatibility layout, no trace update arrived within 12 seconds, so Logs kept the translated body there.
3. **Option C, restated.** Mark a request's cost as an estimate when the response reports a tier priced differently from standard and the price has no figure for it. A positive list per maker:
   - OpenAI: top-level `service_tier` is `priority`, `fast`, `flex` or `ultrafast`. `default`, `auto`, `scale` and an absent field leave the cost as it is.
   - Anthropic: `usage.speed` is `"fast"`. `usage.service_tier` is ignored. `standard` is the ordinary value, `priority` is a prepaid commitment no longer sold, and `batch` does not pass through LLM Router's proxy routes (inferred).
   - Google: the `x-gemini-service-tier` response header is `priority` or `flex`. Whether the gateway passes that header on was not checked.
   - The limit, stated in the task: a translated request that is not streamed loses the field, so its cost stays unmarked. A positive list fails quiet on a new tier name, where a negative list would put a tilde on every Anthropic request.
4. **Attack.** C still never shows the right number, and B would need LiteLLM's tier fields, which do not cover Claude fast mode. "Do nothing" leaves a fast request at half its cost with no tilde, and both of the owner's agents offer fast modes. C is still the smallest honest change.
5. **Verdict.** Stands with the change above, in the remediation release, as Task 8's settled parts plus the three readers. Medium, because the Google header path and the gateway's header pass-through were not run.

## F-PRICE-5. Two rules for a reasoning-only chunk

1. **Re-measure.** `extractUsageSnapshot` counts a reasoning figure from `output_tokens_details.reasoning_tokens`, `thinking_tokens`, `usage.reasoning_tokens` or `usage.thinking_tokens` (read). Gemini's `usageMetadata` path reads no reasoning field, so Gemini cannot produce the case.
2. **Outside facts** (read). OpenAI Chat Completions: the usage chunk arrives "before the `data: [DONE]` message" with `choices` empty, and `CompletionUsage` always has `completion_tokens`, `prompt_tokens` and `total_tokens`. Anthropic: `MessageDeltaUsage.output_tokens` is a required number, and the new `output_tokens_details.thinking_tokens` sits beside it. xAI Responses: usage only on `response.completed`, with `input_tokens` and `output_tokens`. OpenRouter: the chunk example carries both counts.
3. **Repo fixtures** (read). Only two synthetic fixtures send such a chunk, in `response-usage.test.mjs:36` and `usage-store.test.mjs:468`, and they exist to pin the split.
4. **Verdict.** Stands. No documented stream sends it today. High.

## F-PRICE-4 and F-PRICE-8

- **F-PRICE-4** (read). Confirmed: `costBasisFor` returns no basis when `billableTokens <= 0`, and `formatCost` prints `-`. The prototype makes `$0.00` mean "listed at no charge", which is one more reason not to print it for a request with no tokens. A `listed-free` request with no tokens still shows `-`, because `estimateUsageCost` returns nothing without billable usage. Stands.
- **F-PRICE-8** (read). Confirmed: `billing-sync.ts:179` stores `gateway_billing`, which is not in `listedCostSources`, and `authoritativeUsageCost` drops a 0 when no rate is configured. Nothing above argues against it. Stands.

## F-PRICE-9. A reported 0 counts as absent

Stands (read). With F-PRICE-3's prototype, a reported 0 on an OpenRouter `:free` request falls to the rule, which then gives the same `$0.00` under `listed-free`. A BYOK request inside the allowance can report 0 and still cost the user upstream, so storing a reported 0 would be wrong there. When Task 6 is built, its stated reason should name BYOK, not V-21.

## New findings

1. **The provider-name strip** in `modelWithoutRouteAndProvider` (F-PRICE-3, section 3). Old, small, and in the way of (b) for the NVIDIA and OpenRouter presets.
2. **The raw trace body is the gateway's translated reply for a non-streaming request** (F-PRICE-6). Anything that plans to read upstream fields from the trace, P-5 or P-4, has this limit.
3. **A non-streaming translated reply drops `usage.cost`, `service_tier` and `usage.speed` from what the client receives** (run). A client that reads its own tier or cost through LLM Router loses it.
4. **The docs row "Cost shows `$0.00`" in `configuration/overview.md:127`** describes 9.0.0. Since 9.1.0 an unpriced request shows `-` (read on `main`).
5. **OpenAI's background discount windows are reported as `default`.** No tier rule can mark them (read).

## Still not checked

- Whether the gateway passes Google's `x-gemini-service-tier` header to LLM Router. A mock Interactions upstream in the same harness would settle it.
- Whether OpenRouter's Anthropic-compatible messages endpoint returns `usage.cost`, and what `cost` is on a `:free` model. Both need a request with a key.
- Why no trace update reached Logs for chat completions to an Anthropic upstream in the compatibility layout within 12 seconds. A longer wait in `zz-reported-fields-wire.test.mjs` would show whether it is slow or absent.
- How LLM Router's own model-chain fallback picks the model a request is priced by.
- Whether OpenRouter's two Lyria previews are free.
- Option D's effect on paid requests. It needs the same before-and-after run over every paid offer on a provider whose `api` URL is unique.
- One run, `npm run test:core` in the worktree, used the real `HOME` before I set `env -i`. The checksums of `~/.codex/config.toml` and `~/.claude/settings.json` were the same before and after, and nothing under `~/.llm-router` changed. `~/.codex/tmp/arg0-macos` changed at 16:32 local time. That folder belongs to the Codex CLI, so another session probably wrote it, but that is not proven. Every other run used `env -i` and a temp home.
