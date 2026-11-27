# Decisions on tests, CI and repository settings, round two

Second round for group D of [`../plans/2026-11-27-finish-and-release.md`](../plans/2026-11-27-finish-and-release.md). It re-measures what [round one](2026-11-27-decisions-tests-ci-repo.md) rests on and closes what it left open. Run on 2026-11-27 at `v9.1.0` (`6596e807`) and at `1191300a`, in throwaway worktrees since removed. Nothing in the product, the workflows or the GitHub settings was changed. Every claim is labelled run, read or inferred.

Evidence, outside git, is in `private/research/2026-11-27-decisions-round-2/tests-ci-repo/`: the CI script and its output (`ci-failures.mjs`, `ci-job-attempts.json`, every failed job log), the two preloads (`sync-lag-preload.cjs`, `fs-lag-preload.cjs`), the loop runner (`loop.sh`), two patches, the ruleset JSON and both updater configs.

## Summary

| ID | Round one | Round two | When | Confidence |
|---|---|---|---|---|
| F-TEST-1 | Replace the busy loop with two scripts that wait for each other's file | Stands, with the script timeout at 10 s, not 30 s | Remediation release | High (run) |
| F-TEST-2 | Leave the entries, and use a sibling temp folder if ever cleaned | Stands. The count is 61 entries and 11 MB with the gateway entry, not 124 and 38 MB. Every one is a test's. No product code leaks in real use, apart from one file on an RPC the UI never calls | Never, or remediation release | High (run) |
| F-TEST-3 | Require Windows and Intel Mac once F-TEST-13 has a cause | Stands, with changes. F-TEST-13 now has a cause, slow disk I/O against a 2 s wait, and a one-line test fix. Fix it and one new Windows flake first, pin the checks to GitHub Actions, keep "up to date" off. A merge queue is not available here | After 9.1.0, in the remediation release | Medium-high |
| F-TEST-4 | Run H-7 in the end pass | Stands. It is already VM-24 of the 9.1.0 checklist | End pass | High |
| F-TEST-5 | Settings after 9.1.0, lean to Renovate | Timing stands. The updater lean is overturned to Dependabot. The tag ruleset needs a creation rule, which does not stop `npm run release`. A new risk outranks all four settings: any app with write access can push to `main` | After 9.1.0, ruleset changes first | Medium on the updater, high on the rulesets |
| F-DOCS-1 | 7 done, 2 not done, 8 only the owner knows | Stands, with a change. The 9.1.0 checklist written after round one already carries each open step. Nine steps remain for him, and three can be retired | End pass | High |

## F-TEST-1: route scripts side by side

1. **Re-measure.** Confirmed. With the product's slot choice forced to the first slot, the current test passed 3 of 3 runs (run). It cannot see a serial runtime.
2. **Unknowns.** I built the real test in a worktree at `v9.1.0`. Each script writes its own flag, then loops on `await api.fs.exists(theirs)`. That changes 9 lines and removes 6 in `route-script-runtime.test.mjs` and nothing else (`f-test-1-clockless-parallel-test.patch`).
   - Plain runs: 50 of 50 passed, slowest 99 ms (run).
   - Timer-lag preload, 10 runs each: `LAG_MAIN=50`, `LAG_WORKER=50`, both at 200, `LAG_WORKER_START=1500`, and a mix. 50 of 50 passed. The slowest was 1.6 s, with a 1.5 s worker start (run).
   - Mutant (`nextSlot()` returns `slots[0]`): failed 3 of 3, each after 30.0 s, the script timeout (run).
3. **Size.** One test body, +9 / -6. No product change and no broken test.
4. **Attack.** With the 30 s timeout, a regression costs 30 s of a CI run before it fails. The slowest pass under every lag I tried was 1.6 s, so 10 s keeps a wide margin and fails faster (inferred from the runs). Nobody is worse off. The test needs `api.fs` and a temp folder, and it removes its folder.
5. **Outside facts.** None needed.
6. **Verdict.** Stands, with `timeoutMs: 10_000`. Remediation release. High confidence. I would change my mind if a CI runner showed a pass over 5 s.

## F-TEST-2: entries left in the temp folder

1. **Re-measure.** Corrected. A full `npm run test` at `v9.1.0` under `env -i` with its own `HOME`, `TMPDIR` and `LLMR_TEST_GATEWAY_ENTRY` set, as CI runs it, left **61 entries and 11 MB** (run, 91 s). The 124 and 38 MB of the delivery index did not reproduce on this Mac. Five Codex wire tests in `october-issues-wire.test.mjs` failed with 502 "Failed to reach upstream provider". CI passed them at `v9.1.0`, so I take this to be this session's network sandbox (inferred, not proven).
2. **Writers (read, each name traced to its `mkdtemp`).**
   - 20 `llmr-context-archive-<uuid>.sqlite`, from `test/unit/agents/context-archive.test.mjs:36`.
   - 29 `llmr-runtime-*`, from `test/integration/agents/codex-cli-middleware-runtime.test.mjs`. The four bot runtimes are about 330 KB each.
   - 7 from `shell-rc-path-block.test.mjs`, 2 from `service-state.test.mjs`. One each from `codex-app-net-responder.test.mjs`, `provider-probe.test.mjs` and `bot-gateway-env.test.mjs`.
   - Node's own `node-compile-cache` (1.9 MB).

   Every entry is a test's. **No product file appeared.**
3. **Product code that writes to the temp folder (read).**
   - `usage/store.ts:955`. A copy of the request log database, removed in the `finally` of its only caller (`:602`).
   - `media/executors.ts:129` and `:353`. A media download or decoded image, removed in `importResult`'s `finally` (`media/service.ts:479`).
   - `electron/src/main/ipc.ts:558`. The export folder, removed in a `finally`.
   - `proxy/service.ts:1667`. A `.command` installer script for the proxy CA, **never removed**. One small file per call, macOS only, and it holds no secret. Only the management RPC `installProxyCertificate` reaches it. No UI code calls that RPC (read, `rg`).

   So nothing leaks in real use. The one leak is on a path no screen offers.
4. **Attack.** The disk cost is a developer's only. Round one's option (c), a sibling temp folder, still beats putting `TMPDIR` in the home, for the socket path limit it measured.
5. **Outside facts.** None new.
6. **Verdict.** Stands. Leave them. Fixing the CA installer file is one `rmSync` after `open` returns, or a file under the app's own data folder, and it can wait for the proxy UI to return. High confidence.

## F-TEST-3: Windows and Intel Mac as required checks

1. **Re-measure.** Run over every Tests run from 2026-11-25 to now: 172 runs and 806 job attempts, per job and per attempt. Since 2026-11-26:

   | Job | First attempts failed, pull requests | Push to `main` | Reruns that failed |
   |---|---|---|---|
   | Unit and architecture (required) | 2 of 35 | 3 of 70 | 0 of 6 |
   | Unit (Windows) | 4 of 35 | 4 of 69 | 0 of 6 |
   | Unit (Intel Mac) | 0 of 35 | 1 of 67 | 0 of 6 |

   On pull requests, Windows fails about as often as the Linux job that is already required. Round one's "8%" for Windows is confirmed (8 of 104).
2. **F-TEST-13 has a cause (run).** In the log of job `140284993396` (attempt 1, no rerun), the first test timed out in its **first** `waitFor`. That is the first synchronizer's start and one replay of one bundle. The second test timed out in its **second** `waitFor`, after `scanSourcesSoon`. I mapped both through the compiled bundle built at `1191300a`, whose lines match the log's.
   - The timer-lag preload cannot find this. Both tests passed 20 of 20 plain and 10 of 10 under `LAG_MAIN` 50 and 200, at both commits. The path waits on file I/O, not timers.
   - A new preload that slows only `FileHandle.sync()` reproduces it. One test does 33 to 40 fsyncs and 75 to 96 fs calls. With fsync slowed by 120 to 200 ms, both tests fail at both commits, at the same two `waitFor` sites the CI run failed at. At 80 ms they pass.
   - In that CI run, the neighbouring raw-trace tests took 3 to 8 times their median over 15 passing Windows runs. "Inbox and dead letters stay within capacity" took 1960 ms against a median of 202 ms. The whole isolate test took at most 769 ms on a passing run.
   - So the runner's disk was stalled for a few seconds. The product is right, and the 2 s wait is too short for a Windows runner under load (inferred from the runs). The code under test is unchanged between `1191300a` and `v9.1.0`.
   - **Fix:** `waitFor`'s default 2 s becomes 10 s (`f-test-13-waitfor-10s.patch`, one line). Under 120 and 200 ms fsync lag both tests then pass 3 of 3. The file passes 48 of 48 in 3.8 s, and no test waits for `waitFor` to time out (run, read).
3. **What a required Windows job would have blocked.** Every distinct failing test since 2026-11-26 on the two platform jobs, with its count:

   | Test | Job | Count | Event |
   |---|---|---|---|
   | recent issues: production HTTP, tool replay, logs and usage SQLite | Windows | 3 | PR, PR, push |
   | a request for a model no provider has gets one Logs row and one usage event (compat, single) | Windows | 2 | push, PR |
   | one request through the pipeline stores the same cost and source | Windows | 1 | PR |
   | #1850/#1861 fallback attribution reaches OpenAI JSON/SSE clients | Windows | 1 | PR |
   | no file under the data folder holds the login (compat) | Windows | 1 | PR |
   | a single-layout Logs row appears within 1500 ms (replaced by PR 179) | Windows | 1 | PR |
   | the two raw-trace tests (F-TEST-13) | Windows | 1 each | push |
   | a --no-gateway start and a save both write the retention ... | Windows | 1 | push, at `v9.1.0` code |
   | built ToolHub MCP runtime survives a backend that closes its stdin | Intel Mac | 1 | push |

   Five of the nine failed runs were pushes to `main`. A required check never gates those, since it gates merging a pull request. Four PR runs on three branches (PRs 164, 170, 178) would have been blocked until a rerun or the next commit, and each went green that way (run). Since 2026-11-25 every rerun of every job passed.
4. **Outside facts (read, current docs and API).**
   - `MergeStateStatus.UNSTABLE` is "Mergeable with non-passing commit status" (run, GraphQL introspection). Round one confirmed a second way.
   - **Merge queue is not available here.** GitHub's gated-features text says merge queues are available "in any public repository owned by an organization". This repository is owned by a user (`owner.type` is `User`, run). For one person the queue also adds nothing that rerunning a red job does not.
   - "Strict" ("Require branches to be up to date") is the UI's default. Here it is off. Since 2026-11-24, `main` took 97 direct pushes and 30 PR merges (run, `git log --first-parent`). Strict would put nearly every open PR at `BEHIND` after each docs push, for a full rerun each. Keep it off.
   - The platform jobs report as `🧪 Unit (${{ matrix.display_name }})`, so the required names are `🧪 Unit (Windows)` and `🧪 Unit (Intel Mac)` (read). No test pins those names, or the three already required.
   - `continue-on-error` cannot creep in. `tests/architecture/workflow-permissions.test.mjs` already forbids it on the job (read).
5. **Attack.** Who is worse off? The owner, at about one rerun every nine PRs. Do nothing? Then red PRs keep merging as `UNSTABLE` and auto-merge never waits. A third option is to require Intel Mac alone now, since it failed 0 of 35 on PRs.
6. **Verdict.** Stands, with changes, in this order in the remediation release. First the 10 s `waitFor`. Second, a fix to the retention test's last assertion: it should wait for the page, not the database (see New findings). Third, add both contexts to the ruleset, hardened as F-TEST-5 says. Medium-high confidence. I would hold Windows back if the next 50 PR runs fail it more than about 10% after those fixes.

## F-TEST-4: H-7, the Claude Desktop check

1. **Re-measure.** Confirmed. No record shows it was run (read).
2. **Unknowns.** The 9.1.0 checklist, committed after round one (`3c93cf85`), already holds it as **VM-24**, "Claude Desktop gets an answer through the gateway". Its "Dropped" table says "Only H-7 remains, as VM-24" (read).
3. to 5. Nothing to size and no third party. Nobody is worse off.
6. **Verdict.** Stands, and is already planned. High.

## F-TEST-5: repository settings and the updater

1. **Re-measure (run, `gh api`).** Confirmed, as of today:
   - `sha_pinning_required` is `false`. Merge, rebase and squash are all allowed.
   - Only the branch ruleset exists. `automated-security-fixes` is off and alerts are on. One alert is open (144, `minimatch`).
   - `allowed_actions` is `all`.
   - The `release` environment holds the five Apple secrets, with one deployment policy: tag `v*`.
2. **The tag ruleset.** `release.yml` starts on any pushed `v*` tag. Its `macos` job takes the `release` environment, whose only rule is that tag policy (read). So whoever creates a `v*` tag gets the signing secrets and a published release. The last job runs `gh release edit --draft=false --latest`, and the updater reads `latest*.yml`.
   - The plan's step 6 says "Do not add a `creation` rule. The release script pushes tags." That reason does not hold. `scripts/release.mjs:128` pushes as the owner (`git push --atomic origin main vX.Y.Z`). The owner is the only collaborator (run) and is Admin. With `bypass_mode: always` a bypass actor is not stopped, and GitHub's docs say "only users with bypass permissions can create" a tag under "Restrict creations" (read). The release script already bypasses the main ruleset the same way.
   - `release.yml` never creates a tag. `gh release create` runs with `--verify-tag` (read).
   - The JSON (`tag-ruleset.json`). It is the plan's JSON plus two rules, `creation` and `update`:

     ```json
     {"name": "tags: only the owner creates or moves a release tag", "target": "tag", "enforcement": "active",
      "conditions": {"ref_name": {"include": ["refs/tags/v*"], "exclude": []}},
      "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
      "rules": [{"type": "creation"}, {"type": "update"}, {"type": "deletion"}, {"type": "non_fast_forward"}]}
     ```

   - **Test without a release** (`tag-ruleset-dry-run.json`). No workflow starts on a tag outside `v*` (read), so use `rstest-*`. Create the same rules on `refs/tags/rstest-*` with no bypass actor. `git push origin HEAD:refs/tags/rstest-1` must be refused. Add the Admin bypass, and the same push must pass with a "bypassed rule" notice. Delete the tag and the test ruleset. `gh api repos/jrmatherly/llm-router/rulesets/rule-suites` lists each evaluation. After the next real release, the same listing shows the tag push as bypassed. Not run here, since it changes settings.
3. **A risk neither round named, about who may satisfy the required checks and push to `main` or create a release tag.** **Fixed on 2026-11-27, on the owner's word**: the required checks are pinned to the GitHub Actions app and a tag ruleset restricts who creates or moves a `v*` tag. The detail and the evidence were kept outside the repo while it was open, in `private/research/2026-11-27-decisions-round-2/tests-ci-repo/ruleset-risk.md`. The fix is two ruleset changes and no code. It should be applied before any of the four RS-5 settings.
4. **The `copilot` environment.** Created 2026-10-28T19:32:12Z, with no secrets, no variables, no deployments and no protection rule (run). Nothing in `.github/` references it (read). One second before, GitHub ran the repository's only `dynamic` run, "Code scanning AI findings on PR #45", by `github-advanced-security[bot]`. Its steps include "Prepare Copilot" (run). So GitHub's Copilot-based code scanning agent made it (inferred from the timing). GitHub's current page says Copilot secrets in a `copilot` environment "have been automatically migrated" to the repository-level Agents type. Copilot's agent does not read Actions secrets (read). It holds nothing, so it exposes nothing. Deleting it or leaving it are both fine. Delete it only if Copilot code scanning is not wanted.
5. **Updater: Renovate or Dependabot (read, current docs and source).**

   | Need | Dependabot | Renovate (Mend app) |
   |---|---|---|
   | npm release-age wait | `cooldown`, 3-day default, `default-days` and `semver-major-days` (options reference) | `minimumReleaseAge`. Needs `internalChecksFilter: strict` and `prCreation: not-pending` to hold PRs back. `config:recommended` sets none (preset source) |
   | `allowScripts` pins (`esbuild@0.28.2` and three more) | Not updated | Not updated. `postUpgradeTasks` is self-hosted only |
   | Action SHA pins | Yes | Yes |
   | `ARG ...NODE_IMAGE=...@sha256:` lines | **No.** The parser matches literal `FROM` lines only (`file_parser.rb` at `main`). Issue 2057 "Add global ARG support for Dockerfiles" is open | Yes, it expands `ARG` (its Dockerfile manager docs) |
   | `.node-version` | No ecosystem | Yes (`nodenv`) |
   | Who holds write access | GitHub itself | A third party, with Code, Workflows and statuses write |

   - **Both tools fail the same way on `allowScripts`.** I set `esbuild`'s pin to an older version in a worktree. `npm install-scripts ls` then listed the unreviewed script and **still exited 0** (run). npm's docs say install commands "silently skip lifecycle scripts" not in `allowScripts`. A bump of any of the four packages therefore merges green with its install script skipped. Each config below puts the four in their own group, so the hand step (`npm install-scripts approve <pkg>`) is visible.
   - **Drafts, not applied.** `dependabot.yml` keeps the four entries, adds a 2-day cooldown (7 for majors), a group for the four packages and minor-and-patch-only npm groups, so each major gets its own PR. It still passes the architecture test's regex (run). `renovate.json` covers the same points, plus Docker and `.node-version`. Its 2 days match `min-release-age=2` in `~/.npmrc` (run). CI has no such setting (`.npmrc` holds only `install-links`).
   - **Which is less risk.** Dependabot. Renovate's extra coverage is two items that change a few times a year: the `ARG` digests, which `dockerfile.test.mjs` keeps pinned, and `.node-version`, which holds `24`. Its cost is a standing third-party write grant on a repository that signs releases. If Renovate is chosen, the two ruleset changes above come first.
6. **Verdict.** The timing stands: none of it gates 9.1.0. The lean to Renovate is **overturned**. Run Dependabot version updates with the draft config, close PR 168 and uninstall the Renovate app. Do the two ruleset changes (integration id, then the tag ruleset with `creation` and `update`) before or with that. Squash-only and SHA pinning stay as round one said. Medium confidence on the updater, which is a judgment about trusting a third party, high on the rulesets. I would choose Renovate if the owner wants Docker digests updated for him and accepts the app once the rulesets are in place.

## F-DOCS-1: the owner steps

1. **Re-measure.** Confirmed what the repository shows. The two earlier VM passes (2026-11-20 on 8.0.0, 2026-11-24 on 9.0.0) were both on one macOS arm64 VM (read). Neither ran the Chrome extension, Copy Link, launch at login, a real `codex login`, Windows or Linux. The 8.0.0 record lists "Auto-update from 7.2.2 to 8.0.0" as not done (read). No memory note records any of these steps as run (read, grep).
2. **What changed.** The 9.1.0 checklist maps each open step to a check. Jason answers from its Results table. What each one guards:

   | Step | Checklist id | Guards against |
   |---|---|---|
   | H-7, Claude Desktop through the gateway | VM-24 | A preflight that refuses Claude Desktop, so the user sees a network error |
   | EU-2 macOS: launch at login, Copy Link, PNG export, tray | VM-37 | Electron 45 API changes that only a packaged app shows |
   | CG-7, a real Codex login refreshed after expiry | OFF-3 | An expired ChatGPT login that fails instead of refreshing |
   | DH-2, the Chrome extension import | OFF-4 | A broken browser-login import |
   | DH-1, the Windows home page | OFF-5 | The IPC sender check failing closed on Windows, so every screen is empty |
   | EU-1 and EU-2, Windows install | OFF-6 | A Windows package that does not install or start |
   | EU-2, the Linux AppImage | OFF-7 | A Linux package that does not start |
   | RS-5 steps 1, 3, 4, 6 | settings, not a VM check | See F-TEST-5 |
   | RS-5 additions from this round | settings | The two ruleset gaps above |

   The checklist already drops three, each with a reason that holds (read). Jason can retire them:
   - CG-9, the proxy curls. 9.1.0 has no control that reaches it.
   - HP-2, a provider from a deleted preset. It needs a 7.2.2 install and is covered by `providers.test.ts`.
   - Auto-update from 7.2.1. Two majors old.
3. to 5. Nothing to size. No outside facts.
6. **Verdict.** Stands, with a change. The list is now the checklist rows above. Record the results at the end pass. High.

## New findings

- **N-1. The required checks can be satisfied by more than the Actions workflow.** Detail outside the repo, as in F-TEST-5, point 3.
- **N-2. A new Windows flake at release code.** "a --no-gateway start and a save both write the retention, and a locked log database does not hold a save up" failed once on Windows at `94dadde2`, which is `v9.1.0` code. It got 3 where `undefined` was expected, at its last `assert.equal(applied.retentionRequestedDays, undefined)` (run, log). It waits for the database to hold 3 and then reads the page at once. `RequestLogRuntime.list` reports `retentionRequestedDays` until the writer's acknowledgement updates `savedRetentionDays` and the query worker reads 3 (read, `request-log-runtime.ts:333`). The fix is a `waitFor` on the page. On screen, the product shows "requested" for that short window (inferred).
- **N-3. `npm install-scripts ls` exits 0 with unreviewed scripts.** A CI step that compares its output to "No packages with unreviewed install scripts." would catch a skipped install script that today passes silently (run).
- **N-4. The CA installer script is never removed** (`proxy/service.ts:1667`). Reachable only by RPC (read).
- **N-5. A preload that slows fsync** finds the F-TEST-13 class of fault, which the timer-lag preload cannot (run). It is the lever for the remaining raw-trace and request-log waits.

## Still not checked

- The fixes on a Windows runner. The 10 s `waitFor` and the F-TEST-1 test ran only on this Mac with preloads. Running them on Windows needs a pushed branch, which this round may not do.
- Whether the main ruleset change and the tag `creation` rule behave as the docs say. Both need a ruleset change. The `rstest-*` dry run above would settle the second.
- The Renovate app's actual installation scope and permissions. `user/installations` needs a GitHub App token (run, 403). The Renovate settings page for this repository would show them.
- What a job-level `continue-on-error` shows as its own check. It is moot, since a test forbids it.
- Neither draft updater config has run. A Dependabot run shows in Insights, Dependency graph, Dependabot. Renovate has its own validator, which I did not download.
- The five Codex wire failures in my full run. I take them to be this session's sandbox, not checked.
- 124 entries on the machine that measured them. I could not reproduce the count.
