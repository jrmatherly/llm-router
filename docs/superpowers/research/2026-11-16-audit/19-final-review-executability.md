# Final review: executability dry run

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Its confirmed findings were applied to the plans before they were committed. Paths under `<session scratchpad>` no longer exist.

---

The owner wants the eight audit-remediation plans checked once more before they are committed. My lens was executability: would an engineer who runs every step literally get the results the plans predict?

**Verdict:** The plans are executable as written, except one step whose expected output is wrong (RS-3). There are also four small defects in test code or expected messages that would cost a round of rework.

## Findings

**1. Release safety, RS-3 Task 3.1 Step 5 | causes rework**
- **Problem.** The step runs `node scripts/release.mjs patch --dry-run` before the commit, which only happens in Step 7. At that point the branch has no commits, so `HEAD` is still the tip of `main`. That commit already has a Tests run, because `test.yml:3-6` runs on every push to `main`. `testsRunFailure` therefore returns `undefined`, and the expected `no Tests run for HEAD` is never printed.
- **Evidence.** `scripts/release.mjs:68` reads `HEAD` with `git rev-parse HEAD`. Step 5 comes before Step 7.
- **Fix.** Move Step 5 after the commit in Step 7 and do not push. Use this expectation: "Expected: exit code 1 and one line that contains `not on main`, `main is not at origin/main` and `no Tests run for HEAD`."

**2. Desktop hardening, DH-1 Tasks 1 to 3 and the deep-link and update-status steps | minor**
- **Problem.** Five expectations say the build fails with `Could not resolve "@llmr/electron/main/<x>.ts"`. The real message is different. When no candidate file exists, `resolvePackageImport` in `build/test.mjs:211-230` returns the bare path anyway, so esbuild stops with "Cannot read file".
- **Evidence.** I reproduced it in a scratch build with the same plugin shape. Output: `✘ [ERROR] Cannot read file: packages/electron/src/main/nope.ts`. The five lines are `desktop-hardening.md:114,184,304,405,561`.
- **Fix.** Replace each with: "Expected: the build fails with `Cannot read file: …/packages/electron/src/main/<x>.ts`."

**3. Release safety, RS-1 Task 1.2 Steps 1 and 2 | minor**
- **Problem one.** The test code calls `jobBlocks`, but the plan describes it only in prose and never gives its code.
- **Problem two.** Step 2 says the first failure is `jobs.get("gateway")` for `test.yml`. The first test in the file actually fails earlier, on `jobs.get("test")` not matching `needs: gateway` in `release.yml`.
- **Fix.** Add the helper code:
  ```js
  function jobBlocks(file) {
    const text = readFileSync(file, "utf8");
    const body = text.slice(text.indexOf("\njobs:\n") + 7);
    const starts = [...body.matchAll(/^  ([a-z0-9_-]+):$/gm)];
    return new Map(starts.map((m, i) => [m[1], body.slice(m.index, starts[i + 1]?.index)]));
  }
  ```
  Reword the Step 2 sentence to name the `release.yml` assertion.

**4. Core gateway, CG-3 Tasks 2 and 3 | minor**
- **Problem.** The test code uses `chmodSync` (Grok test) and `symlinkSync`, `lstatSync` and `readdirSync` (shell rc test). Neither file imports them today, and the plan does not say to add them. The tests would fail with a ReferenceError instead of the failure the plan predicts. Task 1 of the same PR does say to add `readdirSync`, so this is an inconsistency.
- **Evidence.** `local-agent-provider-grok.test.mjs:2` and `shell-rc-path-block.test.mjs:2`.
- **Fix.** Task 2: "Add `chmodSync` to the `node:fs` import." Task 3: "Add `lstatSync`, `readdirSync` and `symlinkSync` to the `node:fs` import."

**5. Tooling, TL-2 Task 1 Step 4, and Core gateway, CG-6 Task 2 | minor**
- **Problem one.** TL-2's count of 35 errors in 12 files was measured at `136ad730`. The index runs TL-2 in Wave 5, after HP-2, CG-6 and DH-1 have added test code that no one has type-checked.
- **Problem two.** CG-6's new `layout.test.tsx` test uses the `PluginMarketplaceEntry` type, but `layout.test.tsx:1-10` does not import it. esbuild ignores this. Once TL-2 adds the test files to the type check, it becomes TS2304.
- **Fix.** In CG-6, add `import type { PluginMarketplaceEntry } from "@llmr/core/contracts/app.ts";`. In TL-2 Step 4, add: "Errors in tests added by earlier audit PRs are expected; fix them in Task 2."

**6. Upstream leftovers, UL-1 Task 1 Step 2 | minor**
- **Problem.** The step adds `"    TZ: process.env.TZ || '',"` to the `env` object that `writeFakeClaudeCli` writes. The last entry of that object (`LLMR_CLAUDE_CODE_MCP_CONFIG`, at `codex-cli-middleware-runtime.test.mjs:1501-1505`) has no trailing comma. Appending the new line after it gives the fake CLI a syntax error.
- **Fix.** Say "insert it before the `ANTHROPIC_MODEL` line."

## Unverified suspicions

1. **CG-4 Task 1.** The second new test mocks `Date`, which leaves `persistedApiKeyCache.loadedAt` about 6 s in the future. `now - loadedAt` is then negative, so the cache counts as fresh for any test that runs after it. This is harmless only if the two tests go at the end of the file. To settle it, check where they land, or add "append at the end of the file" to the plan.
2. **EU-1 Task 2.** If someone runs the old `test:e2e` between Task 1 and Task 3, the sidecar script recreates `node_modules/better-sqlite3/build`, and the first new packaging test fails. To settle it, check whether `scripts/prepare-electron-sqlite.mjs` creates `build/Release` under 13.2.0.

## Checked and sound

- **ST-1 runtime move.** I rebuilt the base runtime and got hash `e35ead7b…f1` and 301916 bytes, matching the plan. The extraction command passes `node --check` and gives 7,343 lines. A scratch wrapper using the `.runtime.cjs` text loader produces the identical hash. `tsc` accepts the default import from `.d.cts` (exit 0).
- **esbuild failing-first claims.** "No matching export" stops the build for imports from `.ts` and `.mjs` files, and from `.ts` tests too. This confirms the claims in CG-2, CG-4 and RS-3.
- **DH-1 codemod.** `^ipcMain.handle(` appears 80 times. The `webPreferences` check reads 13 blocks, and all 13 set the three flags. Only `ipc.ts` and `built-in-browser.ts` register IPC handlers.
- **HP-1.** The referral `git grep` at HEAD hits exactly the sites the plan lists. The Kimi preset comes first in `providerPresets`, so it is the first link the new test reports.
- **RS-2 Task 2.1.** The merge script's messages, exit codes and line 35 match the planned tests.
- **RS-1 and RS-4.** The test regexes fit the real YAML indentation of `test.yml`, `release.yml`, `docs.yml` and `dependabot.yml`.
- **`gh` flags.** The installed `gh` 2.104.0 has every flag the plans use: `run list --commit`, `release create --verify-tag --draft`, `release edit --draft=false --latest`, `release delete --cleanup-tag`, and `pr checks --watch`.
- **CG-3 Tasks 1 and 3.** The helpers and exports the tests call exist. The regex replacer argument order and the failing-first behaviour of `ensurePathBlock` match the plan.
- **CG-4 Task 1.** `listApiKeys` can be mocked, because `loadPersistedApiKeys` calls `configRepository.listApiKeys`.
- **CG-6.** Entry names fall back to the plugin id. The dialog renders under `renderToStaticMarkup`. The disabled-button regex matches React's `disabled=""` output.
- **UL-1 and UL-2.** The helpers exist: `withGlobalClaudeProfileRelease`, `evaluateRuntimeFunction`, and the dependencies of `resolveConfigDir`. The `parseCodexBotWorkerOptions` fallback to `"Codex"` matches the plan.
- **TL-1.** The `DEFAULT_CHECKS` line and the test-file imports match what the new tests quote.
- **EU-1.** The Task 3 grep's starting state at HEAD is consistent with what Tasks 2 and 3 remove.

**Dry-run coverage.** I covered RS-1 to RS-4, HP-1 to HP-3, CG-1, CG-2 Task 1, CG-3, CG-4, CG-6, CG-9, UL-1, UL-2, TL-1, TL-2, ST-1, DH-1 Tasks 1 to 3, and EU-1 Tasks 2 and 3. I did not reach EU-2, DH-1 Task 4 onward, DH-2, DH-3, ST-2 to ST-5, CG-5 (the fake SSE server), the CG-7 test details, or RS-5. Scratch experiments are in `<session scratchpad>/final-review-executability/`. I edited no repo files.
