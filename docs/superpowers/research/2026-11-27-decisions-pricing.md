# The open pricing decisions, 2026-11-27

Research for the rows F-PRICE-4 to F-PRICE-9, F-PRICE-34 and F-PRICE-36 of [`2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md). The owner decides each. No product code changed. F-PRICE-3 is in [`2026-11-27-zero-listed-price.md`](2026-11-27-zero-listed-price.md), and nothing here disagrees with it.

**Run** is a script's output today. **Read** is the code at `main` `b45e25c5`, the fork at `v1.0.22-llmr.4` plus one commit, or a page fetched today. **Inferred** is neither. The catalog runs use the three live catalogs the F-PRICE-3 researcher saved at 17:58 UTC and the same bundle of `pricing-service.ts`, which matches `main` (read, the bundle holds PR 178's tier code). Each run used `env -i` and a temp home.

## Summary

| ID | Question | Recommendation | When | Confidence |
|---|---|---|---|---|
| F-PRICE-4 | Keep the dash for a request with no tokens? | Yes, as built | No change | High |
| F-PRICE-5 | Give both stores one usage rule now? | No, leave both | No change | Medium |
| F-PRICE-6 | Change the fork to carry a reported cost? | No. Drop P-5 for now. If it comes back, the fork may not be needed | Never, unless he uses the discount router | High |
| F-PRICE-7 | Accept option C for a priority or flex request? | Yes, with two corrections to its wording | Remediation release | Medium |
| F-PRICE-8 | Keep a gateway billing cost as an estimate? | Yes | No change | High |
| F-PRICE-9 | Keep a reported cost of 0 as absent? | Yes | With Task 6, if ever | High |
| F-PRICE-34 | Rename "Estimated cost" to "Cost"? | Yes | Before 9.1.0 if a PR is still open, else remediation | High |
| F-PRICE-36 | Should a zero offer stop the rule from following its canonical id? | Yes, in the same PR as F-PRICE-3's answer. It fixes 77 of the 207, and 88 with F-PRICE-3 (b) | Remediation release | Medium |

Only F-PRICE-34 and F-PRICE-36 differ from the row's default, and both defaults are "no change until he answers".

## F-PRICE-4. A request with no tokens shows a dash

1. **Still true** (read). `costBasisFor` in `packages/core/src/contracts/app.ts` returns no basis when `billableTokens <= 0`, the cost is then undefined, and `formatCost` in `packages/ui/src/pages/home/shared/usage.ts` prints `-` for an undefined cost and for the basis `unknown` alike.
2. **Weight.** The dash appears in Logs detail (`network-logs.tsx:1052`), the Agent requests table (`dashboard.tsx:4759`), the agent runs table (`:5479`) and the trace node (`:5690`). In Logs detail the two states differ, because the "Price source" line is drawn only when a basis exists. A request with no tokens shows `-` and no source line. An unpriced one shows `-` and "No price found" or "Not priced yet". In the three Agent Analysis places nothing tells them apart. Totals are not affected, since `usageTotalsSelect` counts a request as unpriced only when it has billable tokens (read, `usage/store.ts`). Who has such rows was not counted. Failed requests, cancelled streams and token-count calls are the likely ones (inferred).
3. **Outside facts.** Langfuse and Helicone show words, not a number, for a cost they cannot state (read, the F-PRICE-3 note, section 5).
4. **Options.** (a) Keep. (b) Print `$0.00` for no tokens. It is arithmetically true, and it puts `$0.00` on every failed request, which is what 9.0.0 did for every missing cost. (c) Leave the cell empty for no tokens, so the dash means only "unknown". One branch in `formatCost`, and four call sites change meaning.
5. **Recommendation.** Keep (a). The dash is honest in both states and no total moves. If F-PRICE-3 is answered with option (b), `$0.00` gains the meaning "listed at no charge", which is one more reason not to print it for an error. Option (c) would change my mind if he finds the Agent requests table confusing in the VM pass.
6. **Gaps.** None new.

## F-PRICE-5. Two rules for a reasoning-only chunk

1. **Still true** (read). `extractUsageFromBody(text, reasoningCounts = true)` in `packages/core/src/usage/response-usage.ts` takes a flag, and its comment says the usage store passes `false` because its rows hold no reasoning count. PR 175 kept both rules.
2. **Weight.** The 705 of 4,000 is on generated bodies. No real stream was shown to send a chunk whose only figure is a reasoning count (the row says so, inferred). The three main wire shapes state other counts in the same block (inferred from their documented usage objects, not run).
3. **Outside facts.** None fetched. A live stream from a reasoning model per protocol would settle it, and needs a key.
4. **Options.** (a) Leave both. (b) One rule, the usage store's, in both. Logs then loses a reasoning figure on such a chunk. (c) One rule, Logs', in both. The usage row would take its model from a chunk that has no billable count.
5. **Recommendation.** (a). Pricing Task 3 already hands both stores one price, so the cost cannot differ on this account. Only the model name could, and only for a stream nobody has seen. A captured real stream with such a chunk would change my mind.
6. **Gaps.** None new.

## F-PRICE-6. A provider's reported cost and the fork

1. **Still true, with one correction** (read). `StandardUsage` in the fork's `src/types.ts:1059` has token, cache, video and `server_tool_use` fields and no cost. Nothing in the fork reads `usage.cost`, `is_byok` or `cost_details`. The plan's sentence that the bundle "reads no provider cost field" is not exact. `extractProviderReportedCostUsd` in `src/gateway/openai-json.ts:3379` reads xAI's `usage.cost_in_usd_ticks`, for the embeddings, image and video endpoints only, and the installed 1.0.22-llmr.4 bundle holds it (run, `grep -c`).
2. **Weight.** Only a user of an OpenRouter provider is affected, and the gap between the list price and the charge matters most for the bundled discount router. Jason has no outside users.
3. **Outside facts** (read today).
   - OpenRouter returns usage on every response with no request parameter. `usage.cost` is "the total amount charged to your account". `cost_details.upstream_inference_cost` is for BYOK requests only. The Responses API carries `cost` in the `usage` of its terminal event (`openrouter.ai/docs/use-cases/usage-accounting.md`).
   - The page does not say which chunk of a chat completions stream carries usage, and does not mention the Anthropic-compatible messages endpoint. Its reference page returned 404 at two addresses.
   - `GET /api/v1/generation?id=` returns `total_cost`, "Total cost of the generation in USD", with `upstream_inference_cost`, `cache_discount` and `is_byok` (`openrouter.ai/docs/api-reference/get-a-generation.md`). It needs the user's key and a second request.
   - The FAQ says credits are deposits, the base currency is US dollars, and "All of the pricing on our site and API is denoted in dollars". Together with `total_cost` in USD this settles Task 6's labelled assumption that a credit is a dollar, short of one sentence that says so outright.
   - A BYOK request inside the plan's allowance has no fee, so its `cost` can be 0 while the upstream charges the user's own account (FAQ).
4. **Options.**
   - **A. Change the fork.** `StandardUsage` gains `cost` and `is_byok`. The four usage builders in `src/adapters/builtins/target/shared.ts` (lines 320, 370, 412, 442) read them, `mergeStandardUsage` in `handler.ts` carries them, and each formatter that rebuilds `usage` emits them, the streaming ones in `streaming-conversion.ts` included. About ten sites and their tests (inferred from the grep, not built). Then a fork tag and a pin bump, which need his word.
   - **B. No fork change, read the upstream body LLM Router already has.** The raw trace's response body is the upstream's own (`readRawTraceRequestLogBundle` reads the parts `response_stream` and `upstream_response`, and the fork writes them at stage `upstream_response`, read). In the public gateway layout the usage row is written from that body (`recordUsageCaptureFromRawTrace`, on when `standaloneUsageCapture` is set by `config-compiler.ts:182`). In every layout `updateFromRawTrace` re-reads it for the Logs row. So `usage.cost` is in a body LLM Router parses today, translated request or not. The limit is the other layout, where the usage row is written from the gateway's translated body and only the Logs row would learn the cost, so the two tables would disagree unless the usage row is corrected too. Raw traces are off when Logs or body capture is off (`rawTraceConfig`, read).
   - **C. Drop P-5.** The request keeps OpenRouter's list price and its label.
   - **D. Ask OpenRouter's generation endpoint.** Exact, and it spends the user's key on a second call per request. Not worth it.
5. **Recommendation.** C, the row's default. It costs nothing and the label is honest. If he later wants the charged figure, run Task 6's Step 1 wire test first and look at B before A, because the plan's Open question 2 assumed the fork was the only way for a translated request and that is not what the code says. I did not run B. A wire test that shows the cost in the raw trace body for all four cases would make B the plan.
6. **Gaps.** The plan's Task 6 "Why it waits" paragraph and Open question 2 need the two corrections above before anyone builds from them.

## F-PRICE-7. A priority or flex request with no tier price

1. **Still true** (read). `ResponseUsage` has no service tier field, no table has a `service_tier` column, and `pricingForPrompt` chooses by prompt size only. Task 8 is not built.
2. **Weight.** A request served at a premium tier shows about half its real cost with no tilde. It needs a client that asks for the tier. Codex and Claude Code both offer a fast mode, so this is not rare for the owner's own use (inferred).
3. **Outside facts** (read today, except the catalog counts, which are run).
   - **OpenAI.** Priority was renamed Fast mode on 2026-07-30, and `service_tier` accepts `priority` and `fast`. The response's `service_tier` "identifies the tier used", and a downgraded request reports `default` and is billed at standard rates. For GPT-5.6 and earlier a `fast` request still reports `priority`. Fast is 2x standard on the four models read. Flex is 0.5x, absent on the two newest, and is being wound down. There is also an Ultrafast table (`developers.openai.com/api/docs/pricing`, `.../guides/priority-processing`).
   - **Anthropic.** Service tiers are marked legacy. `usage.service_tier` reports `standard`, `priority` or `batch`. Priority Tier is a capacity commitment that is no longer sold, not a per-token premium (`platform.claude.com/docs/en/api/service-tiers`). The premium that exists is fast mode, a `speed: "fast"` request reported in `usage.speed`. Opus 5.5 is $8 and $40 against a LiteLLM standard of $4 and $20, so 2x (`.../build-with-claude/fast-mode`).
   - **Google.** The pricing page lists Standard, Batch, Flex and Priority per model. Priority is 1.8x and Flex 0.5x on the two models read. The page does not name the response field (`aistudio.google.com/docs/pricing`, first 100,000 characters).
   - **LiteLLM.** 1,100 entries have `input_cost_per_token_priority` and 924 the `_flex` form, up from the 468 and 335 of the validation pass. Most are Bedrock (780 priority), then Azure 73, Fireworks 61, OpenAI 46, Gemini 29. New `_ultrafast` fields exist on the GPT-6 entries. Claude entries carry `supports_fast_mode` and no fast price.
   - **models.dev** has no service-tier key in `cost` (keys are `input`, `output`, cache, `tiers` with `tier.type` always `context`, `context_over_200k`, `reasoning`, audio). **OpenRouter**'s `pricing` has none either.
4. **Options.** A, B and C are the plan's. A changes almost nothing. B shows the right figure and makes the price depend on the response body. C marks the cost as an estimate.
5. **Recommendation.** C, the row's default, with two corrections to its text, since "a tier other than `default`" is wrong for Anthropic.
   - Anthropic reports `standard` on an ordinary request. C as worded would put a tilde on every Anthropic request. The standard values are `default`, `standard`, `auto` and an absent field.
   - Anthropic's `priority` is a commitment and carries no listed premium, so it should not be marked. `usage.speed: "fast"` should be, and the plan lists it as not covered. Adding it to C is one more field read in `extractUsageSnapshot`.
   B later only if he wants the number, and then by a multiplier per maker is not safe either, since Google is 1.8x and OpenAI 2x. Remediation release, because Task 8 adds a column to both tables. A catalog that lists a fast price for Claude would not change C.
6. **Gaps.** Whether the gateway keeps `service_tier` and `usage.speed` on a translated response was not checked. The fork names `service_tier` only on a request type (`src/types.ts:1177`). If it drops them, C has the same limit as F-PRICE-6 and the same way round it, the raw trace body.

## F-PRICE-8. A gateway billing cost counts as an estimate

1. **Still true** (read). `billing-sync.ts` stores `costSource: "gateway_billing"`, `listedCostSources` does not hold it, so `costBasisFor` gives `estimate`, and the label is "Calculated by the gateway from its billing rates". `authoritativeUsageCost` drops a cost of 0 when no rate is configured.
2. **Weight.** These are the rows of the internal Fusion client. Small.
3. **Outside facts.** None apply. The fork computes `billing.cost` from configured rates (read, `src/billing/calculate.ts`).
4. **Options.** Keep, or call it listed. A configured rate is the user's own figure, so `user` would be the nearer basis than `listed`, and nothing in the event says whether the rate was configured or a default.
5. **Recommendation.** Keep. One exception exists and is too small to act on. On the embeddings, image and video endpoints the fork bills from xAI's reported `cost_in_usd_ticks` (`createProviderReportedCostBilling`), so that cost is a real charge shown with a tilde.
6. **Gaps.** The pricing plan's line 29 gives "its bundle reads no provider cost field" as the reason. The conclusion holds and the reason needs the xAI exception.

## F-PRICE-9. A reported cost of 0 counts as absent

1. **Still true as a plan choice** (read). Task 6 is not built, so no code holds it.
2. **Weight.** None until Task 6 exists.
3. **Outside facts.** A BYOK request inside the allowance is charged no OpenRouter fee (FAQ, read), so a `cost` of 0 does not mean the request was free. What `cost` is on a `:free` model is not documented (read).
4. **Options.** Keep, or store a reported 0 as `$0.00`.
5. **Recommendation.** Keep. The BYOK case is a stronger reason than V-21's sentence. It also fits F-PRICE-3's option (b). A reported 0 falls to the rule, and the rule then gives `$0.00` for OpenRouter's own `:free` entry and a list price for a BYOK request.
6. **Gaps.** If F-PRICE-3 is answered with (b), the plan's stated reason for this choice ("V-21 lets only a user price yield 0") is out of date and should name BYOK.

## F-PRICE-34. The label "Estimated cost"

1. **Still true** (read). The string is in four places in the app and two in the docs.

| Surface | Where | What a user reads |
|---|---|---|
| Overview card | `dashboard.tsx:2413` | "Estimated cost", then `$1.23`, `~$1.23` or `-`, then the caption |
| Widget picker | `pages/home/shared/options.ts:95` | "Estimated cost" as the widget's name |
| Share poster | `share-cards.tsx:236` | "Estimated cost" over the total, no caption |
| Spend Receipt | `share-cards.tsx:437` | the total, "Estimated cost", then the caption |
| Docs | `docs/src/content/docs/en/configuration/overview.md:88`, `:120` | "Estimated cost, calculated from model pricing data" |

   The tray already says "Today Cost" and "<range> Cost" (`TrayApp.tsx:240`, `overview-panel.tsx:58`), and Logs detail says "Cost".
2. **Weight.** Every user sees the Overview card. Since PR 177 a total with no tilde is made of list prices and user prices, and the label still calls it estimated. A total with a tilde reads "Estimated cost ~$1.23", which says it twice. An exported share card carries the label to other people.
3. **Outside facts.** None needed. B-8 lets the strings change.
4. **Options.** (a) Keep. (b) "Cost" in all four, and in the docs. (c) "Cost" in the app and keep the word in the docs sentence, which describes how the figure is made.
5. **Recommendation.** (b), the source's recommendation. It matches the tray and Logs, and the tilde and caption now do the work the word did. A list price is still not an invoice, and the docs sentence can say that. Six string edits and any test that matches the text. Before 9.1.0 if a release PR is still open, because 9.1.0 is the release that makes the label wrong. Otherwise the remediation release.
6. **Gaps.** The share poster prints no caption, so a `~` there has no explanation on the image.

## F-PRICE-36. A zero offer that takes another provider's paid price

1. **Reproduced, and the cause is half of what the row says** (run). The built rule was asked for each of the 699 live zero offers on its own provider. 318 get a price, and 207 of those carry a listed source and so no tilde (199 from models.dev offers, 8 from LiteLLM entries). 111 get the median, with a tilde.
   - The read cause is right for part. `fetchModelsDevPrices` adds the offer's `canonical_model_id` to `byBareName` before `addCatalogEntry` drops the zero, and `makerEntry` follows it. 161 of the 185 that end at `models.dev` have a canonical id on the zero offer itself.
   - Stopping that alone moves 77 of the 199 to "No price found" (run, a one-line patch of the bundle). The other 122 stay, because a paid offer of the same bare name names the same maker. For them the rule works as V-21 says. It prices the model name by its maker.
   - Only 19 of the 199 are on a provider the rule can recognise. 14 are on a preset mapped to its own catalog id (`zhipuai-coding-plan`, `zai-coding-plan`, `nvidia`) and 5 on a preset mapped to another id (`kimi-code-plan-cn`). The other 180 were "on their own provider" only because the test named the provider by its catalog id. A real user reaches them through a custom provider, which the rule cannot tell from any other.
   - 9.0.0 has the same lines (read, `git show v9.0.0:...`, lines 525 to 527 and 586). It showed the same number. What is new in 9.1.0 is the label "models.dev list price" and the missing tilde, from PR 177.
2. **Weight.** A user on a coding plan or a free variant sees a paid figure labelled as a list price for requests that cost nothing per token. On the mapped presets that is 19 live offers. Totals are overstated with no tilde.
3. **Outside facts.** The catalogs are the saved live files. models.dev gives 302 of its 327 providers an `api` URL (run).
4. **Options.** No code is written here.
   - **A. No change.**
   - **B. A zero offer adds no canonical id.** One condition in `fetchModelsDevPrices`. On its own provider it changes 77 offers from a list price to "No price found". Over the 2,934 bare model names on a custom provider it changes 68, all from a maker's price to unpriced, and no other outcome (run). The 68 are names that exist only as zero offers, such as `glm-5.3-flash-free` and `duo-chat-sonnet-4-5`.
   - **C. The request's own offer is a known zero, so the rule stops.** This is F-PRICE-3's option (b) for steps 1 and 2. It covers the 14 on a preset mapped to its own id, and shows `$0.00`.
   - **D. Map a base URL to a catalog provider by models.dev's own `api` field,** not only by the presets. Then step 2 knows the provider for most of the 180, and C covers them. A new mapping with its own risks (shared hosts, proxies), and a design of its own.
   - **E. Treat a maker's price on a provider that is not the maker as an estimate.** Honest for the rest, and it changes what "listed" means under B-1 and V-21. His to open, not mine.
5. **Recommendation.** B, in the PR that builds F-PRICE-3's answer, with C if he picks (b) there. Together they fix 88 of the 199, 77 by B and 11 more by C, since 3 offers are in both. Say plainly in that PR that the remaining 111 are V-21's maker step and need D or E, which are later questions. Remediation release, since 9.0.0 has the same numbers and B changes the rule's inputs. If he would rather not ship the new "list price" label on these rows at all, B alone is small enough for 9.1.0.
6. **Gaps.**
   - The count of 207 measures a case real users mostly cannot be in. The honest figure for "a provider LLM Router recognises" is 19, and for "a model name that exists only as a zero offer" it is 68 names.
   - `soleOfferEntry` refuses when `canonicalIds.size > 0`, so B also lets a bare name with one paid offer and zero offers that named a maker reach the later steps. The run shows no name changes outcome through it today.

## Not checked

- No option was built and no UI was opened. Every recommendation's size is read from the code.
- Option B of F-PRICE-6 was read, not run. Task 6's Step 1 wire test is the check.
- Which chunk of an OpenRouter chat completions stream carries `usage.cost`, and whether its Anthropic-compatible endpoint returns a cost. No request was sent, since that needs a key.
- What `usage.cost` is for a `:free` model.
- Whether the gateway keeps `service_tier` or `usage.speed` through translation.
- Google's response field for the tier, and the last 18,000 characters of its pricing page.
- The outside pages were read through a fetch tool that summarises. Prices and model names are as that tool returned them.
- How many of the owner's own rows have no tokens (F-PRICE-4). No database was opened.
- A real provider stream with a reasoning-only chunk (F-PRICE-5).
- The F-PRICE-36 runs used the catalogs saved at 17:58 UTC, not a fresh fetch. The patched bundle and both scripts are in `/private/tmp/claude-501/-Users-jason-dev-llm-router/33d97e46-2839-4155-b69d-911aa3653df0/scratchpad/dp`, which a reboot clears.
