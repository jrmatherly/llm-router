# Delivery order for the remaining work

> **For agentic workers:** This file orders the work. It holds no tasks. Open the plan a batch names and run its tasks with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Where a plan's own line on branches, PRs, order or a VM check disagrees with this file, this file is right.

**Goal:** Build every planned task that is not built yet in as few branches, reviews and merges as the code allows, with no stop for a VM pass along the way.

**Written 2026-11-25** from the file lists and the cross-plan notes of nine plans, read at `main` `c87fc875`. It was not audited. Dates in this file are UTC.

**Regrouped the same day after the fix round of the six draft plans.** One researcher per plan, on another model, checked every Blocker and Correction of its 2026-11-22 audit against `main` `c491eb48`, corrected the plan's text, and judged its batches. Of 12 Blockers, 11 hold and one was overtaken by PR 146. Two new Blockers were found. The session checked seven of their claims against the code before folding them in, and all seven held. The table below is the result. Each plan's status line says what its round ran and what it did not.

## The owner's decisions

Read these before any batch. A plan line or a handoff line that contradicts one is wrong.

1. **The VM pass comes once, at the end** (2026-11-25). No batch waits for a VM check, and no build stops for one. Every VM check a task names moves to the list under "The end".
2. **What the VM pass finds is fixed afterwards**, in a remediation plan with a release of its own (2026-11-25).
3. **Fewer branches and PRs** (2026-11-25, and for the audit program on 2026-11-17). Tasks that touch the same files or build on each other land as one branch and one squash-merged PR, with one commit per task.
4. **Merging needs his word, once per PR.** Unchanged.
5. **A push or tag on `jrmatherly/llmr-gateway` needs his word each time.** Unchanged.
6. **The Grok, Kimi and Pi start after the launch wait is accepted** (2026-11-24). Keys plan Task 6 builds it. Evidence found since changed its order, not the decision.
7. **The client label batch and the gateway program's identity task are one PR** (2026-11-25). Batch 16 builds client label 3, 1, 2, then gateway phase 0 Task 5. He accepted what the two sessions had agreed.
8. **Gateway phase 1 is built after the release** (2026-11-25). The new Apps gateway page is not one of the batches, and the release and the VM pass at the end do not wait for it.

## What this file overrides

- Every "one PR each" and every branch name in the plans below. The batch's branch is the one in the table.
- "No two PRs of this plan run at the same time." Batches on different rows of the order below can be open together when their files do not meet.
- VM findings Task 3, Step 1, "The owner's VM check, before any code". The task is built on the run its Evidence names, and Step 1 is a line of the end pass.
- Keys plan Task 6, "the PR waits for it". It does not wait.
- Each task's "VM check, for the owner" paragraph. It is not a gate. It is a line of the end pass.

## The batches

Nineteen PRs. The plans hold 49 tasks that are not built: 44 in the nine plans this file began with, written as about 39 PRs, and the five of the Claude apps gateway phase 0 plan, added on 2026-11-25. Forty-six are in the table and three are not PRs. Batch numbers are kept from the first grouping, so a batch that was split has a letter.

| # | Branch | Tasks, one commit each | Shared ground | Needs |
|---|---|---|---|---|
| 1 | `fix/launch-and-gateway-ownership`. **Merged, PR 156, `92c8cf3f`** | VM findings 7, VM findings 8, keys 6, VM findings 3, then the terminal-only waiting line | `gateway-service.ts`, `launch-service.ts`, `profiles/service.ts` | Nothing. Keys 6 comes after VM findings 7 and 8 inside the branch |
| 2 | `fix/provider-form-local-login`. **Merged, PR 157, `3aef9d00`** | Follow-ups 8, VM findings 4, follow-ups 9, follow-ups 10, in that order | `App.tsx`, `providers.tsx`, `shared/providers.ts` | Nothing. This is follow-ups PR 3 as already planned |
| 3 | `test/harness-and-codex-parse`. **Merged, PR 158, `033c1281`** | Harness 1, 2, 3, stripper 1 | `build/test-home.mjs`, `build/test-home-env.mjs`, `build/run-tests.mjs`, the Codex parse helper | Nothing. Tests and harness only |
| 4 | `ci/package-suites-matrix`. **Merged, PR 159, `1b09fc2d`, with the Windows entry allowed to fail** | Harness 4 | `.github/workflows/test.yml`, and whatever tests its first run shows need a fix | Batch 3. Kept apart because a red matrix job blocks a release. Not open beside batches 6 to 10b: its test fixes can land in `profile-service.test.mjs`, which they change |
| 5 | `fix/gateway-log-control` | Harness 5 | The gateway fork, then two `package.json` pins | His word for the fork push and tag. The fork is at `v1.0.22-llmr.4`, so this releases `llmr.5` |
| 6 | `fix/codex-config-scanner` | Stripper 2, 3 | `codex-config-strip.ts`, `profiles/service.ts` | Batch 3 |
| 7 | `fix/codex-ownership-and-backups` | Stripper 4, 5, 6 | `codex-config-strip.ts`, `backup-files.ts`, `profiles/service.ts` | Batch 6. About 110 source lines and 230 of test |
| 8 | `fix/save-restore-statuses` | Restore 1, 2 | `profiles/service.ts`, the save path through `ipc.ts`, `management-server.ts`, `cli.ts`, `App.tsx` | Batch 7 |
| 9 | `fix/restore-corrections` | Restore 3, 4, 5 | `profiles/service.ts`, `backup-files.ts` | Batch 8. Restore 5 moved here from batch 7: it uses `isCodexFamily` from restore 4. Restore 3 carries an inferred design and is audited as text first |
| 10a | `fix/opencode-kilo-stripper` | Restore 6 | A new `json-config-strip.ts`, `profile-config.ts`, `profiles/service.ts` | Batch 9. Split from 10b: together they are about 540 source lines and 530 of test |
| 10b | `fix/pi-zcode-strippers` | Restore 7, 8 | `json-config-strip.ts`, two `profile-config.ts` files, `profiles/service.ts` | Batch 10a |
| 11 | `fix/trace-import-and-refusals` | Logs 1, 2 | `router-plugin.ts`, `raw-trace-sync.ts`, `usage/store.ts` | Nothing. About 130 source lines and 340 of test |
| 12 | `fix/logs-page` | Logs 3, 4 | `network-logs.tsx`, `request-log-store.ts`, `App.tsx` | Batch 11 |
| 13a | `refactor/pricing-one-shape` | Pricing 1, 2 | `pricing-service.ts`, `usage/store.ts`, `request-log-store.ts`, `response-usage.ts` | Batch 12. Two subtractions with no change in behaviour |
| 13b | `fix/pricing-main-process-catalog` | Pricing 3, harness 6 | `pricing-service.ts`, `usage/store.ts`, `request-log-store.ts`, `request-log-runtime.ts`, the three `build/` harness files | Batches 3 and 13a. Pricing 3 gained a column, a table and a command between threads in its fix round, so it is audited as text first. Harness 6 waits on it and is the last commit |
| 14 | `fix/cost-basis` | Pricing 4, 5 | `pricing-service.ts`, `usage/store.ts`, `contracts/app.ts`, ten cost surfaces, `network-logs.tsx` | Batches 12 and 13b. About 360 source lines. If the reviewers cannot hold it, split at pricing 5 Step 4: the core half first, then the surfaces. Pricing 5 is audited as text first |
| 15 | `fix/long-prompt-tiers` | Pricing 7 | `pricing-service.ts`, `usage/store.ts`, `request-log-store.ts` | Batch 14. Pricing 6 left this batch and waits on the owner |
| 16 | `fix/client-label-and-forwarded-identity` | Client label 3, 1, 2, then gateway phase 0 Task 5, in that order | `io.ts`, `pipeline.ts`, `router-plugin.ts`, `raw-trace-sync.ts`, `usage/store.ts`, `request-log-store.ts`, `network-logs.tsx`, the API Keys page, two header files, the gateway guide | Batches 11, 12 and 17. Not open beside batches 13a to 15, which add columns to the same two tables. Phase 0 Task 5 was a PR of its own and joined this batch on 2026-11-25, agreed with the session that owns that plan: it replaces the label row and the guide sentences client label 2 writes, so one PR ships no state with the e-mail in `client`. Its Steps 1 and 10 are harness runs that need Docker and the `claude` binary, which is why batch 17 comes first |
| 17 | `fix/apps-gateway-phase-0`. **Merged, PR 160, `922626dc`** | Gateway phase 0 Tasks 1, 2, 3, 4 | A new `tests/architecture/web-rpc-contract.test.mjs`, the gateway session store and local provider, `contracts/app.ts`, `ipc-channels.ts`, `ipc.ts`, `preload.ts`, `electron.d.ts`, `web-client-bridge.ts`, `management-server.ts`, `providers.tsx`, `providers/probe.ts`, the gateway dev script and its Docker folder, the gateway guide | Batch 2, which edits `providers.tsx`. It meets batch 8 in `ipc.ts` and `management-server.ts` with added lines only, so whichever is second rebases. Its Task 4 makes the harness use a directory of its own, and its Step 6 is a harness run, not a VM check |

**The Windows faults**, [`2026-11-25-windows-faults.md`](completed/2026-11-25-windows-faults.md), added 2026-11-25 after batch 4's first run. Twelve tasks in two PRs, written, audited once on another model by building the tasks, and corrected. The first PR, Tasks 1 to 5, merged as PR 161 on 2026-11-25, and the second, Tasks 6 to 12, as PR 162 the same day. The plan is built. Some detail for Tasks 1 to 4 is outside the repo, in `private/plans/2026-11-25-windows-faults-private-detail.md`. Its place in the order depends on question 12.

| Branch | Tasks, one commit each | Shared ground | Needs |
|---|---|---|---|
| `fix/windows-launch-and-env`. **Merged, PR 161, `a3c6864d`** | Windows 1, 2, 3, 4, 5 | A new `platform/command-path.ts`, the Codex runtime script, `launch-service.ts`, `mcp/child-env.ts`, `routing/route-script-worker.ts`, 12 call sites that merge an environment | Nothing: batch 4 is merged, so the branch is cut from `main` and each commit gets a Windows run. It meets batch 8 in `launch-service.ts` |
| `fix/windows-platform-faults`. **Merged, PR 162, `f5c1d9eb`** | Windows 6, 7, 8, 9, 10, 11, 12 | `local-providers/opencode-freetier.ts`, the two stdio MCP start sites, `platform/windows-app-discovery.ts`, the profile app monitor, `raw-trace-sync.ts`, `.github/workflows/test.yml` | The branch above. It meets batches 11, 13a and 16 in `raw-trace-sync.ts`. Its Tasks 9 and 10 carry two designs written after the audit and not built, so its review round reads those first |

Not a PR:

- **Restore 9**, the Codex token command prototype. It changes no product code. Its result goes to the owner.
- **Pricing 8**, the service tier price. It waits on the owner's answer in the pricing plan.
- **Pricing 6**, the cost OpenRouter reports. The gateway fork's usage type has no cost field, so the figure does not reach LLM Router (read in gateway `1.0.22-llmr.4`). It waits on the owner's answer on a fork change.

## After the release

**Gateway phase 1**, [`2026-11-25-apps-gateway-phase-1.md`](2026-11-25-apps-gateway-phase-1.md), on `main` as `26616b96`, audited once by the session that owns it. That session asked on 2026-11-25 for it to be a batch here. It is a new page and not a fix, and the owner said the same day that it is built after the release (decision 8). It is not one of the batches above. He has not said where it sits beside the remediation plan that follows the VM pass.

When it is built, this is the branch. By then the batches it meets are merged, so the constraints in the last column are a record of which files to re-read, not an order:

| Branch | Tasks | Shared ground | Needs |
|---|---|---|---|
| `feat/apps-gateway-page` | Gateway phase 1 Tasks 1 to 6, one commit each. Its plan names a split after Task 3 if the reviewers cannot hold six: Tasks 1 to 3 are core with tests, Tasks 4 to 6 are the page | `contracts/app.ts`, `ipc-channels.ts`, `config/config.ts`, `config-repository.ts`, the gateway agent folder, `ipc.ts`, `preload.ts`, `management-server.ts`, `App.tsx`, `layout.tsx`, a new `apps-gateway.tsx`, seven files under the UI's `shared/` | Batch 17. Not open beside batch 8, which rewrites the save handler in `ipc.ts` and `management-server.ts`, or batch 16, which edits the gateway guide. It also meets batches 2, 12 and 14 in `App.tsx` and `contracts/app.ts`. Its Task 6 Step 2 is a harness run with Docker and the `claude` binary. Only files were compared, not lines |

## Order

1. Batches 1, 2, 3, 4 and 17 and both Windows PRs are merged (PRs 156 to 162). Next by this order: batch 6, then the rest of row 3, with batches 11 and 12 able to run beside them. The line below is the record of how batch 4 landed.
   Batches 1, 2 and 3 are merged. Batch 4 merged as PR 159 on 2026-11-25 with the Windows entry allowed to fail, so batch 6 can start. Batch 17 merged as PR 160 on 2026-11-25.
2. Batch 3, then 4, with 4 merged before batch 6 opens. Batch 5 at any point once the owner gives his word on the fork.
3. Batches 6, 7, 8, 9, 10a, 10b, one after another. All six change `profiles/service.ts`.
4. Batches 11 and 12, then batch 16, then 13a, 13b, 14, 15, one after another. All of them meet in the request log store or the usage store. Batch 16 comes straight after batch 12 so that the later phases of the gateway program are not held behind four pricing batches. It can also go after batch 15. It is never open beside 13a to 15.
5. Batch 17 any time after batch 2, and before batch 16. One batch from this row and one from row 3 can be open together, except where they meet: batch 8 shares `App.tsx`, `contracts/app.ts`, `ipc.ts` and `management-server.ts` with batches 12 and 16, so batch 8 is not open beside either.
6. The end.

## Before a batch is built

- **The second Windows PR's review, 2026-11-25.** An audit of the text of Tasks 6 to 12 before the build found two tasks that would have been built wrong: Task 8 carried on with a child process that was never created, and Task 10's test could not reach its code without starting the gateway. The review then found that the shortcut script returned nothing for two or more shortcuts on Windows PowerShell 5.1, that one unreadable folder hid every shortcut beside it, and three failures that were silent. All fixed in the PR. The rows the first PR left out of the shared argument table are in, and the routing guide's `api.env` example reads a name a route script can see, with a test that checks every example against the filter. Departures from the plan: a cap of five failed probes in a row before an adopted app's entry is removed, and the search path walked before the Store package step. Not covered by any run: a user's own Windows machine with a real desktop app to adopt.
- **The first Windows PR's review, 2026-11-25.** Every Windows-only test ran for the first time in the PR's own Tests run and passed (run `45694237786`). The Windows entry now fails two tests, the OpenCode version read and app discovery, and at times the raw trace test, all three for the second PR. The review found that the runtime script doubled only the last backslash of a run where the module doubles all, which no row of the shared table showed, and four mutants no test caught. All fixed in the PR. The shared argument table is narrower than the plan asked: the rows its private half lists beside the percent rows were not added. The routing guide's `api.env` example is still an open question of that plan.
- **Batch 17's review, 2026-11-25.** Three reviewers with mutation testing, then a review of the fix commit, which found two more. Fixed in the PR: the provider probe sent an expired gateway token and showed a raw 401 when a refresh failed or no refresh token was left; the harness skipped its cleanup on a signal during `compose up`, on a failed write and on a closed terminal, and exited 0 when teardown failed; a failed sign-out read as a failed import; the RPC contract test missed five other spellings of a bridge call. Added: a test that every channel the preload script invokes has a main-process handler. Left for the end pass: phase 0 Task 4 Step 6, items 3 to 5 (a browser sign-in, an import, Sign out and Check Connection in the window), and whether the gateway fork has a request path that skips the provider hook and would now send the marker.
- **Batch 4's review, 2026-11-25.** Three reviewers and a review of the fix commit found five things, all fixed in the PR: the architecture test passed with the job switched off by an `if:` or Windows removed by an `exclude:` (run as mutations); a second spelling of the allowance on the Intel Mac entry passed it too (run); the two closed-stdin tests were skipped on Windows where they could expect the product's timeout, and now pass there; the cleanup helper swallowed any locked file on Windows, and now each caller names the databases it knows stay open; `test:packages` was not pinned. Not built: an Apple silicon runner in the matrix, which the requirement does not name.
- **Batches 1 and 2 merged on 2026-11-25.** Batch 1's review found two defects that neither the research nor the audits had. Batch 2's review found three, one of them a regression the batch itself made in onboarding: keep the review round on every batch, and review the fix commit too.
- **Every other batch comes from a draft plan** whose audit found Blockers that nobody has checked. Its fix round happens right before the batch is built, for that batch's tasks only: read each Blocker and Correction against the code as it is then, correct the task text, and have the changed text audited once on another model. The audits are outside the repo, in `private/audits/2026-11-22-audit-<plan>.md`.
- **A task under about 100 lines of change** is built once, on the batch's branch, and gets one review round that covers the task text and the code together.
- **A design that spans commits** keeps its text audit before any build. That is the Codex scanner of batch 6, restore 3 in batch 9, pricing 3 in batch 13b, the cost basis of batch 14 and the client label rule of batch 16.
- **The gateway phase 0 plan** ([`2026-11-25-apps-gateway-phase-0.md`](2026-11-25-apps-gateway-phase-0.md)) belongs to another session, which audits and commits it. This file orders its tasks and changes none of its text. It is on `main` as `0be5ad63`, audited once on another model. Its Task 5 deletes the marked-key row of the label rule, the guide sentence and the check of the client value that client label Task 2 writes one commit earlier, so whoever builds batch 16 expects that check to be rewritten by the fourth commit. Not checked by either session: line overlap of batch 17 with batches 2 and 8 in `providers.tsx` and `ipc.ts`.
- **Batch 3's four tasks were audited on 2026-11-25** at `main` `fddb278a`, on another model, by building them in throwaway worktrees: 3 Blockers and 4 Corrections in harness Tasks 1 and 2, no Blocker and 5 Corrections in harness Task 3 and stripper Task 1. All are applied to the two plans.
- **Every other draft plan's text changed in its fix round and has not been audited since.** The audit of a batch's tasks on another model, before the build or with it as the two lines above say, is still owed.
- **A task whose review finds a fault in its design** leaves the batch and gets its own PR, so the rest can merge.
- **A batch whose diff the reviewers cannot hold** is split at a commit. Batch 14 has its split point named in the table.

## The end

After the last batch, or earlier if the owner calls it:

1. One release, with his version.
2. One VM pass on that release, on his UTM VM. It covers, in one sitting:
   - Gate B of the pass-through follow-ups plan, B1 to B11 and G1 to G10.
   - PRs 151 to 155, which merged with no run on the real apps.
   - VM findings Task 1's check, Task 3's Step 1 and the check after it, Task 6's two runs and Task 7's look at the agent settings.
   - Keys plan Task 6's check.
   - Whether an agent app comes forward when it is behind another window, since the activation option of PR 156 is deprecated since macOS 14 and nobody ran it against a background app.
   - After a takeover, that the agents' config files follow the stored profile list (PR 156).
   - The checks of the v8 plan that were never run: Task 11's Pass 1 to Pass 3, its signed-dmg and upgrade checks, and Task 10 Steps 3 and 4 ([`completed/2026-11-21-v8-clean-vm-fixes.md`](completed/2026-11-21-v8-clean-vm-fixes.md)). They were written for 8.0.1, so read each against the release under test before running it. Added 2026-11-25.
   - Any check a batch's own tasks name.
3. A remediation plan for what the pass finds, then a release of its own.

The owner can cut a release before the end at any time. It needs no VM pass.

## The four questions, researched 2026-11-25

Each was run or read on `main` `d9a40cc7`. The recommendation is what is built unless the owner says otherwise.

| Question | What the research found | Recommendation | Where it lands |
|---|---|---|---|
| Should a stop in the process that owns the gateway stay stopped, when another LLM Router process had adopted it? | Stop is already per process. Stop in a process that adopted a gateway only drops the adoption, and the other process keeps serving (`gateway-service.ts`, `stop` and `stopGateway`, which signal only this process's own child; `ipc.ts`, `appStopGateway`; read). So today the gateway is up while any LLM Router process has it switched on. A marker that made an owner's Stop machine-wide would make the same button mean two things: stop for everyone when this process owns the gateway, stop for this process only when it adopted | Leave the behaviour. Say it in the docs: with two LLM Router processes, Stop in one hands the gateway to the other | One docs paragraph, in batch 1 |
| Should the watch wait 10 seconds, or more than 20? | Twelve restarts of a real gateway child, in a temporary home on this Mac with a one-provider config, left the port unanswered for 221 to 804 ms, median about 355 ms (run). An earlier session measured about 2 seconds on the VM from a key's write to its first accepted request, which includes the poll. The 17 seconds behind the request for 20 is the sum of two timeouts, not a restart anyone measured. Every real exit of the other process costs the wait in full | Keep 10. It is twelve times the slowest restart measured here and five times the VM's figure. Not measured: a large config, or a machine under load | No change |
| Should "Waiting for the gateway" print only on a terminal? | The desktop app keeps no log of its warnings (a search of `packages/electron/src/main`, run), so nothing is lost there. multipass's menu bar app reads stderr through a pipe and shows it as a row note after a switch that worked (`AppState.swift:276`, read). Run from a terminal, multipass passes the terminal through and the line still shows live | Yes. One condition, `process.stderr.isTTY`, and the test that pins the line sets it | Batch 1, last commit |
| A restart for a stored key that loses the port ends in `error` and does not try again | Reproduced (run): one failed start, then nothing for two minutes of poll ticks. Two lines give it the restart a crash gets, which adopts the gateway that holds the port | Build it. It also removes the worst case of keys plan Task 6 | VM findings Task 8, batch 1 |

## Open with the owner

Each has a default, which is built unless he says otherwise.

| # | Question | Default | Plan |
|---|---|---|---|
| 1 | Decided by the owner on 2026-11-25, decision 7 above, after the two sessions agreed. The client label plan builds the per-key mark, which is the spec's G-5. The gateway phase 0 plan's Task 5 builds the spec's G-6 on it, as the last commit of the same batch. That session confirmed three things: none of its later phases reads the stored Logs request headers, so question 4's default suits it; `x-litellm-end-user-id` is meant to feed neither the label nor a field after its Task 5; and the redaction must apply where the Logs row is stored and not to the trace the import reads, which is where the code applies it today (`request-log-store.ts`, `request-log-runtime.ts`, read) and what batch 16's wire test for the single layout pins | One PR, batch 16 | Client label, gateway phase 0 |
| 2 | Should the gateway fork carry a provider's reported cost through to LLM Router? Pricing 6 cannot work without it | No. Drop P-5 for now | Pricing |
| 3 | Which price a priority or flex request takes when the rule's price has no service-tier figure. Pricing 8 waits on it | The pricing plan's option C | Pricing |
| 4 | Store the identity headers as `[redacted]` in Logs for every key, or only for a key without the mark | Every key | Client label |
| 5 | Should an apply refuse a Codex provider id of `openai`, `ollama` or `lmstudio`? | Refuse | Stripper |
| 6 | Should a Codex provider table written without a header count as that table? | No. State the limit | Stripper |
| 7 | Drop the S-7 part of stripper Task 5, which no product path reaches? | Drop it | Stripper |
| 8 | Should `saveApiKeys` stop applying profiles while the gateway is stopped? | As the restore plan recommends | Restore |
| 9 | Should the Restore original settings button cover the agents that get a stripper? | As the restore plan recommends | Restore |
| 10 | May restore Task 9 download another Codex version? | The installed version only | Restore |
| 11 | Should Workbuddy's `models.json` get a stripper too? | No. It holds a placeholder and no key | Restore |
| 12 | **Answered on 2026-11-25: the owner's review line for PR 159 said to merge once CI is green, and it merged as `1b09fc2d` with the Windows entry allowed to fail (`continue-on-error` for that matrix entry only). The Tests run concludes `success` while the Windows check shows red (run `45681008530`), so `npm run release` is not refused. Windows faults Task 12 removed the allowance in PR 162 (`f5c1d9eb`), where the Windows entry passed in full (run `45703069195`). A red Windows entry now fails the Tests run and `npm run release` refuses. The question as asked:** The first run's result. The Intel Mac passes. Windows fails four tests for product faults, listed under "Windows, from PR 159" below, and one unsorted test. None loses or corrupts a user's file. Merged as it is, every push to `main` has a red Tests run and `npm run release` refuses. The choices: hold PR 159 until the four are fixed; merge with the Windows entry allowed to fail, which needs the architecture test's ban on `continue-on-error` lifted for that entry and a comment naming the open rows; or fix the four in a batch of their own first | The harness plan recommends blocking only for a fault that loses or corrupts a user's file, and allowing the job to fail otherwise | Harness |
| 13 | When the fork commit of harness 5 is released | When nothing else needs a fork release sooner | Harness |
| 14 | The single layout's refusal body keeps the fork's prefix | Keep it. Removing it needs a fork release | Logs |
| 15 | Which usage events a trace may name a provider for | Only an event with no tokens and no cost | Logs |
| 16 | H-7 of the harness plan, which waits on his Claude Desktop check | The end pass | Harness |
| 17 | Whether the reviewers, the fixes and the merge on green can run without his `review-pr` line each time | No. Merging needs his word once per PR | All |
| 18 | Should a test run also leave nothing else in the temp folder? Harness Task 1 removes the temporary homes only. One `npm run test` leaves 124 other entries, about 38 MB, that tests and `context-archive.ts` write to the temp folder (audit of batch 3, run). The smallest change is for the runner to point `TMPDIR`, `TMP` and `TEMP` inside the suite's home. It was not built or run, and a longer temp path can break a test that listens on a socket path | No. Task 1's title and the plan's goal now say "temporary home" | Harness |

Four choices the researchers made on evidence, which a review can change: restore 3 keeps a profile's record while a saved original exists; a save's notice is set only by a profile's own restore; a usage row from the gateway's billing counts as an estimate; and a reported cost of 0 counts as absent.

## Findings with no task

- **A failed apply of the agent configs reaches no log a person reads, and nothing tries it again.** The desktop app keeps no log file and a service started in the background discards its output, so the window can be green while an agent's config file was never rewritten. This is so for the apply at startup and, since PR 156, for the apply after a takeover. It needs a place in the status the window shows. Found by the review of PR 156, read and not run.
- **`stored-api-keys-watch.test.mjs` depends on the order of its tests.** One test corrupts the stored config and does not put it back. Nine of twelve random orders failed, tests older than PR 156 included (run by that review).
- **A saved local login that LLM Router has not checked shows green ticks, and they stay green after a check that failed.** The status panel forces both rows green for a local login (`components/providers.tsx`, `ProviderConnectionStatusPanel`). Older than PR 157, whose text "LLMR has not asked this provider" now sits beside a green tick. It needs a decision on what the rows say. Found by the review of PR 157, read and not run.
- **The message from Refresh on a changed address is the banner at the bottom of the provider form**, which can be off-screen in a long edit dialog. Found by the review of PR 157, read and not run.
- **`build/run-tests.mjs` on an install without the Electron binary fails with a misleading error.** It imports `electron` at the top, which then tries to download the binary, and the network guard refuses that, so "the test runner leaves no folder in the temp directory" reports `fetch failed`. A plain `npm ci` in a fresh worktree has no binary, because `electron` is not in `allowScripts`. Found by the review of PR 158, run.
- **The network guard has three ways around it that are stated and not closed**: the macOS system proxy read through `networksetup` when a proxy app listens on loopback, a custom `lookup` given with a loopback name, and DNS or UDP. Found by the review of PR 158, each run.
- **Windows, from PR 159's first run (2026-11-25). Fixed by PRs 161 and 162.** Four product faults, each read in the code by the session that sorted the failures and none verified on a Windows machine:
  - A prompt with certain characters does not reach a batch-file agent CLI intact. Test: `#1851 Pi dispatch consumes only the profile selector and preserves the prompt`. This is the serious one. The detail is in the research notes outside the repo, `private/research/2026-11-25-windows-faults/1-cmd-escape.md`.
  - An npm-installed OpenCode is never read. `readInstalledOpenCodeUserAgent` in `local-providers/opencode-freetier.ts` calls `execFileSync("opencode")` with no shell, which cannot start a `.cmd` shim, so the pinned fallback version is sent.
  - `getAppInfo` blocks for about 22 seconds when ChatGPT, OpenCode and WorkBuddy are not installed. `windowsDesktopAppCandidates` in `platform/windows-app-discovery.ts` runs `powershell.exe` and `where.exe` with `spawnSync` and no timeout. Which spawn takes the time was not measured.
  - A route script's `api.env("PATH")` returns nothing. `withoutLlmrSecretEnv` in `mcp/child-env.ts` copies the environment into a plain object, which is case-sensitive, and Windows spells the name `Path`.
- **Windows, not sorted. Fixed by PR 162, whose Task 11 gives the test a clock it controls.** `raw trace keeps an over-capacity streaming source while its files are active` passed twice and failed once with `ENOENT` on the test's own append. The test appends every 15 ms against a 30 ms grace. A guess: coarse Windows timers overshoot. Raising the test's grace and several Windows runs would settle it.
- **Windows, gaps the review named.** Key and session files are protected by mode `0600` only, and Windows has no mode bits, so they rely on the folder's inherited access list. `UsageStore` has no `close`, and the web management runtime leaves `config.sqlite` open after `close()`, which is why Windows cannot remove those folders while the process lives.
- **A request log `flush()` throws when its checkpoint takes over the caller's budget.** Six tests call it with one second inside a longer wait that never gets to retry. On a slow disk the test fails with `Request log operation timed out after 1000ms` (CI run `45632829586`, Ubuntu; reproduced 10 of 10 in a Linux container with the disk capped at 15 writes a second and two competing writers, and 0 of 100+ without the cap). The fix is in `request-log-runtime.ts`: report a slow checkpoint as `timedOut`, the way a slow drain is reported. No product code waits on that flush. Not caused by PR 158: checkpoint times matched with and without the guard.
- **The Intel Mac entry fails often, with different tests each time (2026-11-25).** Four failures in one afternoon: on `main` at `37ab5ba3` (run `45687915249`, the stream truncation tests of `stream-terminal-error-frame.test.mjs`), at `a18498fe` (run `45695259003`, `recent issues: production HTTP, tool replay, logs and usage SQLite` and `route script workers distribute concurrent executions across available slots`) and at `7a2f1711` (run `45705299569`, `the gateway child refuses an API key that has expired`), and once on PR 162's last commit (run `45703069195`, first attempt, the stream truncation tests again, where one test timed out at 5 seconds and eight more got `ECONNREFUSED` from the test's own loopback server). None of those commits touches the failing files, three of the four are docs commits, and a re-run of PR 162's job passed. Every failing test waits on a timer or a child process. All three `main` failures were a docs commit pushed within about a minute of a merge commit, so two Tests runs were in flight at once: that is a pattern, not a cause. A fifth followed it: the merge commit `f5c1d9eb` (run `45705092956`) and the docs commit `7a2f1711` pushed a minute later both failed on the Intel Mac, and the next docs commit, `ec4c5bda`, pushed alone, passed (run `45706144222`). So of the six runs on `main` that overlapped another, four failed there. **Corrected the same day from the logs of all the red runs and of seven passing Intel Mac jobs.** Two runs at once is not the cause: PR 162's first attempt failed with no other Intel Mac job of this repository running (its job ran 21:18:35 to 21:25:44, the one before was cancelled at 21:18:31 and the next began at 21:26:42), the overlapping runs for `1b09fc2d` and `b69fcde8` both passed, and each job has its own machine. Three lines above are wrong: `recent issues: production HTTP, tool replay, logs and usage SQLite` failed on Windows in run `45695259003`, not on the Intel Mac; run `45687915249` also failed the route script workers test; and a sixth red run is missing, `45684187505` on PR 160's branch (the stream truncation tests and `no file under the data folder holds the login (compat)`). The failures are four separate test faults that a slow runner exposes, where the core suite took from 127 to 413 seconds for the same tests: a cold start under a 5 second cap whose timeout then fails fifteen more tests, 50 ms of slack in the route worker test, a port helper that two test processes can draw the same port from, and a 10 second wait for the request log. **Fixed by PR 163 (`2b1c6916`), 2026-11-25.** The evidence and the fixes are in [`completed/2026-11-25-intel-mac-test-faults.md`](completed/2026-11-25-intel-mac-test-faults.md). The Intel Mac entry passed on both of the PR's runs, which does not prove it for faults that showed in one to four of thirteen jobs. If the entry goes red again on a test that waits on a timer, a port or a child process, read the failure against that plan before re-running the job.
- **`route script workers distribute concurrent executions across available slots` passes on one worker**, before and after PR 163, so nothing tests that route scripts run side by side. A slot starts a call's timer only after its previous call ends (`RouteScriptWorkerSlot.rpc`). Run by the plan's audit and by the mutation review of PR 163. Proving it means timing the pair, which is one more assertion a slow runner can fail. Open with the owner as question 2 of the plan above.
- **Two discovery tests read the real file system under a stubbed Windows platform** (`app-info-paths.test.mjs`). On a developer's Windows machine with OpenCode or Claude installed they find that copy first and fail. CI is not affected. Found by the review of PR 162, read and not run.
- **No test covers what the CLI does after a launch's wait ends with the gateway gone**, which is to start a service for a Grok, Kimi or Pi profile.

## Not verified

- The size of each batch's diff. The figures in the table are the researchers' estimates from the task text. None was measured.
- The code of any task in a batch that is not merged. The fix rounds ran the faults and read the code. They built no task.

## The older plans, checked 2026-11-25

Four older plans sat in this folder and were not ordered here. None holds a code task that is not built.

- **The v8 plan** is in [`completed/`](completed/2026-11-21-v8-clean-vm-fixes.md). Every code task is merged and released. Its VM checks are a line of the end pass above, and its Open items became the backlog plans this file batches.
- **The audit program's hygiene and upstream leftovers plans** are in `completed/`. Their five PRs (69, 70, 71, 90, 91) are merged, read from GitHub.
- **The audit program's release safety plan** stays open for RS-5, which is repository settings and not a PR. Its PRs 64 to 67 are merged. Four of RS-5's six settings are not applied, read from the GitHub API: Dependabot version updates, SHA pinning for actions, squash-only merges and the tag ruleset. They are the owner's steps and gate nothing here.
- **The audit program's index** stays with it. Its list "Steps only the owner can do" holds manual checks and release notes that nobody has recorded as done. Which of them the owner ran was not checked.
