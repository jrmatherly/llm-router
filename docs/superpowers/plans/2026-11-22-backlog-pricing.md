# Backlog: Costs and Pricing Implementation Plan

> **Status, 2026-11-27: Tasks 1 and 2 are built and merged as PR 175 (`8f198bba`), and Task 3 as PR 176 (`d92548df`). Tasks 4 and 5 are built and merged as PR 177 (`fcc89370`). Task 7 is built and merged as PR 178 (`1df5870e`). Tasks 6 and 8 wait for the owner. Task 3 was audited on another model by building it at `main` `e15d9fc3`: 2 Blockers, 13 Corrections and 9 design findings, all applied to its text, with the tests the audit wrote named in its steps. The report is outside the repo, in `private/audits/2026-11-27-audit-pricing-batch13b/`. Task 5 was audited the same way at `main` `f0eca1db`: 2 Blockers and 12 Corrections, all applied to its text, with the tests the audit wrote named in its steps. Its design findings are not in the task and wait for the owner in `private/audits/2026-11-27-audit-pricing-batch14/audit-report.md`. What follows is the fix round's status of 2026-11-24.** Fix round done, text audit owed. The 2026-11-22 audit's 2 Blockers and 11 Corrections were checked against `main` at `c491eb48`, and the task text was corrected for each one that holds. `pricing-service.ts`, `usage/store.ts`, `request-log-store.ts`, `request-log-runtime.ts`, `request-log-worker.ts`, `raw-trace-sync.ts` and the UI cost surfaces did not change between `eb84a3ba` and `c491eb48` (run, `git diff --stat`), so their line numbers hold on today's `main`. `pipeline.ts`, `gateway-service.ts` and `providers.tsx` changed, and their references are updated. Batches 11 and 12 edit the same files before this plan builds, so each task's first act is to re-read the lines it names. Not verified this round: any new test text written here (none was run), OpenRouter's credit unit, the live models.dev tier rule, and whether a same-protocol OpenRouter response keeps `usage.cost`. Tasks 3 and 5 changed in design and need the one text audit on another model before they are built. Task 6 now waits for the owner, as Task 8 does.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person reading a cost in LLM Router can tell a listed price from an estimate, a reported charge and an unknown, sees the same figure in Logs and in the totals from the first request after a launch, and is told when a price source cannot be loaded.

**Architecture:** Six tasks to build, one commit each, on the branches the delivery index names, plus Tasks 6 and 8, which wait for the owner. Tasks 1 to 3 are subtractions that leave one input shape, one usage extractor and one catalog lookup, in the main process only. Task 4 reports the state of that one catalog. Task 5 carries a closed `CostBasis` with every cost and changes the ten cost surfaces. Tasks 6 and 7 read two things the price data already holds, a cost OpenRouter reports and the catalogs' long-prompt tiers.

**Tech Stack:** TypeScript, `better-sqlite3`, a `node:worker_threads` writer for request logs, React, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`, Playwright for one step.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row ids P-1 to P-8, decisions B-1 to B-9 and outside facts X-1 to X-15 come from that record. Task 8 of [`completed/2026-11-21-v8-clean-vm-fixes.md`](completed/2026-11-21-v8-clean-vm-fixes.md), with its "As built (PR 144)" note and decision V-21, is the base this plan changes. Read both before a task.

**Evidence status.** Written 2026-11-22 against `main` at `eb84a3ba`, and re-read against `c491eb48` on 2026-11-24. Every path, symbol and line named below was read on `c491eb48`. On that commit the five test files this plan extends pass, 105 of 105 (run). No fix here was prototyped, and no new test in this plan was run. Where a step rests on something only read or inferred, the step says so and the task's first step is the check.

## Decisions this plan rests on

- **B-1.** An estimate shows with a tilde, an unknown cost shows as a dash, a total carries a caption, and Logs detail gains a "Price source" line. Task 5.
- **B-8.** The caption's wording is the plan author's and can change in review. So can every other string in Tasks 4 and 5.
- **B-9.** P-8 gets no PR of its own. Its Playwright step rides in Task 5.
- **V-21.** A request is priced by rule and once. A median offer is stored as `models.dev-median`. Only a user price can yield a cost of 0. No task changes the order of the rule's steps. Task 8 would, so it waits for the owner.
- **X-7, X-8, X-9.** A long-prompt tier is chosen by the prompt size, which counts cache reads and cache writes. models.dev carries `cost.tiers` and no service-tier price. LiteLLM carries suffixed fields. Tasks 7 and 8.
- **X-10.** OpenRouter returns `usage.cost` in every response, in credits. Task 6.
- **X-11, X-12.** Other tools label a figure as estimated and say when no price matched. A tooltip alone is not enough, so the tilde, the dash and the caption are text.
- **The plan author chose these**, and any can change in review. The dash is the `-` character that two Agent Analysis panels already print; a cost stored with no recorded source counts as an estimate; a user price wins over a cost the provider reports; a tier with no cache price of its own keeps the base entry's cache prices; a LiteLLM tier with no output price of its own keeps the base output price, not the next lower tier's (Task 7).
- **The fix round chose these, on evidence**, and either can change in review. A `gateway_billing` cost is an estimate, not a reported charge: the gateway computes its `x-gateway-billing-*-cost` headers from its own configured rates, and its bundle reads no provider cost field (read, `node_modules/@the-next-ai/ai-gateway` 1.0.22-llmr.4). A reported cost of 0 counts as absent, so V-21 ("only a user price can yield a cost of 0") gains no new exception (Task 6).

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code. A column is added the way `cost_source` was, and old rows are not rewritten.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `packages/ui/**` may import from core only `@llmr/core/contracts/*` and the other modules `ui.md` lists, so `CostBasis` lives in `contracts/app.ts` and the function that derives it stays in core.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches. Tasks 3, 6 and 7 also run `npm run build:assets`, because the request log worker bundle changes. Task 5 also runs `npm run test:e2e`.
- No test, script or doc names a real provider host or holds a key. A price catalog is served to a test through a stubbed `globalThis.fetch`, as `withPriceCatalogs` in `packages/core/test/unit/models/pricing-service.test.mjs` does.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once per PR. Branches, the grouping of tasks into PRs and the order come from `2026-11-25-delivery-order.md` (batches 13, 14 and 15). Start each batch from `main` after the batch before it has merged.
- No task waits on a VM check. Each "VM check, for the end pass" line is a line of the owner's one VM pass at the end of the program.

## Review Focus

Each line names a condition that no single row's test covers. The test that pins it sits in the task named at the end of the line.

1. A machine that is offline from the first launch. Every price source fails, requests are recorded with no cost, and when the network returns the Logs row and the usage row of each request get the same price from the full rule. Task 3, Step 1. Its first test sends its one request after the network is back, so it covers a request made before the load and not a row that waited through the outage. Its second test covers the waiting rows.
2. A request log row that is written after its price update arrives, also when the writer or the app restarts in between. The row is still priced. Task 3, Step 3.
3. A total that mixes a listed price, a median estimate, a request with no price and a user price of 0. The caption's two figures match the rows, the user's 0 shows as `$0.00` and not as a dash, also when the only other request in the range has no price, and a total with nothing priced shows a dash. Task 5, Steps 1 and 5.
4. A row stored before this plan, with a cost and an empty or `request_log` source. It shows as an estimate whose source reads "Not recorded", never as unknown and never as listed. Task 5, Step 1.
5. A request made before the first catalog load whose response names a rule alias or a virtual model, not the routed model. The sweep prices it by the routed model, as the request path would have, and never marks it unpriced for the alias. Task 3, Step 4, in two tests: one for the sweep's choice of `price_model`, one for `recordCapture` storing it. A waiting row copied from Logs is not covered and is still resolved by the alias (Task 3, "What the sweep prices by").
6. A long offline stretch followed by a sweep over thousands of waiting rows. The sweep's price updates do not crowd real request records out of the log queue. Task 3, Step 6, in the runtime test and the page test of Step 4.

## Rows this plan closes

| Row | Task |
|---|---|
| P-6 | 1 |
| P-7 | 2 |
| P-2 | 3 |
| P-3 | 4 |
| P-1 | 5 |
| P-8 | 5, Step 9 |
| P-5 | 6, waiting for the owner |
| P-4, long-prompt tiers | 7 |
| P-4, service tier | 8, waiting for the owner |
| P-4, batch | None. No batch route exists (`grep "/batches" packages/core/src` finds nothing), so a batch price has nothing to apply to. |

## For the harness plan

After Task 3 merges, the request log worker thread and `RequestLogStore` make no outside fetch. The worker no longer imports `preloadUsagePriceCatalog`, and `RequestLogStore.record` no longer awaits a catalog load. From that point a test process reaches a price catalog host only through the main thread's `preloadUsagePriceCatalog`, which a stub of `globalThis.fetch` in the test file can reach. The validation record's run named two such main-thread files that stay after Task 3: `credential-and-model-routing.test.mjs` for the price catalog and `unit/web/web-management-server.test` for the model catalog. This plan does not stub them and does not add the runner guard. Both belong to the harness plan (H-3).

One new main-thread source comes with Task 3 (inferred, not run). `GatewayService` connects the `usageStore` singleton to the rule, so a test that builds a `GatewayService` and records a usage row with tokens and no price starts the sweep, which calls `preloadUsagePriceCatalog`. A `UsageStore` a test builds itself is never connected and never loads a catalog. Harness Task 6's Step 2 report finds any such file.

## Not in this plan

- Batch prices, for the reason in the table above.
- LiteLLM's `tiered_pricing` range arrays (56 entries per the outside-facts report), Anthropic fast mode and US-only inference (`usage.speed`, `usage.inference_geo`), and OpenAI regional uplifts. No catalog LLM Router reads carries a price table for them in a form the rule uses today.
- The gateway's `x-gateway-billing-total-cost` response header, which only `mcp/fusion-vision-mcp.ts` reads. It is the gateway's own calculation from its configured billing rates, not a provider charge (read in the gateway bundle).
- Seeding prices from the bundled `models.json`. The generated file keeps no `canonical_model_id`, so the maker step of the rule could not run on it.
- Re-pricing rows already stored with a cost.

---

### Task 1: Remove the older writer fields, so `price` is the one input shape (P-6)

Nothing a user sees changes. A writer input today accepts a resolved `price` and, beside it, a bare `pricing` with a `pricingSource`. Every source caller already passes `price`. This task deletes the second shape so each later task changes one.

It sits first because it is a pure subtraction and every later task edits these types.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts` (`RequestPriceInput`, `pricingForWrite`)
- Modify: `packages/core/src/usage/store.ts` (`UsageEventInput`, lines 69 to 70)
- Modify: `packages/core/src/observability/request-log-store.ts` (`RequestLogRecordInput` lines 147 to 148, `RequestLogRawTraceUpdateInput` lines 171 to 172, `standaloneRecordInputFromRawTrace` lines 1835 to 1836, `batchNeedsUsagePricing` line 6260)
- Modify: `packages/core/src/observability/raw-trace-sync.ts` (`applyRawTraceRequestLogPolicy`, line 1535)
- Test: `packages/core/test/unit/observability/raw-trace-sync.test.mjs`, `packages/core/test/integration/observability/request-log-pricing-transaction.test.mjs`

**Interfaces:**
- Produces: `RequestPriceInput = { price?: RequestPriceOutcome }`. `UsageEventInput`, `RequestLogRecordInput` and `RequestLogRawTraceUpdateInput` have no `pricing` and no `pricingSource` member.
- Unchanged: `UsageCostInput.pricing` and `UsageCostInput.pricingSource` (the estimator's own input), `RequestLogUsageContext.pricing` (read from the stored `pricing_json`), and the `WritePricing` type.

- [ ] **Step 1: Make the tests state the one shape.** In `raw-trace-sync.test.mjs`, in `#1809 raw trace resolves runtime provider aliases and custom pricing`, replace the assertion on `policy.update.pricing` with:

```js
assert.deepEqual(policy.update.price, { price: { pricing, source: "custom" }, state: "priced" });
assert.equal("pricing" in policy.update, false);
assert.equal("pricingSource" in policy.update, false);
```

In `request-log-pricing-transaction.test.mjs` there are four inputs that pass the old fields, at lines 142, 226, 288 and 408. Convert each to `price: { price: { pricing, source }, state: "priced" }`, with `source: "custom"` at lines 142, 226 and 408 and `source: "litellm"` at line 288. The test at line 403 then asserts that its row holds `{ cost_source: "custom", cost_usd: null }` before the raw trace and `{ cost_source: "custom", cost_usd: 6 }` after it. Rename it `a raw trace prices a row from the price stored with it`.

- [ ] **Step 2: Run both files and see the new assertions fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/observability/raw-trace-sync.test.js`
Expected: FAIL in `#1809`, because `"pricing" in policy.update` is `true`.

- [ ] **Step 3: Delete the fields.** Remove the two members from the four types, the spread at `raw-trace-sync.ts:1535`, the two lines at `request-log-store.ts:1835`, and the `!hasCompleteProviderModelPricing(command.input.pricing)` clause at line 6260. In `pricingForWrite` the last return becomes `{ estimate: true }`. `npm run typecheck` names any caller this list missed.

- [ ] **Step 4: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass.

- [ ] **Step 5: Commit.** `refactor(usage): keep one price input on the usage and request log writers`

---

### Task 2: Keep one usage extractor (P-7)

Nothing a user sees changes. `extractUsageSnapshot` exists twice, at `packages/core/src/usage/store.ts:1293` and `packages/core/src/observability/request-log-store.ts:6600`. The copies differ only in that the log store's also reads reasoning tokens. Tasks 6 and 8 add a field to it, and with two copies the two stores would drift.

It sits here because Tasks 6 and 8 need it and it touches no behaviour Task 3 changes.

**Files:**
- Create: `packages/core/src/usage/response-usage.ts`
- Modify: `packages/core/src/usage/store.ts`, `packages/core/src/observability/request-log-store.ts` (delete `extractUsageFromBody`, `parseStreamPayloads`, `extractUsageSnapshot`, `hasUsageNumbers` and `mergeUsageSnapshots` from each, and import them)
- Test: `packages/core/test/unit/usage/response-usage.test.mjs` (create)

**Interfaces:**
- Produces, all exported from `response-usage.ts`:
  - `type ResponseUsage = { cacheReadTokens?: number; cacheWrite1hTokens?: number; cacheWrite5mTokens?: number; cacheWriteTokens?: number; inputIncludesCacheTokens?: boolean; inputTokens?: number; model?: string; outputTokens?: number; reasoningTokens?: number; totalTokens?: number }`
  - `extractUsageFromBody(text: string): ResponseUsage | undefined`
  - `mergeUsageSnapshots(primary: ResponseUsage | undefined, fallback: ResponseUsage | undefined): ResponseUsage | undefined`
  - `hasUsageNumbers(usage: ResponseUsage): boolean`
- The body of each is the log store's copy, which is the superset. One difference reaches the usage store. `hasUsageNumbers` now counts `reasoningTokens`, so a stream chunk that holds only a reasoning count is merged where it was skipped. The claim made here on 2026-11-24, that every count the usage store writes from such a chunk is still 0, was refuted when the task was built: 705 of 4,000 generated bodies changed a usage row's model, cost or input tokens (run, 2026-11-27). As built in PR 175, `extractUsageFromBody` takes a second parameter and the usage store passes `false`, which keeps its old rule.

- [ ] **Step 1: Write the failing test.** New file `response-usage.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { extractUsageFromBody } from "@llmr/core/usage/response-usage.ts";

test("a JSON body gives its token counts, its model and its reasoning tokens", () => {
  const usage = extractUsageFromBody(JSON.stringify({
    model: "m",
    usage: { completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 }, prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 4 } }
  }));
  assert.equal(usage.inputTokens, 10);
  assert.equal(usage.outputTokens, 5);
  assert.equal(usage.cacheReadTokens, 4);
  assert.equal(usage.reasoningTokens, 2);
  assert.equal(usage.inputIncludesCacheTokens, true);
  assert.equal(usage.model, "m");
});

test("a stream takes each count from the last chunk that states it", () => {
  const stream = [
    `data: ${JSON.stringify({ message: { model: "m", usage: { cache_read_input_tokens: 3, input_tokens: 7 } }, type: "message_start" })}`,
    `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 9 } })}`,
    "data: [DONE]"
  ].join("\n");
  const usage = extractUsageFromBody(stream);
  assert.equal(usage.inputTokens, 7);
  assert.equal(usage.cacheReadTokens, 3);
  assert.equal(usage.outputTokens, 9);
  assert.equal(usage.inputIncludesCacheTokens, false);
});

test("a body with no usage gives nothing", () => {
  assert.equal(extractUsageFromBody("{}"), undefined);
  assert.equal(extractUsageFromBody(""), undefined);
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/usage/response-usage.test.js`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Move the code.** Create `response-usage.ts` from the log store's five functions and the private helpers they need (`asNumber`, `asString`, `isRecord`, `parseJson`, `sumOptionalNumbers`). Delete the five from both stores and import them. Each store keeps its own `extractUsageFromBillingHeaders`, which reads different headers.

- [ ] **Step 4: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:core`
Expected: all pass, with no change to an existing test.

- [ ] **Step 5: Commit.** `refactor(usage): read a response's usage in one module for both stores`

---

### Task 3: Price both stores from the main process's catalog (P-2)

A request made before the price catalog has loaded, which includes the first request after every launch, is priced today by a lookup that skips the provider's own catalog entry. On the validation record's fixture that lookup gave $1 where the rule gives $3, with the same label. The request log worker also loads a second copy of the catalog and prices its rows from that copy. After this task there is one catalog, in the main process, and one lookup, `resolveRequestPrice`. A request written before the catalog loads is stored with no cost, and the main process's sweep prices its usage row and its Logs row together when the catalog arrives.

It sits here because Task 4 reports on the one catalog this task leaves, and Task 5's count of unpriced requests is only right once a waiting row is priced by the same rule as any other.

**Why the request path does not wait for the catalog instead.** `recordGatewayRequestLog` returns its enqueue result synchronously, and the pipeline's `priceFor` is called inside that synchronous path, by `recordUsage` and by `writeRequestLog`. Line numbers in this task predate batches 11, 12 and 13a, so find each place by its symbol. Awaiting a catalog fetch there, with its 5 second timeout per source, would change that contract and delay the Logs row of every request made while a source is down. Read in the code, and the reason the validation record gives.

**What the sweep prices by.** The sweep resolves on the provider stored on the usage row and on a new `price_model` column, which holds the model the request path priced. The stored provider is already the one the request path priced (`record` stores `event.provider`, which `recordCapture` sets to `target.provider`), so the base URL mapping applies, which is the step the old fallback skipped. The stored `model` column is not the priced model. `recordCapture` stores the response's model (`usage/store.ts:362`), and the request path prices `target.model`, the routed model (`:727`). They differ for every rule alias and virtual model profile, which is the normal case (`UsageStore prices the routed upstream model when the response echoes a rule alias`, `usage-store.test.mjs:353`). A run on 2026-11-24 confirmed it. With a provider whose model is `vendor-model` and a response that says `my-alias`, the routed model priced `priced` and the stored model priced `unpriced`. A sweep on the stored model would mark such a row `unpriced` in both tables for good. A row with an empty `price_model` (a row copied from Logs, or one written before this task) is resolved on its `model`.

**What that leaves open, for the owner.** A run on 2026-11-27 showed the copy path has the fault this paragraph describes. `backfillFromAttachedRequestLog` copies `logs.model`, which is the response's alias, and no `price_model`. A waiting log row with no usage row, whose response named `my-alias` and whose `resolved_model` is `Vendor/some-model`, was copied, resolved on `my-alias`, and marked `unpriced` in both tables. Copying `logs.resolved_model` into `price_model` would close it. This task does not do that. The test `FINDING a waiting log row copied into the totals is resolved by the response's alias` in Step 4 records the behaviour, so a later change to it is seen.

**What the sweep does not make equal.** Three runs on 2026-11-27, none of them new with this task's design, all now reachable by a swept row:
- A raw trace that changes a row's tokens re-prices the log row from the stored price and never touches the usage row. A swept row with 10 input tokens and a trace that says 30 ended at $1 in the totals and $3 in Logs, with the same source. The same holds today for a row priced on the request path.
- Neither table stores the split between 5 minute and 1 hour cache writes. The request path prices the split from the response. The sweep and a price update price every cache write at the 5 minute price. One response cost $7.2 priced on the path and $6.9 priced by an update. Both stores agree with each other.
- A record that lost its body to queue pressure is stored with no tokens, so a price update stores the price and no cost.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts`
- Modify: `packages/core/src/usage/store.ts`
- Modify: `packages/core/src/observability/request-log-store.ts`, `packages/core/src/observability/request-log-runtime.ts`, `packages/core/src/observability/request-log-worker.ts`
- Modify: `packages/core/src/gateway/application/gateway-service.ts`
- Test: `packages/core/test/integration/gateway/request-pipeline-cost-parity.test.mjs`, `packages/core/test/integration/observability/request-log-pricing-transaction.test.mjs`, `packages/core/test/integration/usage/usage-store.test.mjs`, `packages/core/test/unit/models/pricing-service.test.mjs`. On `e15d9fc3` no other file in the repo outside `docs/superpowers` names `estimateUsageCostUsd`, `estimateUsageCostUsdFromLoadedCatalog`, `backfillMissingUsageCosts`, `pricingRefreshNeeded` or the `"maintenance"` message (run, `grep -rn` over the whole tree without `node_modules` and build output). No UI, electron, cli, docs or script file reads any of them.
- Test, new: `packages/core/test/integration/observability/request-log-price-update.test.mjs`, `packages/core/test/integration/usage/usage-sweep.test.mjs`, `packages/core/test/integration/gateway/usage-pricing-connection.test.mjs`, `packages/core/test/integration/gateway/request-pipeline-offline.test.mjs`. The audit build of 2026-11-27 wrote and ran all four. They are outside the repo, in `private/audits/2026-11-27-audit-pricing-batch13b/extra-tests/`, under the same names with an `-extra` suffix. Copy them, drop the suffix, and keep every test in them unless a step below says otherwise.

**Interfaces:**
- Removes from `pricing-service.ts`: `estimateUsageCostUsd` (the async one that loads a catalog), and the catalog lookup inside `estimateUsageCostUsdFromLoadedCatalog` (its last two statements and their comment).
- Produces in `pricing-service.ts`: `estimateUsageCost(input: UsageCostInput): UsageCostEstimate | undefined`. It is `estimateUsageCostUsdFromLoadedCatalog` renamed. It returns a cost only from a complete `input.pricing` and never reads the catalog.
- Removes from `request-log-store.ts`: `backfillMissingUsageCosts`, `backfillMissingUsageCostsPage`, `RequestLogCostBackfillPage`, `batchNeedsUsagePricing`, `RequestLogStoreWriteResult` and its `pricingRefreshNeeded`. `writeBatch` returns `Promise<void>`. Three helpers and one import lose their last caller with `batchNeedsUsagePricing` and go too, or `npm run typecheck` fails with TS6133 (run): `recordHasBillableUsage`, `rawTraceHasBillableUsage`, `hasBillableUsageComponents`, and the import of `usagePriceCatalogNeedsRefresh`.
- Removes from `request-log-worker.ts`: `schedulePricingRefresh`, `schedulePricingBackfillPage`, the three variables they use (`pricingBackfillActive`, `pricingRefreshPromise` and `shuttingDown`, with the one assignment to it in the `shutdown` case), and the import of `preloadUsagePriceCatalog`. Removes from `request-log-runtime.ts` the `"maintenance"` message type and the `updated` field of `WorkerResponse`, and the branch of `handleWriterMessage` that reads them.
- Produces in `request-log-store.ts`:
  - `export type RequestLogPriceUpdate = { price: { price: ResolvedModelPrice; state: "priced" } | { state: "unpriced" }; requestId: string }`
  - a third member of `RequestLogStoreWriteCommand`: `{ input: RequestLogPriceUpdate[]; kind: "price-update" }`. One command carries one sweep page's updates, so a sweep over many rows costs the queue one item per page of 500, not one per row.
  - a table `request_log_pending_prices (request_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, price_json TEXT NOT NULL)`, created beside `request_log_pending_updates` (`request-log-store.ts:1587`) and pruned by the same `pendingRawTraceTtlMs` in `prunePendingRawTraceUpdates`. That function runs today only when a raw trace is parked and when the database opens (read), so the `price-update` branch of `writeBatch` also calls it, once per command. It holds an update whose row is not written yet. It is a table and not a `Map` because an acked command is never resent (`handleWriterMessage`, `request-log-runtime.ts:761`) while a raw-trace bundle is retried after a restart, so an in-memory park loses the update when the writer or the app restarts.
  - `export function enqueueGatewayRequestLogPrices(updates: RequestLogPriceUpdate[]): RequestLogEnqueueResult`, which calls `requestLogRuntime.enqueuePriceUpdates(updates)`
- Produces in `request-log-runtime.ts`: `RequestLogRuntime.enqueuePriceUpdates(input: RequestLogPriceUpdate[]): RequestLogEnqueueResult`. It queues one command with the next `sequence`, like `enqueueRawTrace`. The order is not what makes an update land: an update sorted ahead of its record is parked and taken when the record is written, and a build that queued every update with sequence 0 passed every test (run). It goes through `enqueue`, so a closed runtime or a full queue refuses it. A refused command is not retried. Its Logs rows keep no cost and read "Not priced yet" after Task 5, while their usage rows are priced. That loss is accepted and stated here.
- Produces in `usage/store.ts`:
  - a column `price_model TEXT NOT NULL DEFAULT ''` on `usage_events`, added in `ensureUsageSchema` the way `cost_source` was (`usage/store.ts:626`). `UsageEventInput` gains `priceModel?: string`. `recordCapture` passes `priceModel: target.model`, and `record` stores it.
  - `UsageStore.connectPricing(dependencies: { enqueueRequestLogPrices: (updates: RequestLogPriceUpdate[]) => unknown; resolvePrice: (provider: string, model: string) => RequestPriceOutcome }): void`. A store that was never connected records and never sweeps. `usage/store.ts` imports `RequestLogPriceUpdate` with `import type`. `request-log-store.ts` does not import `usage/store.ts`, so no cycle forms.
  - `export function connectUsagePricing(dependencies: Parameters<UsageStore["connectPricing"]>[0]): void`, which connects the `usageStore` singleton
- Consumes: `resolveRequestPrice` and `unpricedCostSource` from `pricing-service.ts`, unchanged, and `shouldRecordRequestLogs` from `raw-trace-sync.ts` (`:1497`).

- [ ] **Step 1: Write the end-to-end test that fails today.** Add to `request-pipeline-cost-parity.test.mjs`, reusing its `modelsDev`, `catalogFetch`, `readRows` and `until` helpers and the first test's config, request and pipeline setup:

```js
test("a request written while no price source is loaded gets the full rule's price in both rows once the catalog loads", async () => {
  // setup as in the first test, with these differences
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  await preloadUsagePriceCatalog({ forceRefresh: true });
  // A failed source is retried after 5 minutes. Six minutes later the usage
  // write sees a catalog due for a refresh and starts the sweep.
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60 * 1000 });
  connectUsagePricing({
    enqueueRequestLogPrices: enqueueGatewayRequestLogPrices,
    resolvePrice: (provider, model) => resolveRequestPrice(config, provider, model)
  });
  globalThis.fetch = /* the first test's handler, serving catalogFetch(modelsDev(3, 3)) */;
  // send the one request, then
  const priced = (rows) => rows.length > 0 && rows[0].cost_usd !== null && rows;
  const [usageRow] = await until(() => priced(readRows(USAGE_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM usage_events")), "the usage row was not priced");
  const [logRow] = await until(async () => {
    await flushRequestLogRuntime(1_000);
    return priced(readRows(REQUEST_LOGS_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM request_logs"));
  }, "the log row was not priced");
  assert.deepEqual(logRow, usageRow);
  assert.equal(usageRow.cost_source, "models.dev");
  assert.ok(Math.abs(usageRow.cost_usd - 0.0033) < 1e-12, `priced by the mapped provider, not the maker: ${usageRow.cost_usd}`);
});
```

The mapped provider's price is $3 and $3 per million, so 1,000 input and 100 output tokens cost $0.0033. The maker's entry, which the old fallback would pick, gives $0.0013. The test imports `connectUsagePricing` from `usage/store.ts`, `enqueueGatewayRequestLogPrices` from `request-log-store.ts` and `resolveRequestPrice` from `pricing-service.ts`. The two tests share the module's catalog, the two databases and the `requestLogRuntime` singleton, so this test deletes the rows the first one left before it sends its request, or filters by its own `request_id`.

Add one more end-to-end test, in its own file `request-pipeline-offline.test.mjs` so it has its own databases: `requests recorded while every price source fails are priced the same in Logs and in the totals by the first request after the network returns`. Every catalog fetch throws. Two requests go through the pipeline a minute apart, and both rows of each are stored with no cost and source `''`. The catalog then serves, the clock moves 6 minutes, and a third request goes through. All three requests end with the same cost and source in both tables, 0.0033 and `models.dev`. The upstream response names a model no catalog holds, so the test also pins that the sweep prices by the routed model. This is the test for Review Focus 1's waiting rows.

The existing test's `finally` calls `closeRequestLogRuntime()`, and a closed runtime stays closed for good (`closed = true` at `request-log-runtime.ts:378`, never reset). A run on 2026-11-24 showed `enqueueRecord` after `closeRequestLogRuntime()` returning `{"accepted":false,"degraded":false,"reason":"closed"}`. So move that call out of the first test's `finally` into one `after(() => closeRequestLogRuntime())` hook at file level, imported from `node:test`. Without the move, every test added after the first waits 10 seconds in `until` and fails with "the log row was not priced". Tasks 6 and 7 add tests to this file and rely on the move.

- [ ] **Step 2: Run it and see it fail, then see the defect on `main`.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/gateway/request-pipeline-cost-parity.test.js`
Expected: the build step fails, not the test. esbuild reports `No matching export in "packages/core/src/usage/store.ts" for import "connectUsagePricing"` and the same for `enqueueGatewayRequestLogPrices`, and writes no test file (run, 2026-11-27).

To see the defect itself, check out `main` in a scratch copy of the test file, delete the two new imports and the `connectUsagePricing` call, and run it there. Keep the real test file out of the build while you do, because the build fails on its imports. Expected on `main`, from a run on 2026-11-27 at `e15d9fc3`: the usage row is priced by the old fallback at 0.0013 with source `models.dev`, and the test fails with "the log row was not priced". The log row keeps no cost and source `''`, because the worker thread loads its own catalog, and a stub of `globalThis.fetch` in the test's thread does not reach it. That is the second copy of the catalog this task removes. If the usage row is not 0.0013, stop and report, because the cause stated above is then wrong. Delete the scratch copy and its `.test-dist` output. On the new code the same body without the call leaves both rows with no cost, which is why the check runs on `main`.

- [ ] **Step 3: Pin the log store's side.** In `request-log-pricing-transaction.test.mjs`, delete `RequestLogStore commits while a background pricing refresh is stalled` and `the back-fill skips a row resolved as unpriced and still prices a row written before any catalog`, remove the `late-request` command and the two back-fill assertions from `a log row stores where its price came from and keeps it through a raw-trace re-price and a back-fill` (rename it to end at `a raw-trace re-price`), and remove every `pricingRefreshNeeded` assertion with the `const result =` that fed it. In the renamed test also remove the `mock.timers.enable` line, its comment and the `mock.timers.reset()`, which existed only for the refresh flag, and drop `mock` from the file's `node:test` import, which nothing else uses. Add, using the file's `openStore`, `createRecord`, `usageBody` and `litellmPrice`:

```js
const noCatalogRecord = (requestId, sequence) => ({
  eventId: `${requestId}-event`,
  input: { ...createRecord(requestId, usageBody), price: { state: "no-catalog" } },
  kind: "record",
  sequence
});
const priceUpdate = (requestId, price, sequence) => ({ input: [{ price, requestId }], kind: "price-update", sequence });

test("a row written with no catalog has no cost until a price update prices it from the row's own tokens", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-price-update-test-");
  try {
    await store.writeBatch([noCatalogRecord("waiting", 1), noCatalogRecord("unpriced", 2)]);
    assert.deepEqual(readRow("waiting"), { cost_source: "", cost_usd: null });
    await store.writeBatch([priceUpdate("waiting", litellmPrice, 3), priceUpdate("unpriced", { state: "unpriced" }, 4)]);
    assert.deepEqual(readRow("waiting"), { cost_source: "litellm", cost_usd: 6 });
    assert.deepEqual(readRow("unpriced"), { cost_source: "unpriced", cost_usd: null });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update leaves a row that already has a cost, and a later raw trace re-prices from the update's price", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-price-update-keep-test-");
  try {
    const custom = { price: { pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 }, source: "custom" }, state: "priced" };
    await store.writeBatch([
      { eventId: "priced-event", input: { ...createRecord("priced", usageBody), price: custom }, kind: "record", sequence: 1 },
      noCatalogRecord("waiting", 2)
    ]);
    await store.writeBatch([priceUpdate("priced", litellmPrice, 3), priceUpdate("waiting", litellmPrice, 4)]);
    assert.deepEqual(readRow("priced"), { cost_source: "custom", cost_usd: 1.5 });
    assert.equal(await store.updateFromRawTrace({ requestId: "waiting", responseBodyText: '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}' }), true);
    assert.deepEqual(readRow("waiting"), { cost_source: "litellm", cost_usd: 12 });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update that arrives before its row prices the row when it is written, also after the store reopens, and one for a request that is never logged writes nothing", async () => {
  const { dbFile, dir, readRow, store } = openStore("llmr-request-log-price-update-early-test-");
  let reopened;
  try {
    await store.writeBatch([priceUpdate("early", litellmPrice, 1), priceUpdate("never-logged", litellmPrice, 2)]);
    assert.deepEqual(readRow("never-logged"), {});
    await store.close();
    reopened = new RequestLogStore(dbFile);
    await reopened.writeBatch([noCatalogRecord("early", 3)]);
    assert.deepEqual(readRow("early"), { cost_source: "litellm", cost_usd: 6 });
  } finally { await reopened?.close(); await store.close(); rmSync(dir, { force: true, recursive: true }); }
});
```

`openStore` (`request-log-pricing-transaction.test.mjs:336`) builds `dbFile` and does not return it today. Add `dbFile` to the object it returns. The reopen is what proves the park is durable. With one store instance an in-memory park would pass too.

These three tests leave six faults in `applyPriceUpdate` and the park unseen (run, mutants on 2026-11-27). Add `request-log-price-update.test.mjs` with the tests that see them:
- `a price update never replaces a price or an unpriced mark the row already has, and a second update for a priced row changes nothing`. A row the request path marked `unpriced`, and a row it stored with a price and no tokens, keep their source and `pricing_json`. Without it the guard can lose its `cost_source = ''` half.
- `a row stored with a cost and no recorded source keeps its cost when a price update names it`. Without it the guard can lose its `cost_usd IS NULL` half.
- `a parked price does not replace the price the request path stored with the row`, and the parked entry is deleted when it is taken.
- `a later parked price replaces an earlier one for the same request, and a parked unpriced mark is applied to the row`.
- `a parked price older than the pending window is dropped by the next price update, with no raw trace parked`.
- `a price update and a raw trace that both arrive before their row both apply, in either order`, and `a row that exists takes a raw trace and a price update in either order and ends with the same cost`. Both pending tables are emptied.
- `a price update for a row with no tokens stores the price, and the raw trace that brings the tokens prices from it`.
- `one price update of 500 rows commits in one writer batch and prices every row`. It took 11 ms on the audit machine.

- [ ] **Step 4: Pin the usage store's side.** In `usage-store.test.mjs`, rewrite `UsageStore records usage while the price catalog loads and prices it afterwards` and `the usage sweep skips a row resolved as unpriced and still prices a row written before any catalog` so the sweep is driven by `connectPricing` and not by the `estimateCost` stub answering without a price. The second becomes:

```js
test("the usage sweep prices a waiting row by the connected rule and the priced model, marks a row the rule cannot price, and sends both outcomes to the request log", async () => {
  // store built with no estimateCost option, loadPriceCatalog: async () => {} and
  // priceCatalogNeedsRefresh: () => true, so every record starts or queues a sweep
  const sent = [];
  const price = { price: { pricing: { inputUsdPerMillionTokens: 100_000, outputUsdPerMillionTokens: 0 }, source: "litellm" }, state: "priced" };
  store.connectPricing({
    enqueueRequestLogPrices: (updates) => sent.push(...updates),
    resolvePrice: (_provider, model) => model === "known-model" ? price : { state: "unpriced" }
  });
  await store.record({ ...event, model: "known-model", price: { state: "no-catalog" }, requestId: "waiting" });
  await store.record({ ...event, model: "my-alias", price: { state: "no-catalog" }, priceModel: "known-model", requestId: "alias" });
  await store.record({ ...event, model: "no-price-model", price: { state: "no-catalog" }, requestId: "unpriced" });
  await store.record({ ...event, model: "known-model", price: { state: "no-catalog" }, requestId: "" });
  await until(() => row("waiting").cost_usd !== null && row("alias").cost_usd !== null && row("unpriced").cost_source === "unpriced" && rowWithoutRequestId().cost_usd !== null);
  assert.deepEqual(row("waiting"), { cost_source: "litellm", cost_usd: 1 });
  assert.deepEqual(row("alias"), { cost_source: "litellm", cost_usd: 1 });
  assert.deepEqual(row("unpriced"), { cost_source: "unpriced", cost_usd: null });
  assert.deepEqual(rowWithoutRequestId(), { cost_source: "litellm", cost_usd: 1 });
  assert.deepEqual(sent.sort((left, right) => left.requestId < right.requestId ? -1 : 1), [
    { price, requestId: "alias" },
    { price: { state: "unpriced" }, requestId: "unpriced" },
    { price, requestId: "waiting" }
  ]);
});
```

The event has 10 input tokens, so the price above gives $1. The `alias` row stores the response's model and is priced by `priceModel`. The store cannot keep today's `priceCatalogNeedsRefresh: () => !loaded`. The first record's load sets `loaded`, the three records after it start no sweep, and the test fails on the `alias` row after its 2 second wait (run, 2026-11-27). More than one sweep can run, so the test waits on a condition over the rows and sorts what was sent. The current test awaits a `swept` promise and then a `setTimeout(20)` (`usage-store.test.mjs:1045` to `1062`). That depends on the order of `setImmediate` and microtasks. Write a small `until(read)` helper in the file that polls every 10 ms for 2 seconds, and `row` and `rowWithoutRequestId` helpers that open the database, read `cost_source, cost_usd` and close it. A row with no request id is priced and sends nothing. Add one more test. A store that `connectPricing` was never called on records a `no-catalog` row and never calls `loadPriceCatalog`.

The first rewritten test keeps its two stores and its assertions. Its `estimateCost` stub goes, and each store is connected to a `resolvePrice` that answers `no-catalog` until `catalogLoaded` and a price of 25,000 per million input tokens after it, which gives the $0.25 a row the test expects.

These tests leave seven faults in the sweep unseen (run, mutants on 2026-11-27). Add `usage-sweep.test.mjs` with the tests that see them:
- `a sweep that finds no catalog writes nothing and sends nothing, and the next sweep prices the row`. Without it a `no-catalog` answer can be stored as `unpriced`.
- `the sweep sends one list of at most 500 updates for each page, after the page's rows are written`. 1,201 waiting rows give calls of 500, 500 and 201, and at each call the page's usage rows already hold their cost. Without it the sweep can send one call per row, send before it writes, or stop after one page. This is half of Review Focus 6.
- `recordCapture stores the routed model as the model to price by, so a sweep prices a row whose response named a rule alias`. Step 4's planned test passes `priceModel` to `record` itself, so it passes when `recordCapture` forgets the field.
- `a usage database made before the price_model column gains it, and its old rows are priced by their model`.
- `a row recorded with no catalog after the catalog has landed is swept, and one recorded while the rule still finds no catalog starts no sweep`. See Step 7.
- `a row whose resolved price gives no amount for its tokens stays waiting and sends nothing`. See Step 7.
- `a waiting request ends with the same cost and source in its usage row and its log row, whichever store hears of the price first`, with a real `RequestLogStore` behind `enqueueRequestLogPrices`.
- The two `FINDING` tests named under "What the sweep prices by" and "What the sweep does not make equal". They assert today's behaviour, not a wanted one.

- [ ] **Step 5: Make the estimator price from a price only.** In `pricing-service.ts`, delete `estimateUsageCostUsd`, rename `estimateUsageCostUsdFromLoadedCatalog` to `estimateUsageCost`, and delete the catalog lookup at lines 154 to 156 so a call with no complete `pricing` returns `undefined`. In `pricing-service.test.mjs`, a test that used the old function to read a catalog price now asserts on `resolveRequestPrice` with a config (the calls at lines 127 to 140, 201, 332, 456 and 466). The test at 127 to 140 has no config. `resolveRequestPrice(undefined, "anthropic", "retry-model")` answers `no-catalog` before the retry and the models.dev price after it (run). At 201, 332 and 456 the line above already asserts `resolveRequestPrice` on the same model, so the old call is deleted and nothing is added. The test `the fallback estimate unwraps a route selector and strips the provider prefix` (line 462) becomes the same assertions on `resolveRequestPrice`. Calls that pass a `pricing` keep their assertions under the new name (lines 35, 43, 54, 223, 228 and 246). The `await estimateUsageCostUsd(input)` assertion at line 30 is deleted, because the line after it asserts the same result through the cache-only function. Add one test, `an estimate with no complete price is no cost, whatever catalog is loaded`: with a catalog that prices the model loaded, `estimateUsageCost` without `pricing` returns `undefined`. No other test pins the removal.

Four comments in `pricing-service.ts` and one in `request-log-store.ts` still describe a writer's fallback estimate and two back-fills: above `RequestPriceOutcome`, above `unpricedCostSource`, above `pricingForWrite`, inside `resolveRequestPrice`, and in `updateFromRawTrace` ("keeps its cost for the back-fill"). Rewrite each to name the usage sweep and the price update.

- [ ] **Step 6: Stop the worker pricing.** In `request-log-store.ts`, `record()` calls `estimateUsageCost(costInput)` in both branches of the transaction check, so it no longer awaits. Delete the removals listed under Interfaces. In `writeBatch`, handle `kind: "price-update"` by calling a new private `applyPriceUpdate(database, update)` for each update in the command's array. The rule it encodes:
  - It acts on the row with that `request_id` only while `cost_usd IS NULL AND cost_source = ''`.
  - `priced`: the cost is `estimateUsageCost` over the row's stored token columns with the update's pricing and source. It writes `cost_usd`, `cost_source` and `pricing_json`, as `record()` does for a resolved price.
  - `unpriced`: it writes `cost_source = 'unpriced'`.
  - `priced` on a row with no tokens: it writes `cost_source` and `pricing_json` and leaves `cost_usd` NULL, as `record()` does, so the raw trace that brings the tokens prices from the stored price.
  - No row with that id: it writes the update to `request_log_pending_prices`, replacing an earlier one for the same id. The record branch of `writeBatch`, after its `takePendingRawTraceUpdate` block, takes and deletes the entry for its request id and applies it with `applyPriceUpdate`. It runs after `record()` and after the parked raw trace, so it acts only when the record left `cost_usd` NULL and `cost_source` empty, and it prices the tokens the trace brought. The table is pruned with `request_log_pending_updates`, and the `price-update` branch calls `prunePendingRawTraceUpdates` once after its updates.

  In `request-log-runtime.ts`, add `enqueuePriceUpdates`. Its command's `sizeBytes` and `batchBytes` are 128 per update, a fixed estimate in place of `estimateRecordBytes` and `estimateRawTraceBytes`. Of the places that branch on `command.kind`, `markRecordAdmissionsCommitted` already skips non-records, and `scheduleRawTraceCleanup` already keys on `raw-trace-update`. The drop path in `handleBatchError` needs no change either (read and typechecked): its admission write is inside `command.kind === "record"`, and its warning already says "Dropping" for every kind but `raw-trace-update`. `withoutSize` does not branch and needs no change.

  Add two runtime tests to `request-log-price-update.test.mjs`, with the real worker file as `request-log-runtime.test.mjs` finds it. `a page of 500 price updates is one queue item, runs after the records enqueued before it, and leaves room for records`: five records, one page of 500 that names them and 495 others, then five more records. The queue holds 6 items after the page, nothing is dropped, 11 commands commit, all ten rows are priced and 490 updates are parked. `a closed runtime refuses a price update and a full queue refuses it without retry`: a queue of `128 * 500 - 1` bytes refuses a page of 500 and takes one of 499. These two are the other half of Review Focus 6. Keep the test's `queueMaxItems` well above its item count. A queue near its limit strips a record's body, and the row then has no tokens to price (run). In the worker, `reviveCommand` (`request-log-worker.ts:153`) must return a `price-update` command unchanged, because its last branch calls `Buffer.from(input.requestBody)` and would throw on one.

- [ ] **Step 7: Make the sweep use the rule.** In `usage/store.ts`, add the `price_model` column and field named under Interfaces. `priceUnpricedEvents` (`:300`) also selects `request_id` and `price_model`, and for each row calls the connected `resolvePrice(provider, price_model || model)`:
  - `priced`: cost from `this.estimateCost` with the outcome's pricing and source, then the existing update. When the estimate is `undefined`, which a catalog price of 0 for the only tokens the row has gives, the row is left as it is and nothing is sent. It is resolved again by every later sweep inside the 7 day window.
  - `unpriced`: `UPDATE usage_events SET cost_source = 'unpriced' WHERE id = ? AND cost_usd IS NULL`.
  - `no-catalog`: nothing.
  - For the first two, when `request_id` is not empty, add `{ price, requestId }` to the page's list. After the page's transaction, when the list is not empty, call `enqueueRequestLogPrices(list)` once.

  `priceUnpricedEventsAfterCatalogLoads` returns at once on a store with no pricing connection. `record()` stores `price_model`, and the `CREATE TABLE` in `open` gains the column too.

  `record()` gains one more reason to start the sweep. Today it starts one only when `priceCatalogNeedsRefresh()` is true as the row is written. The price was resolved earlier, by the pipeline or by the raw-trace policy, and the raw-trace path reads a body file between the two. A catalog that lands in that gap leaves a `no-catalog` row that no sweep is started for, until the catalog is next due or the app restarts (run: a row recorded with `price: { state: "no-catalog" }` and `priceCatalogNeedsRefresh: () => false` kept no cost). So when the row has no cost, `event.price?.state === "no-catalog"` and the catalog is not due, `record()` asks the connected `resolvePrice(provider, priceModel || model)` once, and starts the sweep when the answer is not `no-catalog`. While a source is still failing the answer stays `no-catalog` and no sweep starts, so an outage costs one lookup per request and no scan. The audit added this. It is the one rule here that the 2026-11-24 text did not have, and the owner can strike it. With `estimateUsageCost` as its default estimator, a `no-catalog` row now gets no cost and source `''`.

  A usage row whose provider is still `unknown` is resolved as it is. `setProviderIfUnknown`, which logs plan Task 1 adds, fills the provider only for a refused request, which has no tokens (read in the logs plan), and the sweep selects only rows with tokens. So the two do not meet.

- [ ] **Step 8: Connect it.** In `gateway-service.ts`, beside the `requestPipeline` field (`:115`), call `connectUsagePricing` once. `GatewayService` has no constructor today, and `connectUsagePricing` returns nothing to hold in a field, so add a constructor:

  ```ts
  connectUsagePricing({
    enqueueRequestLogPrices: (updates) => this.config && shouldRecordRequestLogs(this.config) ? enqueueGatewayRequestLogPrices(updates) : undefined,
    resolvePrice: (provider, model) => resolveRequestPrice(this.config, provider, model)
  });
  ```

  The check on `shouldRecordRequestLogs` is the one the raw-trace importer makes before it enqueues. Without it, a sweep with request logs off would start the writer thread through `enqueue` (`request-log-runtime.ts:420`), create a request-log database, and park every update. `this.config` is undefined until the gateway starts (`:505`), and `resolveRequestPrice` accepts that. Read `packages/core/test/architecture/gateway-service-architecture.test.mjs` first. The call goes in `gateway/application/gateway-service.ts`, not in the `gateway/service.ts` facade.

  Ten test files build more instances with `new gatewayService.constructor()` or import the module. Each new instance connects the one `usageStore` to itself, so the last one built answers. Production builds one. No test in the suite reached a price host through this on 2026-11-27 (run, `npm run test:core`: the two refused connections are the model catalog's, in `unit/web`).

  No planned test sees this step. With the guard deleted, or with `resolveRequestPrice(undefined, ...)`, every planned test passed (run). Add `usage-pricing-connection.test.mjs`, which imports `gatewayService` and the `usageStore` singleton, stubs `globalThis.fetch` to throw, and sets `gatewayService.config`:
  - `the gateway's sweep prices by the gateway's config, and with request logs off it sends no price to the log queue and creates no log database`. A provider with a user price in the config prices the row as `custom`, the runtime's `accepted` count stays 0, and `REQUEST_LOGS_DB_FILE` does not exist.
  - `with request logs on the gateway's sweep sends the price to the log queue`.
  - `before the gateway has a config the sweep finds no catalog and sends nothing`.

  The second and third tests move the clock 6 minutes first. The failed load of the first test is not due again before that, and only a due catalog starts a sweep.

- [ ] **Step 9: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run build:assets`
Expected: all pass. `build:assets` checks the caps of the four lightweight MCP bundles only, which this task does not change, and prints nothing about them when they hold. The worker bundle has no cap. What the build does show is the task's claim: `grep -c "models.dev/api.json" packages/core/dist/main/request-log-worker.js` prints 0, so the worker holds no catalog loader (run, 2026-11-27, worker bundle 716.0kb). Then `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 10: Commit.** `fix(usage): price a request written before the catalog loads by the full rule, in the main process only`

---

### Task 4: Say when a price source cannot be loaded (P-3)

With every price source unreachable, the only trace today is three `console.warn` lines, and every cost reads `$0.00`. After this task the usage snapshot carries each source's last success and last error, and Overview shows one line while a source is failing.

It sits after Task 3 because there is then one catalog to report on.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts`, `packages/core/src/contracts/app.ts`, `packages/core/src/usage/store.ts` (`getStats`, `emptySnapshot`)
- Modify: `packages/ui/src/pages/home/shared/usage.ts` (`createEmptyUsageStats`), `packages/ui/src/pages/home/components/dashboard.tsx` (`OverviewView`)
- Test: `packages/core/test/unit/models/pricing-service.test.mjs`, `packages/ui/test/component/overview-components.test.tsx`, `packages/ui/test/fixtures/index.ts`

**Interfaces:**
- Produces in `contracts/app.ts`: `export type PriceSourceStatus = { failing?: true; loadedAt?: string; source: "litellm" | "models.dev" | "openrouter" }`, and `priceSources: PriceSourceStatus[]` on `UsageStatsSnapshot`.
- Produces in `pricing-service.ts`: `export function usagePriceCatalogStatus(): PriceSourceStatus[]`, ordered by `source`. It is empty before the first load attempt. `loadedAt` is the ISO time of the last successful load and survives a later failure. `failing` is `true` while the latest attempt failed, and absent after a success. An absent value is an omitted key, not a key set to `undefined`, because the test compares with `deepEqual`.
- The snapshot carries no error message. It reaches the renderer and the web management API, a proxy or socket error can name the proxy host, and the UI shows only source names. The message stays in the existing `console.warn` (`pricing-service.ts:454`).

- [ ] **Step 1: Write the failing core test.** In `pricing-service.test.mjs`:

```js
test("each price source reports its last successful load and whether its latest load failed", async () => {
  const originalFetch = globalThis.fetch;
  let modelsDevUp = false;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("litellm")) return Response.json({ "m": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 } });
    if (target.includes("openrouter.ai")) return Response.json({ data: [{ id: "lab/m", pricing: { completion: "0.000001", prompt: "0.000001" } }] });
    if (!modelsDevUp) throw new Error("offline");
    return Response.json({ lab: { models: { m: { cost: { input: 1, output: 1 } } } } });
  };
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
    const failing = usagePriceCatalogStatus();
    assert.deepEqual(failing.map((status) => status.source), ["litellm", "models.dev", "openrouter"]);
    assert.deepEqual(failing[1], { failing: true, source: "models.dev" });
    assert.equal(typeof failing[0].loadedAt, "string");
    assert.equal(failing[0].failing, undefined);

    modelsDevUp = true;
    mock.timers.tick(5 * 60 * 1000);
    await preloadUsagePriceCatalog();
    const loaded = usagePriceCatalogStatus()[1];
    assert.equal(loaded.failing, undefined);
    assert.equal(typeof loaded.loadedAt, "string");
  } finally {
    mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`
Expected: FAIL, `usagePriceCatalogStatus` is not exported.

- [ ] **Step 3: Record the status in `loadPriceCatalog`** (`pricing-service.ts:435`). `SourcePrices` already has `failed: boolean` (`:85`), which a success clears and a failure sets. It gains `loadedAt?: number`. A success sets it, and a failure keeps the cached one. `usagePriceCatalogStatus` reads the module's `catalog` and maps `failed` to `failing`.

- [ ] **Step 4: Carry it in the snapshot.** `UsageStore.getStats` adds `priceSources: usagePriceCatalogStatus()`. `emptySnapshot`, `createEmptyUsageStats` and the `usageStats` fixture add `priceSources: []`.

- [ ] **Step 5: Write the failing component test.** In `overview-components.test.tsx`:

```tsx
test("Overview names the price sources that cannot be loaded, and says nothing when all load", () => {
  const render = (priceSources: PriceSourceStatus[]) => renderToStaticMarkup(
    <OverviewView
      overviewWidgets={[]}
      providerAccounts={[]}
      setUsageRange={() => undefined}
      usageRange="30d"
      usageStats={{ ...usageStats("30d"), priceSources }}
      onWidgetsChange={() => undefined}
    />
  );
  const failing = render([
    { loadedAt: "2026-11-22T10:00:00.000Z", source: "litellm" },
    { failing: true, source: "models.dev" },
    { failing: true, loadedAt: "2026-11-21T10:00:00.000Z", source: "openrouter" }
  ]);
  assert.match(failing, /role="status"/);
  assert.match(failing, /Prices could not be loaded from models\.dev and OpenRouter\. Some request costs are missing or older until they load\./);
  assert.doesNotMatch(render([{ loadedAt: "2026-11-22T10:00:00.000Z", source: "litellm" }]), /Prices could not be loaded/);
  assert.doesNotMatch(render([]), /Prices could not be loaded/);
});
```

- [ ] **Step 6: Render the line.** In `OverviewView`, directly under the `overview-toolbar` element, render one `role="status"` line when any entry is `failing`. The names shown are `models.dev`, `LiteLLM` and `OpenRouter`, joined with commas and a final "and". The sentence is the one in the test. Style it as `AnalysisNotice` in the same file does.

- [ ] **Step 7: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui`
Expected: all pass.

- [ ] **Step 8: Commit.** `feat(usage): show when a price source cannot be loaded`

---

### Task 5: Show an estimate and an unknown cost as what they are (P-1, P-8, B-1)

Every cost surface prints one number today. A median of reseller offers looks like a list price, and a request with no price looks free, because `formatUsdCost` turns a missing cost into `$0.00`. After this task a single cost shows `~$0.000016` when it is an estimate and `-` when it is unknown, a total shows a tilde and a caption when part of it is approximate or missing, and Logs detail names where the price came from.

It sits after Task 3 because a row waiting for the catalog and a row no source can price both read as unknown, and only after Task 3 does the first kind get priced by the same rule as any other.

**Files:**
- Modify: `packages/core/src/contracts/app.ts`, `packages/core/src/models/pricing-service.ts`, `packages/core/src/usage/store.ts`, `packages/core/src/observability/request-log-store.ts`
- Modify: `packages/ui/src/pages/home/shared/usage.ts`, `packages/ui/src/pages/home/shared/external.tsx`, `packages/ui/src/pages/tray/shared.tsx` (the `costUsd: 0` totals at line 90 and the re-export at line 34), `packages/ui/src/pages/home/components/network-logs.tsx`, `packages/ui/src/pages/home/components/dashboard.tsx`, `packages/ui/src/pages/home/components/share-cards.tsx`, `packages/ui/src/pages/tray/TrayApp.tsx`, `packages/ui/src/pages/tray/components/overview-panel.tsx`
- Test: `packages/core/test/unit/models/pricing-service.test.mjs`, `packages/core/test/integration/usage/usage-store.test.mjs`, `packages/core/test/integration/observability/request-log-pricing-transaction.test.mjs`, `packages/ui/test/unit/usage-format.test.ts`, `packages/ui/test/component/observability.test.tsx`, `packages/ui/test/component/overview-components.test.tsx`, `packages/ui/test/component/tray-components.test.tsx`, `packages/ui/test/component/share-cards.test.tsx`, `packages/ui/test/fixtures/index.ts`, `tests/e2e/provider-edit.spec.ts`, `tests/e2e/cli-web-runtime.ts`
- Create, from the audit (`private/audits/2026-11-27-audit-pricing-batch14/extra-tests/`): `packages/core/test/integration/usage/cost-basis-extra.test.mjs`, `packages/ui/test/component/cost-basis-extra.test.tsx`

**Interfaces:**
- Produces in `contracts/app.ts`:
  - `export type CostBasis = "listed" | "estimate" | "user" | "unknown";`. No source stored today is a provider's reported charge (see Decisions on `gateway_billing`), so `reported` is not a member yet. Task 6 adds it with the first source that is one.
  - `costBasis?: CostBasis` and `costSource?: string` on `RequestLogEntry`
  - `costBasis?: CostBasis` on `AgentAnalysisRequestRow` and `AgentAnalysisTraceRun`
  - `estimatedCostUsd: number`, `pricedRequestCount: number` and `unpricedRequestCount: number` on `UsageTotals`, which `UsageSeriesPoint`, `UsageComparisonRow` and `AgentAnalysisTotals` extend
  - `export const listedCostSources = ["litellm", "models.dev", "openrouter"]`
  - `export function costBasisFor(row: { billableTokens: number; costSource: string; costUsd: number | undefined }): CostBasis | undefined`
  - `export function totalCostBasis(totals: Pick<UsageTotals, "estimatedCostUsd" | "pricedRequestCount" | "unpricedRequestCount">): CostBasis | undefined`
  - These three live in `contracts/app.ts` as pure code, beside its 58 other exported functions and constants, and not in `pricing-service.ts`. The renderer may import from core only the pure modules `.claude/rules/ui.md` lists, and `pricing-service.ts` imports `system-proxy-fetch`, the model catalog and the model registry. So the UI, the usage store's SQL and the log store all derive the basis from one place.
- Produces in `packages/ui/src/pages/home/shared/usage.ts`:
  - `formatCost(costUsd: number | undefined, basis: CostBasis | undefined): string`. A missing cost or the basis `unknown` gives `-`. An amount with no basis shows plain, as `formatUsdCost` prints it, because a row with no tokens has no basis and test entries written before this task carry a cost and none.
  - `formatTotalCost(totals: Pick<UsageTotals, "costUsd" | "estimatedCostUsd" | "pricedRequestCount" | "unpricedRequestCount">): string`, which calls `totalCostBasis`
  - `totalCostCaption(totals: Pick<UsageTotals, "estimatedCostUsd" | "unpricedRequestCount">): string | undefined`
  - `priceSourceLabel(costSource: string | undefined, basis: CostBasis | undefined): string`
  - `formatUsdCost` stays, for a number that is known to be a cost.
  - The components import these helpers from `../shared/index` through `shared/external.tsx`, which lists `formatUsdCost` in two export lists (`:319` and `:428`). Add the four new functions to both. The tray uses one of them, `formatTotalCost`, and takes it from `tray/shared.tsx` (`:34`). `dashboard.tsx` also needs the `CostBasis` type, which no shared export list carries: import it with `import type { CostBasis } from "@llmr/core/contracts/app"`.

**The rule `costBasisFor` encodes**, in this order:

| Row | Basis |
|---|---|
| `billableTokens` is 0 | none (`undefined`) |
| `costUsd` is `undefined` | `unknown` |
| `costSource` is `custom` | `user` |
| `costSource` is in `listedCostSources` | `listed` |
| anything else, which covers `models.dev-median`, `gateway_billing`, `request_log` and `''` | `estimate` |

`billableTokens` is input plus output plus cache read plus cache write tokens. `pricedRequestCount` counts rows with tokens and a cost, a user price of 0 included. `totalCostBasis` gives `unknown` when `pricedRequestCount` is 0 and `unpricedRequestCount` is above 0, `estimate` when `estimatedCostUsd` or `unpricedRequestCount` is above 0, and none otherwise. The rule keys on the priced count and not on `costUsd` being 0, so a range with one request at the user's $0 price and one unpriced request shows `~$0.00` and its caption, not a dash.

`gateway_billing` is an estimate because the gateway computes it from its own configured billing rates (see Decisions). Its basis reads `estimate`, so a single such cost shows a tilde.

**What each cost surface shows after the change.** The ten surfaces are the validation record's.

| # | Surface | Code | Today | After |
|---|---|---|---|---|
| 1 | Logs detail, "Cost" | `network-logs.tsx:1052` | `formatUsdCost(entry.costUsd ?? 0)` | `formatCost(entry.costUsd, entry.costBasis)`, and a new `LogMetric` "Price source" with `priceSourceLabel(entry.costSource, entry.costBasis)`, shown when `costBasis` is set |
| 2 | Logs list | none | no cost column | unchanged |
| 3 | Overview "Estimated cost" card | `dashboard.tsx:2387` and `OverviewMetricWidget` | summed number | `formatTotalCost(totals)`, and `totalCostCaption(totals)` as a text line under the value in all four variants |
| 4 | Usage analysis rows and chart tooltip | `dashboard.tsx:6290`, `:6386` | summed number | `formatTotalCost(row)` and `formatTotalCost(point)`, no caption |
| 5 | Agent sessions table | `dashboard.tsx:6197` | summed number | `formatTotalCost(session)` |
| 6 | Agent session requests panel | `dashboard.tsx:4729` | `formatUsdCost(request.costUsd ?? 0)` | `formatCost(request.costUsd, request.costBasis)` |
| 7 | Agent trace table and trajectory node | `dashboard.tsx:5447`, `:5658` | number, or `-` when missing | `formatCost(run.costUsd, run.costBasis)`. `AgentTrajectoryNode` gains `costBasis`, copied where `costUsd` is at lines 5170 and 6113 |
| 8 | Agent Analysis totals | `buildAgentAnalysisTotals`, `request-log-store.ts:4157` | `sum(costUsd ?? 0)` | also sums `estimatedCostUsd` and counts `pricedRequestCount` and `unpricedRequestCount` from each request's `costBasis`. The root trace run takes `costBasis: totalCostBasis(totals)` |
| 9 | Tray "Cost" and "Today Cost" | `TrayApp.tsx:240`, `overview-panel.tsx:58` | summed number | `formatTotalCost(totals)`, no caption, because a stat tile has one line |
| 10 | Share cards | `share-cards.tsx:236`, `:435` | summed number | `formatTotalCost(totals)` in both. The Spend Receipt also prints `totalCostCaption(totals)` under its "Estimated cost" label, so an exported image carries it |

The native tray title shows tokens only (`tray-controller.ts:355`). The CLI prints no cost. Neither changes.

**Strings.** All can change in review (B-8).

| Case | Text |
|---|---|
| A single estimate | `~` followed by the amount, such as `~$0.000016` |
| A single unknown | `-` |
| A total with any approximate or missing part | `~` followed by the amount |
| A total with nothing priced and at least one unpriced request | `-` |
| Caption, both parts | `~$0.30 approximate · 3 requests without a price` |
| Caption, one part | `~$0.30 approximate`, or `3 requests without a price`, or `1 request without a price` |
| Price source, `custom` | `Your price` |
| Price source, `models.dev`, `litellm`, `openrouter` | `models.dev list price`, `LiteLLM list price`, `OpenRouter list price` |
| Price source, `models.dev-median` | `Median of reseller prices on models.dev` |
| Price source, `gateway_billing` | `Calculated by the gateway from its billing rates` |
| Price source, `unpriced` | `No price found` |
| Price source, `''` with basis `unknown` | `Not priced yet` |
| Price source, anything else | `Not recorded` |

- [ ] **Step 1: Write the failing core tests.** In `pricing-service.test.mjs`, importing `costBasisFor` and `totalCostBasis` from `@llmr/core/contracts/app.ts`:

```js
test("a cost's basis comes from its stored source, its amount and its tokens", () => {
  const basis = (costSource, costUsd, billableTokens = 10) => costBasisFor({ billableTokens, costSource, costUsd });
  assert.equal(basis("models.dev", 0.1), "listed");
  assert.equal(basis("litellm", 0.1), "listed");
  assert.equal(basis("openrouter", 0.1), "listed");
  assert.equal(basis("models.dev-median", 0.1), "estimate");
  assert.equal(basis("custom", 0), "user");
  assert.equal(basis("gateway_billing", 0.1), "estimate");
  assert.equal(basis("unpriced", undefined), "unknown");
  assert.equal(basis("", undefined), "unknown");
  assert.equal(basis("", 0.1), "estimate");
  assert.equal(basis("request_log", 0.1), "estimate");
  assert.equal(basis("models.dev", undefined, 0), undefined);
  assert.equal(basis("", undefined, 0), undefined);
});

test("a total's basis is unknown with nothing priced, an estimate with any approximate or missing part, and plain otherwise", () => {
  assert.equal(totalCostBasis({ estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 2 }), "unknown");
  assert.equal(totalCostBasis({ estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 2 }), "estimate");
  assert.equal(totalCostBasis({ estimatedCostUsd: 0.3, pricedRequestCount: 2, unpricedRequestCount: 0 }), "estimate");
  assert.equal(totalCostBasis({ estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 0 }), undefined);
  assert.equal(totalCostBasis({ estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 0 }), undefined);
});

test("a user price of 0 beside an unpriced request makes an estimate, not an unknown", () => {
  assert.equal(totalCostBasis({ estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 1 }), "estimate");
});
```

In `usage-store.test.mjs`, record six events into one store through `store.record`, each with 10 input tokens unless stated, and read `getStats("24h", { includeProxy: true })`:

| Event | Input | Stored cost and source |
|---|---|---|
| listed | `price` priced, source `models.dev`, $100,000 per million input | $1, `models.dev` |
| median | `price` priced, source `models.dev-median`, $30,000 per million input | $0.30, `models.dev-median` |
| user zero | `price` priced, source `custom`, input 0 and output 0 | $0, `custom` |
| unpriced | `price: { state: "unpriced" }` | none, `unpriced` |
| waiting | `price: { state: "no-catalog" }` | none, `''` |
| no tokens | `price: { state: "unpriced" }`, no usage | none |

```js
assert.equal(stats.totals.requestCount, 6);
assert.ok(Math.abs(stats.totals.costUsd - 1.3) < 1e-9);
assert.ok(Math.abs(stats.totals.estimatedCostUsd - 0.3) < 1e-9);
assert.equal(stats.totals.unpricedRequestCount, 2);
assert.equal(stats.totals.pricedRequestCount, 3);
const byModel = Object.fromEntries(stats.models.map((row) => [row.model, row]));
assert.equal(byModel["median-model"].estimatedCostUsd, byModel["median-model"].costUsd);
assert.equal(byModel["listed-model"].estimatedCostUsd, 0);
assert.equal(stats.recentRequests.reduce((count, row) => count + row.unpricedRequestCount, 0), 2);
assert.equal(stats.series.reduce((count, point) => count + point.unpricedRequestCount, 0), 2);
```

Give each event its own model name so the per-model rows can be read. The `recentRequests` assertion covers `buildTotals`, the JavaScript path the SQL totals do not use. `series` is read by SQL too (`readUsageSeries`), so its assertion covers the grouped query and not `buildTotals`.

In `request-log-pricing-transaction.test.mjs`, write four rows through `writeBatch` (a `models.dev` price, a `models.dev-median` price, `unpriced`, and a zero-token row with a `models.dev` price), read them through `store.list({ pageSize: 10 })` and `store.getDetail`, and assert:

```js
const byRequest = Object.fromEntries(page.items.map((item) => [item.requestId, [item.costBasis, item.costSource]]));
assert.deepEqual(byRequest, {
  listed: ["listed", "models.dev"],
  median: ["estimate", "models.dev-median"],
  "no-tokens": [undefined, undefined],
  unpriced: ["unknown", "unpriced"]
});
```

Add one row inserted with raw SQL that has `cost_usd = 2`, `input_tokens = 10` and the default empty `cost_source`, as a row stored before PR 144 has. Its entry reads `["estimate", ""]`. Close the store before the insert and open a new one to read. These columns are enough: `INSERT INTO request_logs (created_at, request_id, method, path, url, status_code, ok, duration_ms, input_tokens, cost_usd)` (run).

Also copy in `packages/core/test/integration/usage/cost-basis-extra.test.mjs` from the audit folder. Its six tests cover what the three above leave open: the SQL aggregates against `costBasisFor` over every stored source, cost and token shape; the three fields on series points, the three row lists and `getTotalsSince`; a row waiting for the catalog before and after the sweep; a waiting Logs entry, a user price of 0 and the `litellm` and `openrouter` sources in Logs; and Agent Analysis totals, session rows, request rows and trace runs, which no test above reads.

- [ ] **Step 2: Run them and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`
Expected: the build stops with `No matching export in "packages/core/src/contracts/app.ts" for import "costBasisFor"`, so no test runs (run). One bundle holds every core test, so the store and log tests cannot be seen failing until `costBasisFor` and `totalCostBasis` exist. Add those two first, build again, and see the store, log and extra tests fail on their assertions.

- [ ] **Step 3: Build the core side.** Add the type, the fields, the list and the two functions to `contracts/app.ts`.
  - `usage/store.ts`: `usageTotalsSelect` (`:970`) gains three aggregates over the same rows. `estimated_cost_usd` sums `cost_usd` where it is not null, the four token columns sum above 0, and `cost_source` is not `custom` and not in `listedCostSources`. `priced_request_count` counts rows where `cost_usd IS NOT NULL` and the four token columns sum above 0. `unpriced_request_count` counts rows where `cost_usd IS NULL` and the four token columns sum above 0. Build the SQL list from the exported array so the SQL and `costBasisFor` cannot disagree. `usageTotalsFromRow` (`:1164`), `emptyTotals` (`:161`) and `buildTotals` (`:1266`) carry the three fields. `StoredUsageEvent` (`:130`) gains `costBasis`, set in `toStoredUsageEvent` (`:946`) from the raw row before `normalizeCost` (`:1374`) turns a null cost into 0. The file imports `contracts/app` with `import type` only, so `costBasisFor` and `listedCostSources` need a value import.
  - `request-log-store.ts`: add `cost_source` to the three `SELECT` lists that read `cost_usd` (lines 1134 in `list`, 1300 in `analyze` and 5260 in `readRequestLogById`). `toRequestLogEntry` (`:5287`) returns `StoredRequestLogEntry` (`:240`), not `RequestLogEntry`, so `StoredRequestLogEntry` gains `costBasis?` and `costSource?`. `list` and `getDetail` hand the stored entry on as a `RequestLogEntry` with no mapping in between (`getDetail` at `:1170` returns `readRequestLogById`'s result), so the two fields reach the renderer once both types carry them. Both are absent when `costBasisFor` returns none. `toAnalyzedAgentRequest` (`:2027`, which copies `costUsd` at `:2044`) and the request's trace run (`:3974`) copy `costBasis`. The request row needs no line of its own: `AnalyzedAgentRequest` extends `AgentAnalysisRequestRow` and `stripAnalysisInternals` keeps the field. `buildAgentAnalysisTotals` (`:4157`) and the `emptyAgentAnalysisTotals` constant (`:415`) carry the three fields, and the root trace run (`costUsd` at `:3816`) takes `totalCostBasis(totals)`.

- [ ] **Step 4: Run the core tests of Step 1 and `npm run test:core`.** Expected: all pass.

- [ ] **Step 5: Write the failing UI tests.** In `usage-format.test.ts`:

```ts
test("a single cost shows a tilde for an estimate, a dash for an unknown, and a user price of zero as zero", () => {
  assert.equal(formatCost(0.000016, "listed"), "$0.000016");
  assert.equal(formatCost(0.000016, "estimate"), "~$0.000016");
  assert.equal(formatCost(undefined, "unknown"), "-");
  assert.equal(formatCost(0, "user"), "$0.00");
  assert.equal(formatCost(undefined, undefined), "-");
});

test("a total shows a tilde when part of it is approximate or missing, and a dash when nothing is priced", () => {
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0, pricedRequestCount: 2, unpricedRequestCount: 0 }), "$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0.003, pricedRequestCount: 2, unpricedRequestCount: 0 }), "~$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0.005, estimatedCostUsd: 0, pricedRequestCount: 2, unpricedRequestCount: 1 }), "~$0.005000");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 3 }), "-");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 1 }), "~$0.00");
  assert.equal(formatTotalCost({ costUsd: 0, estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 0 }), "$0.00");
});

test("a total's caption states the approximate part and the requests without a price, and is absent when both are zero", () => {
  assert.equal(totalCostCaption({ estimatedCostUsd: 0.003, unpricedRequestCount: 3 }), "~$0.003000 approximate · 3 requests without a price");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0.003, unpricedRequestCount: 0 }), "~$0.003000 approximate");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0, unpricedRequestCount: 1 }), "1 request without a price");
  assert.equal(totalCostCaption({ estimatedCostUsd: 0, unpricedRequestCount: 0 }), undefined);
});

test("a price source reads as words for every stored value", () => {
  assert.equal(priceSourceLabel("custom", "user"), "Your price");
  assert.equal(priceSourceLabel("models.dev", "listed"), "models.dev list price");
  assert.equal(priceSourceLabel("models.dev-median", "estimate"), "Median of reseller prices on models.dev");
  assert.equal(priceSourceLabel("gateway_billing", "estimate"), "Calculated by the gateway from its billing rates");
  assert.equal(priceSourceLabel("unpriced", "unknown"), "No price found");
  assert.equal(priceSourceLabel("", "unknown"), "Not priced yet");
  assert.equal(priceSourceLabel("", "estimate"), "Not recorded");
});
```

Amounts under one cent keep `formatUsdCost`'s six decimals, which makes the expected strings independent of the test machine's locale.

Component tests, one per surface group, each with `renderToStaticMarkup` and the fixtures in `packages/ui/test/fixtures/index.ts` (whose `usageTotals` gains `estimatedCostUsd: 0`, `pricedRequestCount: 0` and `unpricedRequestCount: 0`):
  - `observability.test.tsx`: `LogExpandedDetails` for an entry with `costBasis: "estimate"`, `costSource: "models.dev-median"`, `costUsd: 0.000016` matches `~$0.000016` and `Median of reseller prices on models.dev`. With `costBasis: "unknown"`, `costSource: "unpriced"` and no `costUsd` it matches `No price found` and does not match `$0.00`. With no `costBasis` it does not match `Price source`.
  - `observability.test.tsx`: the requests panel with one request row whose `costBasis` is `"estimate"` and `costUsd` is `0.000016` matches `~$0.000016`. `AgentAnalysisView` cannot show it in a static render: the panel sits behind the "Session Records" tab, whose state starts at `"trace"` (`dashboard.tsx:4623`, `:4648`), and the audit's run of that test failed. So export `AgentSessionRequestsPanel` (`dashboard.tsx:4693`) and render it with the `selectedSession` of the existing test "AgentAnalysisView keeps session headings horizontal and shows cache rate and cost". In the same test give the `subagent:42` trace run `costBasis: "estimate"` and `costUsd: 0.000017`, and assert `~$0.000017` in the `AgentAnalysisView` markup, which covers the trace table of surface 7. That test's `AgentAnalysisSessionRow` literal needs the three new fields. Give it `estimatedCostUsd: 0.5` and assert `~$1.25` in a table cell, which covers the sessions table of surface 5.
  - `overview-components.test.tsx`: an `estimated-cost` metric widget in each of the four variants, with `usageTotals({ costUsd: 0.005, estimatedCostUsd: 0.003, pricedRequestCount: 2, unpricedRequestCount: 3 })`, matches `~$0.005000` and `~$0.003000 approximate · 3 requests without a price`. With the default totals it matches neither a tilde before the amount nor `approximate`.
  - `tray-components.test.tsx`: `UsageOverviewPanel` with `modules={new Set(["stats"])}` and the same totals as `todayTotals` matches `~$0.005000`.
  - `share-cards.test.tsx`: the Spend Receipt with the same totals matches `~$0.005000` and the caption. `SpendReceiptCard` is not exported, so render `ShareCardWidget` with `type="share-spend-receipt"`. The file's own `emptyTotals` literal gains the three fields.
  - Copy in `packages/ui/test/component/cost-basis-extra.test.tsx` from the audit folder. Its seven tests cover an amount with no basis, the tray's re-export, the caption's plural, the other price source labels, Logs detail for a waiting row, a listed price, a user price of 0 and a pre-PR-144 row, a usage analysis row (surface 4), and the Usage Wrapped card (surface 10).

- [ ] **Step 6: Run the UI tests and see them fail.**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/usage-format.test.js`
Expected: the build stops with `No matching export in "packages/ui/src/pages/home/shared/usage.ts" for import "formatCost"` (run).

- [ ] **Step 7: Build the UI side.** Add the four functions to `shared/usage.ts`, importing `CostBasis` and `totalCostBasis` from `@llmr/core/contracts/app`. Add them to both export lists in `shared/external.tsx` (`:319`, `:428`), and re-export `formatTotalCost`, the one the tray uses, from `tray/shared.tsx` (`:34`). `emptyUsageTotals` (`shared/usage.ts:127`) and the tray's empty totals (`tray/shared.tsx:90`) gain the three fields. Typecheck lists every other `UsageTotals` literal that now lacks them. Change each surface as the table says. `overviewMetricDatum` returns an optional `caption`, and `OverviewMetricWidget` renders it as its own text element after the value in each variant, with no `truncate` class so it wraps (X-12). Nothing is conveyed by colour or by a `title` alone.

- [ ] **Step 8: Run `npm run test:ui`.** Expected: all pass.

- [ ] **Step 9: Cover the price editor's call site (P-8).** `updatePricing` (`providers.tsx:4876`) now passes `current` to the pure `modelMetadataAfterPriceEdit`, which `provider-model-pricing-edit.test.tsx` already covers. What no test covers is the call site, which a browser has to fire. The audit ran the test below once and it passed. Its prove-it-fails run was not done.

  The catalog's defaults reach an edit dialog only through the provider probe, whose result carries `catalogModelMetadata` for the catalog provider that matches the base URL (`probe.ts:383`), and `createProviderDraftFromProvider` starts with none. A preset's base URL is a real provider host, which the Global Constraints forbid in a test, and the dialog's probe would call it with the seeded key. So the test serves its own catalog:
  - `startCliWebServer` in `tests/e2e/cli-web-runtime.ts` takes a second argument, `env: Record<string, string> = {}`, spread last into the child's environment.
  - In `tests/e2e/provider-edit.spec.ts`, the new test writes a catalog file to a temp folder with one model: `provider: "fixture"`, `model: "priced-model"`, `modalities.output: ["text"]`, one `pricing.offers` entry with `source: "models.dev"`, `sourceUnit: "usd_per_1m_tokens"` and `per1MTokens: { input: 3, output: 15 }`, and one `sourceRecords` entry with `providerApi: "http://127.0.0.1:9/v1"`. `schemaVersion` is 2. It starts its own server with `LLMR_MODEL_CATALOG_PATH` set to that file and disposes it in a `finally`.
  - Seed one provider through `window.llmr!.saveConfig` with `api_base_url: "http://127.0.0.1:9/v1"`, a key, `models: ["priced-model"]` and no `modelMetadata`.
  - Open the provider's edit dialog and click the `priced-model` row. Assert that `page.getByLabel("Input(1M tokens/$)")` has the `placeholder` `"3"`, which proves the catalog's defaults loaded.
  - Fill only `Cache read(1M tokens/$)` with `0.5`, and save.
  - Assert with `expect.poll` on `window.llmr!.getConfig()` that `Providers[0].modelMetadata["priced-model"].pricing` equals `{ cacheReadUsdPerMillionTokens: 0.5 }`.

  Then prove the test can fail: in `updatePricing` temporarily pass `{ ...defaults?.[model], ...current }` to `modelMetadataAfterPriceEdit`, run `npm run build:assets` and the one spec, see it fail, and revert.

Run, for the one spec, which opens no Electron window: `npm run build:assets && npx playwright test tests/e2e/provider-edit.spec.ts`
Run: `npm run test:e2e`
Expected: all pass. Then `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 10: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui`
Expected: all pass.

- [ ] **Step 11: Commit.** `feat(usage): mark an estimated cost with a tilde and an unknown one with a dash, and name the price source in Logs`

---

### Task 6: Use the cost OpenRouter reports (P-5). Waits for the owner

OpenRouter states what it charged for a request in `usage.cost` (X-10). LLM Router ignores it and estimates from the `/models` list price. That estimate is wrong by design for a user of the bundled OpenRouter discount router, which picks an endpoint by its price. After this task a request served by an OpenRouter provider stores the reported figure, with source `provider_reported`, and shows it as reported.

It sits after Task 5, which displays the new source. It does not block Task 7.

**Why it waits.** The figure does not reach LLM Router on a translated response. The gateway parses every upstream usage block into `StandardUsage`, which has token counts, cache fields and `server_tool_use` and no cost field (`node_modules/@the-next-ai/ai-gateway/dist/types.d.ts:870`, version 1.0.22-llmr.4). Its formatters rebuild `usage` from that object. No file in the bundle reads `usage.cost`, `is_byok` or `upstream_inference_cost` (run, `grep -r` over `dist/`, no match). So a request from Claude Code (Anthropic messages) to an OpenRouter provider (chat completions), the bundled discount-router case this task is for, loses the field before LLM Router parses the body. A same-protocol response and the single-layout raw-trace body might keep it. Neither was checked. Making the main case work needs a fork change that carries `cost` through `StandardUsage`, and a push or tag on the fork needs the owner's word. The question is the second under "Open with the owner". Until it is answered, this task is not in a batch.

**Labelled assumption.** One OpenRouter credit is one US dollar. X-10 says the unit is credits, and the page the validation pass read never says dollars. This repo already rests on the same reading in two places. The OpenRouter preset labels the account's `total_credits` and `total_usage` with `unit: "USD"` (`packages/core/src/providers/presets/openrouter/index.ts:17`), and the price catalog reads OpenRouter's per-token `pricing` as dollars (`fetchOpenRouterPrices`). Neither proves it. Step 1 is the check, and the task stops there if it fails.

**Scope, stated so nothing is invented.**
- Only a provider the rule already treats as OpenRouter is trusted, by the test `openRouterEntry` uses (a base URL that maps to the `openrouter` catalog id, or a name that contains `openrouter`). A `usage.cost` from any other provider is ignored, because its unit is unknown.
- A request with `usage.is_byok: true` is not trusted. For such a request `cost` may be OpenRouter's fee alone, with the upstream charge in `cost_details.upstream_inference_cost`. The record does not settle that, so the request is priced by the rule as today.
- A price the user set for the model wins over the reported cost. The user wrote it on purpose.
- A reported cost of 0 counts as absent, and the request is priced by the rule. V-21 lets only a user price yield 0, and this keeps it so.
- Where the body LLM Router parses does not hold `usage.cost`, the estimate is used as today. Step 1 says where it does.

**Files:**
- Modify: `packages/core/src/usage/response-usage.ts`, `packages/core/src/models/pricing-service.ts`, `packages/core/src/contracts/app.ts` (`CostBasis`, `reportedCostSources`, `costBasisFor`), `packages/core/src/usage/store.ts` (`recordCapture`), `packages/core/src/observability/request-log-store.ts` (`record`, `updateFromRawTrace`), `packages/ui/src/pages/home/shared/usage.ts` (`formatCost`, `priceSourceLabel`)
- Test: `packages/core/test/unit/usage/response-usage.test.mjs`, `packages/core/test/unit/models/pricing-service.test.mjs`, `packages/core/test/integration/gateway/request-pipeline-cost-parity.test.mjs`, `packages/core/test/integration/observability/request-log-pricing-transaction.test.mjs`, `packages/ui/test/unit/usage-format.test.ts`

**Interfaces:**
- `ResponseUsage` gains `reportedCostUsd?: number`. It is `usage.cost` when that is a finite number above 0 and `usage.is_byok` is not `true`.
- `RequestPriceOutcome` gains an optional `trustReportedCost?: true` on each of its three states. `resolveRequestPrice` sets it for an OpenRouter provider, except on a `custom` price.
- In `contracts/app.ts`, `CostBasis` gains `"reported"`, and `export const reportedCostSources = ["provider_reported"]`. `costBasisFor` gives `reported` for a source in it, after the `listed` row. `formatCost` prints a reported cost with no tilde.
- `priceSourceLabel("provider_reported", "reported")` is `Reported by the provider`.

- [ ] **Step 1: Check where the figure arrives, and its unit.**
  - Write a wire test in `packages/core/test/integration/gateway/`, modelled on `october-issues-wire.test.mjs`, with a loopback stub upstream configured as a provider named `My OpenRouter` that answers with `usage.cost: 0.0123`. Send one request per case and read what `recordCapture` and `RequestLogStore.record` receive: chat completions in and out (same protocol), Anthropic messages in and chat completions out (translated), each with streaming on and off, in both the compatibility and the single layout. The stub is local and holds no key.
  - Expected from the reading above: the translated cases lose the field. If every case loses it, stop and report to the owner, because the task then needs the fork change. If only the translated cases lose it, the owner decides whether the same-protocol cases are worth building alone.
  - Read OpenRouter's own statement of what a credit is worth, on its documentation or FAQ, and record the sentence and the date in this task. If it does not say that a credit is a dollar, stop and report. The repo's two uses above do not settle it.

- [ ] **Step 2: Write the failing tests.** In `response-usage.test.mjs`:

```js
test("a cost the provider reports is read, and is not read for a request made with the user's own upstream key", () => {
  const body = (usage) => JSON.stringify({ model: "m", usage: { completion_tokens: 1, prompt_tokens: 1, ...usage } });
  assert.equal(extractUsageFromBody(body({ cost: 0.0123 })).reportedCostUsd, 0.0123);
  assert.equal(extractUsageFromBody(body({ cost: 0 })).reportedCostUsd, undefined);
  assert.equal(extractUsageFromBody(body({ cost: 0.0123, is_byok: true })).reportedCostUsd, undefined);
  assert.equal(extractUsageFromBody(body({ cost: -1 })).reportedCostUsd, undefined);
  assert.equal(extractUsageFromBody(body({ cost: "0.0123" })).reportedCostUsd, undefined);
  const stream = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }], model: "m" })}`,
    `data: ${JSON.stringify({ choices: [{ delta: {} }], model: "m", usage: { completion_tokens: 1, cost: 0.02, prompt_tokens: 1 } })}`,
    "data: [DONE]"
  ].join("\n");
  assert.equal(extractUsageFromBody(stream).reportedCostUsd, 0.02);
});
```

In `pricing-service.test.mjs`, inside `withPriceCatalogs`, with the config of `an OpenRouter provider is priced by OpenRouter's own entry, and no other provider is`:

```js
assert.equal(resolveRequestPrice(config, "Router", "anthropic/claude-haiku-5-5").trustReportedCost, true);
assert.equal(resolveRequestPrice(config, "Router", "lab/nowhere").trustReportedCost, true);
assert.equal(resolveRequestPrice(config, "VM Custom", "claude-haiku-5-5").trustReportedCost, undefined);
```

and a fourth, with a user price set on the OpenRouter provider's model: `trustReportedCost` is `undefined` and the source is `custom`.

In `request-pipeline-cost-parity.test.mjs`, which after Task 3 closes the runtime in an `after()` hook, a test with a provider named `My OpenRouter`, which the rule treats as OpenRouter by its name, and an upstream body whose `usage` holds `cost: 0.0123` beside its token counts. Both rows read `{ cost_source: "provider_reported", cost_usd: 0.0123 }`, and `assert.deepEqual(logRow, usageRow)`. The same request with `is_byok: true` gives both rows the catalog's price and source. This body reaches the pipeline untranslated, so the test proves the store side only. Step 1's wire test is what proves the field arrives.

In `request-log-pricing-transaction.test.mjs`: a record with `price: { state: "no-catalog", trustReportedCost: true }` and a body with `usage.cost: 0.5` stores `{ cost_source: "provider_reported", cost_usd: 0.5 }`, and a raw trace for that row whose body says `cost: 0.75` changes the cost to 0.75. A row whose source is `litellm` keeps its cost when a raw trace with a `usage.cost` arrives.

- [ ] **Step 3: Run them and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/usage/response-usage.test.js`
Expected: FAIL, `reportedCostUsd` is `undefined` where 0.0123 is expected.

- [ ] **Step 4: Build it.**
  - `response-usage.ts`: read the field in `extractUsageSnapshot`. `mergeUsageSnapshots` already carries any field of the last chunk that states it.
  - `resolveRequestPrice`: compute the OpenRouter test once, share it with `openRouterEntry`, and set the flag on the outcome it returns.
  - `UsageStore.recordCapture`: when the outcome trusts a reported cost and the body states one, pass `costUsd` and `costSource: "provider_reported"` to `record`, which already prefers an explicit cost over any estimate.
  - `RequestLogStore.record`: the same preference. The row stores the reported cost and source and an empty `pricing_json`.
  - `updateFromRawTrace`: a body that states a reported cost replaces the cost of a row whose `cost_source` is `provider_reported`, and of no other row.
  - A `provider_reported` row is never waiting for the catalog, so the sweep and a price update skip it by their existing `cost_usd IS NULL` condition.

- [ ] **Step 5: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run build:assets`
Expected: all pass. Then `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 6: Commit.** `feat(usage): use the cost OpenRouter reports for a request in place of an estimate`

---

### Task 7: Price a long prompt by the catalog's tier (P-4, X-7, X-8, X-9)

A Claude Haiku 5.5 request whose prompt is over 100,000 tokens is estimated at a fifth of the price Anthropic lists (X-7). models.dev carries the tier in `cost.tiers`, and LiteLLM in `_above_<N>k_tokens` fields. Neither is read. After this task a request whose prompt is over a tier's size is priced at that tier.

It sits last among the built tasks because it changes how every catalog price is applied, and it builds on the one lookup Task 3 leaves.

**Evidence and its limits.**
- 904 offers in the bundled `packages/core/models.json` carry a tier list, 66 of them more than one tier (run again 2026-11-24). That file is a converted snapshot of the same source: it holds the list under `tiered.tiers` beside a camelCase `per1MTokens` base, and its tiers have no `tier.type`. The pricing service fetches the live `api.json`, whose shape `{ input, output, cache_read, cache_write, tier: { type: "context", size } }` under `cost.tiers` is X-9's. Step 4 requires only `tier.size`, so a missing `type` does no harm.
- Assumed, from X-7 and X-8 and not from models.dev's own documentation. A tier applies when the prompt is over `size` tokens, not at it, and it prices the whole request, output included. Step 1 checks it. 26 offers write sizes as N+1 (32001, 200001 and others), which under the "over `size`" rule moves the threshold by one token (audit count, not re-run).
- In the same snapshot, 104 of those offers have a tier with no cache read price (run again). Of those, 17 have a base cache read price by a count of `per1MTokens.cacheRead` on 2026-11-24, where the drafter and the audit counted 20. For those the tier keeps the base entry's cache prices, which under-states a cached long prompt on those offers. Nothing is scaled, because no catalog states the scaled figure.
- The snapshot's `anthropic/claude-haiku-5-5` matches X-7 (run): a base of $0.10 and $0.50 with cache read $0.01, and one tier at 100,000 of $0.50 and $2.50 with cache read $0.05 and cache write $0.625.
- 710 snapshot offers also carry a `context_over_200k` field, and on the one the audit read its threshold disagreed with the tier's `size`. This task reads `tiers` only (audit count, not re-run).
- A tier is chosen when the cost is written. A later token correction from a raw trace re-prices the Logs row from the price stored on it, so a correction that crosses a tier's size keeps the first tier. Accepted.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts`, `packages/core/src/usage/store.ts`, `packages/core/src/observability/request-log-store.ts`
- Test: `packages/core/test/unit/models/pricing-service.test.mjs`, `packages/core/test/integration/gateway/request-pipeline-cost-parity.test.mjs`

**Interfaces:**
- `export type PriceTier = { abovePromptTokens: number; pricing: CompleteModelPricing }`
- `ResolvedModelPrice` gains `tiers?: PriceTier[]`, ascending by `abovePromptTokens`. A `custom` price has none.
- `export function pricingForPrompt(price: ResolvedModelPrice, promptTokens: number): CompleteModelPricing`. It returns the pricing of the highest tier whose `abovePromptTokens` is below `promptTokens`, or `price.pricing`.
- `export function promptTokenCount(usage: { cacheReadTokens?: number; cacheWriteTokens?: number; inputTokens?: number }): number`, the sum of the three after normalization, which is how X-7 counts a prompt.
- A tier's pricing is the base entry's pricing overlaid with the tier's own fields.

- [ ] **Step 1: Check the tier rule.** Read the models.dev repository's description of `cost.tiers` and record what it says `tier.size` means. Then compare the live `anthropic/claude-haiku-5-5` entry with X-7: a base of $0.10 and $0.50 and a tier at 100,000 of $0.50 and $2.50. If models.dev defines the tier as applying only to the tokens above `size`, stop and report, because `pricingForPrompt` is then the wrong shape.

- [ ] **Step 2: Write the failing tests.** In `pricing-service.test.mjs`:

```js
const tieredHaiku = {
  anthropic: { models: { "claude-haiku-5-5": {
    cost: {
      cache_read: 0.01, input: 0.1, output: 0.5,
      tiers: [{ cache_read: 0.05, input: 0.5, output: 2.5, tier: { size: 100000, type: "context" } }]
    },
    id: "claude-haiku-5-5"
  } } }
};

test("a prompt over a tier's size is priced at the tier, and one at or under it at the base price", async () => {
  await withPriceCatalogs({ modelsDev: tieredHaiku }, () => {
    const outcome = resolveRequestPrice(customConfig, "VM Custom", "claude-haiku-5-5");
    assert.deepEqual(outcome.price.tiers, [{
      abovePromptTokens: 100000,
      pricing: { cacheReadUsdPerMillionTokens: 0.05, inputUsdPerMillionTokens: 0.5, outputUsdPerMillionTokens: 2.5 }
    }]);
    const cost = (usage) => estimateUsageCost({
      ...usage, model: "claude-haiku-5-5", outputTokens: 1000,
      pricing: pricingForPrompt(outcome.price, promptTokenCount(usage)), pricingSource: outcome.price.source
    }).amountUsd;
    assert.ok(Math.abs(cost({ cacheReadTokens: 130_000, inputTokens: 20_000 }) - 0.019) < 1e-12);
    assert.ok(Math.abs(cost({ cacheReadTokens: 30_000, inputTokens: 20_000 }) - 0.0028) < 1e-12);
    assert.ok(Math.abs(cost({ cacheReadTokens: 80_000, inputTokens: 20_000 }) - 0.0033) < 1e-12, "exactly 100,000 is the base price");
  });
});

test("a tier with no cache price keeps the base entry's cache price", async () => {
  const modelsDev = { lab: { models: { m: { cost: { cache_read: 0.2, input: 1, output: 2, tiers: [{ input: 2, output: 4, tier: { size: 200000 } }] } } } } };
  await withPriceCatalogs({ modelsDev }, () => {
    const price = resolveRequestPrice({ Providers: [{ baseUrl: "https://api.example.com", models: ["m"], name: "Lab" }] }, "Lab", "lab/m").price;
    assert.deepEqual(pricingForPrompt(price, 200_001), { cacheReadUsdPerMillionTokens: 0.2, inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 4 });
  });
});

test("LiteLLM's above-N fields become tiers, ascending", async () => {
  const liteLlm = { "tiered-model": {
    input_cost_per_token: 0.000001, input_cost_per_token_above_200k_tokens: 0.000002, input_cost_per_token_above_272k_tokens: 0.000003,
    output_cost_per_token: 0.000004, output_cost_per_token_above_200k_tokens: 0.000006
  } };
  await withPriceCatalogs({ liteLlm }, () => {
    const price = resolveRequestPrice(customConfig, "VM Custom", "tiered-model").price;
    assert.deepEqual(price.tiers.map((tier) => [tier.abovePromptTokens, tier.pricing.inputUsdPerMillionTokens, tier.pricing.outputUsdPerMillionTokens]), [[200000, 2, 6], [272000, 3, 4]]);
  });
});

test("a user price has no tiers", async () => {
  const pricing = { inputUsdPerMillionTokens: 9, outputUsdPerMillionTokens: 9 };
  const config = { Providers: [{ ...customProvider, modelMetadata: { "claude-haiku-5-5": { pricing } } }] };
  await withPriceCatalogs({ modelsDev: tieredHaiku }, () => {
    assert.equal(resolveRequestPrice(config, "VM Custom", "claude-haiku-5-5").price.tiers, undefined);
  });
});
```

The first test's three costs: 20,000 at $0.5, 130,000 at $0.05 and 1,000 at $2.5 per million is $0.019. 20,000 at $0.1, 30,000 at $0.01 and 1,000 at $0.5 is $0.0028. 20,000 at $0.1, 80,000 at $0.01 and 1,000 at $0.5 is $0.0033. The third LiteLLM tier has no output price of its own, so it keeps the base output price of $4.

In `request-pipeline-cost-parity.test.mjs`, which after Task 3 closes the runtime in an `after()` hook, a test whose catalog gives the mapped provider's model a tier at 100,000 and whose upstream body reports `input_tokens: 150000`. Both rows hold the tier's cost, and `assert.deepEqual(logRow, usageRow)`.

- [ ] **Step 3: Run them and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`
Expected: FAIL, `pricingForPrompt` is not exported.

- [ ] **Step 4: Build it.**
  - `CatalogEntry` gains `tiers?: PriceTier[]`, and `addCatalogEntry` takes them. `fetchModelsDevPrices` reads `cost.tiers`, and an entry counts when `tier.size` is a number above 0 and it states an input or an output price. `fetchLiteLlmPrices` collects every `N` for which `input_cost_per_token_above_<N>k_tokens` exists, and reads the output, cache read and cache creation fields with the same suffix.
  - `resolveRequestPrice` copies the entry's `tiers` into the price. The median step already returns the offer's whole entry.
  - The four places that turn a resolved price into a cost choose the tier first, with `pricingForPrompt(price, promptTokenCount(tokens))`. They are `UsageStore.record`, the usage sweep, `RequestLogStore.record` and `applyPriceUpdate`. `pricingForWrite` passes the whole `ResolvedModelPrice` through for that. The Logs row's `pricing_json` holds the pricing that was chosen.

- [ ] **Step 5: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run build:assets`
Expected: all pass. `usage-store.test.mjs` has two tests that compare the whole estimator input with `deepEqual`, and they pass unchanged because the estimator still receives one flat `pricing`. Then `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 6: Commit.** `feat(usage): price a prompt over a catalog tier's size at that tier`

---

### Task 8: Price by the service tier the response reports (P-4). Waits for the owner

An OpenAI response states the tier that served it in `service_tier` (X-8). A priority request costs about twice the standard price and a flex request about half. LiteLLM carries `_priority` and `_flex` fields. models.dev carries no service-tier price (X-9).

**Why it waits.** The rule (V-21) prices an OpenAI model from the maker's models.dev entry, before it reaches LiteLLM. So reading LiteLLM's service-tier fields only where the price already came from LiteLLM would change almost no request. Making the task useful means letting the service tier choose a different source, which changes the rule the owner decided. The question is the first under "Open with the owner".

**What is settled whichever way that goes**, so the task can be finished quickly after the answer:
- `ResponseUsage` gains `serviceTier?: string`, read in `extractUsageSnapshot` from the response's top-level `service_tier`, then `usage.service_tier`.
- Both tables gain `service_tier TEXT NOT NULL DEFAULT ''`, added the way `cost_source` was (`ensureUsageSchema` in `usage/store.ts`, `addColumn` in `request-log-store.ts`), written by `record` and read by the sweep and by `applyPriceUpdate`, so a row priced late is priced at its own tier.
- `fetchLiteLlmPrices` reads the `_priority` and `_flex` forms of the four base fields and of each `_above_<N>k_tokens` field into `serviceTiers?: Partial<Record<"flex" | "priority", { pricing: CompleteModelPricing; tiers?: PriceTier[] }>>` on the entry.
- `pricingForPrompt` becomes `pricingForRequest(price: ResolvedModelPrice, request: { promptTokens: number; serviceTier?: string }): CompleteModelPricing`. A tier value with no price set, `default` and `auto` among them, uses the standard prices.
- Tests: a `priority` response on a fixture LiteLLM entry gives the priority price in both rows of the parity test. A `default` response gives the standard one. A tier name no catalog prices gives the standard one.
- Commit: `feat(usage): price a request by the service tier its response reports`

Not priced either way: Anthropic's fast mode (`usage.speed`) and OpenAI's newer tier names, which LiteLLM states as a multiplier or not at all. Option C under "Open with the owner" marks them as estimates.

---

## Open with the owner

1. **Which price a priority or flex request takes when the rule's price has no service-tier figure.** Task 8 waits on this. models.dev, which prices most models first under V-21, has no service-tier price. LiteLLM has one for 468 entries (priority) and 335 (flex), per the validation pass.
   - **A. Only where the price already came from LiteLLM.** No change to the rule. Changes very few requests, and a priority request on a models.dev price stays at about half its real cost.
   - **B. For a request whose response reports `priority` or `flex`, take LiteLLM's entry for that model when it has a price for the tier, and label it `litellm`.** The figure is a listed one. The rule gains a branch that depends on the response body. `priceFor` already resolves after the response headers arrive (`pipeline.ts:279`), so the cost is reading the body's `service_tier` before resolving, which for a stream is at its end.
   - **C. Do not price the tier. Mark such a request's cost as an estimate** (Task 5's tilde) when the response reports a tier priced differently from standard and the price has no figure for it. Small, honest, and no new price logic. The tiers that mark a cost, restated on 2026-11-27 from `../research/2026-11-27-decisions-pricing-round-2.md` (F-PRICE-7):
     - OpenAI: the top-level `service_tier` is `priority`, `fast`, `flex` or `ultrafast`. `default`, `auto`, `scale` and an absent field leave the cost as it is.
     - Anthropic: `usage.speed` is `fast`. `usage.service_tier` marks nothing. `standard` there is an ordinary request, so "a tier other than `default`" would have marked every Anthropic request.
     - Google: the `x-gemini-service-tier` response header is `priority` or `flex`. Whether the gateway passes that header on to LLM Router was not checked.
     - The limit, run on gateway 1.0.22-llmr.4. A translated reply that is not streamed drops `service_tier` and `usage.speed` in every store, as it drops a provider's reported cost. A translated stream keeps them in the single layout only, and in the compatibility layout its usage row loses them. Those costs stay unmarked. A new tier name also stays unmarked until it is added to the list.
   - **Recommendation: C now, B later if the owner wants the figure.** C costs Task 8's settled parts plus a reader for `usage.speed` and one for the `x-gemini-service-tier` header. Apart from the limit above, it never shows a standard price as exact for a request whose response reports another tier. B is the only option that shows the right number, and it reopens "resolved once per request".

2. **Whether to change the gateway fork so a provider's reported cost survives protocol translation.** Task 6 waits on this. The fork's `StandardUsage` has no cost field, and nothing in the bundle reads `usage.cost` (read, 1.0.22-llmr.4). Without a fork change, Task 6 helps only a same-protocol OpenRouter request, if any, which its Step 1 wire test would show.
   - **A. Change the fork.** Add an optional `cost` (and `is_byok`) to `StandardUsage`, read them from an OpenRouter chat completion, and emit them in every formatter's `usage`. Then build Task 6 against the new pin. Needs the owner's word for the fork push and tag.
   - **B. Build Task 6 for same-protocol requests only**, if Step 1 shows the field arrives there.
   - **C. Drop P-5.** Keep pricing OpenRouter requests from OpenRouter's own `/models` entry, as the rule does today, and let Task 5 label it a list price.
   - **Recommendation: C now, A later if the owner uses the discount router.** C costs nothing and shows an honest label. A is the only option that shows the charged figure for the bundled case. B builds a reader for a path the main case never takes. Task 6's Step 1 is cheap and settles B either way, so run it first if the owner leans to A or B.

Nothing else in this plan waits on the owner.
