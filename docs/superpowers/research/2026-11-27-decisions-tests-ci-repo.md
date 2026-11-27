# Decisions on tests, CI and repository settings

Research for six rows of [`../plans/2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md), section "Decide". Read and run on 2026-11-27 at `main` `b45e25c5`. Nothing in the product, the workflows or the GitHub settings was changed. Every claim says whether it was run, read or inferred.

## Summary

| ID | Question | Recommendation | When | Confidence |
|---|---|---|---|---|
| F-TEST-1 | Add a timed assertion to the route worker test? | No timed assertion. Replace the busy loop with two scripts that each wait for the other's file. It needs no clock | Remediation release | High (prototype run) |
| F-TEST-2 | Leave the temp folder entries? | Leave them for 9.1.0. If cleaned later, give the suite a short sibling temp folder, not one inside the home | Remediation release, or never | High on the path limit (run) |
| F-TEST-3 | Leave Windows and Intel Mac out of the required checks? | Differs from the default. Require both, once F-TEST-13 has a cause | After 9.1.0 | Medium |
| F-TEST-4 | Run the Claude Desktop check in the end pass? | Yes. Nothing outside Claude Desktop can show it | End pass | High |
| F-TEST-5 | Leave the four settings until after the release? | Yes. None breaks a flow. Run one updater, not two, and decide which before PR 168 is merged or closed | After 9.1.0 | High on the settings, medium on the updater |
| F-DOCS-1 | Were the owner steps run? | 7 confirmed done, 2 confirmed not done, 8 only the owner knows | Record at the end pass | High on what the repo shows |

## F-TEST-1: route scripts side by side

1. **Still true.** `packages/core/test/unit/routing/route-script-runtime.test.mjs:1008` runs two 350 ms busy loops on a runtime of two workers and asserts only that both end `ok` (read). One worker would pass it too, since each script has a 1000 ms timeout of its own and a slot starts a call's timer after the previous call ends (`RouteScriptWorkerSlot.rpc`, `route-script-runtime.ts:221`).
2. **The product does run them side by side.** `RouteScriptRuntime` builds two slots by default (`defaultWorkerCount = 2`, cap 4), each a `Worker` thread. `nextSlot()` picks the slot with the lowest `inFlightCount`, and `rpc` raises that count before its first `await`, so the second of two calls goes to the other slot (read). The prototype below confirms it (run). Weight of the gap is low. A regression to one worker would slow routing under load and break nothing, and only a user with script rules would meet it.
3. **Outside facts.** None needed.
4. **Options.**
   - (a) A timed assertion, the row's own option. A slow runner can fail it, and this repo has just removed one such test (PR 179).
   - (b) A barrier with no clock. Route scripts already have `api.fs.writeText` and `api.fs.exists` (`route-script-worker.ts:128`). Script A writes `a.flag` and loops on `await api.fs.exists(b.flag)`. Script B does the reverse. With two workers both return. With one worker the first can never see the second's file and ends `timeout`. Prototype against the real compiled worker, in an `env -i` throwaway home (run). Two workers gave `["ok","ok"]` in 14 to 27 ms, five times of five. One worker gave `["timeout","ok"]`. A slow runner only makes the passing case take longer, up to the script's `timeoutMs`, which can be set to the 30 s cap. Cost is one test body changed, about 15 lines, in the one test file.
   - (c) Leave it.
5. **Recommendation.** (b), in the remediation release. It is a test-only change and gates nothing in 9.1.0. I would drop it only if `api.fs` were removed from scripts.
6. **Gaps met.** A route script can read and write any path the user can (`resolveScriptPath` resolves any absolute path or `~`). That is by design as far as the code shows, and I did not check it against a decision.

## F-TEST-2: entries left in the temp folder

1. **Still true, with a smaller number here.** `npm run test:packages` in an `env -i` shell with its own `HOME` and `TMPDIR` left 60 entries and 11 MB (run, exit 0, no test failed). The row's 124 and 38 MB were measured on a full `npm run test` with the gateway entry set. My run skipped 82 gateway tests and the architecture suite, so the two numbers do not conflict.
2. **Who writes them.** 34 `llmr-runtime-*` folders come from `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`. 20 `llmr-context-archive-<uuid>.sqlite` files come from the context archive under test. 6 `llmr-rc-*` come from `shell-rc-path-block.test.mjs`, 2 from `service-state.test.mjs`, and one is Node's own `node-compile-cache` (2 MB). Weight is a developer's disk only, since CI runners are thrown away.
3. **Outside facts.** A Unix socket path on macOS holds at most 103 bytes (`sun_path` is 104 with its terminator). Linux allows 107.
4. **Options.**
   - (a) Leave them. No cost.
   - (b) `TMPDIR` inside the suite's home, as delivery question 18 sketched. **This breaks a test on a Mac** (run). The network guard test makes its own home under `os.tmpdir()` and listens on `<home>/s.sock`. Today that path is 78 bytes. With `TMPDIR` at `<suite home>/tmp` it is 117 for the architecture suite, and `listen` fails with `EINVAL`. I ran the test file both ways and it failed 1 of 11 at a temp path of 87 bytes.
   - (c) A short sibling folder. The runner makes `llmr-t-XXXXXX` beside the home, points `TMPDIR`, `TMP` and `TEMP` at it, and removes it with the home (`build/run-tests.mjs`, `build/test-home-env.mjs`). The socket path is then 92 bytes and the same test passed 11 of 11 (run at a 62 byte temp path). On a Linux runner the path is shorter still.
   - (d) Fix the two big writers so they clean up after themselves. More edits, and the next test that forgets brings the problem back.
5. **Recommendation.** (a) for 9.1.0, which is the row's default. If it is ever cleaned, use (c) and never (b). It would move up only if a test started to read another run's leftovers.
6. **Gaps met.** Only one test in the repo listens on a socket path, so the limit has one known victim. `usage/store.ts:943`, `media/executors.ts` and `proxy/service.ts:1667` write to the temp folder in the product too. I did not check that each removes its file.

## F-TEST-3: Windows and Intel Mac as required checks

1. **Still true.** Ruleset `25837404` requires `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke` (run, `gh api`). The two platform jobs report as two separate checks, `🧪 Unit (Windows)` and `🧪 Unit (Intel Mac)` (run, PR 168's check list). A red one already blocks a release, because `npm run release` refuses a red Tests run. It does not block a merge.
2. **Numbers (run).** Last 30 Tests runs, all from today, 33 job attempts each.

   | Job | Failed attempts, last 30 runs | Failed since 2026-11-26 | Median duration | Median finish after run start |
   |---|---|---|---|---|
   | Unit and architecture | 4 of 33 (12%) | 5 of 88 (6%) | 2.6 min | 2.6 min |
   | End to end | 0 of 29 | 0 of 83 | 2.3 min | 4.8 min |
   | Docker smoke | 0 of 33 | 0 of 88 | 0.7 min | 0.8 min |
   | Unit (Windows) | 1 of 33 (3%) | 7 of 88 (8%) | 4.5 min | 4.0 min |
   | Unit (Intel Mac) | 0 of 31 | 1 of 86 (1%) | 5.3 min | 5.4 min |

   All five failures in the last 30 runs were one test, `a single-layout Logs row appears within 1500 ms of the answer`, which PR 179 has since replaced. Four of the five were on Linux, a job that is already required. The older Windows failures were `raw-trace-sync` (F-TEST-13, cause not known), one compat Logs row test and one stripper test on a PR branch. On 2026-11-25, the day the jobs were added, Windows failed 18 of 29, which was the bring-up and says nothing about today.
3. **Outside facts.**
   - GitHub's GraphQL reference defines `UNSTABLE` as "Mergeable with non-passing commit status". Auto-merge is offered only on a pull request that cannot merge yet, and it merges "after all required reviews and status checks pass" (GitHub docs, auto-merge page). So on PR 178 every required check was green, Windows was red, the PR could merge at once, and there was nothing for auto-merge to wait for. Requiring the job turns that state into `BLOCKED`, and auto-merge then waits for the rerun (inferred from the two pages, not tried).
   - A job with `continue-on-error: true` lets "a workflow run pass when this job fails" (workflow syntax page). The docs I read do not say what the job's own check shows on a pull request. A required check that reports success while red would be worse than no requirement.
   - A required check must pass on the latest commit, and a check that never reports stays pending and blocks (troubleshooting page). The platform jobs have no `needs` and no `if`, so they always report.
4. **Options.**
   - (a) Leave them out, the default. A red platform job reaches `main` and is found at release time or by whoever looks.
   - (b) Require both. Add two contexts to the ruleset. Cost in wait is a median of 0.4 minutes per run and 3.3 at the 90th percentile, because the Intel Mac job finishes after End to end (run, 68 runs). Cost in reruns is about one Windows rerun in twelve attempts at the rate since 2026-11-26, about 4 minutes each. The Admin bypass stays, so direct pushes and the release script are untouched.
   - (c) Require the Intel Mac job only. It failed once in 86.
   - (d) One summary job that needs all the others, required alone. It hides which platform failed and adds a job. Not worth it for five jobs.
5. **Recommendation.** (b), after 9.1.0 and after F-TEST-13 has a cause or 50 more runs show Windows under about 5%. The merge gate would then match the release gate, and auto-merge would work again. Do not pair it with `continue-on-error`. I would stay with (a) if the Windows rate does not come down, and take (c) as the middle course.
6. **Gaps met.** The required names carry the matrix `display_name`. Renaming `Windows` or `Intel Mac` in `test.yml` would leave a required check that never reports, and every PR would hang. If (b) is taken, `tests/architecture/package-scripts.test.mjs` should pin the two names. Also, `strict_required_status_checks_policy` is `false`, so a PR can merge on checks from a base that `main` has since moved past.

## F-TEST-4: H-7, the Claude Desktop check

1. **Still true.** H-7 asks whether the Claude desktop app sends an `Origin` header to the gateway (`research/2026-11-22-open-items-validation.md:70`). The harness plan gives it no task and delivery question 16 puts it in the end pass (read).
2. **Weight.** If Claude Desktop calls the gateway from a Chromium renderer with a foreign `Origin`, it stops at the preflight and the user sees a network error and no Logs row. A caller that is not a browser is not affected.
3. **What would show it was done.** Nothing in the repository, GitHub or a release asset can. The only trace would be a Logs row in his own app or a line he writes. I found no such line in `docs/superpowers` (read, grep).
4. **Options.** Run it in the end pass, or drop it. A pass is a reply in Claude Desktop and a Logs row. A fail is a network error and no row.
5. **Recommendation.** The default holds. Keep it in the end pass, since it takes one request. A fail becomes a remediation task in the gateway fork.
6. **Gaps met.** None.

## F-TEST-5: the four settings of RS-5 not applied

Read back today with `gh api` (run). `sha_pinning_required` is `false`. Merge, rebase and squash are all allowed. The only ruleset is the branch one. `automated-security-fixes` is off, Dependabot alerts are on with one open alert, and no Dependabot PR has ever existed. The plan's status table of 2026-11-25 is still right.

| Setting | How it works in November 2026 | What changes here | Breaks a flow? |
|---|---|---|---|
| Dependabot version updates | On a fork, "Version updates are not automatically enabled on forks when a `dependabot.yml` configuration file is present". The owner turns it on in Settings. Updates now wait a default cooldown of 3 days (GitHub docs, options reference) | Four weekly grouped PRs from `.github/dependabot.yml`. Each npm group takes majors too, since the group is `"*"` with no `update-types` | No. But see Renovate below |
| SHA pinning | "All actions must be pinned to a full-length commit SHA to be used." Reusable workflows may still use a tag. A third party's test reports that the rule also reaches actions nested in a composite action. GitHub's page does not say | Nothing today. All 39 `uses:` lines are pinned (run), and so is every action nested in `withastro/action` and in `upload-pages-artifact` (run, read from each action file at its pinned commit). That closes the plan's "not checked" note | No. A later unpinned action would fail its workflow, which is the point |
| Squash only | A repository setting on the merge button | PRs can only be squashed, which is already the house rule | No. The release script and docs commits push straight to `main` and never use the merge button |
| Tag ruleset | Rulesets can target tags. "Restrict deletions" and "Block force pushes" apply to them | `v*` tags cannot be deleted or moved, except by the Admin bypass | No. The plan's JSON has no creation rule, so `git push --atomic origin main vX.Y.Z` still works, and the bypass keeps `gh release delete --cleanup-tag` |

**Renovate and Dependabot overlap.** PR 168 is Renovate's onboarding PR, opened 2026-11-26 by the Renovate app, green, one file (`renovate.json` with `config:recommended`). Merging it starts Renovate. Turning on RS-5 step 1 starts Dependabot. Both would then open PRs for the same npm, Actions and compose updates. Run one.

| | Renovate | Dependabot |
|---|---|---|
| Covers the `Dockerfile` digests on `ARG` lines and `.node-version` | Yes, both are in its detected list on PR 168 | No. The plan found Dependabot reads only literal `FROM` lines, so those stay manual |
| Majors | One PR per major by default | Inside the one grouped PR unless the config changes |
| Who it is | A third-party app with write access to the repository | Part of GitHub |
| Config reviewed here | No. The default has no schedule, no release-age wait and up to 10 open PRs | Yes, in RS-4, with the gateway ignore |

**Recommendation.** Apply steps 3, 4 and 6 any time after 9.1.0. They cost one command each and break nothing. For the updater, I lean to Renovate, because it covers the two things Dependabot cannot and keeps majors apart, which is the worry RS-5 step 1 itself states. That needs a real `renovate.json` first (a weekly schedule, a minimum release age to match the machine's `min-release-age`, one group for non-major updates) and the version-update entries removed from `dependabot.yml`. Do not merge PR 168 as it stands, and not before 9.1.0, since it would open up to ten PRs in the release window. I would choose Dependabot instead if a third-party app with write access to a repository that signs releases is not acceptable. A `v*` tag pushed by any writer starts the Release workflow with the signing secrets, and the tag ruleset as written does not restrict who creates a tag.

**Gaps met.** An environment named `copilot` exists with no protection rules, created 2026-10-28. No plan mentions it. The tag ruleset does not stop the owner's own mistaken force-push of a tag, because the Admin bypass is `always`.

## F-DOCS-1: the owner steps of the audit index

Checked against the repository, the GitHub API and the release notes and assets (run and read).

**Confirmed done**

- EU-1, the `rebuild:sqlite3` deny rule. Neither the rule nor the script exists any more.
- HP-3, the copyright line. The plan's status says the owner confirmed it, and PR 71 merged it.
- RS-2 and RS-5 step 5. The `release` environment exists with a `v*` tag policy and the five secrets, no repository-level secret is left, and no draft release or test tag remains.
- RS-5 step 2, the required checks.
- The six release notes (EU-2 macOS 13, HP-2 presets, UL-1 `TZ`, UL-2 `CODEXL_`, CG-6 `integrity`, CG-9 Proxy mode). All six are in the notes of `v8.0.0`.
- RS-1 outcome C. Not applicable, since Task 1.1 ended in outcome A.
- The `min-release-age` step. The index already says it is no longer an owner step.

**Confirmed not done**

- RS-5 steps 1, 3, 4 and 6 (F-TEST-5 above).
- CG-7, the live check with a real `codex login`. The plan's own status still says nothing ran against a real login, and no later note changes that.

**Only the owner can say**

- EU-1 and EU-2, the Windows and Linux packaging checks. The releases carry an `.exe` and an `.AppImage`, which shows they were built, not that anyone installed one.
- EU-2, the four manual macOS checks and auto-update from 7.2.1 on Windows.
- DH-1, the home page on the Windows build.
- DH-2, the Chrome checks with the unpacked extension.
- HP-2, a provider saved from a deleted preset in the running app.
- CG-9, the three curl checks with the proxy CA trusted.
- Whether the VM passes of 2026-11-20 and 2026-11-24 covered any of these. I did not read the private VM records.

**Recommendation.** At the end pass, put one word beside each line of the index's list (done, not done, dropped). Several target versions two majors old, so "dropped" is a fair answer for the 7.2.1 auto-update check. Nothing here gates 9.1.0.

## Not checked

- What a job-level `continue-on-error` shows as its own check on a pull request. A throwaway workflow on a branch would show it.
- That requiring the platform jobs turns the PR 178 state into one where auto-merge can be switched on. It follows from the docs and was not tried, since trying means changing the ruleset.
- That SHA pinning reaches nested actions. It rests on a third party's test. It does not matter here while every nested action is pinned.
- The count of 124 temp entries on a full `npm run test` with the gateway entry set. I ran the four package suites without it and counted 60.
- Renovate's behaviour on this repository beyond its onboarding PR, and its options page past the first third.
- The private VM records and the reviewers' reports under `private/`, beyond a grep for H-7.
