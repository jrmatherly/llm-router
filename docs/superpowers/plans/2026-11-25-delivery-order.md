# Delivery order for the remaining work

> **For agentic workers:** This file orders the work. It holds no tasks. Open the plan a batch names and run its tasks with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Where a plan's own line on branches, PRs, order or a VM check disagrees with this file, this file is right.

**Goal:** Build every planned task that is not built yet in as few branches, reviews and merges as the code allows, with no stop for a VM pass along the way.

**Written 2026-11-25** from the file lists and the cross-plan notes of nine plans, read at `main` `c87fc875`. It was not audited. The grouping of the six draft plans is an estimate until each has had its fix round.

## The owner's decisions

Read these before any batch. A plan line or a handoff line that contradicts one is wrong.

1. **The VM pass comes once, at the end** (2026-11-25). No batch waits for a VM check, and no build stops for one. Every VM check a task names moves to the list under "The end".
2. **What the VM pass finds is fixed afterwards**, in a remediation plan with a release of its own (2026-11-25).
3. **Fewer branches and PRs** (2026-11-25, and for the audit program on 2026-11-17). Tasks that touch the same files or build on each other land as one branch and one squash-merged PR, with one commit per task.
4. **Merging needs his word, once per PR.** Unchanged.
5. **A push or tag on `jrmatherly/llmr-gateway` needs his word each time.** Unchanged.
6. **The Grok, Kimi and Pi start after the launch wait is accepted** (2026-11-24). Keys plan Task 6 builds it. Evidence found since changed its order, not the decision.

## What this file overrides

- Every "one PR each" and every branch name in the plans below. The batch's branch is the one in the table.
- "No two PRs of this plan run at the same time." Batches on different rows of the order below can be open together when their files do not meet.
- VM findings Task 3, Step 1, "The owner's VM check, before any code". The task is built on the run its Evidence names, and Step 1 is a line of the end pass.
- Keys plan Task 6, "the PR waits for it". It does not wait.
- Each task's "VM check, for the owner" paragraph. It is not a gate. It is a line of the end pass.

## The batches

Sixteen PRs. The plans hold 44 tasks that are not built, written as about 39 PRs before VM findings Task 8 was added. Forty-two are in the table and two are not PRs.

| # | Branch | Tasks, one commit each | Shared ground | Needs |
|---|---|---|---|---|
| 1 | `fix/launch-and-gateway-ownership` | VM findings 7, VM findings 8, keys 6, VM findings 3, then the terminal-only waiting line | `gateway-service.ts`, `launch-service.ts`, `profiles/service.ts` | Nothing. Keys 6 comes after VM findings 7 and 8 inside the branch |
| 2 | `fix/provider-form-local-login` | Follow-ups 8, VM findings 4, follow-ups 9, follow-ups 10, in that order | `App.tsx`, `providers.tsx`, `shared/providers.ts` | Nothing. This is follow-ups PR 3 as already planned |
| 3 | `test/harness-and-codex-parse` | Harness 1, 2, 3, stripper 1 | `build/test-home.mjs`, `build/test-home-env.mjs`, `build/run-tests.mjs`, the Codex parse helper | Nothing. Tests and harness only |
| 4 | `ci/package-suites-matrix` | Harness 4 | `.github/workflows/test.yml` | Nothing. Kept apart because a red matrix job blocks a release |
| 5 | `fix/gateway-log-control` | Harness 5 | The gateway fork, then two `package.json` pins | His word for the fork push and tag |
| 6 | `fix/codex-config-scanner` | Stripper 2, 3 | `codex-config-strip.ts`, `profiles/service.ts` | Batch 3 |
| 7 | `fix/codex-ownership-and-backups` | Stripper 4, 5, 6, restore 5 | `codex-config-strip.ts`, `backup-files.ts`, `profiles/service.ts` | Batch 6 |
| 8 | `fix/save-restore-statuses` | Restore 1, 2 | `profiles/service.ts`, the save path through `ipc.ts`, `management-server.ts`, `cli.ts`, `App.tsx` | Batch 7 |
| 9 | `fix/restore-corrections` | Restore 3, 4 | `profiles/service.ts`, `backup-files.ts` | Batch 8 |
| 10 | `fix/agent-config-strippers` | Restore 6, 7, 8 | A new `json-config-strip.ts`, three `profile-config.ts` files, `profiles/service.ts` | Batch 9 |
| 11 | `fix/trace-import-and-refusals` | Logs 1, 2 | `router-plugin.ts`, `raw-trace-sync.ts`, `usage/store.ts` | Nothing |
| 12 | `fix/logs-page` | Logs 3, 4 | `network-logs.tsx`, `request-log-store.ts`, `App.tsx` | Batch 11 |
| 13 | `fix/pricing-one-shape` | Pricing 1, 2, 3, harness 6 | `pricing-service.ts`, `usage/store.ts`, `request-log-store.ts` | Batches 3 and 11. Harness 6 waits on pricing 3, so it is the last commit |
| 14 | `fix/cost-basis` | Pricing 4, 5 | `pricing-service.ts`, `usage/store.ts`, ten cost surfaces, `network-logs.tsx` | Batches 12 and 13 |
| 15 | `fix/reported-cost-and-tiers` | Pricing 6, 7 | `pricing-service.ts`, `response-usage.ts`, `request-log-store.ts` | Batch 14 |
| 16 | `fix/client-label` | Client label 1, 2, 3 | `router-plugin.ts`, `raw-trace-sync.ts`, `request-log-store.ts`, the API Keys page | Batches 11 and 15, since it meets the same store |

Not a PR:

- **Restore 9**, the Codex token command prototype. It changes no product code. Its result goes to the owner.
- **Pricing 8**, the service tier price. It waits on the owner's answer in the pricing plan.

## Order

1. Batches 1 and 2. Both are written and audited. They can be open together: one is core, the other is the provider form.
2. Batch 3, then 4. Batch 5 at any point once the owner gives his word on the fork.
3. Batches 6, 7, 8, 9, 10, one after another. All five change `profiles/service.ts`.
4. Batches 11, 12, 13, 14, 15, 16, one after another. All six meet in the request log store or the usage store. One batch from this row and one from row 3 can be open together, except where they meet: batch 8 shares `App.tsx`, `contracts/app.ts`, `ipc.ts` and `management-server.ts` with batches 12 and 16, so batch 8 is not open beside either.
5. The end.

## Before a batch is built

- **Batches 1 and 2** are ready. Their tasks were audited on 2026-11-24 and 2026-11-25.
- **Every other batch comes from a draft plan** whose audit found Blockers that nobody has checked. Its fix round happens right before the batch is built, for that batch's tasks only: read each Blocker and Correction against the code as it is then, correct the task text, and have the changed text audited once on another model. The audits are outside the repo, in `private/audits/2026-11-22-audit-<plan>.md`.
- **A task under about 100 lines of change** is built once, on the batch's branch, and gets one review round that covers the task text and the code together.
- **A design that spans commits** keeps its text audit before any build. That is the Codex scanner of batch 6, the cost basis of batch 14 and the client label rule of batch 16.
- **A task whose review finds a fault in its design** leaves the batch and gets its own PR, so the rest can merge.
- **A batch whose diff the reviewers cannot hold** is split at a commit. Batches 7, 13 and 14 are the likely ones.

## The end

After batch 16, or earlier if the owner calls it:

1. One release, with his version.
2. One VM pass on that release, on his UTM VM. It covers, in one sitting:
   - Gate B of the pass-through follow-ups plan, B1 to B11 and G1 to G10.
   - PRs 151 to 155, which merged with no run on the real apps.
   - VM findings Task 1's check, Task 3's Step 1 and the check after it, Task 6's two runs and Task 7's look at the agent settings.
   - Keys plan Task 6's check.
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

Still open with the owner, and stopping nothing:

- **H-7 of the harness plan**, which waits on his Claude Desktop check. It goes to the end pass.
- **Whether the reviewers, the fixes and the merge on green can run without his `review-pr` line each time.** Until he says so, merging needs his word once per PR.

## Not verified

- The size of each batch's diff. The grouping comes from file lists and dependency notes.
- Whether a draft task is already covered by a PR that merged after its plan was written.
- The three older plans in this folder, `2026-11-21-v8-clean-vm-fixes.md` and the two open audit plans. They are not ordered here.
