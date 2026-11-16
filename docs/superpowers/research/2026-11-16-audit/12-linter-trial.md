# Research: linter trial

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

Goal restated: before the audit-fix plan is written, the owner wants evidence on whether "Biome, lint only" is the right linter for llm-router as of 2026-11-16, plus a day-one-green adoption path. I changed nothing in the repo. All runs used a copy of the 606 tracked JS/TS files in `<session scratchpad>/linter/src`.

## 1. Answer

**Keep the choice: Biome, lint only.** Oxlint is a close second. ESLint with typescript-eslint is ruled out.

- **Biome 2.6.6** takes 1.6 to 1.9 s wall time (measured). The recommended preset gives 391 diagnostics. With about 20 noise rules off, 58 remain and all of them are cheap to fix. It is one binary with one JSON config. It can later turn on import sorting and formatting in the same tool if the owner wants them.
- **Oxlint 1.92.0** takes 1.1 to 1.3 s (measured) and gives 201 diagnostics from its default correctness category. Its type-aware mode (`--type-aware` with oxlint-tsgolint) takes 4.7 s and finds the same type-aware hits as typescript-eslint. That is the one real advantage over Biome. It does not tip the choice, because no type-aware hit I sampled was a real bug.
- **ESLint 10.14.0 with typescript-eslint 8.72.1** is out for two measured reasons.
  - Speed: 23.4 s for the untyped run and 40.4 s for the typed run on only 325 files. That is roughly 15 to 30 times slower.
  - TypeScript range: typescript-eslint's peer range is `typescript >=4.8.4 <6.1.0`, and `npm view typescript version` already reports 7.0.2. Upgrading TypeScript would be blocked by the linter.

**Lint only versus lint plus format.** A formatter set to the stated style changes 491 to 508 of 607 files. On a scratch copy that is a diff of +34,211/−27,312 lines (measured). The code is formatted by hand with no line limit, and the formatter reflows import lists and long lines. Format-on is a separate large PR or not worth doing. Lint only is the right call.

**Import order and sorted keys.** In Biome these are assist actions, not lint rules.
- `organizeImports` would rewrite 257 files (measured).
- `useSortedKeys` flags 1,555 objects in 216 files (measured).
- `useConsistentTypeDefinitions` (type over interface) flags 801 in 169 files (measured).

AGENTS.md says "usually" alphabetized and keeps `interface` where a file already uses it, so all three stay off. `useNodejsImportProtocol` has 0 hits, so it is free to keep on.

**Genuine defects found.** These are worth plan tasks of their own.
1. `packages/core/src/providers/probe.ts:1257` (ESLint `no-useless-assignment`, inferred defect). After a Codex OAuth refresh, the rotated `refreshToken` is assigned and then thrown away. It is never persisted. The cache in `refreshCodexProbeAccessToken` (`probe.ts:1320-1354`) is keyed by the hash of the *old* token. If the provider rotates refresh tokens, the next refresh after the cached access token expires sends a revoked token. I did not verify whether the endpoint actually rotates. A test that stubs a rotating token endpoint would settle it.
2. `packages/ui/test/component/share-cards.test.tsx:37` (Biome `noUnusedVariables`, measured). The test is named "share card route map and poster header name the product" but renders `header` and never asserts on it.
3. 13 unused imports (12 test/build files) plus 1 unused function in docs. Examples are `import * as React` in 10 UI component tests (the test JSX is `automatic`, `build/test.mjs:111`) and `build/dev.mjs:11`. This is dead code, not a bug. tsc misses it because tests and `build/` are outside `tsconfig.json`'s `include`. That gap is the main thing a linter adds here.

**Noise I sampled and judged.** Each was read in the source.
- `useHookAtTopLevel` (`request-log-runtime.ts:475`) fires on a class method named `useAdmissionStore`.
- `noAssignInExpressions` (`media/service.ts:67`, `request-log-store.ts:682`) fires on the `??=` lazy-init idiom.
- `noTemplateCurlyInString` (`profiles/service.ts:2797`, `app-launch.ts:78`) fires on shell text and `${VAR}` placeholders.
- `noControlCharactersInRegex` (`electron/src/main/ipc.ts:651`) fires on a filename sanitizer that strips control characters on purpose.
- `noGlobalIsNan` (`system-proxy-fetch.ts:285`) is equivalent after `parseInt`.
- `useIterableCallbackReturn` (`pipeline.ts:857`) is a harmless return from `forEach`.
- typescript-eslint `no-misused-promises` (`gateway-service.ts:583`) is an async timer that already has try/catch.
- `await-thenable` (`request-log-runtime.ts:869`) is narrowing across an await.
- `no-base-to-string` (`context-archive/protocol.ts:211`) is `String(unknown)`, which is intended.
- Oxlint `react(immutability)` (`App.tsx:1058`) is a ref write, `react(purity)` (`share-cards.tsx:503`) is `new Date()` in render, and `exhaustive-deps` (`App.tsx:703`) has deliberately narrow deps.

## 2. Evidence

- Versions come from `npm view <pkg> version time.modified`.
  - Latest releases: Biome 2.6.8, oxlint 1.94.0, ESLint 10.15.0, typescript-eslint 8.72.2.
  - npm has `min-release-age=7`, so the runs used the newest versions older than 7 days: Biome 2.6.6, oxlint 1.92.0, oxlint-tsgolint 7.0.2006, ESLint 10.14.0, typescript-eslint 8.72.1, @eslint/js 10.0.1.
- The Biome schema at `https://biomejs.dev/schemas/2.6.6/schema.json` shows that `recommended` is deprecated in favor of `"preset": "recommended"`. Biome emits a DEPRECATED warning when it is used.
- Monorepo support is from `https://biomejs.dev/guides/big-projects/`: one root config, with optional nested configs using `"extends": "//"`. One root config is enough here.
- Top Biome rules with the default preset (measured):
  - noNonNullAssertion 51, noTemplateCurlyInString 39, useImportType 38, useTemplate 31, noArrayIndexKey 27.
  - noExplicitAny 25, useOptionalChain 19, noPrototypeBuiltins 15, noUnusedImports 13, useArrowFunction 10.
  - useIterableCallbackReturn 10, parse 8 (all in `examples/routing/jev.js`, a route-script body with top-level `return`), a11y useAriaPropsSupportedByRole 8, noImplicitAnyLet 7, a11y noStaticElementInteractions 7.
- Top oxlint rules (measured): no-useless-fallback-in-spread 76, react immutability 54, exhaustive-deps 22, no-unused-vars 13, no-useless-escape 10.
- Top ESLint untyped rules (measured): no-unused-vars 82, no-undef 34 (examples), exhaustive-deps 26, no-explicit-any 25, preserve-caught-error 22.
- `cli-middleware-runtime.ts`: Biome reported 3 hits and oxlint 4. Neither linter parses the JS inside the `String.raw` template, so no exclusion is needed.
- Biome's own type rules (`domains.types: "all"`) take 1.3 s and give 387 hits, of which 332 are `noUnnecessaryConditions`. That is mostly noise, so this domain stays off.
- Lint is not wired in anywhere today. `.claude/hooks/gate-commit.mjs:8` runs typecheck and test:architecture, and `.github/workflows/test.yml` has a typecheck step and a test step. There are no `eslint-disable` or `biome-ignore` comments in the source.

## 3. Plan inputs

**PR 1: adopt Biome (S/M). All of it lands together.**
- Add `@biomejs/biome` pinned exactly to the version current at implementation time (2.6.x) in root `devDependencies`. Regenerate `package-lock.json` with npm. Biome uses an optional native binary and needs no `allowScripts` entry. That is a guess; check that `npm ci` runs no install script for it.
- Create `biome.json` with the config below. It is the exact one I tested, except that the scratch runs passed `--vcs-enabled=false` because the copy has no `.git`.
- Fix the 58 residual diagnostics in the same PR. 13 fall to `biome lint --write` (measured as 13 files, +13/−15). The rest go by `--write --unsafe` for unused imports or by hand.
  - Hand-fix or `biome-ignore` with a reason for: `noConfusingVoidType` ×5, `useDomNodeTextContent` ×5 in `browser-automation-mcp.ts` (innerText is intended, so turn the rule off instead), `noGlobalEval` and `noCommaOperator` in `provider-account-webcontent.test.ts:145`, and `noShadowRestrictedNames` at `browser-automation-mcp.ts:2807`.
  - Add the missing assertion in `share-cards.test.tsx:37`.
- Script: `"lint": "biome lint --error-on-warnings ."` in root `package.json`. Use `biome ci --formatter-enabled=false --assist-enabled=false` in CI. The flag spelling is a guess; check it with `biome ci --help`.
- Commit gate: append `["npm", ["run", "lint"]]` to `DEFAULT_CHECKS` in `.claude/hooks/gate-commit.mjs:8`. This adds about 1.5 s.
- CI: add a `🧹 Lint` step `run: npm run lint` after Typecheck in `.github/workflows/test.yml`.
- AGENTS.md: add a "Where the standards are enforced" bullet for `biome.json` (`npm run lint`, also run by the gate) and an `npm run lint` line under Commands.
- Architecture test: extend `tests/architecture/package-scripts.test.mjs` with a test named "lint script runs biome over the workspace". It asserts that `package.json` `scripts.lint` starts with `biome lint` and that `biome.json` exists with `formatter.enabled === false`. If `claude-hooks.test.mjs` already asserts the gate's default checks, extend that test to include lint. Run with `node build/test.mjs architecture && node --test .test-dist/architecture/test/package-scripts.test.js`.

**PR 2 (S, separate):** the probe refresh-token rotation fix with a test in `packages/core/test/unit/providers/`.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.6/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/dist", "!**/.test-dist", "!**/*.json", "!**/*.css", "!examples/routing", "!packages/ui/src/generated"] },
  "formatter": { "enabled": false },
  "assist": { "enabled": false },
  "linter": { "enabled": true, "rules": {
    "preset": "recommended",
    "a11y": { "preset": "none" },
    "complexity": { "noUselessContinue": "off", "useArrowFunction": "off", "useOptionalChain": "off" },
    "correctness": { "useExhaustiveDependencies": "off", "useHookAtTopLevel": "off" },
    "performance": { "noAccumulatingSpread": "off" },
    "style": { "noNonNullAssertion": "off", "useImportType": "off", "useTemplate": "off" },
    "suspicious": { "noArrayIndexKey": "off", "noAssignInExpressions": "off", "noControlCharactersInRegex": "off", "noExplicitAny": "off", "noImplicitAnyLet": "off", "noPrototypeBuiltins": "off", "noTemplateCurlyInString": "off", "useIterableCallbackReturn": "off" }
  } }
}
```

There is no baseline mechanism, because the residual is small enough to fix in the adoption PR. A later PR could re-enable `useImportType`, `useOptionalChain` and `noPrototypeBuiltins` with their autofixes.

## 4. Risks and unknowns

- Turning off a11y and `useExhaustiveDependencies` is a judgment call. The UI is Electron-only. Re-enable a11y as warnings later if wanted.
- `.gitignore` handling and `vcs.useIgnoreFile` were not tested against the real `.git`. Check with `npx @biomejs/biome@<v> lint .` from the repo root on the adoption branch.
- I measured no per-run variance beyond 3 runs. The npx startup is included in the Biome and oxlint times.
- Whether OpenAI's token endpoint rotates refresh tokens is unverified. It decides how severe the `probe.ts:1257` defect is.

Skipped: I did not test the `biome ci` flags or run the real repo through `npm ci` with Biome installed. Both are listed above with their checks.
