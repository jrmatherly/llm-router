# Finish and release 9.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status, 2026-11-27: written, not built.** The owner chose the scope that day: the two wrong costs, the survey, and the small fixes with a one-line recommendation, released as 9.1.0. Tasks 2 to 8 were checked against `main` `b504d153` on another model before this text was written. That check wrote each task's test and saw it fail on `main` for the reason the finding gives, then built each fix in a throwaway worktree and saw the test pass (run). Nobody reviewed those throwaway fixes, and this text was not audited after it was written. The lead checked that every helper the tests below call exists in the file each test goes into (run). The check's tests as patches against `b504d153`, and its throwaway fixes, are outside the repo in `private/research/2026-11-27-pre-release-findings/` of the main checkout. Tasks 1, 9, 10, 11 and 12 point at text that already exists and add none.

**Goal:** Release what is on `main` as 9.1.0 with seven small faults fixed first, run the one VM pass on that release, and leave every other open finding in a remediation plan.

**Architecture:** Three pieces of code work and three of process. One branch, `fix/pre-release-findings`, carries seven commits, one per finding, and lands as one squash-merged PR. The gateway fork release (batch 5) is built and waits on the owner's word. The release, the VM pass and the remediation plan follow in that order, and gateway phase 1 comes after them.

**Tech Stack:** TypeScript on Node, `node:test` with `node:assert/strict`, better-sqlite3, npm workspaces, GitHub Actions.

**Spec:** This plan has no spec of its own. It argues from four files, and an executor reads the first two.
- [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md), the record of the batches. Its decisions 1 to 9 bind this plan. This plan takes over from its "Order" and "The end" sections.
- [`2026-11-27-open-findings.md`](2026-11-27-open-findings.md), the register of 170 open findings. Every ID below (`F-PRICE-1` and so on) is a row there.
- [`../research/2026-11-27-zero-listed-price.md`](../research/2026-11-27-zero-listed-price.md), the research for F-PRICE-3.
- [`../research/2026-11-27-logs-row-without-usage-row.md`](../research/2026-11-27-logs-row-without-usage-row.md), the survey for F-PRICE-10.

## Global Constraints

- npm only. `npm ci` in a fresh worktree before anything else, or the commit gate blocks.
- Never run `npm run test:e2e`, Playwright, Electron or the desktop app on the owner's Mac. CI runs them. They take his screen.
- Never run `npm run build:assets` or `npm run models:build` on the branch. They rewrite generated files.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/<unit|integration>/<path>.test.js`. No `--scope`.
- A task builds what its text says and nothing else (decision 9). Anything else found is written into the register with its evidence and left.
- One commit per task, in the order given. Each commit holds its fix and its test and leaves the suite green.
- Merging needs the owner's word, once per PR. A push or a tag on `jrmatherly/llmr-gateway` needs his word each time.
- Check the Windows job by hand before calling a PR green. It is not a required check. When auto-merge is refused, merge with `gh pr merge <n> --squash --match-head-commit <sha>`.
- Style: double quotes, semicolons, two-space indent, no comments except a non-obvious why. `npm run lint` through rtk can show a false exit 2, so confirm with `rtk bypass npm run lint`.
- Docs-only changes commit straight to `main`. Code goes through the branch and the PR.

## The owner's answers, 2026-11-27

| Question | Answer |
|---|---|
| Which findings are fixed before the release | F-PRICE-1 and F-PRICE-2, a survey for F-PRICE-10, and the small fixes with a one-line recommendation. Tasks 2 to 8 |
| The version | 9.1.0 |
| The gateway fork push and the `llmr.5` tag | Not yet. Task 1 waits |
| Whether a model listed at zero reads as an unknown price (F-PRICE-3) | He asked for research first. It is done, and the decision is under "Open with the owner" |

## Open with the owner

Each has a default. The release does not wait for any of them unless he says so.

| # | Question | Default | Evidence |
|---|---|---|---|
| 1 | **F-PRICE-3.** Should a zero that is the offer of the provider the request went to show `$0.00` and "Listed at no charge"? The research recommends yes: it changes 80 live offers on 8 presets, and a zero from any other offer stays "no price here". It changes the last sentence of V-21, which V-21's own row says was the plan author's (read) | No change. A free model reads "No price found", as built | The zero-listed-price note |
| 2 | **New, from that research.** 207 live zero offers take a paid price from another provider's offer today and show it as a list price with no tilde. A free OpenCode model reads as 0.3 and 1.2 per million. Should a zero offer stop the rule from following its canonical id to the maker's entry? The cause was read and then inferred, and the count was run by the researcher only | No change until he answers. Register row F-PRICE-36 | The same note, "Gaps" 1 |
| 3 | Release the fork commit of batch 5 with 9.1.0, or hold it for the next fork release | Hold. 9.1.0 ships on `llmr.4` | Task 1 |
| 4 | Pricing Task 6, the cost a provider reports, needs a fork change | No. Drop P-5 for now | Delivery index question 2 |
| 5 | Pricing Task 8, the service tier price | The pricing plan's option C, built after the release | Delivery index question 3 |
| 6 | Where gateway phase 1 sits beside the remediation release | After it | Delivery index, "After the release" |
| 7 | The gateway phase 0 plan's status line still says Task 5 is not built. Another session owns the file | This session corrects the one line on his word | `2026-11-25-apps-gateway-phase-0.md` line 3 |
| 8 | RS-5, four repository settings | After the release. They gate nothing | Register row F-TEST-5 |

## Review Focus

What the tasks' tests do not exercise and a reviewer should try, most likely first.

1. **A Logs row written by 9.0.0 or by today's `main`, then a trace.** Its `pricing_json` is the flat shape with no `tiers`. It must be read and re-priced at its stored price. Task 5's helper writes the flat shape for a price with no tiers, so the existing tests of a re-priced row cover the read (`request-log-price-update.test.mjs`, `request-log-pricing-transaction.test.mjs`). No test seeds a row by hand in the old shape.
2. **A tier that states 0 on one side only.** Task 2 drops the 0 and the tier takes the base entry's price for that side. Its test covers a 0 cache field and a tier of 0 and 0. No test has input 0 beside a real output.
3. **A second process that holds the schema lock for more than 5 seconds.** The open throws `SQLITE_BUSY` after the busy timeout, which blocks the thread while it waits. That is no worse than today's error and no test reaches it.
4. **An identity id that contains a comma.** Task 8 keeps the part before the first comma. An e-mail address cannot hold an unquoted comma. An id could, and it would be cut.
5. **A stored cost of exactly 0 on a request with no tokens.** Task 3 leaves it with no basis, so it shows a dash and not `~$0.00`. The test asserts it. The audit's own wording would give it a basis, and F-PRICE-4 keeps the dash.

## Order

1. Tasks 2 to 8, one branch, one PR. Nothing else is open beside it, since it touches both stores.
2. Task 1 whenever the owner gives his word. Before the release if he answers question 3 with yes, after it otherwise.
3. Task 9 at any time. It changes no product code.
4. Task 10, the release. Then Task 11, the VM pass. Then Task 12.

The method for Tasks 2 to 8 is the one batch 10b set, in the delivery index under "Before a batch is built": a builder on Opus in a worktree from this text, one callers reviewer on Fable given the lead's guesses, one fix round, and a test for any mutant that survives. No separate audit build, since the check behind this text already built each fix once. Expected time from the owner's word to an open PR is 60 to 90 minutes (inferred from batches 14 and 15, not measured).

---

### Task 1: Release the gateway fork as `llmr.5` and move LLM Router to it (batch 5). Waits on the owner's word

The text is harness Task 5, Steps 6 and 7, in [`2026-11-22-backlog-harness.md`](2026-11-22-backlog-harness.md). Steps 1 to 5 are done: commit `d35913c` on the local branch `fastify-log-controller` of the clone at `~/dev/llmr-gateway`, pushed nowhere. The fork's suite was 1018 passed and 7 skipped before and after, and a built gateway printed 0 request lines with access logs off and 4 with them on (run, 2026-11-27).

**Files:**
- Fork: `package.json` and `package-lock.json` (the version), through `npm version`
- Modify: `packages/core/package.json:19`, `packages/cli/package.json:39`, `package-lock.json` (through npm)

**Interfaces:**
- Consumes: fork commit `d35913c`.
- Produces: the fork release `v1.0.22-llmr.5` with the asset `the-next-ai-ai-gateway-1.0.22-llmr.5.tgz`, and LLM Router branch `fix/gateway-log-control`.

- [ ] **Step 1: GATE.** The owner's word for the fork push and the tag. Nothing below runs before it.
- [ ] **Step 2: Release the fork.** Harness Task 5 Step 6 as written: merge the branch into `llmr`, `npm version 1.0.22-llmr.5 --no-git-tag-version`, commit `chore: release 1.0.22-llmr.5`, push, tag, push the tag. Expected: the fork's release workflow passes and the release holds the `.tgz`. The recipe and the `gh run watch` note are in [`completed/2026-11-18-gateway-fork.md`](completed/2026-11-18-gateway-fork.md), Task 1 Step 7 and Task 3 Step 6.
- [ ] **Step 3: Bump LLM Router.** Harness Task 5 Step 7 as written, on `fix/gateway-log-control` from `main`. Expected: `git diff --stat` shows the two manifests and the lockfile, and `npm run typecheck`, `npm run lint`, `npm run test:architecture` and `npm run test:core` with `LLMR_TEST_GATEWAY_ENTRY` set all pass.
- [ ] **Step 4: Commit and open the PR.** `fix(gateway): move to gateway 1.0.22-llmr.5, which starts without the Fastify deprecation warning`. The merge needs his word.

---

### Task 2: A 0 in a price tier's field reads as absent (F-PRICE-28)

Today a tier's 0 replaces the base entry's price for that field, so a long prompt's cache writes cost nothing on the 10 bundled tiers that list a cache write of 0.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts`, `addCatalogEntry`, the tier overlay near `:612-617`
- Test: `packages/core/test/unit/models/pricing-service.test.mjs`

**Interfaces:**
- Produces: `function positivePrices(candidate: ProviderModelPricing): ProviderModelPricing`, private to the file. It keeps only the fields whose value is above 0.

- [ ] **Step 1: Write the failing test.** Append:

```js
test("a 0 in a tier's field reads as absent, so the tier keeps the base entry's price for that field", async () => {
  const lab = { Providers: [{ baseUrl: "https://api.example.com", models: ["m"], name: "Lab" }] };
  const modelsDev = { lab: { models: { m: { cost: { cache_read: 0.2, cache_write: 1.25, input: 1, output: 2, tiers: [
    { cache_read: 0, cache_write: 0, input: 2, output: 4, tier: { size: 200000 } },
    { input: 0, output: 0, tier: { size: 300000 } }
  ] } } } } };
  await withPriceCatalogs({ modelsDev }, () => {
    const price = resolveRequestPrice(lab, "Lab", "lab/m").price;
    assert.deepEqual(pricingForPrompt(price, 200_001), { cacheReadUsdPerMillionTokens: 0.2, cacheWriteUsdPerMillionTokens: 1.25, inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 4 });
    assert.deepEqual(price.tiers.map((tier) => tier.abovePromptTokens), [200000], "a tier whose input and output are both 0 is left out");
  });
  const liteLlm = { "tiered-model": {
    cache_creation_input_token_cost: 0.00000125, cache_creation_input_token_cost_above_200k_tokens: 0,
    input_cost_per_token: 0.000001, input_cost_per_token_above_200k_tokens: 0.000002,
    output_cost_per_token: 0.000004, output_cost_per_token_above_200k_tokens: 0
  } };
  await withPriceCatalogs({ liteLlm }, () => {
    const tier = pricingForPrompt(resolveRequestPrice(customConfig, "VM Custom", "tiered-model").price, 200_001);
    assert.deepEqual([tier.inputUsdPerMillionTokens, tier.outputUsdPerMillionTokens, tier.cacheWriteUsdPerMillionTokens], [2, 4, 1.25]);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`. Expected: FAIL, with `cacheReadUsdPerMillionTokens: 0` and `cacheWriteUsdPerMillionTokens: 0` where 0.2 and 1.25 are expected.
- [ ] **Step 3: Add `positivePrices` and use it in the overlay.** Map each tier candidate's pricing through it first, then run the existing filter (input or output defined, size above 0), then spread the result over the base as today. `definedPrices` stays for the base entry, where a 0 on one side has a meaning.
- [ ] **Step 4: Run the file again.** Expected: PASS, every test in the file. Then `request-pipeline-cost-parity.test.js` under `integration/gateway`: PASS.
- [ ] **Step 5: Commit.** `fix(usage): read a 0 in a price tier's field as absent`

---

### Task 3: A stored cost on a request with no tokens gets a basis (F-PRICE-2)

Today `costBasisFor` returns nothing whenever a row has no billable tokens, before it looks at the cost, so a total shows `-` while $0.50 is stored.

**Files:**
- Modify: `packages/core/src/contracts/app.ts`, `costBasisFor`, near `:2320-2331`
- Modify: `packages/core/src/usage/store.ts`, `usageTotalsSelect`, the two lines near `:998` and `:1002`
- Test: `packages/core/test/integration/usage/cost-basis-extra.test.mjs`

**Interfaces:**
- Produces: `costBasisFor` with the same signature. A row with a cost above 0 gets a basis by its source whatever its tokens. A row with no tokens and no cost, or with no tokens and a cost of 0, gets none.

- [ ] **Step 1: Write the failing test.** Append:

```js
test("a stored cost on a request with no tokens counts in the totals by its source, and a total beside an unpriced request is an estimate, not a dash", async () => {
  const billedNoTokens = { costSource: "gateway_billing", costUsd: 0.5, tokens: {} };
  const alone = await usageStoreWithRows("llmr-usage-basis-no-token-cost-test-", [billedNoTokens]);
  const beside = await usageStoreWithRows("llmr-usage-basis-no-token-cost-beside-test-", [billedNoTokens, { costSource: "", tokens: { input: 10 } }]);
  try {
    const aloneTotals = (await alone.store.getStats("24h", { includeProxy: true })).totals;
    assert.deepEqual(costFields(aloneTotals), { estimatedCostUsd: 0.5, pricedRequestCount: 1, unpricedRequestCount: 0 });
    assert.equal(totalCostBasis(aloneTotals), "estimate");
    const besideTotals = (await beside.store.getStats("24h", { includeProxy: true })).totals;
    assert.deepEqual(costFields(besideTotals), { estimatedCostUsd: 0.5, pricedRequestCount: 1, unpricedRequestCount: 1 });
    assert.equal(totalCostBasis(besideTotals), "estimate");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "gateway_billing", costUsd: 0.5 }), "estimate");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "models.dev", costUsd: 0.5 }), "listed");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "custom", costUsd: 0.5 }), "user");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "gateway_billing", costUsd: 0 }), undefined);
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "", costUsd: undefined }), undefined);
  } finally {
    removeTestDir(alone.dir, ["usage.sqlite", "request-logs.sqlite"]);
    removeTestDir(beside.dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test .test-dist/core/test/integration/usage/cost-basis-extra.test.js` after the build. Expected: FAIL, `estimatedCostUsd: 0, pricedRequestCount: 0` where 0.5 and 1 are expected.
- [ ] **Step 3: Change `costBasisFor`.** Replace its first two checks with one: when the cost is undefined, or the row has no billable tokens and a cost of 0 or less, return `"unknown"` for a row with tokens and `undefined` for a row without. The source checks below stay.
- [ ] **Step 4: Change the SQL to match.** In `usageTotalsSelect`, the condition for `estimated_cost_usd` and the one for `priced_request_count` both become `cost_usd IS NOT NULL AND (${billableTokensSql} > 0 OR cost_usd > 0)`. The unpriced count is unchanged. Nothing else is edited: `toStoredUsageEvent`, `toRequestLogEntry` and the Agent Analysis totals call `costBasisFor`, and the UI only formats a basis.
- [ ] **Step 5: Run the file again.** Expected: PASS, and its first test, which puts 198 row shapes through both the function and the SQL, still passes. That test is the guard against the two drifting apart. Then `pricing-service.test.js`: PASS.
- [ ] **Step 6: Commit.** `fix(usage): give a stored cost its basis when the request has no tokens`

---

### Task 4: A row copied from Logs into the totals is priced by its routed model (F-PRICE-11)

Today `backfillFromAttachedRequestLog` copies `logs.model` and no `price_model`, so the sweep resolves the alias the response named and marks the row `unpriced` for good. The survey for F-PRICE-10 found this path is the one that serves a cancelled or failed stream in the compatibility layout.

**Files:**
- Modify: `packages/core/src/usage/store.ts`, `backfillFromAttachedRequestLog`, near `:611-683`
- Test: `packages/core/test/integration/usage/usage-sweep.test.mjs`

**Interfaces:**
- Produces: a copied row whose `price_model` is the Logs row's `resolved_model`, or `''` when the attached database has no such column.

- [ ] **Step 1: Write the failing test and its guard.** Append both:

```js
test("a waiting log row copied into the totals is priced by the routed model the log row holds, in both rows", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-copied-routed-"));
  const logFile = path.join(dir, "request-logs.sqlite");
  const logs = new RequestLogStore(logFile);
  try {
    const now = new Date().toISOString();
    await logs.writeBatch([{
      eventId: "event",
      input: { completedAt: now, durationMs: 1, method: "POST", model: "Vendor/some-model", path: "/v1/messages", price: { state: "no-catalog" }, providerName: "ProviderA", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId: "copied", resolvedModel: "Vendor/some-model", responseBodyText: '{"model":"my-alias","usage":{"input_tokens":10,"output_tokens":1}}', responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence: 1
    }]);
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true, requestLogDbFile: logFile });
    let writes = Promise.resolve();
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => { writes = writes.then(() => logs.writeBatch([{ input: updates, kind: "price-update", sequence: 2 }])); },
      resolvePrice: (_provider, model) => model === "Vendor/some-model" || model === "known-model" ? price : { state: "unpriced" }
    });
    await store.getStats("24h", { includeProxy: true });
    await store.record({ ...event, requestId: "trigger" });
    const read = (database, table) => ({ ...database.prepare(`SELECT cost_source, cost_usd FROM ${table} WHERE request_id = 'copied'`).get() });
    await until(async () => read(await store.getDatabase(), "usage_events").cost_source !== "");
    await writes;
    assert.deepEqual({ ...(await store.getDatabase()).prepare("SELECT price_model FROM usage_events WHERE request_id = 'copied'").get() }, { price_model: "Vendor/some-model" });
    assert.deepEqual(read(await store.getDatabase(), "usage_events"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(read(await logs.getDatabase(), "request_logs"), { cost_source: "litellm", cost_usd: 1 });
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a log database with no resolved_model column is still copied into the totals", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-copied-old-log-"));
  const logFile = path.join(dir, "request-logs.sqlite");
  try {
    const legacy = createBetterSqliteDatabase(logFile);
    try {
      legacy.exec(`CREATE TABLE request_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, source_usage_id INTEGER, created_at TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT 'unknown', method TEXT NOT NULL, path TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'unknown', credential_id TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT 'unknown', status_code INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0, total_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL)`);
      legacy.prepare("INSERT INTO request_logs (created_at, request_id, method, path, provider, model, input_tokens, output_tokens, total_tokens) VALUES (?, 'old-log', 'POST', '/v1/messages', 'alpha', 'known-model', 10, 1, 11)").run(new Date().toISOString());
    } finally {
      legacy.close();
    }
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true, requestLogDbFile: logFile });
    await store.getStats("24h", { includeProxy: true });
    assert.deepEqual({ ...(await store.getDatabase()).prepare("SELECT model, price_model FROM usage_events WHERE request_id = 'old-log'").get() }, { model: "known-model", price_model: "" });
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});
```

- [ ] **Step 2: Run the file and see the first fail.** `node --test .test-dist/core/test/integration/usage/usage-sweep.test.js`. Expected: the first new test FAILS with `price_model: ''` where `'Vendor/some-model'` is expected. The second passes on `main`. It guards the column check of Step 3.
- [ ] **Step 3: Copy the routed model.** In `backfillFromAttachedRequestLog`, read `sourceColumns.has("resolved_model")` beside the existing `cost_source` check, add `price_model` to the insert's column list, and select `logs.resolved_model` when the column exists and `''` when it does not.
- [ ] **Step 4: Delete the test that pins the fault.** In the same file, the test whose name starts `FINDING a waiting log row copied into the totals is resolved by the response's alias` (near `:240-273`) and its "Finding, not a rule" comment. It fails once Step 3 is in.
- [ ] **Step 5: Run the file again.** Expected: PASS.
- [ ] **Step 6: Commit.** `fix(usage): price a row copied from Logs by the routed model the log row holds`

---

### Task 5: A Logs row keeps its price's tiers, so a trace that brings the tokens chooses the tier (F-PRICE-1)

Today a Logs row stores only the tier chosen when its price was written. A row priced with no tokens stores the base price, and the raw trace that brings 150,000 tokens re-prices from that base: Logs shows $0.0155 where the usage row shows $0.0775. The request log store has no config and cannot resolve a price a second time, so the tiers go on the row.

**Files:**
- Modify: `packages/core/src/observability/request-log-store.ts`: `RequestLogUsageContext` (near `:108`), `record` (near `:768`), `updateFromRawTrace` (near `:978-991`), `applyPriceUpdate` (near `:1743`), `readRequestLogUsageContext` (near `:6198`)
- Test: `packages/core/test/integration/usage/usage-sweep.test.mjs`

**Interfaces:**
- Consumes: `ResolvedModelPrice`, `pricingForPrompt` and `promptTokenCount` from `models/pricing-service.ts`, as they are.
- Produces, private to the file:
  - `function storedPriceJson(price: ResolvedModelPrice): string`. It writes the flat base fields as today, plus a `tiers` array only when the price has tiers. A price with no tiers gives the same text as today.
  - `function parseStoredPrice(value: unknown, source: UsagePricingSource | undefined): ResolvedModelPrice | undefined`. It reuses `parseStoredModelPricing` for the base and for each tier, so a flat row written before this change still parses.
  - `RequestLogUsageContext` holds `price?: ResolvedModelPrice` in place of `pricing` and `pricingSource`.

- [ ] **Step 1: Write the failing test.** Append:

```js
test("a long prompt's log row whose tokens arrive after its price takes the tier its usage row takes, in every order of price update and trace", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-late-tokens-tier-"));
  const logs = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  const usage = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => false });
  try {
    const tiered = {
      price: {
        pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 },
        source: "models.dev",
        tiers: [{ abovePromptTokens: 100_000, pricing: { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 6 } }]
      },
      state: "priced"
    };
    const longBody = '{"usage":{"input_tokens":150000,"output_tokens":0}}';
    await usage.record({ ...event, price: tiered, requestId: "usage-row", usage: { inputTokens: 150_000 } });
    const usageCost = (await usage.getDatabase()).prepare("SELECT cost_usd FROM usage_events WHERE request_id = 'usage-row'").get().cost_usd;
    assert.ok(Math.abs(usageCost - 0.45) < 1e-12, "the usage row takes the tier");

    const now = new Date().toISOString();
    let sequence = 0;
    const record = (requestId, price, responseBodyText) => ({
      eventId: `${requestId}-event`,
      input: { completedAt: now, durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price, providerName: "alpha", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId, responseBodyText, responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence: sequence += 1
    });
    const trace = (requestId) => ({ input: { requestId, responseBodyText: longBody }, kind: "raw-trace-update", sequence: sequence += 1 });
    const priceUpdate = (requestId) => ({ input: [{ price: tiered, requestId }], kind: "price-update", sequence: sequence += 1 });

    await logs.writeBatch([record("priced-no-tokens", tiered, "{}")]);
    await logs.writeBatch([trace("priced-no-tokens")]);
    await logs.writeBatch([record("waiting-no-tokens", { state: "no-catalog" }, "{}")]);
    await logs.writeBatch([priceUpdate("waiting-no-tokens")]);
    await logs.writeBatch([trace("waiting-no-tokens")]);
    const shortBody = '{"usage":{"input_tokens":50000,"output_tokens":0}}';
    await logs.writeBatch([record("update-then-trace", { state: "no-catalog" }, shortBody)]);
    await logs.writeBatch([priceUpdate("update-then-trace")]);
    await logs.writeBatch([trace("update-then-trace")]);
    await logs.writeBatch([record("trace-then-update", { state: "no-catalog" }, shortBody)]);
    await logs.writeBatch([trace("trace-then-update")]);
    await logs.writeBatch([priceUpdate("trace-then-update")]);

    const logCost = async (requestId) => (await logs.getDatabase()).prepare("SELECT cost_usd FROM request_logs WHERE request_id = ?").get(requestId).cost_usd;
    const ids = ["priced-no-tokens", "waiting-no-tokens", "update-then-trace", "trace-then-update"];
    const costs = Object.fromEntries(await Promise.all(ids.map(async (requestId) => [requestId, await logCost(requestId)])));
    assert.deepEqual(costs, Object.fromEntries(ids.map((requestId) => [requestId, usageCost])));
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});
```

- [ ] **Step 2: Run it and see it fail.** Expected: FAIL with `'priced-no-tokens': 0.15, 'waiting-no-tokens': 0.15, 'update-then-trace': 0.15, 'trace-then-update': 0.45` against 0.45 for all four.
- [ ] **Step 3: Store the tiers.** Add `storedPriceJson` and call it where `record` and `applyPriceUpdate` write `pricing_json`. `record` writes `""` when it has no price, as today.
- [ ] **Step 4: Read the tiers and choose again.** Add `parseStoredPrice`, have `readRequestLogUsageContext` build `price` with it, and in `updateFromRawTrace` re-price with `pricingForPrompt(storedPrice, promptTokenCount({ cacheReadTokens, cacheWriteTokens, inputTokens }))` and the stored price's source. `pricing_json` has no other reader and no other writer.
- [ ] **Step 5: Run the file and its neighbours.** `usage-sweep`, and under `integration/observability` and `integration/gateway`: `request-log-price-update`, `request-log-pricing-transaction`, `request-log-store`, `request-pipeline-cost-parity`. Expected: PASS, all of them.
- [ ] **Step 6: Commit.** `fix(logs): keep a price's tiers on the log row, so a trace that brings the tokens chooses the tier`

---

### Task 6: Two processes that open an older database at once do not collide on a new column (F-LABEL-4)

Both stores read a table's columns and then add the missing ones, outside a transaction. A second process that adds the same column in between makes the first fail with `duplicate column name`. A desktop app and a CLI that start together after an upgrade can do this. It failed 2 of 48 opens in a forced race of eight processes (the review of PR 174, run).

**Files:**
- Create: `packages/core/test/support/sqlite-schema-race.mjs`
- Modify: `packages/core/src/usage/store.ts`, `open` (near `:565`)
- Modify: `packages/core/src/observability/request-log-store.ts`, `open` (near `:1556-1558`) and `ensureRequestLogSchema` (near `:4587-4684`)
- Test: `packages/core/test/integration/usage/usage-store.test.mjs`, `packages/core/test/integration/observability/request-log-store.test.mjs`

**Interfaces:**
- Produces, private to `request-log-store.ts`:
  - `function ensureRequestLogColumns(database: SqlDatabase): boolean`. It holds the `addColumn` block and returns whether the model summary migration is needed.
  - `function ensureRequestLogIndexes(database: SqlDatabase): void`. It holds the index statements.
- Produces, for tests: `addColumnRightAfterTheColumnsAreRead(file, table, columnSql)`, which returns a function that undoes it.

One wrapper around the whole request log schema does not work. `migrateGatewayOutcome` and `migrateGatewayFinalAttempt` open their own `BEGIN IMMEDIATE`, and a transaction cannot nest: three existing tests fail with `cannot start a transaction within a transaction` (run). So only the column block is wrapped.

- [ ] **Step 1: Write the test helper.** A lock held from another process does not reproduce the race, because an earlier statement in `open` waits for it (run, three passes on `main`). The window is between the column read and the add, so the helper puts the other writer exactly there:

```js
import Database from "better-sqlite3";

// Stands in for a second process: right after a store reads a table's columns, another
// connection adds one of them and commits, which is the moment two opens collide.
export function addColumnRightAfterTheColumnsAreRead(file, table, columnSql) {
  const prepare = Database.prototype.prepare;
  let armed = true;
  Database.prototype.prepare = function (sql, ...rest) {
    const statement = prepare.call(this, sql, ...rest);
    if (!armed || sql.trim() !== `PRAGMA table_info(${table})`) return statement;
    armed = false;
    const all = statement.all.bind(statement);
    statement.all = (...params) => {
      const rows = all(...params);
      const other = new Database(file, { timeout: 100 });
      try {
        other.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
      } catch (error) {
        if (!/locked|busy/i.test(error.message)) throw error;
      } finally {
        other.close();
      }
      return rows;
    };
    return statement;
  };
  return () => { Database.prototype.prepare = prepare; };
}
```

- [ ] **Step 2: Write the two failing tests.** Import the helper in each file. In `usage-store.test.mjs`, append:

```js
test("an older usage database opens when another process adds the same column between this one's read of the columns and its own add", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-schema-race-test-"));
  const file = path.join(dir, "usage.sqlite");
  try {
    await new UsageStore(file).record({ durationMs: 1, method: "POST", model: "m", path: "/v1/messages", provider: "p", requestId: "old", statusCode: 200 });
    const legacy = createBetterSqliteDatabase(file);
    try {
      legacy.exec("ALTER TABLE usage_events DROP COLUMN forwarded_user_email");
    } finally {
      legacy.close();
    }
    const restore = addColumnRightAfterTheColumnsAreRead(file, "usage_events", "forwarded_user_email TEXT NOT NULL DEFAULT ''");
    let stats;
    try {
      stats = await new UsageStore(file).getStats("24h", { includeProxy: true });
    } finally {
      restore();
    }
    assert.equal(stats.totals.requestCount, 1);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});
```

In `request-log-store.test.mjs`, append:

```js
test("an older request log database opens when another process adds the same column between this one's read of the columns and its own add", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-schema-race-test-"));
  const file = path.join(dir, "request-logs.sqlite");
  let store;
  try {
    const first = new RequestLogStore(file);
    await first.list({ pageSize: 1 });
    await first.close();
    const legacy = createBetterSqliteDatabase(file);
    try {
      legacy.exec("ALTER TABLE request_logs DROP COLUMN forwarded_user_email");
    } finally {
      legacy.close();
    }
    const restore = addColumnRightAfterTheColumnsAreRead(file, "request_logs", "forwarded_user_email TEXT NOT NULL DEFAULT ''");
    try {
      store = new RequestLogStore(file);
      assert.equal((await store.list({ pageSize: 1 })).total, 0);
    } finally {
      restore();
    }
  } finally {
    await store?.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
```

- [ ] **Step 3: Run both files and see both fail.** Expected: each new test FAILS with `SqliteError: duplicate column name: forwarded_user_email`. `RequestLogStore bounded heap regression` fails too while the new test in its file fails, because it re-runs the file in a child process.
- [ ] **Step 4: Usage store.** In `open`, run the schema check as `database.transaction(() => ensureUsageSchema(database)).immediate();`.
- [ ] **Step 5: Request log store.** Split `ensureRequestLogSchema` into the two functions above. It then runs `ensureRequestLogColumns` inside `database.transaction(...).immediate()`, the three migrations outside it as today, and `ensureRequestLogIndexes` last. In `open`, wrap `ensureRequestRouteTraceSchema` and `ensurePendingRawTraceUpdateSchema` together in one more `.immediate()` transaction.
- [ ] **Step 6: Run the files.** `usage-store`, `request-log-store` and `request-log-backfill`. Expected: PASS, the two race tests and the three migration tests included.
- [ ] **Step 7: Commit.** `fix(usage): add a database's new columns inside one write transaction, so two processes cannot collide`

A second process now waits for the first. Both stores set a busy timeout of 5 seconds, and the wait blocks the thread. After it the open throws `SQLITE_BUSY`. Not in this task: `config-repository.ts` near `:350` and `request-log-admission-store.ts` near `:389` add columns the same way, and neither failed in the review's race.

---

### Task 7: The Logs page does not say a retention is pending when the database already holds it (F-LOGS-5)

Today the page can say "kept for 3 days" and "Settings ask for 3 days. That has not been applied" together. The fault is in core and not in the page: `RequestLogRuntime.list` sends `retentionRequestedDays` whenever the requested value differs from the one it last saved, even when the database holds the requested value.

**Files:**
- Modify: `packages/core/src/observability/request-log-runtime.ts`, `list`, the condition near `:332`
- Test: `packages/core/test/integration/observability/request-log-runtime.test.mjs`

**Interfaces:**
- Produces: a page with no `retentionRequestedDays` when the requested retention equals `page.retentionDays`. The UI needs no change, since it falls back to `page.retentionDays` when the field is absent.

- [ ] **Step 1: Write the failing test.** Insert before `RequestLogRuntime terminally rejects delayed raw traces`:

```js
test("RequestLogRuntime says nothing is pending when another process stored the retention it asked for", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-runtime-retention-equal-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const runtime = createRequestLogRuntime({ dbFile, workerFile });
  let database;
  try {
    await runtime.setRetentionDays(7);
    await runtime.list({});
    database = createBetterSqliteDatabase(dbFile);
    database.exec("BEGIN EXCLUSIVE");
    await assert.rejects(runtime.setRetentionDays(3), /locked/);
    database.exec("ROLLBACK");
    database.prepare("UPDATE request_log_settings SET value = '3' WHERE key = 'retention_days'").run();
    const page = await runtime.list({});
    assert.equal(page.retentionDays, 3);
    assert.equal(page.retentionRequestedDays, undefined);
  } finally {
    database?.close();
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test .test-dist/core/test/integration/observability/request-log-runtime.test.js`. Expected: FAIL, `3 !== undefined` on the last assertion. The one before it passes, so the database does hold 3.
- [ ] **Step 3: Add the condition.** In `list`, send the field only when the requested retention also differs from `page.retentionDays`.
- [ ] **Step 4: Run the file again.** Expected: PASS, with `says which retention it asked for while the database holds another` still passing.
- [ ] **Step 5: Commit.** `fix(logs): say no retention is pending when the database already holds the one asked for`

---

### Task 8: An identity header sent twice gives its first value (F-LABEL-5)

Node joins a repeated custom header into one string with a comma, so "Gateway user" shows `a@example.com, b@example.com` (run).

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts`, `forwardedIdentity`, near `:30-37`
- Test: `packages/core/test/unit/gateway/http-boundary.test.mjs`

**Interfaces:**
- Produces: `forwardedIdentity` with the same signature. Each of the two values is the text before the first comma, trimmed, then cut to length as today. It is the one reader of the two headers, for the request pipeline and for the trace import.

- [ ] **Step 1: Write the failing test.** Add `import { createServer, request } from "node:http";` after the assert import, then append:

```js
test("an identity header sent twice gives its first value, as Node joins the two with a comma", async () => {
  const server = createServer((incoming, response) => {
    response.end(JSON.stringify(forwardedIdentity(forwarder, incoming.headers)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const body = await new Promise((resolve, reject) => {
      const outgoing = request({ host: "127.0.0.1", port, headers: [
        ["host", `127.0.0.1:${port}`],
        ["x-claude-gateway-user-email", "a@example.com"], ["x-claude-gateway-user-email", "b@example.com"],
        ["x-claude-gateway-user-id", "id-a"], ["x-claude-gateway-user-id", "id-b"]
      ].flat() }, (response) => {
        let text = "";
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => resolve(text));
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
    assert.deepEqual(JSON.parse(body), { userEmail: "a@example.com", userId: "id-a" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(forwardedIdentity(forwarder, { "x-claude-gateway-user-email": " a@example.com , b@example.com" }), { userEmail: "a@example.com" });
  assert.deepEqual(forwardedIdentity(forwarder, { "x-claude-gateway-user-id": ["id-a", "id-b"] }), { userId: "id-a" });
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test .test-dist/core/test/unit/gateway/http-boundary.test.js`. Expected: FAIL, with `userEmail: 'a@example.com, b@example.com'` and `userId: 'id-a, id-b'`.
- [ ] **Step 3: Take the first value.** In `forwardedIdentity`, split each value at the first comma and trim it before the existing length cut.
- [ ] **Step 4: Run the file again.** Expected: PASS.
- [ ] **Step 5: Run the gates and open the PR.** `npm run typecheck`, `rtk bypass npm run lint`, `npm run test:architecture`, `npm run test:core`. Expected: all pass. Then commit `fix(gateway): take the first value of an identity header sent twice`, push the branch, and open the PR. Its body lists the seven findings by ID, and what was not run. The merge needs the owner's word.

---

### Task 9: Run the Codex token command prototype (restore Task 9)

The text is restore Task 9 in [`2026-11-22-backlog-restore.md`](2026-11-22-backlog-restore.md), unchanged. It is an investigation. It changes no product code, its deliverable is `docs/superpowers/research/2026-11-22-codex-token-command.md`, and it goes straight to `main`. It runs on the installed Codex only (delivery index question 10). Its home safety paragraph is binding: every Codex run uses a fresh temporary home under `env -i`, and the checksum of `~/.codex/config.toml` is recorded before and after.

- [ ] **Step 1:** Run that task as written.
- [ ] **Step 2:** Commit the result file to `main` and give the owner its question.

---

### Task 10: Release 9.1.0

**Before.** Tasks 2 to 8 are merged. Task 1 is merged too if the owner answered question 3 with yes. `main` is clean and level with origin, and the Tests run for its head passed, Windows and the Intel Mac included.

- [ ] **Step 1: Draft the notes.** An "Upgrading to 9.1" header and a "What's new" header, written from the commit messages of PRs 149 to 179 and the PR of Tasks 2 to 8. Check each sentence against its PR's message. `git grep -i "release note" -- docs/superpowers` finds sentences earlier sessions owed. The notes stay neutral about the fault fixed in 8.0.1, as before. The owner reads the draft.
- [ ] **Step 2: Cut it.** `npm run release -- 9.1.0`. Expected: a commit `chore: release v9.1.0`, the tag, and a push that reports the required checks bypassed, which is normal.
- [ ] **Step 3: Watch the Release run.** Find it with `gh run list --workflow=release.yml`. Expected: 14 assets on the release. `gh run watch --exit-status` can return 1 while the Linux and Windows jobs still run, so watch again before calling it failed. If "Create draft release" fails, `gh run rerun <id> --failed`.
- [ ] **Step 4: Check the Docker release.** It follows by itself from a successful Release run. Expected: image tags `9.1.0`, `9.1` and `latest`.
- [ ] **Step 5: Put the notes on.** `gh release edit v9.1.0 --notes-file <draft>`, with the two headers above the generated list.
- [ ] **Step 6: Record it.** In the delivery index's "State" section and in this plan's status line: the commit, the run id and what shipped.

---

### Task 11: The VM pass on 9.1.0

One sitting on the owner's UTM VM, on the released build. It is his to run. The session prepares the scripts and the checklist, as it did for the pass of 2026-11-24 (`docs/superpowers/research/2026-11-24-decisions-vm-pass.md`).

- [ ] **Step 1: Write the checklist** as one file under `docs/superpowers/research/`, one line per check with what to do and what passing looks like, read against 9.1.0 and not against the release each check was written for. The lines are the list under "The end", item 2, of the delivery index, plus these from the register:
  - F-CODEX-8: the window shows the refusal for a reserved Codex provider id, and a real Codex loads each rewritten config.
  - F-GATEWAY-18: an agent app behind another window comes forward.
  - F-GATEWAY-19: gateway phase 0 Task 4 Step 6, items 3 to 5, in the window.
  - F-UI-3: at 720 px a save error that persists does not cover onboarding's footer buttons.
  - F-TEST-4: H-7 of the harness plan, the Claude Desktop check.
  - Two processes started together on an upgraded install both open (Task 6 of this plan).
- [ ] **Step 2: The owner runs it.** Each line is marked passed, failed or not run, with what was seen.
- [ ] **Step 3: Record the results** in that file and commit it to `main`.

---

### Task 12: The remediation plan

- [ ] **Step 1: Gather.** Every line Task 11 marked failed, every register row whose disposition is `remediation` or `test`, and every `decide` row the owner has answered with a change.
- [ ] **Step 2: Group and write.** A new plan under `docs/superpowers/plans/`, written with superpowers:writing-plans, grouped by the files the fixes share so that each group is one branch and one PR. Each task's text is checked against the code on another model before the plan is committed, as Tasks 2 to 8 here were.
- [ ] **Step 3: The owner reads it** and says which groups are built and in what release.

Gateway phase 1, [`2026-11-25-apps-gateway-phase-1.md`](2026-11-25-apps-gateway-phase-1.md), comes after that release unless he answers question 6 otherwise.

## Not in this plan

- The other 160 rows of the register. Each waits for Task 12 or for the owner's answer.
- A sweep started by the back-fill (the survey's second line for F-PRICE-10). The case is rare: the compatibility layout, a stream the client cancels or that fails partway, and the window before the catalog loads (read and inferred, not run). Task 4 fixes the half that marked such a row `unpriced` for good.
- F-PRICE-3 and F-PRICE-36. No task is written for either until the owner answers questions 1 and 2.

## Self-review

- **Coverage.** Every item the owner chose has a task: F-PRICE-28 (2), F-PRICE-2 (3), F-PRICE-11 (4), F-PRICE-1 (5), F-LABEL-4 (6), F-LOGS-5 (7), F-LABEL-5 (8). The survey for F-PRICE-10 is done and is a research note. Batch 5, restore Task 9, the release, the VM pass and the remediation plan each have a task.
- **Names.** `storedPriceJson`, `parseStoredPrice`, `positivePrices`, `ensureRequestLogColumns`, `ensureRequestLogIndexes` and `addColumnRightAfterTheColumnsAreRead` are each defined in one task and used only there.
- **What rests on a run and what does not.** Each test in Tasks 2 to 8 failed on `main` and passed on a throwaway fix (run by the check on another model). Line numbers are that check's reading of `b504d153` and move as commits land. The expected time, the release steps and the VM list are not run.
- **Not checked.** The full core suite with all seven fixes together. The UI, Electron and CLI suites. Whether `resolved_model` holds a route selector on some path, where the sweep would be handed the selector. Whether any real tier means a 0 as free. What the gateway fork forwards when a client sends an identity header twice in the single layout.
