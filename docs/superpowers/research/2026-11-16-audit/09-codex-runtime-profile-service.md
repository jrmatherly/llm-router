# Research: Codex runtime source and profiles/service.ts

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal restated.** The owner wants an audit-fix plan and asked for two structural refactors to be researched first, so each plan task names exact files, gates and costs. Nothing in the repo was changed. All experiments are in `<session scratchpad>/structural-refactors/`.

## 1. Answer

**Refactor 1 (`cli-middleware-runtime.ts`). Do it, in two small PRs.** Move the script verbatim into a real `.cjs` file that esbuild loads as text, then type-check it with `checkJs` under a separate, non-strict tsconfig. The prototype emits a byte-identical script and tsc reports 11 errors. Converting it to TypeScript is not worth it (1,335 strict errors, output no longer identical).

**Refactor 2 (`profiles/service.ts`). Defer most of it.** Do at most the shared-helper extraction plus Grok and Kimi. I found no defect or merge conflict in the last 90 days that the file's size caused. The Claude Code, Codex and takeover clusters are mutually dependent and are where the recent fixes landed, so moving them carries the most risk for the least proof.

### Refactor 1 facts (measured unless marked)
- **Shape.** One export, `codexCliMiddlewareRuntimeScript(): string` (`cli-middleware-runtime.ts:3`). The body is CommonJS (`"use strict"`, `require("node:…")` only, plus one dynamic `import()` of the bot-gateway SDK by path at `:5884`). It has 349 top-level functions.
- **Template content.** Exactly one interpolation, `${JSON.stringify(codexBaseInstructions)}` at `:4701`. One escaped backtick at `:541`, which `String.raw` emits as `\``, valid inside that regex class.
- **Consumers.** Written to `CONFIGDIR/bin/llmr-codex-cli-middleware.js` by `profiles/service.ts:1685, 2024, 2692` and `profiles/launch-service.ts:1573` (which also checks six marker substrings, `:1581-1590`). Wrappers run it with `process.execPath` and `ELECTRON_RUN_AS_NODE=1` (`service.ts:2824, 2971`). It must stay a single self-contained file.
- **Node floor.** `engines.node >=24`, esbuild target `node24`. Electron is `^42.3.3` (42.11.18 installed); I did not check its embedded Node version.
- **Tests.** `codex-cli-middleware-runtime.test.mjs` has 29 tests. They write the string to disk, run `node --check`, spawn it, and extract functions by the text `function <name>(` (`:1455-1489`). All keep working unchanged only if the emitted text is unchanged.

### Approaches compared
| | Type coverage | Build change | Emitted bytes | Diff |
|---|---|---|---|---|
| **A. `.cjs` loaded as text + `checkJs`** (recommended) | Whole script, non-strict | One `loader` line in 4 configs, one extra tsconfig | Identical (sha256 `e35ead7b…`, minified and unminified host bundle) | Move of 7,344 lines, about 30 new |
| B. Real TS compiled by an esbuild sub-build | Full | Nested build or generated file in 4 configs | Not identical (1,727 diff lines after transpile) | 1,335 strict errors to fix first |
| C. Several typed modules bundled to one script | Full | Same as B plus bundling | Not identical; function-extraction tests at risk (inferred) | Largest |

### Type-check cost of approach A (TypeScript 6.0.3, the repo's version)
- `strict: false`: **11 errors** (9 TS2339, 2 TS2345).
- `strict` with `noImplicitAny: false`: **30 errors**.
- Full strict: **898 errors**, 788 of them untyped parameters. TS 6 defaults `strict` to true, so the tsconfig must set it false explicitly.
- I did not triage whether any of the 11 are real bugs. One to look at first: emitted line 1189 (source about `:1192`) reads `commandReply.length` on a value that can be an object.

### Why not `with { type: "text" }`
esbuild 0.28.2 supports it and produced identical bytes. tsc rejects it with TS2856, because no `package.json` sets `"type": "module"`, so the `.ts` files count as CommonJS. The extension loader `".runtime.cjs": "text"` passes tsc and esbuild. A build missing the loader fails loudly on first call (`….default.replace is not a function`).

### Refactor 2 facts (measured by a TypeScript-AST script, `map.cjs`)
- **Public exports (8).** `applyProfileConfig` `:155`, `applyProfileRuntimeConfig` `:390`, `resolveKimiSourceHome` `:2378`, `resolveGrokSourceHome` `:2605`, `cleanupGeneratedBinBackups` `:3415`, `restoreInactiveGlobalProfileConfigs` `:3641`, `restoreGlobalProfileConfigsOnExit` `:3808`, `restoreTakeoversWhenNoGatewayServes` `:3827`.
- **Importers.** `web/management-server.ts:39`, `profiles/launch-service.ts:25`, `cli/src/cli.ts:13`, `electron/src/main/main-app.ts:10`, `electron/src/main/ipc.ts:44`, and five test files.
- **Clusters (281 top-level functions, classified by name).**

| Cluster | Functions | Lines | Depends on |
|---|---|---|---|
| claude-code | 84 | 1,158 | 41 shared helpers, takeover |
| shared | 78 | 766 | n/a |
| codex (incl. TOML helpers) | 45 | 800 | 35 shared, takeover |
| kimi | 20 | 363 | shared + 3 TOML helpers |
| takeover/restore | 15 | 367 | predicates from 6 agent clusters |
| grok | 10 | 181 | shared only |
| opencode / kilo | 9 / 9 | 125 / 124 | shared + `restoreDisabledGlobalProfile` |
| pi | 8 | 137 | shared, codex, takeover |
| zcode | 4 | 108 | codex, takeover |

  Clusters are interleaved, not contiguous (about 100 alternating ranges).
- **Module state.** Only two. `applyQueue` `:153` (used by `applyProfileConfig` only) and `ownedGlobalProfileTakeovers` `:130` (takeover only). No agent cluster holds state.
- **Existing layout.** `agents/{kilo,opencode,pi,zcode}/profile-config.ts` already hold `write<X>GatewayConfig`, `resolve<X>ConfigFile`, `isManaged<X>ConfigContent`. `agents/*` already imports `profiles/backup-files`, `model-allowlist` and `launch-core`, so "agent module imports a profiles leaf" is the established direction. There is no `agents/grok/` or `agents/kimi/`.
- **Constraints.** No architecture test or `.claude/rules` file constrains profile code. `package-boundaries.test.mjs:26` only bans cross-package relative paths. The gateway facade test covers `gateway/` only.
- **Tests.** `test/integration/profiles/profile-service.test.mjs` (63 tests, 3,203 lines) is the main cover. It has zero mentions of Kilo, so the Kilo wrapper code has no apply-level test.
- **Churn.** 29 commits in 90 days (+1,323/−606), 11 with a `fix` prefix. Fork-era fixes (Oct 25 to Nov 1) are about Claude Code settings and takeover/restore. The fork is single-author with squash merges, so conflict cost is not observable in history.

## 2. Evidence (commands)
- Extraction and hash: `node_modules/.bin/esbuild …cli-middleware-runtime.ts --bundle --format=cjs --alias:@llmr/core=./packages/core/src`, then sha256 of the function's return value. 301,916 bytes, 7,344 lines. `node --check` passes.
- Type counts: `node node_modules/typescript/bin/tsc --noEmit --allowJs --checkJs --module NodeNext --types node [--strict false | --strict --noImplicitAny false | --strict] emitted.js`. I used the repo's installed TypeScript instead of `npx`, same version.
- Prototype: `proto/` in the scratch directory (wrapper `.ts`, `.runtime.cjs`, `.runtime.d.cts`, two tsconfigs).
- Churn: `git log --since='90 days ago' [--numstat] -- <file>`.

## 3. Plan inputs

**R1-PR1, move only (M, mechanical).**
- Create `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs`: template body verbatim, with `:4701` becoming `base_instructions: __LLMR_CODEX_BASE_INSTRUCTIONS_JSON__,`.
- Create sibling `cli-middleware-runtime-source.runtime.d.cts`: `declare const source: string; export = source;`.
- Rewrite `cli-middleware-runtime.ts` to import the source and return `source.replace("__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__", () => JSON.stringify(codexBaseInstructions))`. Signature unchanged.
- Add `loader: { ".runtime.cjs": "text" }` to `createMainBuildOptions` (`build/esbuild.config.mjs:281`), `createCliBuildOptions` (`:318`), `createCoreServerBuildOptions` (`:353`), and the loader map in `build/test.mjs` (about `:112`). `build/dev.mjs` reuses the first two.
- Gate: sha256 of the emitted script before and after must both be `e35ead7b47ca5dc816950ef265c2c2ad93e6c00ec97ec14f0577f63b20ee2af1` at base `136ad730`. Record both in the PR. Do not pin the hash in a test; every legitimate edit would break it.
- Extend the existing test file with `generated Codex CLI middleware runtime has no unreplaced placeholder` (asserts the sentinel is absent and the base instructions text is present).
- Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js`, then `npm run build:assets`.

**R1-PR2, turn the check on (S).**
- Create root `tsconfig.codex-runtime.json` (`allowJs`, `checkJs`, `strict: false`, `types: ["node"]`, `files`: the `.cjs` plus a one-line `.d.ts` declaring the sentinel as `string`).
- Change `typecheck` in `package.json:69` to `tsc --noEmit && tsc --noEmit -p tsconfig.codex-runtime.json`. The commit gate, `test.yml:38`, `release.yml:36` and `scripts/release.mjs:15` all call `npm run typecheck`, so they inherit it.
- Fix the 11 errors with JSDoc or real fixes. Any behaviour fix gets its own test.
- Optional PR3: `strict: true, noImplicitAny: false` (30 errors). Stop there.

**R2, only if the owner wants a start. Each PR is move-only.** Gate for each: `npm run typecheck` and `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`.
- **PR A (M).** New `packages/core/src/profiles/apply-support.ts` with the 76 leaf helpers (486 lines: file modes, `shellQuote`, `cmdQuote`, `sanitizeProfilePathSegment`, `profileEnv`, `writeGeneratedFileIfChanged`, `gatewayEndpoint`, `disabledStatus` and the like) plus `tomlString`, `tomlQuotedKey`, `firstTomlTableIndex`. `service.ts` imports them. Required first, otherwise agent modules would import `service.ts` and create a cycle.
- **PR B (S).** Grok, 10 functions, 181 lines, to new `agents/grok/profile-config.ts`. Exports `applyGrokProfile`, `grokWrapperPath`, `resolveGrokSourceHome`. `service.ts` re-exports `resolveGrokSourceHome` so importers do not change.
- **PR C (M).** Kimi, 20 functions, 363 lines including `buildKimiProfileConfigToml`, to new `agents/kimi/profile-config.ts`. Same pattern for `resolveKimiSourceHome`.
- **Stop here.** Kilo and OpenCode `apply*` call `restoreDisabledGlobalProfile`, and takeover calls predicates in the Claude Code and Codex clusters. Moving those needs the takeover module designed first.

## 4. Risks and unknowns
- **Scan coverage.** Moving text from `.ts` to `.cjs` may drop it from architecture scans (`english-only`, `llmr-rename`) and from the `tsconfig` include. I did not read their file filters. Check: `npm run test:architecture` on the PR branch, and read their extension lists.
- **Electron's Node version** is unverified. Check `process.versions.node` in the packaged app. It matters only if the script later adopts newer syntax.
- **Cluster counts are by name pattern.** TOML helpers land in "codex" although Kimi uses three. Grok and Kimi closures were computed exactly; the others are approximate.
- **Helper copies.** `sanitizeProfilePathSegment`, `shellQuote` and `cmdQuote` have same-named copies in `launch-service.ts`, `launch-core.ts`, `agents/claude-app/launch.ts` and `agents/codex/app-launch.ts`. Their bodies differ in the first five lines, so PR A must not merge them.
- **R2 move-only PRs** on a file with 29 commits in 90 days will conflict with any open branch that touches it. Land them when no profile work is in flight.

Skipped: I did not run the core test suite or `build:assets` (forbidden by the brief), so "tests keep working unchanged" rests on the byte-identical emitted script, not on a test run.
