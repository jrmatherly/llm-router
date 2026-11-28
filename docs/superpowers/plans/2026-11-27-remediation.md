# Remediation after 9.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status, 2026-11-27: written, audited by building, not built.** An audit on another model built Tasks 1 to 7 from this text alone, without the prototypes: 1 Blocker, 19 Corrections, 3 design findings and 4 gaps, all applied below. With every task built, typecheck and lint pass, the architecture suite is 218 of 218, the core suite with the gateway entry is 2,537 passed and 16 skipped, and the UI suite 337 of 337 (its run). It ran 13 mutants: 9 killed and 4 survivors, three of which now have a test here. The audit removed one task: the fault Task 6 fixed was already gone. The text its corrections changed was not built again. Its build and tests are outside the repo in `private/audits/2026-11-27-audit-remediation-plan/`. What follows is the status as first written.

> **Reviewed against the code, 2026-11-27, by the lead.** Every file, symbol, test name, helper and line reference the tasks name was checked at `main` (`2636b447`), and the tests' expected values against the audit's patches. Nothing was built or run. Five changes: Task 4 Step 1 counted three `gw` assertions where the audit's patch changes four; Task 2 Step 4 now makes its check inside the function's `try`, on the text already read; Task 1 gains a docs step and a stale assertion message to reword; Task 2 names what its tests do not cover; and "Order" carries the three points of the build method it had left out. Task 2 Step 4's placement and Task 1 Step 7c were not built.

> **As first written.** Every code task here comes from a prototype that a research run on another model built at `v9.1.0`, with a test it saw fail there and pass on the prototype (its run). The lead copied each test from that run's patch and has not built or run any of it. No task is approved: each waits on the owner's answer to the decision it names. The VM pass on 9.1.0 has not been run, so its failed lines are not here yet.

**Goal:** Build the changes two rounds of research recommend for the release after 9.1.0, and leave every other open finding listed with the reason it waits.

**Architecture:** Five small branches, each one PR. No two change the same source file. Task 4 and the branch of Tasks 5 and 7 both edit `raw-trace-sync.test.mjs`, in different tests, so whichever merges second rebases. Three more pieces are not code in this repository: the gateway fork release, two repository settings, and edits to three plans' text. What the VM pass finds joins as new tasks once it has run.

**Tech Stack:** TypeScript on Node, React, `node:test` with `node:assert/strict`, better-sqlite3, npm workspaces, GitHub Actions.

**Spec:** This plan argues from these, and an executor reads the first two.
- [`2026-11-27-finish-and-release.md`](2026-11-27-finish-and-release.md), section "Open with the owner" and its "Round two" table. Where the two rounds disagree, round two is right.
- [`2026-11-27-open-findings.md`](2026-11-27-open-findings.md), the register. Every `F-...` id below is a row of its tables, except F-PRICE-36, which is a bullet under "The owner's answers".
- The round two notes under `../research/2026-11-27-decisions-*-round-2.md`, one per area.
- [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md), decisions 1 to 9, which bind this plan.

## Global Constraints

- npm only. `npm ci` in a fresh worktree before anything else.
- Never run `npm run test:e2e`, Playwright, Electron or the desktop app on the owner's Mac. CI runs them.
- Never run `npm run build:assets` or `npm run models:build` on a branch.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. No `--scope`.
- The gate before a PR: `npm run typecheck`, `rtk bypass npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`, and `npm run test:ui` for a branch that changes the UI. Without that variable 82 core tests are skipped, and with it 16, which run only on other platforms.
- A task builds what its text says and nothing else (decision 9). Anything else found goes into the register with its evidence.
- One commit per task. Each commit holds its change and its test.
- Merging needs the owner's word, once per PR. A push or a tag on `jrmatherly/llmr-gateway` needs his word each time.
- Read every CI job by hand before calling a PR green, Windows and the Intel Mac included. Merge with `gh pr merge <n> --squash --match-head-commit <full 40-character sha>`.
- **A builder must not open `private/research/2026-11-27-decisions-round-2/`.** It holds a prototype of every code task here. A reviewer may diff a branch against it and should explain each difference.
- Style: double quotes, semicolons, two-space indent, no comments except a non-obvious why.

## What each task waits on

No task starts before the owner answers its row. A row he answers with "no" takes its task out of the plan.

| Task | Row | Round two's recommendation | His answer |
|---|---|---|---|
| 1 | F-PRICE-3, F-PRICE-36 | A zero that is the request's own provider's offer is a price of zero, and a zero offer leads to no maker's price | yes, 2026-11-27. Not built |
| 2 | F-CODEX-1 | Refuse an apply over a provider written with no header of its own | yes, 2026-11-27. Not built |
| 3 | F-UI-1 | A saved local login shows grey until checked, green on a pass, amber on a failure | yes, 2026-11-27. Not built |
| 4 | F-LABEL-1 | A request is named by its key in both layouts | yes, 2026-11-27. Not built |
| 5, 7 | F-TEST-13, F-TEST-1 | Fix one test fault and prove route scripts run side by side | yes, 2026-11-27. **Merged, PR 182, `05ce1d74`** |
| 8 | F-TEST-3 | Make the Windows and Intel Mac jobs required checks | open. Task 5 is merged; Windows has passed once since, on the PR |
| 9 | F-TEST-5 | Dependabot version updates, and close Renovate's PR 168 | open |
| 10 | F-GATEWAY-1 | Release the gateway fork as `llmr.5` | "not yet", 2026-11-27 |
| 11 | F-RESTORE-3, F-GATEWAY-2, F-PRICE-7 | Correct three plans' text | none needed, docs only |

Already done on his word and not tasks here: the two ruleset changes of F-TEST-5, the rename of "Estimated cost" (PR 181) and three docs sentences.

## Review Focus

What the tasks' tests do not exercise and a reviewer should try, most likely first.

1. **A provider left at its preset name.** The price lookup strips the provider's name from the front of a model id, so a provider named `NVIDIA` or `OpenRouter` looks up the wrong name, and 23 of the 96 zero offers Task 1 aims at stay wrong (the research run). Task 1 does not fix that, against round two's advice, for the reason under "Not in this plan". A reviewer should confirm the count has not grown.
2. **A row stored before Task 1.** A free model's request priced by 9.1.0 is stored as unpriced, and the sweep never prices such a row again, so that history keeps reading "No price found" after Task 1 (read). A row stored after it reads as a list price: the basis, the label and the totals follow from `listedCostSources` (read), and Task 1 pins the basis and the label. No test renders the Overview caption or the tray with such a row.
3. **A Codex config the profile already doubled under 9.1.0.** After Task 2 the next apply is refused and the switch-off removes LLM Router's table and token (run by the audit). Pinned in Task 2. Not asserted: that the user's own line is kept.
4. **A saved local login reopened after a passed check.** The check's result is forgotten when the dialog closes, so after Task 3 the provider opens grey each time (read). That is the task's stated limit, not a failure.
5. **A Claude Code request through a Claude apps gateway.** After Task 4 it reads as the forwarder key's name in the single layout too, as it already does in the other, and the developer is in "Gateway user". One of the six tests Task 4 changes covers it: a `claude-cli` request through a trusted forwarder key is labelled by the key, with the developer's e-mail (the audit's run).

## Order

1. Task 11 at any time. It is docs only and goes straight to `main`.
2. Tasks 5 and 7, one branch. They are tests only, and Task 5 unblocks Task 8. Task 6 was removed by the audit and its number is kept.
3. Tasks 1, 2, 3 and 4, one branch each, in any order. No two share a source file, so two can be open together.
4. Task 8 after the branch of Tasks 5 and 7 is merged and has run green on Windows three times.
5. Tasks 9 and 10 on his word, at any time.
6. The VM pass results join as tasks when the pass has run. See "When the VM pass has run".

The method for each branch is the one batch 10b set in the delivery index: a builder on Opus in a worktree from this text, one callers reviewer on Fable given the lead's guesses, one fix round, and a test for any mutant that survives. The text was audited by building on 2026-11-27, as the status line says. A task the VM pass adds later gets the same audit before it is built.

Three points of that entry this summary left out, which hold here too. The builder of Task 2 runs the profile restore harness before it hands back, since Task 2 is the only task that changes `profiles/service.ts`: it is in `private/research/2026-11-26-batch9-review/` and `2026-11-26-batch10a-review/`, which a builder may open. One branch is built per session, in a fresh session resumed from the handoff. And the owner is told the expected duration when a branch starts.

---

### Task 1: A zero the request's own provider lists is a price of zero (F-PRICE-3, F-PRICE-36)

Branch `fix/listed-free-price`. Today the rule treats every catalog price of 0 and 0 as "no price here", so a free model reads "No price found". And a zero offer still adds its canonical id, so the rule follows it to the maker's paid entry and shows a paid list price for a free model. After this task a zero that is the offer of the provider the request went to stores a cost of 0 under a source of its own, and a zero offer names no maker.

This changes the last sentence of decision V-21, "Only a price the user set can yield a cost of 0". That sentence was the plan author's and not the owner's, by V-21's own row.

**Files:**
- Modify: `packages/core/src/models/pricing-service.ts`: `CatalogPricingSource`, `pricingSources`, `PriceIndex`, the two own-provider steps (`openRouterEntry` and `mappedProviderEntry`), `fetchModelsDevPrices`, `addCatalogEntry`, and the amount check that refuses a cost of 0
- Modify: `packages/core/src/contracts/app.ts`: `listedCostSources`
- Modify: `packages/ui/src/pages/home/shared/usage.ts`: the price source labels
- Modify: `docs/src/content/docs/en/configuration/overview.md` and `docs/src/content/docs/en/configuration/providers.md`: one sentence each
- Test: `packages/core/test/unit/models/pricing-service.test.mjs`
- Create: `packages/ui/test/unit/listed-free-label.test.ts`

**Interfaces:**
- Produces: the cost source `"listed-free"`, a member of `CatalogPricingSource` and of `listedCostSources`, with the label "Listed at no charge".
- Produces: `PriceIndex.zeroKeys: Set<string>`, the keys of offers listed at 0 and 0.
- Produces, private to `pricing-service.ts`: `function ownEntry(index: PriceIndex | undefined, key: string): CatalogEntry | undefined`. It returns the priced entry for `key`, or exactly `{ model: key, pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 }, source: "listed-free" }` when `key` is in `zeroKeys`, with no cache fields, since the test compares the whole value. Only the two own-provider steps call it.

- [ ] **Step 1: Write the failing test.** Append:

```js
test("a zero the request's own provider lists is a price of zero, and a zero offer leads nowhere else", async () => {
  const openRouter = [...otherCatalogs.openRouter, { id: "lab/model:free", pricing: { completion: "0", prompt: "0" } }];
  const modelsDev = {
    ...haikuModelsDev,
    "zai-coding-plan": { models: { "glm-9": { canonical_model_id: "zai/glm-9", cost: { input: 0, output: 0 } } } },
    zai: { models: { "glm-9": { cost: { input: 1, output: 3 } } } },
    "free-host": { models: { "claude-haiku-5-5-free": { canonical_model_id: "anthropic/claude-haiku-5-5", cost: { input: 0, output: 0 } } } }
  };
  const config = {
    Providers: [
      { baseUrl: "https://openrouter.ai/api/v1", models: ["lab/model:free"], name: "Router" },
      { baseUrl: "https://api.z.ai/api/coding/paas/v4", models: ["glm-9"], name: "Plan" },
      { ...customProvider, models: ["claude-haiku-5-5-free"] }
    ]
  };
  const free = priced({ pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 }, source: "listed-free" });
  await withPriceCatalogs({ modelsDev, openRouter }, () => {
    assert.deepEqual(resolveRequestPrice(config, "Router", "lab/model:free"), free);
    assert.equal(resolveRequestPrice(config, "Plan", "glm-9").price?.source, "listed-free");
    assert.deepEqual(resolveRequestPrice(config, "VM Custom", "claude-haiku-5-5-free"), { state: "unpriced" });
    const usage = { inputTokens: 10, model: "m", outputTokens: 1, pricing: free.price.pricing, pricingSource: "listed-free" };
    assert.equal(estimateUsageCost(usage)?.amountUsd, 0);
    assert.equal(costBasisFor({ billableTokens: 11, costSource: "listed-free", costUsd: 0 }), "listed");
  });
});
```

The third assertion is F-PRICE-36: a free host's offer on a custom provider must not borrow the maker's paid price.

- [ ] **Step 2: Run it and see it fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`. Expected: FAIL on the first assertion, `{ state: "unpriced" }` where the free price is expected.
- [ ] **Step 3: Keep the zero offers.** `addCatalogEntry` adds the key of an offer priced 0 and 0 to `index.zeroKeys` and still adds no priced entry for it. A new index starts with an empty set.
- [ ] **Step 4: Let only the request's own provider use one.** Add `ownEntry` and call it in the two own-provider steps in place of the direct `byKey.get`. No later step of the rule reads `zeroKeys`.
- [ ] **Step 5: A zero offer names no maker.** In `fetchModelsDevPrices`, add an offer's `canonical_model_id` to `offers.canonicalIds` only when its input and output are not both 0.
- [ ] **Step 6: Let the source through.** Add `"listed-free"` to `CatalogPricingSource`, to `listedCostSources`, and as `"listed-free": true` to `pricingSources`, which is checked against the full set of sources, so typecheck fails without it and a stored row could not be read back. Let the amount check accept a cost of 0 for it as it does for `"custom"`. Add the label `["listed-free", "Listed at no charge"]`. Two comments become false and are rewritten: the one above the amount check that says only a user's price may come to zero, and the one above `addCatalogEntry` that calls a price of 0 and 0 "no price here".
- [ ] **Step 7: Fix the one test that pins the old rule.** `a catalog entry priced 0 for input and output does not stop the rule`, in the same file, expects DeepSeek's zero to fall through to the LiteLLM price of 0.8 and 2. Change its first expectation to `{ inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 }` under `"listed-free"`, and rename it to say that a zero from the request's own provider stops the rule. Its second assertion still passes, and its message, "only a user price may come to zero", is no longer true: reword it to say that a list price that comes to zero is no cost. Any other failure is a fault of the change.
- [ ] **Step 7b: Pin the label.** The core test checks no label, and a change that drops the label survives it (the audit's mutant). Create `packages/ui/test/unit/listed-free-label.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { costBasisFor } from "@llmr/core/contracts/app.ts";
import { priceSourceLabel } from "@llmr/ui/pages/home/shared/usage.ts";

test("a cost the request's own provider lists at zero reads as that list price", () => {
  const basis = costBasisFor({ billableTokens: 11, costSource: "listed-free", costUsd: 0 });
  assert.equal(basis, "listed");
  assert.equal(priceSourceLabel("listed-free", basis), "Listed at no charge");
});
```

If the UI package keeps its unit tests under another folder, put it beside the nearest test of `shared/usage.ts`.
- [ ] **Step 7c: Say it in the docs.** Two pages describe the price rule step by step and name the source `models.dev-median`: the "Cost shows `-`" row of `docs/src/content/docs/en/configuration/overview.md` and the local-services paragraph of `docs/src/content/docs/en/configuration/providers.md`. Add one sentence to each, after the step for the provider the base URL maps to: a model that provider lists at zero is recorded as free, with the source `listed-free`. Added by the review of 2026-11-27. The audit's build changed no docs.
- [ ] **Step 8: Run the suites.** The test file, then `npm run test:core` with the gateway entry, then `npm run test:ui`. Expected: all pass. The research run saw 2,551 core tests with that one failure before Step 7, and 336 of 336 UI tests.
- [ ] **Step 9: Commit.** `feat(usage): price a model its own provider lists at zero as free, and stop a free offer borrowing a paid price`

Stated limit: a request stored as unpriced before this task stays so, since the sweep never prices an unpriced row again. Only requests made after the upgrade read as free.

Measured by the research run on catalogs fetched 2026-11-27, each zero offer asked for on its own provider: 73 become `$0.00` (36 from unpriced, 23 from a median, 14 from a paid list price), 74 go from a paid list price to unpriced, and 551 do not change. Of those 551, 207 still carry a paid price, all on providers the rule cannot recognise.

---

### Task 2: Refuse an apply over a Codex provider written with no header of its own (F-CODEX-1)

Branch `fix/codex-headerless-refusal`. Codex 0.172.0 loads a provider written in seven ways. LLM Router's scanner knows the two that use a `[model_providers.<id>]` header. Over the others, 9.1.0 writes its own table beside the user's, reports ok, and Codex then refuses the file with "duplicate key" or "cannot extend value of type inline table". After this task such an apply is refused before any file in the Codex folder is written.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`
- Modify: `packages/core/src/profiles/service.ts`: `applyCodexProfile`, inside its `try`, right after it reads the config file into `source`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `scanTomlStatements` in `codex-config-strip.ts`, `tomlKey` from `apply-support.ts`, already imported there, and `refusedProfileStatus` in `service.ts`, as they are. `scanTomlStatements` writes each key segment through `tomlKey`, so compare against `tomlKey(providerId)`.
- Produces: `export function headerlessCodexProviderTable(source: string, providerId: string): "own-id" | "root-inline" | undefined`. It returns `"own-id"` when an assignment defines the profile's provider with no header of its own: a key `<id>` or `<id>.<field>` under `[model_providers]`, or `model_providers.<id>` or `model_providers.<id>.<field>` at the root. It returns `"root-inline"` when the root assigns `model_providers` itself, whatever ids it holds. Otherwise `undefined`.

The research prototype returned a boolean and one message. Its message named `[model_providers.<id>]` even for a root inline table of another id, which is wrong, so this task asks for the two cases apart.

- [ ] **Step 1: Write the failing test.** Insert after the test `a reserved Codex provider id is refused after it is sanitized`:

```js
test("a Codex apply is refused when the user's config defines a provider LLMR cannot write beside", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const B = 'base_url = "http://127.0.0.1:9/v1"';
  const ownId = /defines the provider "llm-router" without its own \[model_providers\.llm-router\] header/;
  const rootInline = /defines model_providers on one line/;
  const forms = {
    dottedRoot: [`model_providers.llm-router.name = "Mine"\nmodel_providers.llm-router.${B}\n`, ownId],
    dottedUnderSuper: [`[model_providers]\nllm-router.name = "Mine"\nllm-router.${B}\n`, ownId],
    inlineUnderSuper: [`[model_providers]\nllm-router = { name = "Mine", ${B} }\n`, ownId],
    quotedDottedRoot: [`model_providers."llm-router".name = "Mine"\nmodel_providers."llm-router".${B}\n`, ownId],
    inlineRoot: [`model_providers = { llm-router = { name = "Mine", ${B} } }\n`, rootInline],
    inlineRootOtherId: [`model_providers = { mine = { name = "Mine", ${B} } }\n`, rootInline]
  };
  for (const [name, [original, message]] of Object.entries(forms)) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
      const codex = (await applyProfileConfig(config)).clients.find((client) => client.client === "codex");
      assert.equal(codex?.ok, false, name);
      assert.match(codex.message, message, name);
      assert.match(codex.message, /LLMR left .* unchanged\./, name);
      assert.equal(readFileSync(codexConfigFile, "utf8"), original, name);
      assert.deepEqual(readdirSync(codexDir), ["config.toml"], name);
    }, plantCodexOriginal(original), { applied: false });
  }
});

test("a Codex apply goes ahead over a provider of another id written with no header", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const B = 'base_url = "http://127.0.0.1:9/v1"';
  const forms = {
    dottedRootOtherId: `model_providers.mine.name = "Mine"\nmodel_providers.mine.${B}\n`,
    inlineUnderSuperOtherId: `[model_providers]\nmine = { name = "Mine", ${B} }\n`
  };
  for (const [name, original] of Object.entries(forms)) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ config }) => {
      const codex = (await applyProfileConfig(config)).clients.find((client) => client.client === "codex");
      assert.equal(codex?.ok, true, name);
    }, plantCodexOriginal(original), { applied: false });
  }
});
```

Append these two as well. The first passes before and after, and fails if the id is matched without its dot boundary (the audit's mutant). The second is the upgrade case:

```js
test("a provider id that only starts with the profile's id is not refused", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = `model_providers.llm-router-old.name = "Mine"\nmodel_providers.llm-router-old.base_url = "http://127.0.0.1:9/v1"\n`;
  await withAppliedDefaultProfiles(["default-codex"], async ({ config }) => {
    const codex = (await applyProfileConfig(config)).clients.find((client) => client.client === "codex");
    assert.equal(codex?.ok, true, codex?.message);
  }, plantCodexOriginal(original), { applied: false });
});

test("a config 9.1.0 already doubled is refused on the next apply, and the switch-off removes LLMR's table", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, config }) => {
    const doubled = `model_providers.llm-router.name = "Mine"\n${readFileSync(codexConfigFile, "utf8")}`;
    writeFileSync(codexConfigFile, doubled);
    const codex = (await applyProfileConfig(config)).clients.find((client) => client.client === "codex");
    assert.equal(codex?.ok, false);
    assert.match(codex.message, /without its own \[model_providers\.llm-router\] header/);
    assert.equal(readFileSync(codexConfigFile, "utf8"), doubled);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = readFileSync(codexConfigFile, "utf8");
    assert.doesNotMatch(restored, /\[model_providers\.llm-router\]/);
    assert.doesNotMatch(restored, /llmr-profile-/);
  }, plantCodexOriginal(), { parseAfter: false });
});
```

All four tests were built and run by the audit. The safe-forms test passes on `main` before the change, so the premise holds.

- [ ] **Step 2: Run it and see it fail.** `node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: the first test FAILS on its first form with `true !== false`. If the second test fails on `main`, the task's premise about the safe forms is wrong: stop and report.
- [ ] **Step 3: Add `headerlessCodexProviderTable`** in `codex-config-strip.ts`, over the statements `scanTomlStatements` gives, comparing keys through `tomlKey` so a quoted id matches.
- [ ] **Step 4: Refuse in `applyCodexProfile`.** For every agent that function serves, and not only when `profile.agent === "codex"` as the reserved-id refusal beside it does: the doubled table breaks the file whichever agent writes it. Call the function on the `source` that `applyCodexProfile` already reads at the top of its `try`, before the model catalog file is written, which is the first write. Do not read the file a second time before the `try`, as the audit's build did: nothing above `applyCodexProfile` catches, so a config file that cannot be read would throw out of the whole apply where today it gives this one client a failed status (read on 2026-11-27, not run). When the function returns a case, return `refusedProfileStatus` with one of these messages, where `<file>` is the config file and `<id>` the provider id:
  - `"own-id"`: `<file> defines the provider "<id>" without its own [model_providers.<id>] header, so Codex would not start once LLMR adds its table. Move that provider under its own header, or set this profile's providerId in LLM Router's config to another id. LLMR left <file> unchanged.`
  - `"root-inline"`: `<file> defines model_providers on one line, so Codex would not start once LLMR adds its table. Write each provider under its own [model_providers.<name>] header. LLMR left <file> unchanged.`
- [ ] **Step 5: Run the file and the core suite.** Expected: PASS. The research run's prototype left 2,551 core tests at 0 failures.
- [ ] **Step 6: Commit.** `fix(profiles): refuse a Codex apply over a provider written with no header of its own`

Not tested: the refusal for an agent other than Codex. Every test here applies `default-codex`, so a change that refuses only when `profile.agent === "codex"` survives them. A reviewer reads that condition.

Not in this task: teaching the scanner the headerless forms. A refusal turns a false ok into a true one for about 13 lines. The docs sentence that names these forms is already on `main`.

---

### Task 3: A saved local login shows what its check found (F-UI-1)

Branch `fix/provider-local-login-status`. Today both rows of the provider form's status panel are green whenever the provider is a saved local login. Neither reads a check's result, so never checked, passed and failed look the same.

**Files:**
- Modify: `packages/ui/src/pages/home/components/providers.tsx`: `ProviderConnectionStatusPanel`, the `connectionVerified` line of `AddProviderForm`, and the `verified` prop in `AddProviderDialog`
- Create: `packages/ui/test/component/provider-local-login-status.test.tsx`
- Modify: `packages/ui/test/component/provider-dialog-local-agent.test.tsx`, the test `a Codex login provider keeps its heading, its connection check and its model refresh`, which asserts the text "Available after saving"

**Interfaces:**
- Produces: for a local login, the second row reads "Not checked" and is grey before any check, reads "Connection verified" and is green after a check that found a supported protocol, and reads "Last check failed" and is amber after one that did not. The first row is green only when a probe or a passed check found a protocol. `connectionVerified` is true only when the check passed. The Verify step reads "Done" only then.

- [ ] **Step 1: Write the failing test.** Create the file:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AddProviderForm } from "@llmr/ui/pages/home/components/providers.tsx";
import { createProviderDraft, localAgentProviderApiKey } from "@llmr/ui/pages/home/shared/index.tsx";

const draft = {
  ...createProviderDraft([]),
  apiKey: localAgentProviderApiKey,
  baseUrl: "https://codex.example.test/v1",
  modelsText: "gpt-5",
  name: "Codex"
};
const plugins = [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }];
const probe = (supported: boolean) => ({
  models: [],
  normalizedBaseUrl: draft.baseUrl,
  protocols: [{ endpoint: "/responses", message: supported ? "ok" : "401 Unauthorized", protocol: "openai_responses" as const, status: supported ? 200 : 401, supported }]
});
const render = (connectivityProbe?: ReturnType<typeof probe>, error = "") =>
  renderToStaticMarkup(
    <AddProviderForm
      connectivityProbe={connectivityProbe}
      draft={draft}
      error={error}
      mode="edit"
      onChange={() => undefined}
      onCheck={async () => undefined}
      probeLoading={false}
      providerPlugins={plugins}
      providers={[]}
    />
  );
const rows = (html: string) =>
  [...html.matchAll(/<div class="flex min-w-0 items-start gap-2 rounded-md border bg-background px-3 py-2 ([^"]+)">.*?<div class="truncate text-\[12px\] font-semibold text-foreground">([^<]+)<\/div>/g)]
    .map((match) => `${match[2]}=${match[1].includes("emerald") ? "green" : match[1].includes("amber") ? "amber" : "grey"}`);
const verifyStep = (html: string) => html.match(/Verify connection<\/div><div[^>]*>([^<]+)</)?.[1];

test("a saved local login shows grey before a check, green after a pass, amber after a failure", () => {
  const never = render();
  const passed = render(probe(true));
  const failed = render(probe(false), "401 Unauthorized");
  assert.deepEqual(rows(never).map((row) => row.split("=")[1]), ["grey", "grey"]);
  assert.deepEqual(rows(passed).map((row) => row.split("=")[1]), ["green", "green"]);
  assert.deepEqual(rows(failed).map((row) => row.split("=")[1]), ["grey", "amber"]);
  assert.match(never, /Not checked/);
  assert.match(failed, /Last check failed/);
  assert.notEqual(verifyStep(never), "Done");
  assert.equal(verifyStep(passed), "Done");
  assert.notEqual(verifyStep(failed), "Done");
});
```

Built and run by the audit. Two assertions guard against a half fix and do not fail at 9.1.0. Both rows green after a pass is true today through the shortcut this task removes, and fails only if the shortcut goes and a passed check is not counted. The first row grey after a failed check kills a fix that turns it green after any check (the audit's mutant).

- [ ] **Step 2: Run it and see it fail.** `node build/test.mjs ui && node --test .test-dist/ui/test/component/provider-local-login-status.test.js`. Expected: FAIL on the first assertion, with both rows green before any check.
- [ ] **Step 3: Read the check's result.** In `ProviderConnectionStatusPanel`, the second row's title, text and state follow `connectionVerified` first, then, for a local login, whether a check has run. Its description is "LLMR has not sent a request through this local login yet. Check Connection sends one." before a check and "The last real model request through this local login failed. Check Connection tries again." after a failed one. Delete `claudeLoginProvider` in `AddProviderDialog`, which nothing reads once `verified` follows the check alone, or typecheck fails. The first row's state counts a passed check as a detected protocol and no longer counts a local login by itself. In `AddProviderForm` and `AddProviderDialog`, verified means the check found a supported protocol and nothing else. The Claude Code login provider cannot be checked and keeps the "Not checked" text it has today.
- [ ] **Step 4: Fix the one test that pins the old text.** In `provider-dialog-local-agent.test.tsx`, the test named above asserts "Available after saving". It now fails. Change that assertion to `/Not checked/`.
- [ ] **Step 5: Run the UI suite and typecheck.** `npm run test:ui && npm run typecheck`. Expected: all pass.
- [ ] **Step 6: Commit.** `fix(ui): show a saved local login as checked only after a check passed`

Not tested: the dialog's own Verify step. `AddProviderDialog` renders into a portal, so a static render gives nothing, the UI tests have no DOM, and a change that keeps the old shortcut in the dialog's `verified` prop survives every test (the audit's mutant). Its progress bar shows only when adding a provider. A reviewer reads that one line.

Stated limit: a check is forgotten when the dialog closes, so a saved local login opens grey each time. Keeping the result is not in this task. Nobody has looked at this panel in a window, and the VM pass has a check for it.

---

### Task 4: A request is named by its key in both layouts (F-LABEL-1)

Branch `fix/client-label-key-name`. Today a request with a valid key and no display-name header is named by its key in the compatibility layout and by its `User-Agent` in the single layout. On 9.1.0 the two layouts gave different names in 7 of 12 cases (the research run). After this task the trace import builds its caller the way the request path does.

**Files:**
- Modify: `packages/core/src/observability/raw-trace-sync.ts`: `readRawTraceRequestLogBundle`, where it builds `caller`
- Test: `packages/core/test/integration/gateway/october-issues-wire.test.mjs`, `packages/core/test/unit/observability/raw-trace-sync.test.mjs`

**Interfaces:**
- Consumes: `gatewayClientCallerForKey` from `gateway/http/io.ts`, as it is.
- Produces: in `readRawTraceRequestLogBundle`, a caller built with `gatewayClientCallerForKey(apiKey)` when the trace's key id names a stored key, `{ kind: "key", trustedForwarder: false }` when it names none, and `{ kind: "refused" }` when the trace has no key id.

- [ ] **Step 1: Change what six tests expect.** These pin the old single-layout label. The four in `october-issues-wire.test.mjs` have names built from a template, so search for the words before "(single)". Their expectations are written as a choice by layout: five as `layout === "compat" ? X : "Node.js"`, nine as `single ? "Node.js" : X`, and one as `single ? "u".repeat(120) : "wire"`. Each becomes its compatibility value alone. The two `"Node.js"` assertions on `refusedForKey` stay. The two in `raw-trace-sync.test.mjs` have no compatibility case and their keys have no name, so the expected client becomes the key's id, `gw` in four assertions (two in each test) and `profile:codex` in one, and a trace with no stored key or no key id keeps `Claude`. The six:
  - in `october-issues-wire.test.mjs`: `the client label holds for every source and caller (single)`, `the client label follows the key's trusted forwarder mark (single)`, `the client label follows the key's trusted forwarder mark (single, logs off)`, and `a request from a marked key is recorded under the developer's id and e-mail, and one from another key naming the same developer is not (single)`
  - in `raw-trace-sync.test.mjs`: `raw trace usage capture keeps the client label the request log gets` and `a trace records the developer only when its key is a trusted forwarder`
- [ ] **Step 2: Run both files and see the six fail.** With the gateway entry set. Expected: those six FAIL on the client label and nothing else does.
- [ ] **Step 3: Build the caller from the key.** Replace the inline caller in `readRawTraceRequestLogBundle` as the Interfaces block says, and drop the import of `isTrustedForwarderKey` if nothing else in the file uses it.
- [ ] **Step 4: Run the core suite.** Expected: PASS. Five Codex wire tests failed for two research runs under an environment with no variables and pass in CI. If they fail here too, run them on `main` in the same shell before blaming the change.
- [ ] **Step 5: Commit.** `fix(gateway): name a request by its key in the single layout, as the other layout does`

What moves beside the label (the research run): in Agent Analysis a key named `codex` that sends `curl` becomes agent `codex` in the single layout, as it already is in the other. A request with `x-llmr-proxy-mode: gateway` keeps its `User-Agent` name in both layouts, before and after.

---

### Task 5: The raw trace tests wait long enough for a slow disk (F-TEST-13)

Branch `test/platform-flakes`, with Task 7. Two tests of `raw-trace-sync.test.mjs` timed out on Windows at PR 172's merge commit. The cause is found: each does 33 to 40 fsyncs inside a 2 second wait, and that runner's disk stalled. A preload that slows only `FileHandle.sync()` by 120 to 200 ms reproduces both failures (the research run).

**Files:**
- Modify: `packages/core/test/unit/observability/raw-trace-sync.test.mjs`: the `waitFor` helper near the end of the file

- [x] **Step 1: Raise the default.** `waitFor(predicate, timeoutMs = 2_000)` becomes `timeoutMs = 10_000`. A test that passes waits no longer than before.
- [x] **Step 2: Run the file.** `node build/test.mjs core && node --test .test-dist/core/test/unit/observability/raw-trace-sync.test.js`. Expected: PASS, in about the time it took before.
- [x] **Step 3: Commit.** `test(core): give the raw trace tests ten seconds for a disk that stalls`

---

### Task 6: Removed by the audit

Round two reported a new Windows flake in `a --no-gateway start and a save both write the retention, and a locked log database does not hold a save up` (`packages/core/test/unit/web/request-log-retention-save.test.mjs`) and called it 9.1.0 code. It was not. The failing run was at `94dadde2`, which is before PR 180, and PR 180 made `RequestLogRuntime.list` compare the requested retention with the page's own (checked by the lead with `git merge-base`: PR 180 is not in `94dadde2` and is in `v9.1.0`). At `main` the page's retention and that condition come from one read, so the test cannot see 3 beside a pending 3. The audit delayed the writer's acknowledgement by 1.5 seconds and the test passed 3 of 3. With the delay and PR 180's condition taken out, it failed exactly as CI had.

So there is nothing to fix, and no task. The number is kept so the others do not move.

---

### Task 7: Prove route scripts run side by side, with no clock (F-TEST-1)

Today `route script workers distribute concurrent executions across available slots` spins for 350 ms in each script and passes on one worker, so nothing tests that scripts run at the same time. After this task each script waits for a file the other writes, so both finish only when both run at once.

**Files:**
- Modify: `packages/core/test/unit/routing/route-script-runtime.test.mjs`: that one test

- [x] **Step 1: Replace the test's body.**

```js
test("route script workers distribute concurrent executions across available slots", async () => {
  // Each script waits for the file the other writes, so both finish only when they run at the same time.
  const directory = mkdtempSync(path.join(os.tmpdir(), "llmr-route-script-parallel-"));
  const runtime = new RouteScriptRuntime({ workerCount: 2, workerFile });
  const script = routeScript(`
    await api.fs.writeText(input.body.mine, "ready");
    while (!(await api.fs.exists(input.body.theirs))) {}
    return true;
  `, { timeoutMs: 10_000 });
  const flag = (name) => path.join(directory, `${name}.flag`);
  try {
    const results = await Promise.all([
      runtime.execute("parallel-a", script, scriptInput({ mine: flag("a"), theirs: flag("b") })),
      runtime.execute("parallel-b", script, scriptInput({ mine: flag("b"), theirs: flag("a") }))
    ]);

    assert.deepEqual(results.map((result) => result.status), ["ok", "ok"]);
  } finally {
    await runtime.close();
    rmSync(directory, { force: true, recursive: true });
  }
});
```

`mkdtempSync`, `rmSync` and `os` are already imported in that file (the audit's run).

- [x] **Step 2: Run it 20 times.** Expected: 20 of 20 pass, in about 20 ms each (the audit's run).
- [x] **Step 3: See it fail on one worker.** Change `workerCount: 2` to `1` and run once. Expected: FAIL with `[ 'timeout', 'ok' ]` after about 10 seconds. Put it back.
- [x] **Step 4: Run the gate and open the PR** for Tasks 5 and 7. Commit this task as `test(core): prove route scripts run side by side without a clock`.

---

### Task 8: Make the Windows and Intel Mac jobs required checks (F-TEST-3). The owner's setting

Not code, apart from one test. A red platform job already stops `npm run release`, so the merge gate is looser than the release gate. Since 2026-11-26 Windows failed 4 of 35 first attempts on PRs, the required Linux job 2 of 35, and the Intel Mac job none (the research run over 172 runs).

**Before.** The branch of Tasks 5 and 7 is merged and the Tests workflow has passed on Windows three times in a row since.

**Files:**
- Modify: `tests/architecture/workflow-permissions.test.mjs`, beside its test `the package suites also run on Windows and an Intel Mac`

- [ ] **Step 1: Pin the names.** The job is named `🧪 Unit (${{ matrix.display_name }})`, with the display names `Windows` and `Intel Mac`, so a rename in `.github/workflows/test.yml` would leave every PR waiting for a check that never reports. Add this test and land it as its own small PR:

```js
test("the Tests workflow still reports the required platform check names", () => {
  const workflow = readFileSync(".github/workflows/test.yml", "utf8");
  const platforms = workflow.split(/^(?= {2}[\w-]+:$)/m).find((job) => job.startsWith("  platforms:\n"));
  assert.ok(platforms);
  const template = /^ {4}name: (.*)\$\{\{ matrix\.display_name \}\}(.*)$/m.exec(platforms);
  assert.ok(template, "the job name is built from matrix.display_name");
  const names = [...platforms.matchAll(/^ {10}- display_name: (.+)$/gm)].map((match) => `${template[1]}${match[1]}${template[2]}`);
  assert.deepEqual(names, ["🧪 Unit (Windows)", "🧪 Unit (Intel Mac)"]);
});
```

  It passes today, and renaming `Intel Mac` in the workflow makes it fail (the audit's run). Use the file's own way of reading the workflow if it has one.
- [ ] **Step 2: GATE. The owner's word.** Then add both names to the ruleset `main: tests must pass`, pinned to the GitHub Actions app as its three checks already are. Keep "require branches to be up to date" off: with about three direct pushes to `main` for each PR merge, it would leave almost every PR behind.
- [ ] **Step 3: Check it.** `gh api repos/jrmatherly/llm-router/rules/branches/main` lists five checks, where it lists three today. An open PR whose five checks passed reads clean to merge.

No merge queue. They are for repositories an organization owns, and this one is a user's.

---

### Task 9: Turn on Dependabot version updates, and close Renovate's PR (F-TEST-5). The owner's decision

Round two leans to Dependabot. Renovate also covers the Dockerfile `ARG` digests and `.node-version`, which Dependabot does not, and it holds third-party write access to a repository that signs releases. Neither tool updates the version-pinned `allowScripts` list in the root `package.json`.

**Files:**
- Modify: `.github/dependabot.yml`

- [ ] **Step 1: GATE. The owner chooses Dependabot, Renovate or neither.** Nothing below runs before that.
- [ ] **Step 2: Replace the config.** `.github/dependabot.yml` already exists with four entries: GitHub Actions, npm at the root as one group that leaves the gateway package out, npm under `docs`, and the compose images of the Claude apps gateway harness. Its check is `Dependabot covers both lockfiles, the workflows and the compose images` in `tests/architecture/workflow-permissions.test.mjs`. The repository is a fork, where version updates need the toggle of Step 3, and Dependabot has never opened a PR here. A draft that passes that check is in the private folder as `tests-ci-repo/dependabot.yml`. The lead copies it into the branch, since a builder does not open that folder. It groups the four packages that have install scripts, so a bump of one arrives as its own PR and the hand step, `npm install-scripts approve <pkg>`, is not missed.
- [ ] **Step 3: Switch it on.** "Dependabot version updates" in the repository's settings. A fork needs the toggle. It is the owner's click.
- [ ] **Step 4: Close PR 168** with one line saying why, and ask the owner whether to remove the Renovate app from the repository.
- [ ] **Step 5: State the two gaps** in the repository's contributor notes: the Dockerfile digests and `.node-version` stay manual.

A gap neither tool closes: `npm install-scripts ls` exits 0 with an unreviewed script, so a bump can merge green with its script skipped. A CI step that compares that command's output with the `allowScripts` list would catch it. It has no task.

---

### Task 10: Release the gateway fork as `llmr.5` (F-GATEWAY-1). Waits on the owner's word

This is Task 1 of [`2026-11-27-finish-and-release.md`](2026-11-27-finish-and-release.md), unchanged. Its fork commit `d35913c` is built and lives only on this Mac, on the local branch `fastify-log-controller` of `~/dev/llmr-gateway`.

Two facts round two added. Fastify 6.0.0-alpha.6 neither throws nor warns on the option that commit removes. It ignores it and turns access logging back on, so without the commit a move to Fastify 6 would switch request logging on silently. Nothing forces that move yet, since LLM Router's range cannot take version 6 and version 6 has no date. And pushing the commit as a branch with no tag starts no workflow, makes the branch public, and ends the one-disk risk.

- [ ] **Step 1: GATE.** The owner's word for a push to the fork. He may give it for the branch alone, with no tag.
- [ ] **Step 2:** Run that plan's Task 1 as written.

Not in this task: the fork change for F-LOGS-1. In the single layout a refusal that reads "All target providers failed" keeps its real reason only in a nested field, so Claude Code and the OpenAI SDK show the bare message, and the error code sits one level too deep for the OpenAI SDK. The fix is in the fork and nobody has designed it. It should ride the same fork release if it is ready.

---

### Task 11: Correct three plans' text. Docs only, straight to `main`

- [ ] **Step 1: Restore Task 9**, in `2026-11-22-backlog-restore.md`, near lines 562 to 600. It has no link to the Codex config reference today, so add one to its opening paragraph: https://learn.chatgpt.com/docs/config-file/config-reference, which answers and is where the old address now redirects (one request, 2026-11-27). Add a row for `model_providers.<id>.gateway_oauth.credential_export` beside the `auth` table, with the finding that with its default header it cannot be combined with `auth`, `env_key`, `experimental_bearer_token` or `requires_openai_auth` on Codex 0.172.0, so the `auth` table stays the base. Close its download question as "the installed version only".
- [ ] **Step 2: The gateway phase 1 plan**, `2026-11-25-apps-gateway-phase-1.md`. Every name it uses exists at 9.1.0. Four lines are out of date: the "Where this fits" row near line 92, since batches 8, 16 and 17 are merged; two preconditions that phase 0 has met, near lines 5 and 17; and Task 5 Step 4 near line 426, which tells the builder to run `npm run test:e2e` locally. Replace that step with "left to CI". Another session owns that plan, so ask the owner before editing it.
- [ ] **Step 3: Pricing Task 8**, in `2026-11-22-backlog-pricing.md`. That task has two options lettered C. The one to restate is the first, near line 1013, which begins "Do not price the tier. Mark such a request's cost as an estimate". Restate it as the list of tiers that mark a cost: OpenAI `priority`, `fast`, `flex` or `ultrafast` in `service_tier`; Anthropic `usage.speed` of `fast`; Google `priority` or `flex` in the `x-gemini-service-tier` response header. Say that Anthropic's `service_tier` of `standard` is an ordinary request, and that a translated reply that is not streamed drops these fields, as it drops a provider's reported cost.
- [ ] **Step 4:** Commit each as its own docs commit.

---

## When the VM pass has run

The checklist is [`../research/2026-11-27-vm-pass-9.1.0-checklist.md`](../research/2026-11-27-vm-pass-9.1.0-checklist.md). The owner runs it on new installs, Claude Code first.

- [ ] Fill its Results table from what he reports, and commit it.
- [ ] A step he could not follow as written is a fault of the checklist. Fix the step and say so. It is not a product finding.
- [ ] Each line marked failed becomes a task here, written the way Tasks 1 to 4 are: the failing test first, checked against the code on another model before the task is committed.
- [ ] Checks not run are listed under "Not in this plan" with the reason: the upgrade from 9.0.0 (VM-3, VM-4), ZCode (VM-12), and any check that needs an agent other than Claude Code that he leaves for later.

## Not in this plan

Each waits for the owner, for the VM pass, or for a design nobody has made.

- **Deferred by the owner on 2026-11-27, ZCode.** Two System default ZCode profiles leave the profile key on disk (the research run). The current ZCode app may ignore every file LLM Router writes (read in its public source). A user's ZCode cache that names LLM Router's id refuses the switch-off. And F-RESTORE-1: the rule round one proposed should not be built as specified, since it makes a failed switch-off stick in 186 of 4,000 generated scenarios.
- **Deferred against round two's advice.** Round two said to fix the provider-name strip in the price lookup in Task 1's PR, and sketched two ways: try the model id as sent before the stripped form, or strip only when the provider's own model list holds the stripped name. It is left out here because neither way was built, no unit test pins the fault, only a script over the live catalogs shows it, and it changes the lookup for paid models too. It needs a prototype and a failing test of its own first. Until then 23 of the 96 offers Task 1 aims at stay wrong for a provider left at its preset name.
- **Open, no design.** The fork change for a single-layout refusal's reason (F-LOGS-1). The identity header rule (F-LABEL-5): the gateway replaces a client's copy, so a repeated header never arrives through it, and the rule waits for a case that needs it.
- **Open, a decision.** Pricing Task 8 itself, once its text is corrected. Squash-only merges and SHA pinning for actions, the two RS-5 settings left beside Task 9. The 88 `remediation` and 27 `test` rows of the register, which nobody has sorted into tasks: the owner says which matter after the VM pass.
- **Stays as it is, by both rounds.** F-PRICE-4, 5, 6, 8 and 9. F-LOGS-2, F-LABEL-2. F-RESTORE-2, 4 and 5. F-TEST-2. F-GATEWAY-2, apart from the four text lines of Task 11.

## Self-review

- **Coverage.** Every row round two recommends a change for has a task or a line under "Not in this plan" with its reason: F-PRICE-3 and 36 (1), F-CODEX-1 (2), F-UI-1 (3), F-LABEL-1 (4), F-TEST-13 (5), F-TEST-1 (7), F-TEST-3 (8), F-TEST-5 (9, and the rulesets already applied), F-GATEWAY-1 (10), F-RESTORE-3, F-GATEWAY-2 and F-PRICE-7 (11).
- **Names.** `ownEntry`, `zeroKeys`, `"listed-free"` and `headerlessCodexProviderTable` are each defined in one task and used only there.
- **What rests on a run and what does not.** Tasks 1 to 5 and 7 were built twice by two runs on another model: once as prototypes, and once from this plan's text alone. Every test here was run by the second. Written after it and not built again: the wording its corrections changed, which is Step 6 and 7b of Task 1, Step 4's "every agent" of Task 2, the two descriptions of Task 3 and Step 1 of Task 4. Written by the later review and built by nobody: where Task 2 Step 4 makes its check, and Task 1 Step 7c.
- **Not checked.** A real Codex loading or refusing any form of Task 2: the audit checked only that each file parses as TOML. Any task in a window. Any Windows run. Either setting of Tasks 8 and 9 in effect. Review Focus 1's count of 23 on today's catalogs.
