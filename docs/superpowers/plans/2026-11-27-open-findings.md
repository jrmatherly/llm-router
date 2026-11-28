# Open findings from the delivery program

This file lists every finding from PRs 149 to 179 and their plans that was found and not fixed, one row each, written 2026-11-27 at `main` `b504d153`.
The full evidence for a row stays where it was written, mostly under "Findings with no task" in [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md), and this file is the index into it.
Every Disposition is a proposal until the owner accepts it.

How to read a row. **Since 9.0.0?** says `new` when a PR after tag `v9.0.0` introduced the behaviour, `old` when 9.0.0 does the same, `worse` when the unreleased code does worse for a user than 9.0.0, and `unknown` when this pass could not tell. **Evidence** is the label the source gives (run, read, inferred) and nothing here was run again. **Recommendation** is the source's own, shortened. The dispositions are `before release`, `decide` (the owner's answer comes before any build), `limit` (the plan chose it and says so), `test` (tests, mutants, harness or CI only), `remediation` (fix after the VM pass) and `closed`.

One planned task is not built and is not a finding: harness Task 5, batch 5, which waits on the owner's word for the gateway fork.

## The owner's answers, 2026-11-27

The tables below are the proposal as first written. These answers came the same day and are not folded into the rows or the counts.

- **Fixed before the release, as Tasks 2 to 8 of [`2026-11-27-finish-and-release.md`](2026-11-27-finish-and-release.md):** F-PRICE-1, F-PRICE-2, F-PRICE-11, F-PRICE-28, F-LOGS-5, F-LABEL-4 and F-LABEL-5. The last five are listed below as `remediation`. Each was checked against `main` `b504d153` and still holds, with a test seen failing there (run, on another model).
- **F-PRICE-10 is surveyed** in [`../research/2026-11-27-logs-row-without-usage-row.md`](../research/2026-11-27-logs-row-without-usage-row.md). It is rare. It needs the compatibility layout, a stream the client cancels or that fails partway, and the window before the catalog loads (read and inferred, not run). "Never priced" is too strong: the back-fill copies such a row into the totals, and F-PRICE-11 is what then marked it `unpriced` for good. It stays a limit, with the back-fill starting a sweep left for the remediation plan.
- **F-PRICE-3 is researched** in [`../research/2026-11-27-zero-listed-price.md`](../research/2026-11-27-zero-listed-price.md), and the decision is still his. The recommendation is to show `$0.00` and "Listed at no charge" only for a zero that is the offer of the provider the request went to.
- **F-PRICE-36, new from that research, `decide`.** 207 live offers listed at zero take a paid price from another offer and show it as a list price with no tilde, the opposite error to F-PRICE-3. A second researcher reproduced the count on the saved catalogs and corrected the rest (run): 9.0.0 has the same code, so the figures are old and only the "list price" label is new, from PR 177. The cause first given, a zero offer's canonical id followed to the maker's entry, accounts for 77 of the 199 models.dev cases. The other 122 take a maker's price by V-21's maker step, working as decided. Question: should a zero offer add no canonical id? Default: no change until he answers. Recommended: yes, in the PR that builds F-PRICE-3's answer. **Closed by PR 185, 2026-11-27.**
- **Every `decide` row was researched the same day.** The recommendations, grouped by when, are under "Open with the owner" in the finish plan, and the evidence is in five notes under `../research/2026-11-27-*.md`. One row below is corrected by that research: the first half of F-RESTORE-5, "a profile's record is kept while a saved original exists", is not in the code. Batch 9's review replaced it with a flag set on every finished restore (read).
- **Group A of the finish plan was accepted the same day.** F-PRICE-34, the rename of "Estimated cost" to "Cost", merged as PR 181 (`26bd76c6`). The docs sentences for F-CODEX-1 and F-RESTORE-2 are on `main` as `fca8e250`. The refusal that F-CODEX-1's research also suggests is not built.
- **F-GATEWAY-19's second half is answered by a read, 2026-11-27.** The gateway fork has one request path that skips the provider hook: `checkProviderHealth` builds its request from the provider's stored key and sends it with a plain fetch. Its callers are a manager route and a scheduler that is off by default, and no LLM Router source sets the option or calls the route. What it would send is the placeholder key to that provider's own address, never a session token (read at the fork's `d35913c`; that the compiled provider entry carries the placeholder is inferred). The detail is in the VM checklist. The window steps of F-GATEWAY-19 stay for the pass.
- **The version is 9.1.0.** The gateway fork release of batch 5 is not yet.
- **Found by the build and review of Tasks 2 to 8 (PR 180), 2026-11-27. None is fixed, and none has a row or a task.** The owner answered the first two the same day: Task 8's commit is dropped, so F-LABEL-5 is not fixed and stays `remediation`, and PR 180 merged as `0500d2f3` with Tasks 2 to 7 and the Task 4 limit as it stands.
  - **Task 8's rule hides a forged identity header.** On `main` a header sent twice shows both values joined. The branch shows the first. If the Apps gateway appends its own header after a caller's copy, the first is the caller's. Whether it does is unknown: no recorded harness run sent a client copy through the gateway (read). One request through the harness with the header set by the client would settle it. Options: first value as built, no forwarded identity when a header carries more than one value, or drop the commit and keep `main`'s display. Recommended: drop the commit for 9.1.0 and decide after that one request.
    - **That request was run the same day, and the gateway replaces a client's copy.** Through `claude gateway` 2.1.332 in the Docker harness, signed in as the mock user, with a mock upstream that logs the raw headers: a client that sent one forged copy, two different forged copies or a mixed-case name of `x-claude-gateway-user-email`, `x-claude-gateway-user-id` or `x-litellm-end-user-id` reached the upstream as exactly one copy of each, holding the signed-in user's value. No forged value arrived in 7 requests through the gateway, and all of them arrived in the 5 control requests sent straight to the mock (run, and the log re-read by the lead). So through this gateway the forged-first case does not happen, and neither does the repeated header F-LABEL-5 describes: only another holder of the marked key can send one. Not run: a user whose IdP token has no e-mail, a streaming request, routes other than `/v1/messages`. One more cost of the rule, not in the task's text: the gateway sends the IdP's `sub` as the id, and a `sub` that is a directory name such as `CN=Jane,OU=Eng` is cut at its first comma where `main` keeps it whole (inferred, the mock issuer's `sub` holds no comma). Recommended, more firmly: drop the commit. It fixes a display the real gateway never produces and shortens an id it can. The record is outside the repo, in `private/research/2026-11-27-identity-header-order/`.
  - **Task 4 leaves a virtual model profile's copied row unpriced.** The pipeline stores the profile's name in `resolved_model`, and the copy now prices by it, so both rows end unpriced where `main` priced them (run). It needs a pipeline-written Logs row with tokens, no price and no usage row (inferred). Recommended: keep the commit and state the limit, and for the remediation release have the sweep try `model` when `price_model` gives no price.
  - **Task 2 does not remove the fault F-PRICE-28 names for the bundled catalog.** The ten tiers with a cache write of 0 sit on base entries that also list 0, so 0 of 1,228 tiered offers resolve differently (run of a re-implementation over `models.json`, not the live catalogs). Recommended: decide separately whether a base entry's cache price of 0 reads as absent.
  - **A NULL `resolved_model` fails the whole copy from Logs** with a NOT NULL error, where `main` copied (run). Only a hand-built database has one: the column has always been `NOT NULL DEFAULT ''` (read). Recommended: `COALESCE(logs.resolved_model, '')`.
  - **A row with a complete stored price and a cost source that is no price source is no longer re-priced by a trace.** `main` re-priced it and labelled it `custom` (run). No writer since 8.1.0 produces one (read). The plan's text asks for this, and a test now pins it.
  - **A downgrade mis-prices a tiered Logs row.** A row the branch wrote with tiers, then traced by 9.0.0 code, is priced at its base price (run). Recommended: one line in the release notes if downgrades are supported.
  - **An identity value that starts with a comma is dropped, and a quoted display name with a comma is cut** (run). The second is the comma limit Task 8 states for ids.
  - **`usageSchemaColumns` can drift from `ensureUsageSchema`.** The fix round's test reads the columns from the schema itself, so a new column left out of the list fails it (run on the mutant).
  - **Already on `main`:** when the copy from Logs throws on a constraint, the fallback duplicates the whole log database and fails again (read, and seen in a run).

## Counts

Counted by a script over the tables below.

| Area | before release | decide | limit | test | remediation | Total |
|---|---|---|---|---|---|---|
| PRICE | 2 | 7 | 3 | 0 | 23 | 35 |
| LOGS | 0 | 2 | 5 | 0 | 9 | 16 |
| LABEL | 0 | 1 | 6 | 0 | 7 | 14 |
| RESTORE | 0 | 5 | 3 | 0 | 29 | 37 |
| CODEX | 0 | 0 | 1 | 0 | 8 | 9 |
| GATEWAY | 0 | 2 | 11 | 0 | 6 | 19 |
| UI | 0 | 0 | 0 | 0 | 5 | 5 |
| WIN | 0 | 0 | 0 | 0 | 2 | 2 |
| TEST | 0 | 4 | 0 | 31 | 0 | 35 |
| DOCS | 0 | 1 | 0 | 0 | 2 | 3 |
| Total | 2 | 22 | 29 | 31 | 91 | 175 |

## Before release

Two rows, the more harmful first. Both are new, both show a wrong figure on a page a user reads, and the source asks for both to be settled before the release.

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Why it qualifies |
|---|---|---|---|---|---|---|
| F-PRICE-1 | On a prompt over a tier's size, a Logs row whose tokens arrive after its price keeps the base price and disagrees with its usage row ($0.0155 against $0.0775), and the order of the price update and the trace changes the figure. | PR 178 | new | run | Store the whole price on the row, or choose the tier again in the raw trace re-price. | Tiers are new in PR 178, and Logs then shows a cost five times too low beside the totals. How often a row is priced before it has tokens was not surveyed. |
| F-PRICE-2 | A stored cost on a request with no tokens gets no basis, so every total shows `-` while $0.50 is stored, and alone it shows `$0.50` with no tilde. | PR 177, audit F-1 | new | run. That the gateway sends such an event is inferred | Decide the basis from the cost first, and return none only for a row with no tokens and no cost. | The cost basis is new in PR 177, a total hides real money, and the fix is one line. |

Three more the owner may want to pull forward. F-PRICE-3 needs his answer first and the source names it for the release. F-PRICE-10 is a stated limit whose source asks for a survey of the request paths before the release. F-RESTORE-11 is `worse` only for an install that upgrades with a Pi takeover in place.

## Decide

Each question can be answered yes or no. The default is what happens with no answer.

| ID | Finding | Source | Since 9.0.0? | Evidence | Question | Default | Before release? |
|---|---|---|---|---|---|---|---|
| F-PRICE-4 | A request with no tokens shows `-` in Logs detail and the Agent requests panel, the same sign as an unknown cost, where it showed `$0.00`. | PR 177, audit F-4 | new | run | Keep the dash for a request with no tokens? | Yes, as built | No |
| F-PRICE-5 | Logs counts a response chunk whose only figure is a reasoning count and the usage row skips it, so the two tables can name different models for one request (705 of 4,000 generated bodies). | PR 175 | old | run. No real provider stream was shown to send one (inferred) | Give both stores one rule now? | No, leave both rules | No |
| F-PRICE-6 | A provider's reported cost does not survive the gateway fork, so pricing Task 6 cannot work. | Delivery index question 2 | old | read | Change the fork to carry the cost? | No, drop P-5 for now | No |
| F-PRICE-7 | A priority or flex request has no price when the rule's price has no service-tier figure. Pricing Task 8 waits. | Delivery index question 3 | old | read | Accept the pricing plan's option C, mark such a cost as an estimate? | Yes | No |
| F-PRICE-8 | A usage row from the gateway's billing counts as an estimate. A researcher's choice, built. | Delivery index, four choices | new | read | Keep it? | Yes | No |
| F-PRICE-9 | A reported cost of 0 counts as absent. A researcher's choice that belongs to pricing Task 6, which is not built. | Delivery index, four choices | unknown | read | Keep it? | Yes | No |
| F-PRICE-34 | The Overview card and both share cards say "Estimated cost" beside a tilde that now means something narrower. | PR 177, audit F-7 | new | read | Rename the label to "Cost"? | No change until he answers. The source recommends yes. | No |
| F-LOGS-1 | The single layout's refusal body keeps the fork's prefix before the reason. | Delivery index question 14 | old | read | Keep the prefix? | Yes. Removing it needs a fork release. | No |
| F-LOGS-2 | A trace names a provider only for a usage event with no tokens and no cost. Built so in PR 172. | Delivery index question 15 | new | read | Keep the narrow rule? | Yes | No |
| F-LABEL-2 | Identity headers are stored as `[redacted]` in Logs for every key, a marked key's included. Built so in PR 174. | Delivery index question 4 | new | run | Keep it for every key? | Yes | No |
| F-RESTORE-1 | With `v2/config.json` deleted during a ZCode takeover, a switch-off leaves LLM Router's entry in the model cache under an ok status, and the user's `defaultModel` stays only in the saved original. 9.0.0 restored the cache. | PR 171 | worse | run | May a cache entry be taken by its id when the config is gone and a saved original exists? | No, left as a stated limit | No |
| F-RESTORE-2 | The Restore original settings button covers Claude Code and Codex only. | Delivery index question 9 | old | read | Leave the button as it is? | Yes | No |
| F-RESTORE-3 | Restore Task 9, the Codex token command prototype, has not run, and its Versions row waits. | Delivery index question 10 | old | read | Installed Codex version only? | Yes | No |
| F-RESTORE-4 | Workbuddy's `models.json` has no stripper. It holds a placeholder and no key. Built so in PR 169. | Delivery index question 11 | old | read | Leave it? | Yes | No |
| F-RESTORE-5 | Two researcher's choices in the restore work, built. A profile's record is kept while a saved original exists, and a save's notice is set only by a profile's own restore. | Delivery index, four choices | new | read | Keep both? | Yes | No |
| F-GATEWAY-1 | The fork commit of harness Task 5 has no release. | Delivery index question 13 | old | read | Hold it until another fork change needs a release? | Yes | No |
| F-GATEWAY-2 | Gateway phase 1 is built after the release, and nobody has said where it sits beside the remediation plan. | Delivery index, "After the release" | new | read | Remediation release first? | none given | No |
| F-TEST-2 | One `npm run test` leaves 124 entries, about 38 MB, in the temp folder beside the temporary homes it removes. | Delivery index question 18 | old | run | Leave them? | Yes | No |
| F-TEST-3 | The Windows and Intel Mac jobs are not required checks, so a red one does not block a merge and GitHub called PR 178 unstable. | Harness plan question 1, PR 178 | new | run | Leave them out of the required list? | Yes | No |
| F-TEST-4 | H-7 of the harness plan waits on the owner's Claude Desktop check. | Delivery index question 16 | old | read | Run it in the end pass? | Yes | No |
| F-TEST-5 | Four of RS-5's six repository settings are not applied (Dependabot version updates, SHA pinning for actions, squash-only merges, the tag ruleset). | Delivery index, "The older plans" | old | read from the GitHub API | Leave them until after the release? | Yes. They gate nothing here. | No |
| F-DOCS-1 | The audit index's list "Steps only the owner can do" has no record of which steps were run. | Delivery index, "The older plans" | old | not checked | Were they run? | none given | No |

Question 17 of the delivery index, whether merges can go without his review line, is about method and is not a row.

## PRICE

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-PRICE-10 | A Logs row that waits with no usage row is never priced, because the back-fill that priced it is deleted. | PR 176 | new | read. The request paths that write such a row were not surveyed | Survey the paths before the release, and give the sweep a second source if one is common. | limit |
| F-PRICE-11 | A waiting row copied from Logs into the totals is resolved by the response's alias and marked `unpriced` in both tables for good. | PR 176 | new | run | Copy `resolved_model` into `price_model`, one line. | remediation |
| F-PRICE-12 | A raw trace that changes a swept row's tokens leaves Logs and the totals with different costs ($3 against $1). | PR 176 | old | run | none given | remediation |
| F-PRICE-13 | The sweep prices 1 hour cache writes at the 5 minute price, since neither table stores the split. | PR 176 | old | run | none given | remediation |
| F-PRICE-14 | A row whose resolved price gives no amount stays waiting and is resolved again by every sweep for 7 days. | PR 176 | new | run | none given | remediation |
| F-PRICE-15 | A row whose model is `unknown` is marked `unpriced` and sent, where it was left waiting. | PR 176 | new | run | none given | remediation |
| F-PRICE-16 | A price update is sent for a request with no Logs row and parks for 5 minutes. Harmless. | PR 176 | new | read | none given | remediation |
| F-PRICE-17 | A price update refused by a closed or full log queue is not retried, so its Logs row has no cost while its usage row is priced. | PR 176 | new | run | none given | remediation |
| F-PRICE-18 | The sweep has no timer, so after an outage with no later request the waiting rows stay unpriced until the next launch. | PR 176 | new | read | none given | remediation |
| F-PRICE-19 | The Overview notice about a failed price source never shows in a process that prices no request, such as `serve --no-gateway` or a process that adopted another's gateway. | PR 177 | new | run and read | Say so in the text, or carry the pricing process's status with the shared database. | remediation |
| F-PRICE-20 | The price source status is only as fresh as the last reload a request asked for. It stays failing after the network returns, and an outage after a good load is silent for up to 24 hours. | PR 177 | new | run | Retry on a timer or from `getStats`. | remediation |
| F-PRICE-21 | A gateway billing cost of $0 shows `~$0.00` alone and a plain `$0.00` in a total. | PR 177, audit F-3 | new | run | Leave it, or count estimates by rows. | remediation |
| F-PRICE-22 | A usage row that states only a total token count is in neither the priced nor the unpriced count. | PR 177, audit F-6 | new | run | none given | remediation |
| F-PRICE-23 | "Not priced yet" is permanent for a waiting row older than the sweep's 7 days. | PR 177, audit F-5 | new | read | A later wording change. | remediation |
| F-PRICE-24 | An expanded Logs row caches its detail, so a row priced after it was opened keeps `-` and "Not priced yet". | PR 177 | new | read | none given | remediation |
| F-PRICE-25 | `loadedAt` is sent in the snapshot and shown nowhere, and a forced refresh clears the catalog. No product path forces one. | PR 177 | new | read and run | none given | remediation |
| F-PRICE-26 | `OverviewView` throws on a snapshot with no `priceSources`, which a window on a newer build than its service would get. | PR 177 | new | run. No product path produces one (read) | none given | remediation |
| F-PRICE-27 | A tier that states only `cache_write` is hidden by the base entry's 5 minute or 1 hour field. No bundled tier has the shape. | PR 178 | new | run | Drop the base's narrower fields from such a tier. | remediation |
| F-PRICE-28 | A 0 in a tier field replaces the base price for that field. The snapshot has 10 tiers with a cache write of 0. | PR 178 | new | run. A tier of 0 and 0 leaving no cost is inferred | Treat a tier's 0 as absent. | remediation |
| F-PRICE-29 | A tier written as "at or over" starts one token late, and a 1 hour cache write on a long prompt takes the tier's one cache write price. | PR 178 | new | read | none given | remediation |
| F-PRICE-30 | A tier below the base is applied (4 bundled offers), a size given as a string is accepted, and a `tier.type` other than `context` is read as a context tier. | PR 178 | new | run | none given | remediation |
| F-PRICE-31 | A partial user price is ignored whole, and the request takes the catalog price with its tiers. | PR 178 | old | run | none given | remediation |
| F-PRICE-32 | The log queue counts a price update as 128 bytes, and an update now carries its tiers. | PR 178 | new | read | none given | remediation |
| F-PRICE-33 | Each store chooses the tier from its own token count, and the two counts can differ for one response. | PR 178 | new | read, not run | none given | remediation |
| F-PRICE-35 | Not priced at all, by the pricing plan. Batch prices, LiteLLM's range tiers, fast mode, regional uplifts, and rows already stored with a cost are not re-priced. | Pricing plan, "Not in this plan" | old | read | none given | limit |
| F-PRICE-37 | A zero offer no longer names its maker, so a model whose only maker link came from zero offers is priced by a later step. On the models.dev catalog of 2026-11-27, 70 bare names lose a maker price: all 70 are free aliases with no priced offer of their own, which is the intent, and none shares its maker's own name. A catalog that lists a paid model's maker link only on a zero offer of the same name would fall to the median. | PR 185 review | new | measured over the live catalog, script not kept in the repo | Count it again when the catalogs are next studied. Narrower rule if it appears: drop the link only when the bare names differ. | limit |

## LOGS

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-LOGS-3 | The Logs page shows an error, not the pending line, while the log database is locked and the stored retention changed since the last prune, because a read prunes and a prune writes. | PR 173 | old | run | Skip the prune on a read when the database is busy. | remediation |
| F-LOGS-4 | The first retention sent after a writer starts goes out twice. No stale state resulted. | PR 173 | unknown | run on both builds | none given | remediation |
| F-LOGS-5 | The page can say "kept for 3 days" and "Settings ask for 3 days. That has not been applied" together. It needs another process to write the same value while this one's write failed. | PR 173 | new | run | Drop the line when the two are equal. | remediation |
| F-LOGS-6 | A stored retention of 0, -3 or 2.5 saved through `saveConfig` becomes 90, where it became 1, 1 and 2. That is B-7's rule, and the Settings field refuses such a value. | PR 173 | new | run and read | none given | limit |
| F-LOGS-7 | In the compatibility layout a trace imported before the host writes its usage event leaves two events for one request id, one under `unknown`. | PR 172 | old | run on both builds | Have the host's write check the request id as the trace's write does. | remediation |
| F-LOGS-8 | A trace's start time has no lower bound, so `"2020"` dates its event in 2020. The task's text asks for it. | PR 172 | new | run | none given | limit |
| F-LOGS-9 | A scan asked for during a replay and followed by a stop leaves its bundle for the next start. The task lists it as out of scope. | PR 172 | new | run | none given | limit |
| F-LOGS-10 | `scanSourcesSoon` chains one `.then` per call while a replay runs, and the cost of the spool walk under load was not measured. | PR 172 | new | run | none given | remediation |
| F-LOGS-11 | Nobody checked that a screen reader announces the refused-key count, which is `role="status"` in a `<span>` inside `<summary>`. | PR 172 | new | not checked | none given | remediation |
| F-LOGS-12 | The host fsyncs one trace bundle 20 times in series and adopts bundles one at a time, which caps intake near 10 to 14 bundles a second and puts a row 1 to 2.5 seconds late on a busy disk. | PR 179 investigation | unknown | run for the timings, inferred for the cap | Review which fsyncs can go, against each crash case. | remediation |
| F-LOGS-13 | In the single layout 12 requests sent back to back gave 7 or 8 usage events, and all 12 when paced 700 ms apart. The cause was not looked for. | PR 174 audit, client label plan finding 11 | unknown | run, by the audit and the builder | none given | remediation |
| F-LOGS-14 | A closing request log never says that its last flush timed out or failed, so records still queued are lost with no log line. | PR 165 review | old | read | none given | remediation |
| F-LOGS-15 | Three limits of the retention work. A failed retention write is not retried until the next save, the pending line does not show with request logs off, and Agent Analysis reads the config's value. | Logs plan Task 3, "Not in this task" | new | read | none given | limit |
| F-LOGS-16 | In the compatibility layout with request logs on and body capture `none` no trace arrives, so the row and the event both keep `unknown`. | Logs plan Task 1, "Not in this task" | old | read | none given | limit |

## LABEL

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-LABEL-3 | A caller that holds LLM Router's own per-start core token and sends straight to the core port in the compatibility layout gets a forwarded id and e-mail on a usage event. | PR 174 | new | run | The trace import takes forwarded fields only in the single layout. | remediation |
| F-LABEL-4 | Two processes that open an older usage or request-log database at the same moment can fail with `duplicate column name`, 2 of 48 opens in a forced race. | PR 174 | new | run | `BEGIN IMMEDIATE` around each schema check. | remediation |
| F-LABEL-5 | An identity header sent twice is stored joined with a comma, so "Gateway user" shows both values. | PR 174 | new | run | Take the first value. | remediation |
| F-LABEL-6 | A key save from a stale list that edits the marked key drops the mark, and so does a key write by an older build on the same database. | PR 174 | new | run | none given | remediation |
| F-LABEL-7 | Agent Analysis in the single layout reads `unknown` in two cases where it named the agent, both headers sent with only `x-client-name` naming it, and an agent name past the 120th character. | PR 174 | worse | run | none given. The label cannot give them back. | limit |
| F-LABEL-8 | A row that nothing else names is named from its client label, so a key named `codex` names its rows, `mycodexwrapper/1.0` reads as Codex, and older stored rows gain an agent. | PR 174 | new | run | none given | remediation |
| F-LABEL-9 | In the compatibility layout a trace update to a row the host wrote does not write the forwarded fields. The host row already has them. | PR 174 | new | read | none given | remediation |
| F-LABEL-10 | A trace bundle on disk holds the identity header values of any key, marked or not, until the import removes it. | Client label plan finding 1 | old | run | none given | limit |
| F-LABEL-11 | The compatibility layout's Logs row stores `x-forwarded-client-cert`, `client-cert` and `x-client-name` whole. | Client label plan finding 2 | old | run | none given | remediation |
| F-LABEL-12 | A caller can still choose its label's text. A refused caller is named from the first token of its `User-Agent`, and `x-llmr-proxy-mode` is the caller's own header. | Client label plan findings 3 and 8 | old | run and read | none given | limit |
| F-LABEL-13 | The mark in the config's own key list counts once, and a key whose id is exactly `profile:` keeps a mark the page hides the switch for. | Client label plan findings 4 and 9 | new | run and read | none given | limit |
| F-LABEL-14 | In the single layout a request that passes with the core token is named from its `User-Agent` alone, and a route script no longer reads a key id from it. No code in the repo sends one. | Client label plan findings 6 and 7 | new | inferred and read | none given | limit |
| F-LABEL-15 | Single-layout rows stored before PR 184 keep their `User-Agent` label, so a client filter lists the old and the new name for a while. | PR 184 review | new | read | None. No consumers yet. | limit |

## RESTORE

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-RESTORE-6 | Every save removes the three live files of an enabled generated-scope ZCode profile, because the ZCode sweep loop takes every ZCode profile's file whatever its scope. One test skips ZCode for it. | PR 171 | old | run on both builds. The loop was read again today | Filter the loop to global profiles, then drop the skip. | remediation |
| F-RESTORE-7 | With two global Pi profiles on one `models.json`, the switched-off one strips the enabled one's provider on every save. | PR 171 | old | run | none given | remediation |
| F-RESTORE-8 | An app open writes the ZCode files with no global writer, so an untouched cache comes back with LLM Router's `revision` and `updatedAt` and one safety copy, where it came back byte for byte. | PR 171 | worse | run | none given | remediation |
| F-RESTORE-9 | A config file the user deleted after a finished restore, or while the profile was off, comes back from a stale `.llmr-original` (Pi, ZCode, OpenCode, Kilo). | PRs 170 and 171 | old | run | none given | remediation |
| F-RESTORE-10 | The Pi and ZCode statuses of a switch-off never carry the "Switch it on to undo this" sentence. | PR 171 | unknown | read | none given | remediation |
| F-RESTORE-11 | A Pi file that the older code replaced whole restores to `{ "providers": {} }` with a message that says the user's settings were kept, while their providers are only in the saved original. | PR 171 | worse | run | none given | remediation |
| F-RESTORE-12 | A Pi or ZCode file that does not parse and still holds LLM Router's provider keeps its key under an unchanged status. | PR 171 | old | read | none given | remediation |
| F-RESTORE-13 | A locked folder of a switched-off Workbuddy, Pi or ZCode profile makes a save throw after the config was saved, because those three sweep loops have no `try`. | PRs 167, 170 and 171 | old | read. Read again today | none given | remediation |
| F-RESTORE-14 | Nobody checked whether a user can set a profile key that does not start with `llmr-profile-`, which ZCode's mark needs. | PR 171 | unknown | read | none given | remediation |
| F-RESTORE-15 | An OpenCode and a Kilo profile on one config file are not supported. A switch-off fails with a not-ok status and the key kept, where 9.0.0 reports ok and leaves more keys. | PR 170 | old | run | none given | limit |
| F-RESTORE-16 | A user's own OpenCode provider that carries LLM Router's header counts as LLM Router's, and when it is the file's only content the switch-off fails and the key stays. | PR 170 | old | run | none given | remediation |
| F-RESTORE-17 | After the user removes that header and saves, a switch-off says "restored to what it was before LLMR" and writes LLM Router's provider and key back from a backup. | PR 170 | old | run | none given | remediation |
| F-RESTORE-18 | An edited restore drops an OpenCode `provider` value that is not an object. | PR 170 | unknown | run | none given | remediation |
| F-RESTORE-19 | The default path flips from `opencode.json` to `opencode.jsonc`, which leaves a key behind or keeps a deleted file from coming back. | PR 170 | old | run | none given | remediation |
| F-RESTORE-20 | A second save over a config that does not parse leaves a backup with the live key, and a generated-scope profile leaves a backup with the key in LLM Router's own folder. A generated-scope Codex original is also copied whole. | PRs 166 and 170 | old | run and read | none given | remediation |
| F-RESTORE-21 | The "not valid JSON" guard still fires after an apply that already rewrote the file, which is status noise. | PR 170 | unknown | run | Change how statuses merge. | remediation |
| F-RESTORE-22 | A Claude Code profile that the one-profile-per-agent rule switches off names itself as the profile still using its `.claude.json`. | PR 170 | old | run | none given | remediation |
| F-RESTORE-23 | A value the user sets in a Claude Code settings file during the takeover is removed at the restore when LLM Router writes that key too, such as a model key or a `NO_PROXY` host. 9.0.0 kept most only because its restore did not run. | PR 169 | new | run | none given | remediation |
| F-RESTORE-24 | A base URL the user changes during the takeover is replaced by their original at the restore, or overwritten by the next apply and recorded nowhere. | PR 169 | old | run | none given | remediation |
| F-RESTORE-25 | The user's own `apiKeyHelper` is lost after a strip and comes back only with the saved copy. | PR 169 | old | run | none given | remediation |
| F-RESTORE-26 | A restored Claude Code file that no record names is stripped again by the sweep. Closing it means judging a file by content with no record, so it was left out on purpose. | PR 169 | old | run | none given | limit |
| F-RESTORE-27 | A custom folder whose `.claude.json` is a link to `~/.claude.json` has the cache written through the link into the account file. | PR 169 | old | run | none given | remediation |
| F-RESTORE-28 | A failed `.claude.json` cache restore keeps the status ok and retries on every pass. | PR 169 | unknown | read | none given | remediation |
| F-RESTORE-29 | A restore of a link to a folder throws, reports a failed restore and leaves both. A test pins it. | PR 169 | new | run | none given | remediation |
| F-RESTORE-30 | The path comparison for a shared file falls back to text for a file that does not exist, so letter case on macOS and a dangling link do not match. | PR 169 | new | run | none given | remediation |
| F-RESTORE-31 | The Restore original settings button cleans up a Claude Code profile's helper files before its restore and keeps the key when the restore fails, so the kept key reaches no agent. It also passes the raw profile list to the restore. | PR 167 | old | run and read | none given | remediation |
| F-RESTORE-32 | A failed restore is logged two to four times in one save. | PR 167 | unknown | run | none given | remediation |
| F-RESTORE-33 | The Profiles page error is never cleared by a save made with the on/off switch. | PR 167 | new | read | none given | remediation |
| F-RESTORE-34 | A second apply rewrites `~/.zcode/v2/bots-model-cache.v2.json` and its backup. | PR 167 | old | run | none given | remediation |
| F-RESTORE-35 | A disabled profile whose id collides with an enabled one under `profileApiKeyId`, such as `a b` and `a-b`, would count as holding a kept key and get no restore. | PR 167 | unknown | read. Whether two ids can collide was not checked | none given | remediation |
| F-RESTORE-36 | Two processes can pick one backup name in the same millisecond, since `backupFilePath` checks and then writes and the desktop app and the CLI share no queue. | PR 166 | new | read | none given | remediation |
| F-RESTORE-37 | Linked Claude Code settings. The file's mode goes from 644 to 600 and is not put back, and a shared-home profile's own settings file keeps the line of a key that is no longer stored. | Follow-ups plan question 4 | old | run | none given. No harm found. | limit |

## CODEX

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-CODEX-2 | A Codex profile whose provider id changes leaves LLM Router's old provider table and `model_provider` line behind. The token in it is revoked at the restore. | Delivery index, 2026-11-26 | unknown | run at the strip, read for the apply | Let the ownership rule take a provider table whatever its id. | remediation |
| F-CODEX-3 | An original that defines the provider as an array of tables, `[[model_providers.<id>]]`, makes an apply write a file that does not parse. | PR 166 | old | run | none given | remediation |
| F-CODEX-4 | A strip applied twice can differ from once on a file with a value left open, 12 of 12,000 cases. No product path strips twice. | PR 166 | new | run and read | none given | remediation |
| F-CODEX-5 | The strip returns before it appends displaced tables when nothing else changed, which needs every marker and LLM Router's table deleted by hand. | PR 166 | new | run | none given | remediation |
| F-CODEX-6 | Opening a profile whose apply was refused reports "Profile launcher was not found" and advises a re-save that does not help. PR 166's refusal of a reserved id is a second way to reach it. | Batch 7 text audit | old | read | none given | remediation |
| F-CODEX-7 | Three stated limits of the stripper. `config.toml.llmr-original` stays after a restore, blank lines written into a CRLF file keep their LF, and a byte-order mark is moved into the file. | Stripper plan, "Not planned here" | old | run | none given | limit |
| F-CODEX-8 | The owner's VM check that LLM Router's window shows the refusal for a reserved Codex provider id, and that a real Codex loads each rewritten config, is not done. | Stripper plan, VM check | new | not run | The end pass. | remediation |
| F-CODEX-9 | A refused first apply still leaves the takeover record and the profile key, which the apply loop writes before any client's apply. The reserved-id refusal does the same. | PR 186 review | old | read, not run | Check that a restore over a file LLM Router never wrote changes nothing, then decide whether a refusal should skip both. | remediation |
| F-CODEX-10 | A user who defines a provider under LLM Router's own id with a proper header has it taken out while the profile is on and put back at the switch-off, and nothing tells them. | PR 186 review | old | read in the strip and displacement code, not run | Say so where the profile's provider id is shown, or refuse as the headerless case does. | remediation |

## GATEWAY

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-GATEWAY-3 | A failed apply of the agent configs reaches no log a person reads and is not tried again, so the window can be green while an agent's config was never rewritten. Since PR 156 this also holds for the apply after a takeover. | PR 156 review | old | read | Give it a place in the status the window shows. | remediation |
| F-GATEWAY-4 | A Stop in the process that owns the gateway makes a process that had adopted it start its own gateway and apply the agent configs again. The docs say Stop hands the gateway over. | VM findings Task 7, delivery index four questions | worse | inferred | Leave it and say it in the docs. | limit |
| F-GATEWAY-5 | A second process that calls `start` still stops the first one's gateway once, and requests in flight are dropped. | VM findings plan, "Not in this plan" | old | read | none given | limit |
| F-GATEWAY-6 | One process in the single layout beside one in the compatibility layout. The restart removes the other's marker, fails on the port and tries again every 30 seconds. | VM findings plan, "Not in this plan" | new | read | none given | limit |
| F-GATEWAY-7 | After the serving process quits, requests fail for about 12 seconds, and the adopter's new gateway starts from the config of its last adoption, so a key stored since is refused until a save or restart. | VM findings Task 6 | new | read | none given | limit |
| F-GATEWAY-8 | The watch sends no key, so an adopted gateway that answers and no longer accepts this process's key is not seen. | VM findings Task 6 | new | read | none given | limit |
| F-GATEWAY-9 | A deep link or a profile open that starts the gateway between a takeover and the restart applies no profiles, so the configs stay restored until the next save or restart. | VM findings Task 7 | new | read | none given | limit |
| F-GATEWAY-10 | The takeover warning can be logged twice, the gateway marker is removed with no check of whose it is, and the status field `coreManagedExternally` is never set. | VM findings plan | unknown | read and inferred | Delete the dead field in its own small change. | remediation |
| F-GATEWAY-11 | A start a person asked for that loses the port is left with its error and does not try again. | Keys plan Task 6, VM findings Task 8 | old | read | none given | limit |
| F-GATEWAY-12 | A Grok, Kimi or Pi launch can wait twice, about 20 seconds in the worst case, and the CLI cannot tell a restart from a gateway that is gone. | Keys plan Task 6 | new | read | none given | limit |
| F-GATEWAY-13 | A profile key over its request limit is refused at launch with advice to restart the gateway, which cannot help. | Keys plan research, question 3 | new | read. The 429 on `/v1/models` is inferred | none given | remediation |
| F-GATEWAY-14 | Limits of the key merge. The API Keys page shows the list from its last load, a key written between a config load and the service taking it waits for the next change, and a skipped delete or edit gets no message. | Keys plan, "Not in this plan" | new | read | none given | limit |
| F-GATEWAY-15 | A gateway token in a config saved before phase 0 Task 3 stays until the provider is imported again, and a sign-out can race the gateway child's refresh. | Phase 0 plan, "Not in this plan" | new | read | none given | limit |
| F-GATEWAY-16 | The Routing page still offers the Claude login provider as a rule target and a fallback, and a rule that sends another caller there gets the "no login" refusal. | Follow-ups plan, "Not in this plan" | old | read | none given | limit |
| F-GATEWAY-17 | An add draft from an import whose address is edited before the first save sends its saved login to the edited address on Refresh and Check. | Follow-ups plan, "Not verified" | old | read, with one stubbed run | none given | remediation |
| F-GATEWAY-18 | The macOS activation option PR 156 uses to bring an agent app forward is deprecated since macOS 14, and nobody ran it against a background app. | Delivery index, "The end" | new | not run | The end pass. | remediation |
| F-GATEWAY-19 | Phase 0 Task 4 Step 6, items 3 to 5 (a browser sign-in, an import, Sign out and Check Connection in the window), and whether the fork has a request path that skips the provider hook, were left for the end pass. | Batch 17 review | new | not run | The end pass. | remediation |

## UI

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-UI-2 | The message from Refresh on a changed address is the banner at the bottom of the provider form, which can be off-screen in a long edit dialog. | PR 157 review | new | read | none given | remediation |
| F-UI-3 | At 720 px and below a save error that persists, with its Retry button, sits at the bottom centre and could cover onboarding's footer buttons. | PR 173 | new | read, not measured | One look in the end pass. | remediation |
| F-UI-4 | At 700 px the top navigation strip runs past the window, "Fusion" through "Extensions". | PR 173 | old | measured in the built app | none given | remediation |
| F-UI-5 | "Price source" wraps to three lines at 1440 px, the notice reads "LiteLLM, models.dev, and OpenRouter" with a comma the plan leaves open, and the Overview grid slides over the notice for about a second after a load. | PR 177 | new | the reviewer's screenshot and run | none given | remediation |
| F-UI-6 | A failed or refused profile apply at startup, at a provider model refresh or at a gateway takeover reaches only the log, never the window. | PR 186 review | old | read | Route those statuses to the same notice a save uses. | remediation |

## WIN

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-WIN-1 | Key and session files are protected by mode `0600` only, and Windows has no mode bits, so they rely on the folder's inherited access list. | PR 159 review | old | read | none given | remediation |
| F-WIN-2 | `UsageStore` has no `close` and the web management runtime leaves `config.sqlite` open, so Windows cannot remove those folders while the process lives. | PR 159 review | old | read | none given | remediation |

## TEST

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-TEST-6 | `npm run test:e2e` brings the real Electron window to the front on the developer's Mac. Deferred by the owner. | Delivery index, 2026-11-26 | old | read, not run | Find which call takes focus, then a test-only variable for `showInactive()`. | test |
| F-TEST-7 | `stored-api-keys-watch.test.mjs` depends on the order of its tests. Nine of twelve random orders failed. | PR 156 review | new | run | none given | test |
| F-TEST-8 | Three older request log tests fail when timers run late, and have not failed in CI. | PR 165 review | old | run under a delaying preload | none given | test |
| F-TEST-9 | `build/run-tests.mjs` on an install without the Electron binary fails with a misleading `fetch failed`, because it imports `electron` at the top. | PR 158 review | new | run. The import was read again today | none given | test |
| F-TEST-10 | The network guard has three stated ways around it (the macOS system proxy, a custom `lookup`, DNS or UDP), and it does not count a refusal in a child that loses `LLMR_TEST_NETWORK_LOG`. | PRs 158 and 176 | new | run | none given | test |
| F-TEST-11 | Two discovery tests read the real file system under a stubbed Windows platform, and fail on a developer's Windows machine with OpenCode or Claude installed. | PR 162 review | new | read | none given | test |
| F-TEST-12 | No test covers what the CLI does after a launch's wait ends with the gateway gone, which is to start a service for a Grok, Kimi or Pi profile. | Delivery index | new | read | none given | test |
| F-TEST-14 | Three mutants of PR 172 survive with the behaviour right (the scan flag never cleared, any `protocolVersion` accepted, a scan after `stop()`). | PR 172 | new | run | One assertion each. | test |
| F-TEST-15 | The compact classes of the logs-off wrapper are pinned by a measurement and no test, and the desktop save handler's change has no test. | PR 173 | new | run and read | none given | test |
| F-TEST-16 | The "Gateway user" line has no component test and nobody saw it rendered. | PR 174 | new | not run | none given | test |
| F-TEST-17 | One mutant of the client label rule changes no test, the trace fallback built as a marked key. | Client label plan finding 10 | new | run | none given | test |
| F-TEST-18 | The first Docker harness run of PR 174 exited 1 after a Ctrl-C although it cleaned up in full. | PR 174 | new | seen, not looked into | none given | test |
| F-TEST-19 | No store-level test reads a reasoning-only chunk into a Logs row. One unit test of the extractor pins the rule. | PR 175 | old | read | none given | test |
| F-TEST-20 | A `GatewayService` built in a test rebinds the one usage store's pricing each time, in 10 test files. | PR 176 | new | read | none given | test |
| F-TEST-21 | The "next sequence" the plan gives a price update is not what makes it land. With every update at sequence 0 every test passed. | PR 176 | new | run | none given | test |
| F-TEST-22 | The trajectory node, the chart tooltip and the tray header "Cost" have no test. Four mutants survive. | PR 177 | new | run | none given | test |
| F-TEST-23 | The new Playwright case creates its catalog folder before the `try`, and the e2e CLI server tries `raw.githubusercontent.com` and `t0.gstatic.com`. | PR 177 | new | read and run | The harness plan. | test |
| F-TEST-24 | Pricing Task 4's test prints a `console.warn` line into the run, and `ModelPricingSource` and `PriceSourceStatus["source"]` are two copies of one union. | PR 177 | new | read | none given | test |
| F-TEST-25 | A LiteLLM tier pattern with no end anchor survives the suite. | PR 178 | new | run | none given | test |
| F-TEST-26 | `usage/store.ts` imports `promptTokenCount` as `tierPromptTokens` beside a local function of the first name. | PR 178 | new | read. Read again today | Rename the local one when the file is next touched. | test |
| F-TEST-27 | Three tests of `release-publish-step.test` failed for both reviewers under a reduced `PATH`. | PR 178 | unknown | run | none given | test |
| F-TEST-28 | A mutant that treats every given id as owned in the ZCode cache survives, since no test has a user's own key under LLM Router's id beside a cache entry. | PR 171 | new | run | none given | test |
| F-TEST-29 | Two mutants of the restore work survive. One drops the `settingsFile` default in a release, and one calls `removedTableStatements` without its skip of markers. | PRs 166 and 169 | new | run | none given | test |
| F-TEST-30 | Three one-off failures nobody named or explained. The Profiles page switch in `onboarding-chosen-agent.spec.ts` (batch 8), one architecture test in a builder's worktree (batch 7), and the OpenCode free-tier user-agent test (PR 170). | Batch 7, 8 and 10a reviews | unknown | run | none given | test |
| F-TEST-31 | No kept test runs two processes on one home. The research ran one by editing `build/test-home.mjs`. | VM findings plan, "Not in this plan" | new | read | A supported way to share one home between two test processes. | test |
| F-TEST-32 | The test of F-TEST-1 proves two route scripts run at the same time. It proves they land on separate workers only because a worker runs one request at a time, and no test is known to pin that rule by itself: with both places that serialize a worker removed, the test passes on one worker. | PR 182 review | old | run by the reviewer, not repeated | A test that runs two scripts on one worker and asserts they do not overlap, after checking that none exists. | test |
| F-TEST-33 | `raw-trace-sync.test.mjs` has a retry loop near line 916 with its own 2 second deadline, which PR 182's change to `waitFor` does not reach. It was not one of the tests that timed out. | PR 182 review | old | read | Leave it unless it fails on a slow runner. | test |
| F-TEST-34 | `Logs rows sent before the gateway stops are listed after it` (`october-issues-wire.test.mjs`) failed on Windows on a docs-only commit of `main`, `cfcd4cae`: "Timed out waiting for gateway/logs" after 12.5 seconds, 1 failure in 2,550. The same job passed on PR 182's head and on its merge commit. Cause not known. It restarts the count of green Windows runs that remediation Task 8 waits for. | `main`, run `46083424211` | unknown | run, read from the job log | Find the cause before Windows becomes a required check. | test |
| F-TEST-35 | `a streamed response arrives event by event (single)` in `claude-login-pass-through-wire.test.mjs` failed once on the Intel Mac on PR 186's first head, "the first event is read before the second is sent", 1 failure in 2,554. The branch does not touch it and the job passed on the next head. The failed job's log could not be downloaded afterwards. | PR 186, run `46088543904` attempt 1 | unknown | the session's read of the job, not the lead's | Find the cause before the Intel Mac job becomes a required check. | test |
| F-TEST-36 | In `raw-trace-sync.test.mjs` the caller for a key id that names no stored key is pinned only by an older test that happens to send a display-name header, and no key in that file has a name, so the name-over-id rule rests on the 52 second wire test. | PR 184 review | new | run by the reviewer | Add the header to the no-stored-key assertion, and give one unit key a name. | test |
| F-TEST-37 | No test makes the Codex config file unreadable, so moving the headerless check above the `try` would pass. And the doubled-config test does not assert that the user's own line survives the switch-off. | PR 186 review | new | read | One test with an unreadable file, one assertion on the user's line. | test |

## DOCS

| ID | Finding | Source | Since 9.0.0? | Evidence | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| F-DOCS-2 | A bare model id in a Claude Code profile's `availableModels` replaces the profile's model, because LLM Router writes the model with its provider's name in front. No hint or docs line says so. | Follow-ups plan question 8 | old | run with Claude Code 2.1.330, inferred for other modes | A hint in the form or a docs line. | remediation |
| F-DOCS-3 | The gateway guide said the forwarded e-mail is kept 7 days and only with request logs on, while usage events keep it 90 days either way. Batch 16 rewrote those sentences and nobody recorded whether the fault went with them. | Phase 0 plan, "Not in this plan" | unknown | read | Fix it when the lines are next written. | remediation |

## Closed since found

Each was listed as open somewhere and is not a row above.

- **The four Windows product faults of PR 159's first run and the unsorted raw trace test.** PRs 161 and 162, by the delivery index's own text and the merged commits.
- **The Intel Mac entry's four test faults.** PR 163, by the delivery index's text.
- **The request log `flush()` budget fault and the `config.sqlite` cleanup failure on Windows.** PR 165, by the delivery index's text.
- **F-TEST-1 and F-TEST-13.** PR 182 (`05ce1d74`): the route-script test now fails on one worker (run), and the raw trace tests wait ten seconds. The Windows stall itself was not reproduced, so F-TEST-13 is closed on one green Windows run.
- **F-PRICE-3 and F-PRICE-36, F-CODEX-1, F-UI-1, F-LABEL-1.** Remediation Tasks 1 to 4, merged 2026-11-27 as PRs 185 (`47f258ef`), 186 (`7eeace42`), 183 (`4b6bccb6`) and 184 (`0c9f6068`), on the owner's yes to each. Nobody has seen any of the four in a window: that is the VM pass.
- **Row S-15, two backups in one millisecond sharing a name.** PR 166, stripper Task 6. The cross-process half is still open as F-RESTORE-36.
- **`a single-layout Logs row appears within 1500 ms of the answer` failing on slow disks.** PR 179. What it found about the fsync chain is F-LOGS-12.
- **The OpenCode and Kilo sweep loops with no `try`** (PR 167's finding). PR 170. Read today in `restoreInactiveGlobalProfileConfigs`, where both loops now catch. The Workbuddy, Pi and ZCode loops do not, which is F-RESTORE-13.
- **Backup copies of an OpenCode, Kilo, ZCode, Workbuddy or Pi file that hold a pruned token** (PR 167's finding). PRs 169 to 171, by PR 171's harness line that the key was left in 0 of 1,600 scenarios. Not read in the code. What is left is F-RESTORE-20.
- **A test that reaches a public catalog host under the network guard** (PR 173's management server test, PR 174's single-file run of `request-log-store.test.js`). PR 176. Nothing under `packages/core/src/observability` calls `preloadUsagePriceCatalog` any more (read today), and a refused host now fails the run, which is green. That the management server test is among the stubbed files is inferred.
- **The takeovers restored when a profile-managed service stops beside another process** (keys plan Task 6, "Not in this task"). PR 156, VM findings Task 7, by the plan's text.
- **An adopted gateway that nobody watches** (VM findings plan, "Not in this plan"). PR 155, VM findings Task 6, by the plan's text.
- **A hand-typed placeholder key shown as a local login** (follow-ups plan, F-9 in the Add flow). PR 157, VM findings Task 4, by the plan's text.
- **Delivery index questions 5, 7, 8 and 12.** Answered and built in PRs 166, 167, 159 and 162.
- **Three cases where a branch did worse than `main`.** Each was fixed in its own PR's fix round: the Logs row with no cost in the single layout (PR 176), the compact Overview cost card (PR 177), and Agent Analysis reading `unknown` for a request named by `x-client-name` (PR 174, with F-LABEL-7 left).

## Not checked

- **Nothing was run.** No test, no app, no harness. Every Evidence cell repeats the source's label.
- **`old` and `new`.** Checked at the tag by reading, twelve things: `restoreInactiveGlobalProfileConfigs`, `backupFilePath`, the adoption flag, `isClaudeCodeAccountFile`, the prune on a Logs read, the discarded flush in `RequestLogRuntime.close`, a `UsageStore` with no `close`, the raw trace usage capture, the warn-only apply in `launch-service.ts`, and that `test-network-guard.mjs`, `json-config-strip.ts` and `stored-api-keys-watch.test.mjs` do not exist at `v9.0.0`. For the other restore and Codex rows `old` rests on the source's "on `main` too", and `main` at that time already held PRs 149 to 166. No 9.0.0 build was run.
- **`closed`.** Only the loop, the catalog call and the two code reads named above were checked in the code. The rest rest on later text in the plans.
- **Whether a row is still true at `b504d153`.** A later batch may have changed a finding of an earlier one without saying so. Likely candidates: F-RESTORE-34 after PR 171, F-RESTORE-31 after PRs 169 to 171, F-CODEX-6 and F-DOCS-3.
- **F-LOGS-13**, the usage events lost on back-to-back requests, has no cause and no known age. If it is new it belongs under "Before release".
- **The plans' "Not verified" lists are not rows.** They name checks nobody ran, not findings. They are in the harness, keys, pass-through, follow-ups, VM findings and phase 0 plans, and most are lines of the end pass.
- **Feature deferrals of the pass-through plan** (PT-8, the plan-usage display, a Routing page warning) shipped in 9.0.0 and are not rows.
- **`private/`.** Only `private/audits/2026-11-27-audit-pricing-batch14/audit-report.md` was read. Its seven design findings are F-PRICE-2, 3, 4, 21, 22, 23 and 34. No other private audit or review report was opened, so a finding that is only there is not here.
- **The counts table** was produced by a script over this file's tables and not by hand.
