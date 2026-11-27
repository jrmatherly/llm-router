# Finish and release 9.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status, 2026-11-27: Tasks 2 to 7 are merged as PR 180, `0500d2f3`. Task 8 was built and dropped on the owner's word, so F-LABEL-5 stays open.** The gateway replaces a client's copy of an identity header (run), so the header is never repeated through it. The case where Task 4 does worse than `main` is kept as a stated limit. Next is Task 10, the release, on his word. The record is in the delivery index under "Before a batch is built". The rest of this line is the status before the build. The owner chose the scope that day: the two wrong costs, the survey, and the small fixes with a one-line recommendation, released as 9.1.0. Tasks 2 to 8 were checked against `main` `b504d153` on another model before this text was written. That check wrote each task's test and saw it fail on `main` for the reason the finding gives, then built each fix in a throwaway worktree and saw the test pass (run). Nobody reviewed those throwaway fixes. **Audited the same day** on another model, which built Tasks 2 to 8 from this text alone in a throwaway worktree, without the first check's fixes: no Blocker, 11 Corrections, 1 design finding and 6 gaps, all applied below. Every test failed as its "Expected" says and every fix passed, and the core suite was green at each of the seven commits (2457 passed, 0 failed, 82 skipped at the last, and 2523 passed with the gateway entry set). It ran 23 mutants: 18 killed, 1 equivalent and 4 survivors, and each survivor now has a test here that it saw fail on the mutant (run). The design finding changed Task 6. The text the audit's corrections changed was not built again. The audit's build, its extra tests and its mutant script are outside the repo in `private/audits/2026-11-27-audit-finish-plan/`. The check's tests as patches against `b504d153`, and its throwaway fixes, are outside the repo in `private/research/2026-11-27-pre-release-findings/` of the main checkout. Tasks 1, 9, 10, 11 and 12 point at text that already exists and add none.

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

Every `decide` row of the register, researched on 2026-11-27 as of that month, on another run than the one that wrote the row. The notes hold the evidence and the options:
[pricing](../research/2026-11-27-decisions-pricing.md), [free models](../research/2026-11-27-zero-listed-price.md), [restore and Codex](../research/2026-11-27-decisions-restore.md), [logs, label, gateway and UI](../research/2026-11-27-decisions-logs-label-gateway.md), [tests, CI and repository](../research/2026-11-27-decisions-tests-ci-repo.md).

Each recommendation is the researcher's and is labelled with how it is known. The lead re-ran none of them. Nothing here is built until the owner answers, and the release waits for none of it. A row with no answer keeps its default.

### A. A change is recommended before 9.1.0

**Accepted by the owner on 2026-11-27, all three.** The rename merged as PR 181 (`26bd76c6`) on his word, with every CI job green, Windows and the Intel Mac included, and no look at the four surfaces in a window. The two docs sentences are on `main` as `fca8e250`.

| Row | Recommendation | Size | Evidence |
|---|---|---|---|
| F-PRICE-34 | Rename "Estimated cost" to "Cost" on the Overview card and both share cards. The tray and Logs detail already say "Cost", and since PR 177 a total with no tilde holds list and user prices under a label that calls it estimated | Six strings: four in the app, two in the configuration docs page | read |
| F-CODEX-1 | State the limit on the user-facing Codex docs page: a provider table written with no header, under the same id as the profile's, makes an apply write a file Codex refuses, and switching the profile off restores the original byte for byte | One docs sentence | run on Codex 0.172.0 in a temporary home |
| F-RESTORE-2 | Say in the docs that for OpenCode, Kilo, Pi, ZCode and Workbuddy the way back when a save is refused is to stop the gateway or quit. The button stays as it is | One docs sentence | read |

### B. A change is recommended for the remediation release

| Row | Recommendation | Why not now | Evidence |
|---|---|---|---|
| F-PRICE-3 | Show `$0.00` and "Listed at no charge" only for a zero that is the offer of the provider the request went to. A zero from any other offer stays "no price here". It changes 80 live offers on 8 presets and the last sentence of V-21, which V-21's own row says was the plan author's | A rule change with a new cost source and a label. Default until then: a free model reads "No price found", as built | run on the live catalogs, the rule read |
| F-PRICE-36 | A zero offer adds no canonical id, so it cannot borrow the maker's paid price. Build it in the PR that builds F-PRICE-3. Corrected by the second researcher: the 207 reproduces and 9.0.0 has the same code, so the figures are old and only the "list price" label without a tilde is new. The one-condition fix moves 77 of the 199 models.dev cases. The other 122 take a maker's price by V-21's maker step, working as decided. With F-PRICE-3 it fixes 88 of 199. On a custom provider 68 of 2,934 model names go from a maker's price to unpriced | Same PR as F-PRICE-3 | run on catalogs saved at 17:58 UTC |
| F-PRICE-7 | Accept the pricing plan's option C for a priority or flex request, with two corrections to its wording. Anthropic reports `service_tier: "standard"` on an ordinary request, so "a tier other than `default`" would mark every Anthropic request. Anthropic's real premium is fast mode, `usage.speed: "fast"`, which C should cover. Unknown: whether the gateway keeps those two fields through translation | Pricing Task 8 is not built, and its text needs the corrections first | fetched provider docs through a tool that summarises, the plan read |
| F-LABEL-1 | Show the key's name in both layouts. It reads as one argument where the trace import builds its row. The key is the only anchor for who called that the caller cannot choose | A behaviour change with no test yet. With a proxied request the layouts could still differ (not run) | read |
| F-UI-1 | A saved local login shows grey until LLM Router has checked it, green after a pass and amber after a failure. Today both rows are green whenever the provider is a local login and neither reads a check result, so never checked, passed and failed look the same. Two step markers in the same file use the same condition and must follow | A UI change that wants a look in a window | read |
| F-RESTORE-1 | Not the row's option. Taking a ZCode cache entry by its id fixed three of six scenarios in a scratch prototype and made one worse. If it is closed, record the ids written at apply time and read that record when the config is gone, about 20 to 40 lines (inferred). Unknown, and the fact that would change this: whether ZCode itself deletes or rewrites its config | Rare, and the same shape of rule failed twice in batch 9 | run in a temporary home, no ZCode binary on this Mac |
| F-CODEX-1 | Beyond the docs sentence: refuse the apply with a not-ok status when the user's own headerless provider has the profile's id, as stripper Task 7 does for reserved ids | A new refusal | run |
| F-GATEWAY-1 | Release the fork commit no later than the remediation release. Fastify 6 is at alpha 6 with no date, and LLM Router's range cannot pull it. Until then a terminal user sees one deprecation line per start, and the tested commit lives on one disk. Pushing it as a branch with no tag would end that risk and needs his word | He said not yet on 2026-11-27 | npm and the lockfile read, the fork's state run |

### C. The default holds

| Row | What stays | Note from the research |
|---|---|---|
| F-PRICE-4 | The dash for a request with no tokens | |
| F-PRICE-5 | Both stores keep their own usage rule | No real provider stream was shown to send a reasoning-only chunk |
| F-PRICE-6 | No fork change for a provider's reported cost. Pricing Task 6 stays dropped | If it returns, the fork may not be needed: the trace body LLM Router already parses is the upstream's own body and would carry OpenRouter's `usage.cost` (read, not run). The pricing plan assumes the fork is the only way |
| F-PRICE-8 | A gateway billing cost counts as an estimate | One exception found: the fork reads xAI's reported cost for the embeddings, image and video endpoints, so that one cost is a real charge shown with a tilde |
| F-PRICE-9 | A reported cost of 0 counts as absent | A bring-your-own-key request inside the allowance carries no OpenRouter fee, so a reported 0 is not "free" |
| F-LOGS-1 | The refusal body keeps the fork's prefix | Drop it only as a passenger on a fork release made for another reason. LLM Router cannot strip it on its own side (inferred) |
| F-LOGS-2 | A trace names a provider only for an event with no tokens and no cost | |
| F-LABEL-2 | Identity headers are stored as `[redacted]` for every key | Nothing is lost: a marked key's e-mail and id have their own columns and show as "Gateway user". LiteLLM, Langfuse and Helicone all put identity in a named field (fetched docs) |
| F-RESTORE-3 | Restore Task 9 runs on the installed Codex only | It is 0.172.0, npm's latest that day. The premise holds at config load. The Codex config reference now also lists `gateway_oauth.credential_export`, a command that prints one access token, which Task 9 does not mention |
| F-RESTORE-4 | Workbuddy's `models.json` gets no stripper | It holds a placeholder and no key |
| F-RESTORE-5 | A save's notice is set only by a profile's own restore | The row's other half was stale and is corrected: "a profile's record is kept while a saved original exists" is not in the code. Batch 9's review replaced it with a flag set on every finished restore |
| F-GATEWAY-2 | The remediation release comes before gateway phase 1 | The phase 1 plan was audited once on 2026-11-25. About thirty PRs have merged since, several in its files, so it needs a fresh audit before it is built |

### D. Tests, CI and the repository

| Row | Recommendation | When | Evidence |
|---|---|---|---|
| F-TEST-3 | **Differs from the default.** Make the Windows and Intel Mac jobs required checks, once the Windows failure of PR 172's merge commit has a cause. A red platform job already stops `npm run release`, so the merge gate is looser than the release gate. Cost over 68 runs: a median of 0.4 minutes more wait per run and 3.3 at the 90th percentile. Failures since 2026-11-26: Windows 7 of 88 attempts, Intel Mac 1 of 86, and the Linux unit job that is already required 5 of 88, all five the timing test PR 179 replaced. Do not pair it with `continue-on-error`. A required check is named by the matrix entry's display name, so a rename in `test.yml` would hang every PR, and an architecture test should pin the names | After 9.1.0 | run on the workflow's history, GitHub docs fetched. That it also lets auto-merge switch on was not tried |
| F-TEST-1 | No timed assertion, as the default says. A third option closes the gap with no clock: two route scripts that each wait for a file the other writes. A prototype on the real compiled worker gave both results in 14 to 27 ms on two workers, five of five, and a timeout on one worker | Remediation release | run in a temporary home |
| F-TEST-2 | Leave the temp folder entries for 9.1.0. The fix the delivery index sketches, a temp folder inside the suite's home, breaks a test on a Mac: the socket path is 117 bytes against a limit of 103. A short sibling folder gives 92 and passes. The count was 60 entries and 11 MB on the package suites without the gateway entry, not 124 | Remediation release, or never | run |
| F-TEST-4 | Run H-7, the Claude Desktop check, in the end pass. Nothing outside his own app can show it | Task 11 | read |
| F-TEST-5 | Leave RS-5's four settings until after the release. All four read back as not applied, and none would break the release script, a docs push to `main` or Renovate. SHA pinning is safe to enforce now: all 39 `uses:` lines are pinned. **His call:** Renovate's PR 168 and Dependabot version updates would do the same job twice, so run one. The research leans to Renovate with a real config, because it also covers the Dockerfile digests and `.node-version`, and says PR 168 should not merge as it stands or before 9.1.0. Choose Dependabot if a third-party app with write access to a repository that signs releases is not acceptable. This partly reopens RS-4's choice of Dependabot | After 9.1.0 | read from the GitHub API, docs fetched |
| F-DOCS-1 | Of the audit program's owner steps, the repository shows 7 done and 2 not done (RS-5's remaining steps and CG-7's live `codex login` check), and 8 only he can know: the Windows and Linux installs, EU-2's four macOS checks and the auto-update from 7.2.1, DH-1's Windows home page, DH-2's Chrome checks, HP-2's saved preset and CG-9's curl checks. All six owed release notes are in the notes of `v8.0.0` | He says which he ran, at the end pass | read from the repo, GitHub and the release |

Gaps that research named and nobody has weighed: the main ruleset does not require a branch to be up to date, so a PR can merge on checks from a stale base. The tag ruleset as planned does not restrict who creates a `v*` tag, and such a tag starts the Release workflow with the signing secrets. An environment named `copilot` exists with no protection rule and is in no plan.

### Round two, 2026-11-27: what a second look changed

The owner asked for a deeper round on groups B, C and D. Four runs on another model were told to overturn round one where they could. They re-measured its figures, ran what it had only read, and built a throwaway prototype wherever a change was recommended. The notes are beside round one's, each named `...-round-2.md`: [pricing](../research/2026-11-27-decisions-pricing-round-2.md), [restore and Codex](../research/2026-11-27-decisions-restore-round-2.md), [logs, label, gateway and UI](../research/2026-11-27-decisions-logs-label-gateway-round-2.md), [tests, CI and repository](../research/2026-11-27-decisions-tests-ci-repo-round-2.md). Prototypes and raw runs are outside the repo in `private/research/2026-11-27-decisions-round-2/`. The lead re-ran none of it, except where a line below says so. Where this table and the groups above disagree, this table is the later word.

**Recommendations that changed.**

| Row | Round one | Round two | Evidence |
|---|---|---|---|
| F-CODEX-1 | State the limit, build nothing | **Build the refusal.** Codex 0.172.0 loads seven spellings of a provider, and on six of them 9.1.0 writes a file Codex refuses, under an ok status. One breaks whatever the provider's id. The prototype refuses all six, lets the three safe forms through and leaves the Codex folder untouched: 13 source lines and a 20-line test, core suite 0 failures. Its message names the wrong table for one form, which a built version must fix | run in a temporary home |
| F-RESTORE-1 | If closed, record the ids written at apply time | **Do not build that rule as specified.** Over 4,000 generated scenarios it fixes the row's own case, 72 scenarios to 0. Where the user's own cache names LLM Router's id it makes a failed switch-off stick across later saves, sweeps and quits, in 186 scenarios. Two new ZCode findings below outrank the row | run |
| F-PRICE-6 | If it returns, the fork may not be needed | **The fork-free read works only for a stream.** For a request that is not streamed the trace holds the gateway's translated reply, and the provider's cost is gone. In the compatibility layout only Logs would get it, so Logs and the totals would disagree. Stays dropped | run against the real gateway in both layouts |
| F-PRICE-3 | Show a provider's own zero as `$0.00` | Stands, with one more fix in the same PR. The price lookup strips the provider's name from the front of a model id, so a provider left at its preset name, such as `NVIDIA` or `OpenRouter`, looks up the wrong name. That leaves 23 of the 96 offers the change aims at still wrong, and it touches paid models too. The prototype with F-PRICE-36 is 25 lines added and 13 removed in three files. On catalogs fetched that day 73 zero offers become `$0.00`, 74 stop borrowing a paid price, and 207 still carry a paid price, all on providers the rule cannot recognise | run |
| F-PRICE-7 | Option C with two wording fixes | Stands as a list of the tiers that mark a cost, per maker. Google reports its tier in a response header and not in the body. A translated reply that is not streamed drops the tier fields, as it drops the cost | run, and the makers' docs fetched |
| F-LOGS-1 | Keep the fork's prefix | The prefix is cosmetic: Claude Code, Codex and both SDKs still show the reason. The fault that matters is beside it. In the single layout "All target providers failed" keeps the real reason only in a nested field, so Claude Code and the OpenAI SDK show the bare message, and the error code sits one level too deep for the OpenAI SDK. The fix is in the fork and was not built. Do it with the fork release of F-GATEWAY-1 | refusal bodies replayed through four clients |
| F-GATEWAY-1 | Release the fork commit by the remediation release | Stands, with a sharper reason. Fastify 6.0.0-alpha.6 neither throws nor warns on the removed option. It ignores it and turns access logging back on. Pushing the commit as a branch with no tag starts no workflow, and it does make the branch public | run on the alpha, the fork's workflows read |
| F-UI-1 | Grey until checked, green on a pass, amber on a failure | Stands, with a second fix. A passed check never turned the first row green, because that row reads another field than the one the check writes. One file, 12 lines in and 13 out. A check is forgotten when the dialog closes, so a saved local login would open grey each time. The Claude Code login provider cannot be checked and stays "Not checked" | component test, failing on 9.1.0 |
| F-TEST-3 | Require the Windows and Intel Mac jobs once the Windows failure has a cause | **The cause is found**: the runner's disk stalled, and two tests wait 2 seconds through 33 to 40 fsyncs. One line, the wait's default from 2 to 10 seconds, makes both pass under a slowed fsync. Fix that and one new flake first, then require both jobs. Of nine platform failures since 2026-11-26, five were pushes to `main`, which a required check never gates. No merge queue: they are for repositories an organization owns | CI history by script, a preload that slows fsync |
| F-TEST-5, the updater | Lean to Renovate | **Lean to Dependabot.** Renovate covers the Dockerfile digests and `.node-version`, which Dependabot does not, and holds third-party write access to a repository that signs releases. Neither updates the `allowScripts` list, and `npm install-scripts ls` exits 0 with an unreviewed script, so such a bump merges green with its script skipped. Draft configs for both are in the private folder | docs and source read, one command run |
| F-TEST-5, the rulesets | Apply after 9.1.0 | **Applied on the owner's word, 2026-11-27.** The three required checks of `main: tests must pass` are pinned to the GitHub Actions app, so only the repository's own workflow can satisfy them, and a new ruleset, `tags: only the owner creates or moves a release tag`, covers `v*` tags with creation, update, deletion and no force push, the owner bypassing. Read back from the API, and PR 168, whose checks had passed, still reads clean to merge under the pin (run). Not tested: that a push by anyone but the owner is refused, which needs a second account. The ruleset before the change is saved beside the private note. This also does the tag step of RS-5, so three of its settings are left. What round two had recommended: harden the main ruleset and add the tag rules first, before the four settings. The round found a weakness in who may satisfy the required checks. The lead confirmed the ruleset's state by a read of the API. The detail and the exact fix are outside the repo until it is applied, in `private/research/2026-11-27-decisions-round-2/tests-ci-repo/ruleset-risk.md`. The tag ruleset needs a creation rule, which does not stop `npm run release`, since the owner bypasses it | API read, GitHub docs fetched, not applied |
| F-GATEWAY-2 | Re-audit the phase 1 plan before it is built | Cheaper than feared. Every name the plan uses exists at 9.1.0. Four lines of its text are out of date, one of which tells the builder to run the local end-to-end suite | read against `v9.1.0` |

**Confirmed as they were, now by a run:** F-PRICE-4, F-PRICE-5, F-PRICE-8, F-PRICE-9, F-PRICE-36, F-LABEL-1 (one file, 5 lines in and 4 out, and a proxied request causes no split), F-LOGS-2, F-LABEL-2, F-RESTORE-3 (the `auth` table stays the base, and restore Task 9's text needs three small edits before it runs), F-RESTORE-4, F-RESTORE-5, F-TEST-1 (50 of 50 runs, and a serial mutant fails), F-TEST-2 (61 entries and 11 MB, all from tests), F-TEST-4, F-DOCS-1 (the VM checklist already carries every open owner step).

**New findings, most serious first.** None has a task. **The three ZCode findings (1, 2 and 5) are deferred by the owner on 2026-11-27**: testing focuses on Claude Code for now, and ZCode waits for a later follow-up. They stay listed so that follow-up starts from them.

1. **Two System default ZCode profiles leave the profile key on disk** (run). One on, one off with another provider id, two saves, then a switch-off. The switch-off is refused and the key stays in ZCode's own config. Codex and OpenCode pass the same run.
2. **The current ZCode app may ignore every file LLM Router writes** (read in its public source, not run, no ZCode installed here). It keeps providers in another file and reads the three LLM Router writes only once. A takeover may then do nothing, or ZCode may copy the profile key into a file no restore knows. Check VM-12 of the VM checklist looks for it.
3. **The repository's required checks**, as the F-TEST-5 row above says. Fixed the same day.
4. **A single-layout refusal hides its reason from the client**, as the F-LOGS-1 row says.
5. **A user's ZCode cache that names LLM Router's id refuses the switch-off** (run). No key is involved.
6. **The price lookup strips the provider's name from a model id**, as the F-PRICE-3 row says. It is older than 9.1.0.
7. **A new Windows flake at 9.1.0**, in `request-log-retention-save.test.mjs`: its last assertion reads the page before the runtime clears the pending retention. The fix is to wait on the page.
8. **Claude Code retries a 401 eleven times over 180 seconds** before showing it, so a wrong key looks like a hang. A 403 is not retried.
9. **Smaller.** Agent Analysis differs by layout apart from the label. The no-key message differs by layout. OpenAI's discounted background windows report the default tier, so no tier rule can mark them. A catalog whose response holds only zeros counts as a failed source. The proxy certificate installer file is never removed, and only a call the UI never makes reaches it.

**Corrected on `main` the same day, since each was a wrong statement in user docs:** the Profiles page on how five agents get their config back, the Codex page on which headerless forms break an apply, and the cost row that still described 9.0.0 (`a16be336`).

### Other questions

| Question | Default |
|---|---|
| The gateway phase 0 plan's status line still says Task 5 is not built. Another session owns the file | This session corrects the one line on his word |
| Run restore Task 9 before or after the release | After. The research recommends it, and it changes no product code |

## Review Focus

The five inputs the first draft of this plan left without a test. The audit ran each, and four now have a test in the task that owns the code.

1. **A Logs row written by 9.0.0 or by today's `main`, then a trace.** Its `pricing_json` is the flat shape with no `tiers`. It is re-priced at its stored price (run). Pinned in Task 5.
2. **A tier that states 0 on one side only.** The tier takes the base entry's price for that side (run). Pinned in Task 2.
3. **Another process that holds a write lock while this one opens.** An up-to-date usage database opens at once and takes no lock. An older one, and the request log database in any state, waits up to 5 seconds on the thread and then throws `SQLITE_BUSY`. For the request log that is what `main` does (run). The up-to-date case is pinned in Task 6. The 5 second failure has no test, since it would add 5 seconds to the suite.
4. **An identity id that contains a comma.** It is cut at the comma (run). An e-mail address cannot hold an unquoted comma. Pinned in Task 8 as a stated limit.
5. **A stored cost of exactly 0 on a request with no tokens.** It gets no basis, so it shows a dash and not `~$0.00`. Task 3's test asserts it. This rests on the default of F-PRICE-4, which keeps the dash.

## Order

1. Tasks 2 to 8, one branch, one PR. Nothing else is open beside it, since it touches both stores.
2. Task 1 whenever the owner gives his word. Before the release if he says so, after it otherwise (F-GATEWAY-1).
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
- [ ] **Step 3: Bump LLM Router.** Harness Task 5 Step 7 as written, on `fix/gateway-log-control` from `main`. Expected: `git diff --stat` shows the two manifests and the lockfile, the lock still resolves one `node_modules/fastify` at 5.10.0 or later, and `npm run typecheck`, `rtk bypass npm run lint`, `npm run test:architecture` and `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core` all pass.
- [ ] **Step 4: Commit and open the PR.** `fix(gateway): move to gateway 1.0.22-llmr.5, which starts without the Fastify deprecation warning`. The merge needs his word.

---

### Task 2: A 0 in a price tier's field reads as absent (F-PRICE-28). Built, PR 180

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

Append these two as well. The first fails on `main`. The second passes on `main` and fails if the fix is applied to the base entry too.

```js
test("a tier that states 0 on one side takes the base entry's price for that side", async () => {
  const lab = { Providers: [{ baseUrl: "https://api.example.com", models: ["m"], name: "Lab" }] };
  const modelsDev = { lab: { models: { m: { cost: { input: 1, output: 2, tiers: [
    { input: 0, output: 4, tier: { size: 200000 } },
    { input: 3, output: 0, tier: { size: 300000 } }
  ] } } } } };
  await withPriceCatalogs({ modelsDev }, () => {
    const price = resolveRequestPrice(lab, "Lab", "lab/m").price;
    assert.deepEqual(pricingForPrompt(price, 200_001), { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 4 });
    assert.deepEqual(pricingForPrompt(price, 300_001), { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 2 });
  });
});

test("a base entry that lists input at 0 beside a real output stays priced with its 0", async () => {
  const lab = { Providers: [{ baseUrl: "https://api.example.com", models: ["m"], name: "Lab" }] };
  const modelsDev = { lab: { models: { m: { cost: { input: 0, output: 5 } } } } };
  await withPriceCatalogs({ modelsDev }, () => {
    const outcome = resolveRequestPrice(lab, "Lab", "lab/m");
    assert.equal(outcome.state, "priced");
    assert.deepEqual(outcome.price.pricing, { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 5 });
  });
});
```

- [ ] **Step 2: Run the file and see the first two fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/models/pricing-service.test.js`. Expected: the first FAILS with `cacheReadUsdPerMillionTokens: 0` and `cacheWriteUsdPerMillionTokens: 0` where 0.2 and 1.25 are expected, the one-side test fails too, and the base-entry test passes.
- [ ] **Step 3: Add `positivePrices` and use it in the overlay.** Map each tier candidate's pricing through it first, then run the existing filter (input or output defined, size above 0), then spread the result over the base as today. `definedPrices` stays for the base entry, where a 0 on one side has a meaning.
- [ ] **Step 4: Run the file again.** Expected: PASS, every test in the file. Then `request-pipeline-cost-parity.test.js` under `integration/gateway`: PASS.
- [ ] **Step 5: Commit.** `fix(usage): read a 0 in a price tier's field as absent`

---

### Task 3: A stored cost on a request with no tokens gets a basis (F-PRICE-2). Built, PR 180

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
- [ ] **Step 4: Change the SQL to match.** In `usageTotalsSelect`, in the condition for `estimated_cost_usd` and in the one for `priced_request_count`, replace `${billableTokensSql} > 0` with `(${billableTokensSql} > 0 OR cost_usd > 0)`. The `cost_source NOT IN (...)` clause of the estimated sum stays: dropping it fails the 198-shape test (run by the audit). The unpriced count is unchanged. Nothing else is edited: `toStoredUsageEvent`, `toRequestLogEntry` and the Agent Analysis totals call `costBasisFor`, and the UI only formats a basis.
- [ ] **Step 5: Run the file again.** Expected: PASS, and its first test, which puts 198 row shapes through both the function and the SQL, still passes. That test is the guard against the two drifting apart. Then `pricing-service.test.js`: PASS.
- [ ] **Step 6: Commit.** `fix(usage): give a stored cost its basis when the request has no tokens`

---

### Task 4: A row copied from Logs into the totals is priced by its routed model (F-PRICE-11). Built, PR 180

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

### Task 5: A Logs row keeps its price's tiers, so a trace that brings the tokens chooses the tier (F-PRICE-1). Built, PR 180

Today a Logs row stores only the tier chosen when its price was written. A row priced with no tokens stores the base price, and the raw trace that brings 150,000 tokens re-prices from that base: Logs shows $0.0155 where the usage row shows $0.0775. The request log store has no config and cannot resolve a price a second time, so the tiers go on the row.

**Files:**
- Modify: `packages/core/src/observability/request-log-store.ts`: `RequestLogUsageContext` (near `:108`), `record` (near `:768`), `updateFromRawTrace` (near `:978-991`), `applyPriceUpdate` (near `:1743`), `readRequestLogUsageContext` (near `:6198`)
- Test: `packages/core/test/integration/usage/usage-sweep.test.mjs`

**Interfaces:**
- Consumes: `ResolvedModelPrice`, `pricingForPrompt` and `promptTokenCount` from `models/pricing-service.ts`, as they are.
- Produces, private to the file:
  - `function storedPriceJson(price: ResolvedModelPrice): string`. It writes the base price's fields flat, where today the chosen tier's fields are written, plus a `tiers` array of `{ abovePromptTokens, pricing }` only when the price has tiers. For a price with no tiers the text is the same as today.
  - `function parseStoredPrice(value: unknown, source: UsagePricingSource | undefined): ResolvedModelPrice | undefined`. It reuses `parseStoredModelPricing` for the base and for each tier, so a flat row written before this change still parses. It returns `undefined` when the source is not a known source or the base is not complete, and it skips a tier that does not parse.
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

Append these two as well. The first fails on `main` and kills a fix that leaves cache tokens out of the prompt count. The second passes on `main` and must keep passing: it is the row an install already holds.

```js
test("a trace's cache reads count toward the tier, as they do for the usage row", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-cache-tier-"));
  const logs = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  const usage = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => false });
  try {
    const tiered = { price: { pricing: { cacheReadUsdPerMillionTokens: 0.1, inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 }, source: "models.dev", tiers: [{ abovePromptTokens: 100_000, pricing: { cacheReadUsdPerMillionTokens: 0.3, inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 6 } }] }, state: "priced" };
    await usage.record({ ...event, price: tiered, requestId: "usage-row", usage: { cacheReadTokens: 60_000, inputTokens: 60_000 } });
    const usageCost = (await usage.getDatabase()).prepare("SELECT cost_usd FROM usage_events WHERE request_id = 'usage-row'").get().cost_usd;
    const now = new Date().toISOString();
    await logs.writeBatch([{ eventId: "e", input: { completedAt: now, durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: tiered, providerName: "alpha", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId: "log-row", responseBodyText: "{}", responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" }, kind: "record", sequence: 1 }]);
    await logs.writeBatch([{ input: { requestId: "log-row", responseBodyText: '{"usage":{"cache_read_input_tokens":60000,"input_tokens":60000,"output_tokens":0}}' }, kind: "raw-trace-update", sequence: 2 }]);
    const logCost = (await logs.getDatabase()).prepare("SELECT cost_usd FROM request_logs WHERE request_id = 'log-row'").get().cost_usd;
    assert.ok(Math.abs(logCost - usageCost) < 1e-12, `log ${logCost} usage ${usageCost}`);
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a log row whose pricing_json is the old flat shape is re-priced by a trace at its stored price", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-old-flat-"));
  const logs = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    const now = new Date().toISOString();
    await logs.writeBatch([{
      eventId: "flat-event",
      input: { completedAt: now, durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, providerName: "alpha", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId: "flat", responseBodyText: "{}", responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence: 1
    }]);
    (await logs.getDatabase()).prepare("UPDATE request_logs SET cost_source = 'models.dev', pricing_json = ? WHERE request_id = 'flat'")
      .run(JSON.stringify({ inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 6 }));
    await logs.writeBatch([{ input: { requestId: "flat", responseBodyText: '{"usage":{"input_tokens":150000,"output_tokens":0}}' }, kind: "raw-trace-update", sequence: 2 }]);
    const row = { ...(await logs.getDatabase()).prepare("SELECT cost_source, cost_usd FROM request_logs WHERE request_id = 'flat'").get() };
    assert.equal(row.cost_source, "models.dev");
    assert.ok(Math.abs(row.cost_usd - 0.45) < 1e-12, `cost ${row.cost_usd}`);
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});
```

- [ ] **Step 2: Run the file and see the first two fail.** `node build/test.mjs core && node --test .test-dist/core/test/integration/usage/usage-sweep.test.js`. Expected: the first FAILS with `'priced-no-tokens': 0.15, 'waiting-no-tokens': 0.15, 'update-then-trace': 0.15, 'trace-then-update': 0.45` against 0.45 for all four. The cache-reads test fails too. The flat-shape test passes.
- [ ] **Step 3: Store the tiers.** Add `storedPriceJson` and call it where `record` and `applyPriceUpdate` write `pricing_json`. `record` writes `""` when it has no price, as today.
- [ ] **Step 4: Read the tiers and choose again.** Add `parseStoredPrice`, have `readRequestLogUsageContext` build `price` with it, and in `updateFromRawTrace` re-price with `pricingForPrompt(storedPrice, promptTokenCount({ cacheReadTokens, cacheWriteTokens, inputTokens }))` and the stored price's source. `pricing_json` has no other reader and no other writer.
- [ ] **Step 5: Run the file and its neighbours.** `usage-sweep`, and under `integration/observability` and `integration/gateway`: `request-log-price-update`, `request-log-pricing-transaction`, `request-log-store`, `request-pipeline-cost-parity`. Expected: PASS, all of them.
- [ ] **Step 6: Commit.** `fix(logs): keep a price's tiers on the log row, so a trace that brings the tokens chooses the tier`

---

### Task 6: Two processes that open an older database at once do not collide on a new column (F-LABEL-4). Built, PR 180

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

In `request-log-store.test.mjs`, append this too. It covers the two side tables, which nothing else does:

```js
test("an older pending-update table opens when another process adds the same column between the read and the add", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-pending-race-test-"));
  const file = path.join(dir, "request-logs.sqlite");
  let store;
  try {
    const first = new RequestLogStore(file);
    await first.list({ pageSize: 1 });
    await first.close();
    const legacy = createBetterSqliteDatabase(file);
    try {
      legacy.exec("ALTER TABLE request_log_pending_updates DROP COLUMN update_bytes");
    } finally {
      legacy.close();
    }
    const restore = addColumnRightAfterTheColumnsAreRead(file, "request_log_pending_updates", "update_bytes INTEGER NOT NULL DEFAULT 0");
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

In `usage-store.test.mjs`, append this too. It passes on `main` and must keep passing. It is the inverse of a test the audit ran, and was not run in this form:

```js
test("an up-to-date usage database opens at once while another connection holds the write lock", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-schema-no-lock-test-"));
  const file = path.join(dir, "usage.sqlite");
  try {
    await new UsageStore(file).record({ durationMs: 1, method: "POST", model: "m", path: "/v1/messages", provider: "p", requestId: "old", statusCode: 200 });
    const holder = createBetterSqliteDatabase(file);
    try {
      holder.exec("BEGIN IMMEDIATE");
      const started = Date.now();
      const stats = await new UsageStore(file).getStats("24h", { includeProxy: true });
      assert.equal(stats.totals.requestCount, 1);
      assert.ok(Date.now() - started < 2_000, `waited ${Date.now() - started} ms`);
      holder.exec("ROLLBACK");
    } finally {
      holder.close();
    }
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});
```

- [ ] **Step 3: Run both files and see the three race tests fail.** Expected: each race test FAILS with `SqliteError: duplicate column name`, for `forwarded_user_email` twice and `update_bytes` once. The up-to-date test passes. `RequestLogStore bounded heap regression` fails too while the new test in its file fails, because it re-runs the file in a child process.
- [ ] **Step 4: Usage store.** In `open`, read `PRAGMA table_info(usage_events)`. When every column `ensureUsageSchema` adds is present, call `ensureUsageSchema(database)` as today. Otherwise run it as `database.transaction(() => ensureUsageSchema(database)).immediate();`, which reads the columns again under the lock. The eight column names are one constant beside `ensureUsageSchema`, with a one-line comment that a column added to the function goes into the list too. Why not the lock on every open: with it, an up-to-date database waited 5.2 seconds and then failed to open while another connection held a write transaction, where `main` opens in about 3 ms (the audit's run). A column in the function and not in the list reopens the race for that column only.
- [ ] **Step 5: Request log store.** Split `ensureRequestLogSchema` into the two functions above. It then runs `ensureRequestLogColumns` inside `database.transaction(...).immediate()`, then `ensureRequestLogMigrationSchema` and the three migrations outside it as today, and `ensureRequestLogIndexes` last. This store takes the lock on every open. That is not new: its open already waits out the busy timeout and fails under another connection's write lock on `main` (the audit's probe, 5.2 seconds on both). In `open`, wrap `ensureRequestRouteTraceSchema` and `ensurePendingRawTraceUpdateSchema` together in one more `.immediate()` transaction.
- [ ] **Step 6: Run the files.** `.test-dist/core/test/integration/usage/usage-store.test.js`, `.test-dist/core/test/integration/observability/request-log-store.test.js` and `.test-dist/core/test/unit/observability/request-log-backfill.test.js`. Expected: PASS, the four new tests and the migration tests included.
- [ ] **Step 7: Commit.** `fix(usage): add a database's new columns inside one write transaction, so two processes cannot collide`

A second process that opens an older database now waits for the first. Both stores set a busy timeout of 5 seconds, and the wait blocks the thread. After it the open throws `SQLITE_BUSY`. Considered and not built: no lock at all, with the column adds run again when one fails on `duplicate column name`, since each add is safe to repeat. It would need no list and no wait, and nobody has run it. Not in this task: `config-repository.ts` near `:350` and `request-log-admission-store.ts` near `:389` add columns the same way, and neither failed in the review's race.

---

### Task 7: The Logs page does not say a retention is pending when the database already holds it (F-LOGS-5). Built, PR 180

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

Append this beside it. It passes on `main` and fails if Step 3 replaces the existing half of the condition where it should add to it:

```js
test("RequestLogRuntime reads a retention it saved as applied after another process writes its own", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-runtime-retention-other-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const runtime = createRequestLogRuntime({ dbFile, workerFile });
  let database;
  try {
    await runtime.setRetentionDays(3);
    await runtime.list({});
    database = createBetterSqliteDatabase(dbFile);
    database.prepare("UPDATE request_log_settings SET value = '5' WHERE key = 'retention_days'").run();
    const page = await runtime.list({});
    assert.equal(page.retentionDays, 5);
    assert.equal(page.retentionRequestedDays, undefined);
  } finally {
    database?.close();
    await runtime.close({ timeoutMs: 5_000 });
    rmSync(dir, { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: Run the file and see the first fail.** `node build/test.mjs core && node --test .test-dist/core/test/integration/observability/request-log-runtime.test.js`. Expected: the first FAILS, `3 !== undefined` on its last assertion. The assertion before it passes, so the database does hold 3. The test takes about 5 seconds, because the locked save waits out the busy timeout. The second test passes.
- [ ] **Step 3: Add the condition.** In `list`, keep the existing check against the saved value and add a second: send the field only when the requested retention also differs from `page.retentionDays`.
- [ ] **Step 4: Run the file again.** Expected: PASS, with `says which retention it asked for while the database holds another` still passing.
- [ ] **Step 5: Commit.** `fix(logs): say no retention is pending when the database already holds the one asked for`

---

### Task 8: An identity header sent twice gives its first value (F-LABEL-5). Built, then dropped on the owner's word

**Not on `main`.** The commit was built and reviewed, then removed from PR 180 before the merge, and `forwardedIdentity` in `io.ts` is as it was. A harness run through `claude gateway` 2.1.332 showed that the gateway replaces a client's forged, repeated or mixed-case copy of each identity header with one copy of the signed-in user's value, in 7 requests against 5 controls (the build session's run, recorded in the register and in `private/research/2026-11-27-identity-header-order/`). So the repeated header this task fixes never arrives through the gateway, and the rule would cut an id that holds a comma, such as a directory-name `sub` (inferred). F-LABEL-5 stays open in the register for the remediation plan. The text below is kept as the record of what was built. Its Step 5 gates were run for the six tasks that merged.

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
  assert.deepEqual(forwardedIdentity(forwarder, { "x-claude-gateway-user-id": "tenant,42" }), { userId: "tenant" }, "an id that holds a comma is cut at it, a stated limit");
});
```

- [ ] **Step 2: Run it and see it fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js`. Expected: FAIL, with `userEmail: 'a@example.com, b@example.com'` and `userId: 'id-a, id-b'`.
- [ ] **Step 3: Take the first value.** In `forwardedIdentity`, split each value at the first comma and trim it before the existing length cut.
- [ ] **Step 4: Run the file again.** Expected: PASS.
- [ ] **Step 5: Run the gates and open the PR.** `npm run typecheck`, `rtk bypass npm run lint`, `npm run test:architecture`, and `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`. CI sets that variable. Without it 82 tests are skipped, the wire tests over `io.ts` among them. Expected: all pass, and the core suite skips 16 tests and not 82. Then commit `fix(gateway): take the first value of an identity header sent twice`, push the branch, and open the PR. Its body lists the seven findings by ID, and what was not run. The merge needs the owner's word.

---

### Task 9: Run the Codex token command prototype (restore Task 9)

The text is restore Task 9 in [`2026-11-22-backlog-restore.md`](2026-11-22-backlog-restore.md), unchanged. It is an investigation. It changes no product code, its deliverable is `docs/superpowers/research/2026-11-22-codex-token-command.md`, and it goes straight to `main`. It runs on the installed Codex only (delivery index question 10). Its home safety paragraph is binding: every Codex run uses a fresh temporary home under `env -i`, and the checksum of `~/.codex/config.toml` is recorded before and after.

- [ ] **Step 1:** Run that task as written.
- [ ] **Step 2:** Commit the result file to `main` and give the owner its question.

---

### Task 10: Release 9.1.0. Done 2026-11-27

**Released on the owner's word.** Commit `6596e807`, tag `v9.1.0`, on gateway fork `v1.0.22-llmr.4`. The Tests run for `main`'s head passed before the cut (run `46065459250`). Release run `46066501758` passed on every job with no rerun, and the release is public with 14 assets. Docker run `46067533723` passed, with image tags `9.1.0`, `9.1` and `latest`. It ships PRs 149 to 181. The "Upgrading to 9.1" and "What's new" sections were put above the generated list with `gh release edit`. They were written from the opening of each squash-merge message, with five messages read in full, and the owner was shown the draft before the cut. Not checked: each sentence against its PR's full message, and the installed app on any machine.

**Before.** Tasks 2 to 7 are merged as PR 180 (`0500d2f3`), and so is PR 181, the cost label (`26bd76c6`). Task 1 is merged too if the owner gave his word for it. `main` is clean and level with origin, and the Tests run for its head passed, Windows and the Intel Mac included.

- [ ] **Step 1: Draft the notes.** An "Upgrading to 9.1" header and a "What's new" header, written from the commit messages of PRs 149 to 179, the PR of Tasks 2 to 8, and Task 1's PR if it merged. Check each sentence against its PR's message. Sentences earlier sessions owed are the "Paste the release note" lines under "Steps only the owner can do" in [`2026-11-16-audit-remediation-index.md`](2026-11-16-audit-remediation-index.md). All six are already in the notes of `v8.0.0` (read by the decision research), so none is owed for 9.1.0. A plain `git grep -i "release note" -- docs/superpowers` returns 63 lines, most of them in finished plans (the audit's run). The notes stay neutral about the fault fixed in 8.0.1, as before. The owner reads the draft.
- [ ] **Step 2: Cut it.** `npm run release -- 9.1.0`. Expected: a commit `chore: release v9.1.0`, the tag, and a push that reports the required checks bypassed, which is normal.
- [ ] **Step 3: Watch the Release run.** Find it with `gh run list --workflow=release.yml`. Expected: 14 assets on the release. `gh run watch --exit-status` can return 1 while the Linux and Windows jobs still run, so watch again before calling it failed. If "Create draft release" fails, `gh run rerun <id> --failed`.
- [ ] **Step 4: Check the Docker release.** It follows by itself from a successful Release run. Expected: image tags `9.1.0`, `9.1` and `latest`.
- [ ] **Step 5: Put the notes on.** `gh release edit v9.1.0 --notes-file <draft>`, with the two headers above the generated list. The Release run publishes the release itself, so this edits notes that are already public. Have the draft ready before Step 2.
- [ ] **Step 6: Record it.** In the delivery index's "State" section and in this plan's status line: the commit, the run id and what shipped.

---

### Task 11: The VM pass on 9.1.0. Step 1 done, the pass is the owner's

**The checklist is [`../research/2026-11-27-vm-pass-9.1.0-checklist.md`](../research/2026-11-27-vm-pass-9.1.0-checklist.md)**, written 2026-11-27 after the release: 53 checks on the VM in eight groups and 9 off it, each read against the code at `v9.1.0`, with a list of the checks dropped and why. **The owner narrowed it on 2026-11-27 to new installs only**: the upgrade from 9.0.0 (VM-3, the in-app update, and VM-4, two processes on an upgraded database) is not run, which leaves 51 checks on the VM. The checklist keeps both and says what goes unseen. Its writer estimates a sitting of about six hours. Nothing in it was run, so every command and helper script in it is untried. The lead checked 13 of its quoted UI strings against the source and all 13 are there (run). It also answers the second half of F-GATEWAY-19 by a read of the fork: one path skips the provider hook, the provider health check, and nothing LLM Router sets or calls reaches it.

One sitting on the owner's UTM VM, on the released build. It is his to run. The session prepares the scripts and the checklist, as it did for the pass of 2026-11-24 (`docs/superpowers/research/2026-11-24-decisions-vm-pass.md`).

- [ ] **Step 1: Write the checklist** as one file under `docs/superpowers/research/`, one line per check with what to do and what passing looks like, read against 9.1.0 and not against the release each check was written for. The lines are the list under "The end", item 2, of the delivery index, plus these from the register:
  - F-CODEX-8: the window shows the refusal for a reserved Codex provider id, and a real Codex loads each rewritten config.
  - F-GATEWAY-18: an agent app behind another window comes forward.
  - F-GATEWAY-19: gateway phase 0 Task 4 Step 6, items 3 to 5, in the window.
  - F-UI-3: at 720 px a save error that persists does not cover onboarding's footer buttons.
  - F-TEST-4: H-7 of the harness plan, the Claude Desktop check.
  - Two processes started together on an upgraded install both open (Task 6 of this plan).
  - F-GATEWAY-19, second half: whether the gateway fork has a request path that skips the provider hook. This is a read of the fork's code and not a VM step, and the session does it while writing the checklist.
  - Every "VM check, for the owner" paragraph of the plans this program built. That is what "any check a batch's own tasks name" means in the delivery index, and nobody has listed them. They are in the harness, restore and pricing plans in this folder and in the keys, pass-through, follow-ups, VM findings, stripper, logs and client label plans under `completed/`.
  - The "Not verified" lists of those plans and of the gateway phase 0 plan, where a line names something only a real app or a real login can show.
  - The in-app checks of the audit program that nobody recorded as run: EU-2, DH-1, HP-2, DH-2, CG-7 and CG-9 under "Steps only the owner can do" in the audit index.
- [ ] **Step 2: The owner runs it.** Each line is marked passed, failed or not run, with what was seen.
- [ ] **Step 3: Record the results** in that file and commit it to `main`.

---

### Task 12: The remediation plan

- [ ] **Step 1: Gather.** Every line Task 11 marked failed, every register row whose disposition is `remediation` or `test`, and every `decide` row the owner has answered with a change. Leave out the six rows Tasks 2 to 7 fixed, four of which the register's tables still list as `remediation`. F-LABEL-5 is not fixed and stays in. Include the second half of F-PRICE-10, a sweep started by the back-fill, which the tables list as a `limit`.
- [ ] **Step 2: Group and write.** A new plan under `docs/superpowers/plans/`, written with superpowers:writing-plans, grouped by the files the fixes share so that each group is one branch and one PR. Each task's text is checked against the code on another model before the plan is committed, as Tasks 2 to 8 here were.
- [ ] **Step 3: The owner reads it** and says which groups are built and in what release.

Gateway phase 1, [`2026-11-25-apps-gateway-phase-1.md`](2026-11-25-apps-gateway-phase-1.md), comes after that release unless he says otherwise (F-GATEWAY-2). It is audited again first, since about thirty PRs have merged since its one audit.

## Not in this plan

- The register's other rows. It has 170 in its tables and F-PRICE-36 above them. Tasks 2 to 7 fixed 6, so 165 remain. Each waits for Task 12 or for the owner's answer.
- A sweep started by the back-fill (the survey's second line for F-PRICE-10). The case is rare: the compatibility layout, a stream the client cancels or that fails partway, and the window before the catalog loads (read and inferred, not run). Task 4 fixes the half that marked such a row `unpriced` for good.
- Anything under "Open with the owner". No task is written for a row there until he answers it. A row in group A that he accepts joins the branch of Tasks 2 to 8 as one more commit, or goes to `main` as docs.

## Self-review

- **Coverage.** Every item the owner chose has a task: F-PRICE-28 (2), F-PRICE-2 (3), F-PRICE-11 (4), F-PRICE-1 (5), F-LABEL-4 (6), F-LOGS-5 (7), F-LABEL-5 (8). The survey for F-PRICE-10 is done and is a research note. Batch 5, restore Task 9, the release, the VM pass and the remediation plan each have a task.
- **Names.** `storedPriceJson`, `parseStoredPrice`, `positivePrices`, `ensureRequestLogColumns`, `ensureRequestLogIndexes` and `addColumnRightAfterTheColumnsAreRead` are each defined in one task and used only there.
- **What rests on a run and what does not.** Each test in Tasks 2 to 8 was built twice from two texts by two runs on another model: once before this plan was written and once from this plan's text alone. The tests the audit added passed or failed as each step says (its run). Two things were not run in the form written here: the up-to-date usage database test in Task 6, which is the inverse of one the audit ran, and Task 6 Step 4's wording, which describes the audit's prototype. Line numbers are that check's reading of `b504d153` and move as commits land. The expected time, the release steps and the VM list are not run.
- **Not checked.** The full core suite with all seven fixes together. The UI, Electron and CLI suites. Whether `resolved_model` holds a route selector on some path, where the sweep would be handed the selector. Whether any real tier means a 0 as free. What the gateway fork forwards when a client sends an identity header twice in the single layout.
