# Audit remediation: lint and test type-checking implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a linter that runs in the commit gate and in CI, and make `npm run typecheck` cover the TypeScript test files, so unused code and stale test fixtures fail a check instead of sitting unnoticed.

**Architecture:** Biome runs as a linter only, from one root `biome.json`, through one `npm run lint` script that the commit gate and the Tests workflow both call. The root `tsconfig.json` gains the test globs, so the existing typecheck step covers tests with no new command. Each PR fixes every diagnostic its new check raises, so the check is green on the day it lands.

**Tech Stack:** Biome 2.6.x (`@biomejs/biome`), TypeScript 6.0.3, `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`. This plan fixes F-F1, F-F2 and F-F3 under decision D-6. The program index is `docs/superpowers/plans/2026-11-16-audit-remediation-index.md`.

## Global Constraints

From the spec, verbatim:

- Node `>=24`. npm only, never pnpm or yarn. Regenerate lockfiles with npm; never edit them by hand.
- Code goes through a branch and a squash-merged PR. Docs-only changes commit straight to `main`.
- The commit gate runs `npm run typecheck` and `npm run test:architecture`. Both must pass on every commit.
- Never `import()` the `ai-gateway` package or run it in-process in a test or script. It starts a server on `*:3000` that never exits. The one exception is the two wire test files in F-A3. They spawn the gateway bin as a child process that the test owns, and RS-1 runs them. The release safety plan's workstream constraints say how they start and stop it.
- Never run `npm run rebuild:sqlite3` locally.
- `npm run build:assets` and `npm run test:e2e` may rewrite `packages/core/models.json` and `packages/ui/src/generated/`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended.
- Style: double quotes, semicolons, two-space indent, `node:` imports first, `type` aliases unless the file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. Run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<kind>/<path>.test.js`.
- The project has no consumers as of 2026-11-16 (decision D-9). No fix adds a compatibility shim, a migration for existing installs, or a deprecation period.
- A rule and the check that enforces it change in the same PR.
- This machine's `~/.npmrc` sets `min-release-age=7`. A package version younger than seven days does not install without an override, which is an owner step.

Specific to this plan:

- D-6 binds. Biome lints only. `formatter.enabled` and `assist.enabled` stay `false`. Do not turn on import sorting, `useSortedKeys` or `useConsistentTypeDefinitions`. Do not run `biome format` or `biome check --write`.
- Never run `biome lint --write --unsafe` without `--only`. Measured on a scratch copy, the blanket form renames unused names to `_name`, rewrites `void` to `undefined` in callback types, and swaps `innerText` for `textContent`. All three are wrong here.
- No `biome-ignore` comment lands in this plan. Each diagnostic is fixed, or its rule is off in `biome.json` with the reason in this plan.
- The machine's npm has `min-release-age=7` (`npm config get min-release-age`). Pin Biome to the newest version published at least 7 days before the install.
- Read a file with Read before editing it. The path-scoped rules in `.claude/rules/` load only on Read, Edit and Write.
- The Codex OAuth probe defect (spec F-C12) belongs to CG-7 in the [core gateway plan](../2026-11-16-audit-core-gateway.md). Do not touch `packages/core/src/providers/probe.ts` here.

## Order

- TL-1 lands after the PRs that delete or move much code: CG-1 in the [core gateway plan](../2026-11-16-audit-core-gateway.md), UL-1 and UL-2 in the [upstream leftovers plan](../2026-11-16-audit-upstream-leftovers.md), and HP-2 in the [presets and hygiene plan](../2026-11-16-audit-hygiene-and-presets.md). The [program index](../2026-11-16-audit-remediation-index.md) lists CG-1 and UL-2 as its dependencies. Lint fixes on lines about to be removed are wasted, and each of those PRs shifts the diagnostic list. If TL-1 has to land earlier, nothing breaks. Later PRs then run `npm run lint` like any other check.
- ST-1 in the [structure plan](../2026-11-16-audit-structure.md), which moves the Codex runtime into a real `.cjs` file (D-7), puts 7,348 lines in front of Biome for the first time. Biome does not lint that file. If ST-1 merged first, TL-1's `biome.json` carries `"!packages/core/src/agents/codex/*.runtime.cjs"` in `files.includes` from the start. If TL-1 merged first, ST-1 adds that entry in its own PR. Nobody edits the script to satisfy lint, because the emitted script must stay byte-identical across ST-1.
- TL-2 is independent of every other plan and of TL-1.
- TL-1 and TL-2 share 11 fixes: the unused `React` import in 10 UI component tests and the missing assertion in `share-cards.test.tsx`. Whichever lands second finds them done. The counts below assume neither has landed.

## Review Focus

1. Biome sees a different file set in the real repo than in the trial. The trial ran on a copy with no `.git`, so `vcs.useIgnoreFile` and the nested `docs/.gitignore` are untested. TL-1 Task 1 Step 3 measures it before any fix.
2. A newer Biome adds or changes recommended rules. The architecture test in TL-1 Task 3 pins the `$schema` version to the installed version, so a bump without a config review fails the gate.
3. A contributor lowers the lint check to pass a commit, by dropping it from the gate or from CI. TL-1 Task 3 pins the gate's default checks and the workflow step.
4. Adding the missing `protocol` field to a probe fixture changes what `providers.test.ts` exercises, and an assertion may fail. TL-2 Task 2 Step 5 says what to do then.
5. Someone removes the test globs from `tsconfig.json` and tests go unchecked again. TL-2 Task 1 pins them.

---

## TL-1: adopt Biome for linting

**Fixes:** F-F1, F-F2.
**Depends on:** CG-1 and UL-2, for ordering only (see Order). Nothing breaks if it merges earlier.
**Branch:** `chore/biome-lint`
**Size:** M
**Owner steps:** None.

**Status:** Merged 2026-11-18 as [PR 105](https://github.com/jrmatherly/llm-router/pull/105), squash commit `e0ae98b7`. It installs Biome 2.6.8, which was past the machine's two-day release cooldown. `npm run lint` checks 825 files and exits 0, with no `biome-ignore` comment. The three gate checks take 14 s together.

The real repo did not match the trial under Evidence. It gave 163 diagnostics, not 48, because Biome 2.6.8 reads file types the trial's copy did not hold:

- About 100 were `noUnusedImports` and `noUnusedVariables` in `*.astro`. Biome reads the frontmatter and does not see the template.
- 4 were `noUnknownProperty` on an Adobe export attribute in vendor `*.svg` icons.
- 22 came from code written after the trial: 21 more `noAdjacentSpacesInRegex` hits and one `[^]` regex.
- TL-2 had already made the 11 shared fixes, so Task 2 Step 3 had nothing to do.

`biome.json` differs from Task 1 Step 3. It keeps the `files.includes` list as written and adds an `overrides` block, each entry turning off one rule where it misfires:

| Files | Rule off | Reason |
|---|---|---|
| `**/*.astro` | `noUnusedImports`, `noUnusedVariables` | Biome does not see the template. |
| `**/*.svg` | `noUnknownProperty` | Vendor exports. |
| `docs/public/**`, `extension/chrome/**` | `noRedundantUseStrict` | Classic scripts that Biome parses as modules. |
| `packages/ui/test/integration/providers.test.ts` | `noChildrenProp` | A `React.createElement` call in a `.ts` test whose component type requires `children`. |

One "safe" fix was wrong. `biome lint --write` deleted `"use strict"` from `docs/public/llmr-provider-buttons.js`. Other sites load that file with a plain `<script>` tag, so the directive does work there. The fix was reverted, and `AGENTS.md` now says to read the diff of a `--write` run.

The review of PR 105 found no behaviour change in any fix and no weakened test. It changed these points:

- The first version excluded `*.astro`, `*.svg` and `docs/public` outright and turned `noChildrenProp` off everywhere. The overrides above replaced that, which raised the checked files from 772 to 825.
- Nothing failed when `biome.json` was hollowed out. `tests/architecture/package-scripts.test.mjs` now plants a defect in `packages/core/src` and expects lint to name three rules. It fails with `"!packages"` in the includes, with `preset: "none"` and with the `suspicious` group off.
- The CI check in Task 3 Step 1 matched a commented-out step. It now requires the whole step inside the `test` job.
- The gate test in Task 3 Step 1 pinned `DEFAULT_CHECKS` as source text. It now runs the gate in a temporary repo and checks the order and that a failing lint blocks the commit.
- `fusion-vision-mcp.test.mjs` counts upstream requests after each of its three calls.

ST-1 still has to add `"!packages/core/src/agents/codex/*.runtime.cjs"` to `files.includes` in its own PR, as Order says.

### Evidence

Measured on 2026-11-16 with Biome 2.6.6 on a copy of the 606 tracked JS and TS files at `136ad730`.

- The config below without its last two rule lines gives 58 diagnostics (4 errors, 47 warnings, 7 infos). With `noConfusingVoidType` and `useDomNodeTextContent` also off, 48 remain.
- `biome lint --write` fixes 13 of them. `--write --unsafe` limited to four rules fixes 18 more. 17 need a hand fix.
- `npm view @biomejs/biome@2.6.6 scripts` and the same for `@biomejs/cli-linux-x64@2.6.6` return nothing, so the packages declare no install script.
- `biome lint --help` and `biome ci --help` on 2.6.6 list `--error-on-warnings`, `--write`, `--unsafe`, `--only=<GROUP|RULE|DOMAIN|PLUGIN>`, `--reporter`, `--max-diagnostics=<none|NUMBER>`, and for `ci` also `--formatter-enabled`, `--linter-enabled` and `--assist-enabled`.
- Not measured: a run against the real repo with its `.git`, and `npm ci` with Biome in the lockfile. Task 1 covers both.

### File structure

- Create `biome.json`. The only lint config.
- Modify `package.json` (one devDependency, one script) and `package-lock.json` (npm regenerates it).
- Modify `.claude/hooks/gate-commit.mjs:8` (`DEFAULT_CHECKS`).
- Modify `.github/workflows/test.yml` (one step after `🔎 Typecheck`, line 37).
- Modify `tests/architecture/package-scripts.test.mjs` and `tests/architecture/claude-hooks.test.mjs` (one test each).
- Modify `AGENTS.md` (Commands, Where the standards are enforced, Local checks).
- Modify about 40 source and test files for the 48 diagnostics.

### Task 1: install Biome and measure the real repo

**Files:**
- Create: `biome.json`
- Modify: `package.json` (`devDependencies`, `scripts`), `package-lock.json`

**Interfaces:**
- Produces: `npm run lint`, defined as `biome lint --error-on-warnings .`. Tasks 2 and 3 call it.

- [ ] **Step 1: pick the version**

Run: `npm view @biomejs/biome time --json`
Take the newest stable version whose timestamp is at least 7 days before today. On 2026-11-16 that is `2.6.6` (published 2026-11-06). `2.6.7` (2026-11-11) qualifies from 2026-11-18 and `2.6.8` (2026-11-15) from 2026-11-22. Call the result `<v>`.

- [ ] **Step 2: install it and confirm no install script runs**

```bash
npm install --save-dev --save-exact @biomejs/biome@<v>
```

Add `"lint": "biome lint --error-on-warnings ."` to the root `scripts`, next to `typecheck`.

Then run `rm -rf node_modules && npm ci`, and after it:

```bash
node -e 'for (const p of ["@biomejs/biome", "@biomejs/cli-" + process.platform + "-" + process.arch]) console.log(p, JSON.stringify(require(p + "/package.json").scripts ?? {}))'
npx biome --version
```

Expected: neither `scripts` object has `preinstall`, `install` or `postinstall`, `npm ci` prints no blocked-script notice that names Biome, and the last line is `Version: <v>`. Then `allowScripts` in `package.json` needs no entry. If `npm ci` does name a blocked Biome script, stop and report it. Do not add an `allowScripts` entry without the owner.

`npm ci` also rebuilds the ignored `node_modules` only. Confirm `git status --short` shows `package.json`, `package-lock.json` and nothing else.

- [ ] **Step 3: write `biome.json` and compare the count with the trial**

Create `biome.json` with this content, and put `<v>` in the `$schema` URL:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.6/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**",
      "!**/dist",
      "!**/.test-dist",
      "!**/*.json",
      "!**/*.css",
      "!examples/routing",
      "!packages/ui/src/generated"
    ]
  },
  "formatter": { "enabled": false },
  "assist": { "enabled": false },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "a11y": { "preset": "none" },
      "complexity": {
        "noUselessContinue": "off",
        "useArrowFunction": "off",
        "useOptionalChain": "off"
      },
      "correctness": {
        "useExhaustiveDependencies": "off",
        "useHookAtTopLevel": "off"
      },
      "performance": {
        "noAccumulatingSpread": "off",
        "useDomNodeTextContent": "off"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useImportType": "off",
        "useTemplate": "off"
      },
      "suspicious": {
        "noArrayIndexKey": "off",
        "noAssignInExpressions": "off",
        "noConfusingVoidType": "off",
        "noControlCharactersInRegex": "off",
        "noExplicitAny": "off",
        "noImplicitAnyLet": "off",
        "noPrototypeBuiltins": "off",
        "noTemplateCurlyInString": "off",
        "useIterableCallbackReturn": "off"
      }
    }
  }
}
```

Why each rule is off. This table is the record, since JSON holds no comments.

| Rule | Reason |
|---|---|
| `a11y` group | The UI ships only inside Electron. 15 hits, none reviewed for value. Revisit as warnings later. |
| `noUselessContinue`, `useArrowFunction`, `useOptionalChain`, `useTemplate`, `useImportType` | Style preferences with 10 to 38 hits each and no defect among those sampled. |
| `useExhaustiveDependencies` | The sampled hit (`App.tsx:703`) narrows its dependency list on purpose. |
| `useHookAtTopLevel` | Fires on a class method named `useAdmissionStore` (`request-log-runtime.ts:475`). |
| `noAccumulatingSpread` | Small arrays, no measured cost. |
| `useDomNodeTextContent` | 5 hits in `browser-automation-mcp.ts`. Page snapshots want `innerText`, which returns rendered text only. |
| `noNonNullAssertion` (51), `noExplicitAny` (25), `noImplicitAnyLet` (7) | `tsc --strict` already polices types. These need type-aware review, which D-6 defers. |
| `noArrayIndexKey` | 27 hits on static lists. |
| `noAssignInExpressions` | Fires on the `??=` lazy-init idiom (`media/service.ts:67`). |
| `noConfusingVoidType` | 5 hits, all the "callback may return nothing" union, as in `MaybePromise<GatewayPluginRegistration \| void>` (`plugins/service.ts:221`). Biome's fix to `undefined` would reject callbacks that return nothing. |
| `noControlCharactersInRegex` | A filename sanitizer strips control characters on purpose (`electron/src/main/ipc.ts:651`). |
| `noPrototypeBuiltins` | 15 hits, safe on the plain objects involved. |
| `noTemplateCurlyInString` | 39 hits on shell text and `${VAR}` placeholders. |
| `useIterableCallbackReturn` | A harmless return from `forEach` (`pipeline.ts:857`). |

`examples/routing` is excluded because its files are route-script bodies with a top-level `return`, which is a parse error for a module.

Run:

```bash
npx biome lint --max-diagnostics=none --reporter=summary .
```

Expected, if no other audit PR has landed: 48 diagnostics, as 4 errors, 37 warnings and 7 infos, across the rules in Task 2's tables. Then:

- **Fewer, and the missing ones sit in files another PR deleted or already fixed.** Go on.
- **More, in paths the trial never saw** (an ignored directory, `docs/.astro`, a build output). The ignore handling differs from the trial. Add the path to `files.includes` as a `!` entry and re-run. Do not fix generated files.
- **More, in tracked source, from a rule not in Task 2's tables.** Either `<v>` is newer than 2.6.6 and added a recommended rule, or new code landed. Fix the hits if there are fewer than 10 and the fix is safe. Otherwise turn the rule off, add its row to the table above, and say so in the PR.
- **A configuration error.** Run `npx biome lint --help` and `npx biome migrate --help`, fix the config key the error names, and note the change in the PR.

Also run `npx biome ci --help` and `npx biome lint --help`, and confirm that `--error-on-warnings` appears in both. CI calls `npm run lint`, so no `biome ci` flag is needed. If `--error-on-warnings` is gone, stop and report it.

- [ ] **Step 4: commit**

```bash
git add biome.json package.json package-lock.json
git commit -m "chore(lint): add Biome as a lint-only dev dependency"
```

The gate does not run lint yet, so this commit passes with diagnostics open.

### Task 2: clear the diagnostics

**Files:** the files named in the tables below. Line numbers are from `136ad730`. Trust `npx biome lint` over this list.

**Interfaces:**
- Consumes: `npm run lint` from Task 1.
- Produces: `npm run lint` exits 0.

- [ ] **Step 1: apply the safe fixes**

Run: `npx biome lint --write .`
Expected: 13 files fixed. `git diff --stat` shows about 13 insertions and 15 deletions.

| Rule | Count | Files |
|---|---|---|
| `noAdjacentSpacesInRegex` | 3 | `tests/architecture/ui-build-contract.test.mjs:11`, `tests/architecture/workflow-permissions.test.mjs:11,17` |
| `noUselessEscapeInRegex` | 3 | `packages/core/src/observability/request-log-store.ts:3381`, `packages/core/src/providers/account-service.ts:2290`, `packages/electron/src/main/provider-account-webcontent.ts:256` |
| `noUselessEscapeInString` | 3 | `packages/core/src/profiles/launch-service.ts:1852`, `packages/core/test/support/claude-code-keychain.mjs:114`, `scripts/generate-claude-code-config-options.mjs:351` |
| `noExtraBooleanCast` | 1 | `packages/core/src/observability/request-log-store.ts:2007` |
| `noUselessEmptyExport` | 1 | `packages/ui/src/types/electron.d.ts:1` |
| `useConst` | 1 | `packages/core/src/mcp/grok-media-mcp.ts:178` |
| `noRedundantUseStrict` | 1 | `docs/public/llmr-provider-buttons.js:2` |

Read the diff. The three regex-spacing fixes rewrite `  ` as ` {2}` inside architecture tests, and the three string-escape fixes sit in text that ends up in shell rc files and a keychain helper. Step 6 runs the suites that cover them.

- [ ] **Step 2: apply four unsafe fixes by rule**

```bash
npx biome lint --write --unsafe \
  --only=correctness/noUnusedImports \
  --only=suspicious/noGlobalIsNan \
  --only=complexity/useMathMinMax \
  --only=complexity/noUselessFragments .
```

Expected: 16 files fixed.

| Rule | Count | Files | Why the unsafe fix is safe here |
|---|---|---|---|
| `noUnusedImports` | 13 | `import * as React` in 10 files under `packages/ui/test/component/` (`claude-apps-gateway-login`, `components`, `layout`, `observability`, `onboarding`, `overview-components`, `profiles`, `share-cards`, `tray-components`, `ux-feedback`), `os` in `build/benchmark-request-logs.mjs:4`, `cliSourceRoot` in `build/dev.mjs:11`, `RequestLogPage` in `docs/src/components/interactive/LogsViewDemo.tsx:11` | Tests build with `jsx: "automatic"` (`build/test.mjs:111`), so the `React` binding is unused. |
| `noGlobalIsNan` | 2 | `packages/core/src/proxy/system-proxy-fetch.ts:285,301` | Both arguments come from `parseInt`, so `Number.isNaN` gives the same answer. |
| `useMathMinMax` | 1 | `packages/ui/src/pages/home/components/dashboard.tsx:3636` | `x >= 0 ? x : 0` equals `Math.max(x, 0)` for the integer index involved. |
| `noUselessFragments` | 2 | `packages/ui/src/pages/home/components/profiles.tsx:951,964` | Each fragment wraps one `Field`. |

Two fixes leave untidy text, because the formatter is off. Tidy them by hand: `import type { RequestLogListFilter, } from` in `LogsViewDemo.tsx` loses its trailing comma and space, and `Math.max(initialIndex , 0)` in `dashboard.tsx` loses the space before the comma. Re-indent the two unwrapped `Field` blocks in `profiles.tsx` by one level.

- [ ] **Step 3: add the missing assertion (F-F2)**

File: `packages/ui/test/component/share-cards.test.tsx:34-38`. PR 40 (`d49c2b80`) deleted the test's only assertion on `header` when it removed the `CCR` checks. `SharePosterHeader` (`share-cards.tsx:478-496`) renders the `title` in an `h4` and `productShortName` (`"LLMR"`, `shared/brand.ts:1`) in a `span`.

Rename the test, since "not LLMR" is a leftover of the rename, and assert on the header:

```tsx
test("share card route map and poster header name the product", () => {
  const map = renderToStaticMarkup(<RouteMapCard usageStats={emptyUsageStats} />);
  assert.match(map, /LLMR/);
  const header = renderToStaticMarkup(<SharePosterHeader {...minimalPosterHeaderProps} />);
  assert.match(header, />Route Map</);
  assert.match(header, />LLMR</);
});
```

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/share-cards.test.js`
Expected: PASS. The assertions pin existing behaviour, so there is no failing run first. To see them bite, change `/>LLMR</` to `/>CCR</`, watch it fail, and change it back.

- [ ] **Step 4: fix the remaining unused names by hand**

| Site | Fix |
|---|---|
| `packages/core/test/integration/mcp/fusion-vision-mcp.test.mjs:463,474,485` | Drop the `const octetStream =`, `const textPlain =` and `const webp =` bindings and keep each `await sendJsonRpc(...)`. The test asserts on `provider.lastBody`. |
| `docs/src/components/interactive/demoRuntime.tsx:149-152` | Delete the `center` function. Nothing calls it. |
| `packages/core/test/unit/agents/kilo-profile-config.test.mjs:13` | `testConfig(root)` becomes `testConfig()`. Drop the argument at its 3 calls. |
| `packages/core/test/unit/agents/opencode-profile-config.test.mjs:24` | Same, 3 calls. |
| `packages/core/test/unit/agents/plugin-permissions.test.mjs:290` | `baseConfig(dir)` becomes `baseConfig()`. Drop the argument at its 6 calls. |
| `packages/core/test/unit/agents/plugin-stop-reason.test.mjs:48` | `configWithPlugin(dir, pluginFile, enabled)` loses `dir`. Update its 2 calls. |
| `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs:561` | `withGrokHome(t, run)` loses `t`. Update its 2 calls. |
| `packages/core/test/unit/routing/route-script-runtime.test.mjs:60` | `scriptInput(script, body = {})` loses `script`. Update its 22 calls. Each passes a first argument the helper never read. |

If removing an argument leaves a local variable unused, delete that variable too. Biome reports it.

- [ ] **Step 5: fix the last six by hand**

| Site | Rule | Fix |
|---|---|---|
| `packages/core/src/routing/route-script-worker.ts:71` | `noBannedTypes` | Remove the `: Function` return annotation from `compileScript`. `vm.compileFunction` already types the result. |
| `packages/electron/src/main/browser-automation-mcp.ts:2807,2873` | `noShadowRestrictedNames` | Rename the nested helper `valueOf` to `fieldValue` at its definition and its one call. It runs inside the injected page function, so keep it nested. |
| `packages/electron/test/unit/provider-account-webcontent.test.ts:145` | `noGlobalEval`, `noCommaOperator` | Replace `await (0, eval)(script) as any` with `await runInThisContext(script) as any`, importing `runInThisContext` from `node:vm`. Both evaluate in the global scope, where the test has stubbed `fetch`, `localStorage` and `sessionStorage`. |
| same file, `:150-151` | `noUnsafeOptionalChaining` | Read the headers once as `const headers = fetchInit?.headers as Record<string, string> \| undefined;` and assert on `headers?.authorization` and `headers?.["x-csrf-token"]`. |

The `runInThisContext` swap is inferred to be equivalent. Step 6 runs the test that proves it. If it fails, revert that line and stop to report, since the only other route is a suppression comment.

- [ ] **Step 6: verify**

Run each and expect exit 0:

```bash
npm run lint
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:ui
npm run test:electron
```

`npm run lint` must end with a "Checked N files" line and no diagnostic, infos included. The docs package has no test suite. Its two edits are a deleted unused function and a deleted unused type import.

- [ ] **Step 7: commit**

```bash
git add -A
git commit -m "chore(lint): clear the Biome diagnostics and assert on the poster header"
```

Before `git add -A`, run `git status --short` and confirm it lists only files this task edited.

### Task 3: wire lint into the gate, CI and the docs

**Files:**
- Modify: `.claude/hooks/gate-commit.mjs:8`
- Modify: `.github/workflows/test.yml:37-38`
- Modify: `AGENTS.md:8`, `:19-24`, `:53`
- Test: `tests/architecture/claude-hooks.test.mjs`, `tests/architecture/package-scripts.test.mjs`

**Interfaces:**
- Consumes: `npm run lint` exits 0 (Task 2).

- [ ] **Step 1: write the failing tests**

Append to `tests/architecture/claude-hooks.test.mjs`:

```js
test("gate default checks are typecheck, lint and the architecture tests", () => {
  const source = readFileSync(path.join(hooksDir, "gate-commit.mjs"), "utf8");
  assert.ok(source.includes('const DEFAULT_CHECKS = [["npm", ["run", "typecheck"]], ["npm", ["run", "lint"]], ["npm", ["run", "test:architecture"]]];'));
});
```

Append to `tests/architecture/package-scripts.test.mjs`:

```js
test("lint is Biome with the formatter and assists off, pinned, and run by CI", () => {
  const { devDependencies, scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const biome = JSON.parse(readFileSync("biome.json", "utf8"));
  const version = devDependencies["@biomejs/biome"];
  assert.equal(scripts.lint, "biome lint --error-on-warnings .");
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(biome.$schema, `https://biomejs.dev/schemas/${version}/schema.json`);
  assert.equal(biome.formatter.enabled, false);
  assert.equal(biome.assist.enabled, false);
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /run: npm run lint\n/);
});
```

- [ ] **Step 2: run them and see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/claude-hooks.test.js .test-dist/architecture/test/package-scripts.test.js`
Expected: the gate test fails on `assert.ok`, and the lint test fails on the workflow match. Every other test passes.

- [ ] **Step 3: change the gate and the workflow**

In `.claude/hooks/gate-commit.mjs`, set `DEFAULT_CHECKS` to the exact line the test quotes. Lint sits second, so the 2 s check fails before the 15 s one.

In `.github/workflows/test.yml`, add after the `🔎 Typecheck` step of the `test` job:

```yaml
      - name: 🧹 Lint
        run: npm run lint
```

- [ ] **Step 4: update `AGENTS.md`**

- Under Commands, after the `npm run typecheck` line, add: "`npm run lint` runs Biome as a linter over the workspace. Fix what it reports. `npx biome lint --write <path>` applies the safe fixes. Never pass `--unsafe` without `--only=<rule>`."
- Under "Where the standards are enforced", add: "`biome.json`: lint rules, with the formatter and assists off on purpose. `npm run lint`; the commit gate and the Tests workflow run it. Turn a rule off only with its reason in the PR. `tests/architecture/package-scripts.test.mjs` pins the script, the exact version and the CI step."
- Under "Local checks", change "runs typecheck plus `npm run test:architecture`" to "runs typecheck, `npm run lint` and `npm run test:architecture`", and re-measure "about 15 s" with `time` on one gated commit.

- [ ] **Step 5: run the tests and see them pass**

Run the Step 2 command.
Expected: all tests pass.

- [ ] **Step 6: verify before opening the PR**

```bash
npm run typecheck
npm run lint
npm run test:architecture
npm run test
```

Expected: exit 0 for each. After the PR opens, the `🧹 Lint` step must appear and pass in the Tests run.

- [ ] **Step 7: commit**

```bash
git add .claude/hooks/gate-commit.mjs .github/workflows/test.yml AGENTS.md tests/architecture/claude-hooks.test.mjs tests/architecture/package-scripts.test.mjs
git commit -m "chore(lint): run Biome in the commit gate and the Tests workflow"
```

Squash-merge title: `chore(lint): adopt Biome as a lint-only check (#NN)`.

---

## TL-2: type-check the TypeScript test files

**Fixes:** F-F3.
**Depends on:** None.
**Branch:** `chore/typecheck-tests`
**Size:** M
**Owner steps:** None.

**Status:** Merged 2026-11-18 as [PR 101](https://github.com/jrmatherly/llm-router/pull/101), squash commit `3da61a13`. The typecheck reported the same 35 errors in the same 12 files as the evidence below. The review changed these points:

- The locale test in `usage-format.test.ts` also asserts `de-DE`. With `en-US` alone it passed when `formatLogTokenSummary` ignored its locale, because `en-US` is the default where it runs.
- The architecture test pins the `typecheck` script and checks the file list that `tsc --showConfig` resolves, not the glob strings. An `exclude` entry or a changed script passed the plan's version.
- The route-map assertion in `share-cards.test.tsx` matches only the centre column's brand span.
- The probe fixture's `protocols` entry in `providers.test.ts` is written out. Adding `protocol` did not change the test's outcome, because no assertion reads that entry (Review Focus 4 cannot happen with this code).

Found and left alone: the onboarding tests do not assert on what `agentOptions` renders, because the form defaults to the same list. Nothing guards against `// @ts-nocheck` in a test file, and none exists. The evidence below says 6 Electron test files. There are 14, all clean. TL-1 finds the 11 shared fixes already done.

### Evidence

Measured on 2026-11-16 at `136ad730` with the repo's TypeScript 6.0.3 and a scratch tsconfig that extends the root one, adds the two test globs and sets `allowImportingTsExtensions`.

- 35 errors in 12 UI test files. The 6 Electron test files and `packages/ui/test/fixtures/index.ts` have none.
- All 30 `.test.ts(x)` files import with `.ts` or `.tsx` extensions, so `allowImportingTsExtensions` is required. It needs `noEmit`, which the root config already sets.
- Typecheck time is 8.3 s without the tests and 8.6 s with them.

| File | Errors | Codes |
|---|---|---|
| `packages/ui/test/integration/providers.test.ts` | 16 | TS2345 ×12, TS2769 ×3, TS7006 ×1 |
| `packages/ui/test/component/onboarding.test.tsx` | 4 | TS2741 ×3, TS6133 ×1 |
| `packages/ui/test/unit/usage-format.test.ts` | 3 | TS2739 ×2, TS2554 ×1 |
| `packages/ui/test/component/layout.test.tsx` | 2 | TS2322 ×1, TS6133 ×1 |
| `packages/ui/test/component/profiles.test.tsx` | 2 | TS2345 ×1, TS6133 ×1 |
| `packages/ui/test/component/share-cards.test.tsx` | 2 | TS6133 ×2 |
| `claude-apps-gateway-login`, `components`, `observability`, `overview-components`, `tray-components`, `ux-feedback` (`.test.tsx`, under `test/component/`) | 1 each | TS6133 |

Totals by code: TS2345 13, TS6133 11, TS2741 3, TS2769 3, TS2739 2, TS2322 1, TS2554 1, TS7006 1.

Four groups are real test defects, found by reading each site. The rest are type-only, and each test runs the same before and after.

| Defect | Site | What is wrong |
|---|---|---|
| Missing assertion | `share-cards.test.tsx:37` | `header` is rendered and never asserted on (F-F2). |
| Wrong arguments | `usage-format.test.ts:56` | `formatLogTokenSummary(entry, translate, "en-US")` passes a function as the locale and drops `"en-US"`. The signature is `(entry, locale?)` (`shared/logs.ts:30`). The test passes only where the default locale formats like `en-US`. |
| Wrong fixture shape | `providers.test.ts:1264-1271` | The `protocols` entry spreads a capability, so it has `type` and no `protocol`. `GatewayProviderProbeProtocolResult` (`contracts/app.ts:621-629`) requires `protocol`. The code under test may be skipping the entry. |
| Missing required prop | `onboarding.test.tsx:23,77,116` | `OnboardingView` requires `agentOptions` (`onboarding.tsx:67`) and passes it down at `:290`. The tests render without it. |

### Task 1: include the tests in typecheck

**Files:**
- Modify: `tsconfig.json` (`compilerOptions`, `include`)
- Modify: `AGENTS.md:8`
- Test: `tests/architecture/package-scripts.test.mjs`

**Interfaces:**
- Produces: `npm run typecheck` reports errors in `packages/*/test/**/*.ts` and `*.tsx`. Task 2 drives that count to zero.

- [ ] **Step 1: write the failing test**

Append to `tests/architecture/package-scripts.test.mjs`:

```js
test("typecheck covers the TypeScript test files", () => {
  const { compilerOptions, include } = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.ok(include.includes("packages/*/test/**/*.ts"));
  assert.ok(include.includes("packages/*/test/**/*.tsx"));
  assert.equal(compilerOptions.allowImportingTsExtensions, true);
});
```

- [ ] **Step 2: run it and see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/package-scripts.test.js`
Expected: FAIL on the first `assert.ok`.

- [ ] **Step 3: change `tsconfig.json`**

Add `"allowImportingTsExtensions": true` to `compilerOptions`, after `"allowSyntheticDefaultImports"`. Add `"packages/*/test/**/*.ts"` and `"packages/*/test/**/*.tsx"` to `include`, after the three `src` globs.

- [ ] **Step 4: run the test and the typecheck**

Run the Step 2 command. Expected: PASS.
Run: `npm run typecheck`
Expected: exit 2 with 35 errors in the 12 files above, or 24 in 4 files if TL-1 has landed (the 11 TS6133 errors are gone). An error under `packages/*/src` or `packages/electron/test` means the tree changed since the audit. Fix it in Task 2 with the rest. Errors in tests added by earlier audit PRs (HP-2, CG-6, DH-1 and others that land before this one) are expected too. Fix them in Task 2.

Do not commit yet. The gate runs typecheck, so the first commit comes at the end of Task 2.

### Task 2: fix the 35 errors

**Files:** the 12 test files in the table above. No file under `packages/*/src` changes.

**Interfaces:**
- Consumes: the failing `npm run typecheck` from Task 1.
- Produces: `npm run typecheck` exits 0.

Fixing one error can uncover another on the same object, because TypeScript stops at the first mismatch per assignment. Re-run `npm run typecheck` after each step.

- [ ] **Step 1: unused names (11 × TS6133)**

Delete `import * as React from "react";` (line 3) from the 10 files under `packages/ui/test/component/` that TL-1 Task 2 Step 2 lists. Keep it in `packages/ui/test/integration/providers.test.ts`, which calls `React.createElement`. Then apply TL-1 Task 2 Step 3 to `share-cards.test.tsx`, test rename and both assertions included.

- [ ] **Step 2: `usage-format.test.ts` (3 errors, 1 real defect)**

- `:56`. Call `formatLogTokenSummary(entry, "en-US")` and delete the `translate` constant at `:54`. The expected string stays `"123.5K in  12K out"`.
- `:45`. Give `requestBody` the full shape, as `:79` already does: `{ encoding: "utf8", sizeBytes: 0, text: "", truncated: false }`.
- `:60`, and the first entry once `:45` is fixed. Add `routeAttemptCount: 0`, `routeHopCount: 0` and `routeTraceTruncated: false` (`contracts/app.ts:2285-2288`), in the file's alphabetical key order.

- [ ] **Step 3: `onboarding.test.tsx` (3 × TS2741, real defect)**

Import `profileAgentOptions` from `@llmr/ui/pages/home/shared/options.ts` (`options.ts:132`) and pass `agentOptions={profileAgentOptions}` to all three `OnboardingView` renders, in alphabetical prop order.

- [ ] **Step 4: `layout.test.tsx` and `profiles.test.tsx` (type-only)**

- `layout.test.tsx:134`. Delete the stale `copy={appCopy}` prop. `UpdateEntryButton` (`layout.tsx:340-348`) takes `actionBusy`, `onOpen` and `status`. The `appCopy` import stays, since `:42` and `:157` use it.
- `profiles.test.tsx:655`. Annotate the draft as `const draft: AddProfileDraft = {`, importing the type from `@llmr/ui/pages/home/shared/types.ts` (`types.ts:153`). The annotation stops `operator`, `operation` and `type` widening to `string`.

- [ ] **Step 5: `providers.test.ts` (16 errors, 1 real defect)**

| Lines | Code | Fix |
|---|---|---|
| the `const draft = {` at `307`, `332`, `1120`, `1247` and `1378` (errors at `314`, `339`, `1128`, `1274`, `1413`) | TS2345 ×5 | Annotate each draft as `AddProviderDraft` (`shared/types.ts:72`), so `protocol` and `selectedProtocols` keep their literal types. |
| `1259-1272` (used at `1277`, `1279`, `1282`) | TS2345 ×3 | Real defect. Add `protocol: "anthropic_messages" as const` to the `protocols` entry, after `message`. |
| `564`, `732` | TS2769 ×2 | Add `message: ""` to the `protocols` entry. The type requires it. |
| `98` | TS2769 ×1 | Pass `{ children: null, label: "Models" }`. `FieldGroup` requires `children` in its props type, and the `createElement` child arguments still replace it at run time. |
| the two candidates used at `1680`, `1684`, `1698`, `1699` | TS2345 ×4 | Annotate `zenCandidate` (`:1665`) as `LocalAgentProviderCandidate` (`contracts/app.ts:457`), imported as a type. `goCandidate` spreads it and inherits the type. |
| `1738` | TS7006 ×1 | `function providerInstallLinkPayload(link: string)`. |

After the `1259-1272` fix, run the file:

`node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js`

Expected: PASS. If the test at `:1274-1282` now fails, the old fixture hid behaviour the test never reached. Do not change the fixture back and do not edit `packages/ui/src` in this PR. Mark the test `{ todo: "<one-line reason>" }`, record the actual and expected values in the PR description, and open an issue for the owner.

- [ ] **Step 6: update `AGENTS.md`**

Change line 8 to: "`npm run typecheck` runs `tsc --noEmit` across the workspace, including the `.ts` and `.tsx` test files. The `.mjs` tests are not type-checked."

- [ ] **Step 7: verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:ui
npm run test:electron
```

Expected: exit 0 for each, and `npm run typecheck` prints nothing. Run `npm run lint` too if TL-1 has landed.

- [ ] **Step 8: commit**

```bash
git add tsconfig.json AGENTS.md tests/architecture/package-scripts.test.mjs packages/ui/test
git commit -m "chore(typecheck): type-check the TypeScript test files and fix what it finds"
```

---

## Out of scope

- A formatter, import sorting, sorted keys, and type-over-interface (D-6).
- Type-aware lint rules (spec, Deferred).
- Re-enabling `useImportType`, `useOptionalChain` and `noPrototypeBuiltins`, which have autofixes and could follow in a later PR.
- Lint in `scripts/release.mjs`. The Tests workflow on `main` covers it, and release preconditions belong to F-A5.
- Type-checking the `.mjs` tests and the `build/` and `scripts/` files.
