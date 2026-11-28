> Prototype notes for [`../plans/2026-11-28-major-updates.md`](../plans/2026-11-28-major-updates.md), written by the prototype's builder on 2026-11-28 and copied here unchanged. The patch and scripts it names are outside the repo in `private/research/2026-11-28-major-updates/js-yaml-5/`. Where these notes and the plan differ, the plan is right: it was audited and reviewed after them.

# js-yaml ^4.3.2 to ^5: prototype findings (2026-11-28)

Goal: a proven recipe for moving the root devDependency `js-yaml` to ^5, or proof it should be held.

Recommendation: **(b)**. Bump the root devDependency to `^5.0.0` (npm picks 5.5.0), delete the `"js-yaml": "$js-yaml"` override, and switch the repo's three default imports to `import * as yaml`. pm2, electron-updater and electron-builder keep their own js-yaml 4.3.2. All suites pass. The merged `latest-mac.yml` written by 5 reads back to the same values under the 4.3.2 copy that the shipped app bundles.

Labels: **run** = executed here, **read** = read in source or docs, **inferred** = reasoning without a run.

## Files

- `prototype.patch`: `git diff` of worktree `agent-aea75dec1ec1210c1` at base `8f1725f1`, lockfile included.
- `roundtrip.mjs`: the scratch round-trip script. Run it as `node roundtrip.mjs <repo with js-yaml 5 installed> <dir whose node_modules holds js-yaml 4.3.2 and a merge4.mjs copy of the merge script>`.

## The edits (run)

| File | Line | Before | After |
|---|---|---|---|
| `package.json` | 88 | `"js-yaml": "^4.3.2",` | `"js-yaml": "^5.0.0",` |
| `package.json` | 103-104 | `"@types/react": "$@types/react",` then `"js-yaml": "$js-yaml"` | `"@types/react": "$@types/react"` (override line deleted) |
| `build/merge-macos-update-metadata.mjs` | 3 | `import yaml from "js-yaml";` | `import * as yaml from "js-yaml";` |
| `tests/architecture/merge-macos-update-metadata.test.mjs` | 7 | same | same, plus `import { createRequire } from "node:module";` and one new test |
| `tests/architecture/release-publish-step.test.mjs` | 7 | same | same |
| `package-lock.json` | | root `js-yaml` 4.3.2 | root `js-yaml` 5.5.0 with `argparse` 3.0.4; nested `js-yaml` 4.3.2 plus `argparse` 2.0.1 under `pm2`, `electron-updater`, `app-builder-lib`, `builder-util` and `dmg-builder` |

A namespace import leaves every `yaml.load` and `yaml.dump` call unchanged. Named imports `{ dump, load }` would work as well. Typecheck passes either way because the files are `.mjs`.

## js-yaml 5.x changelog (read, CHANGELOG.md on master, fetched 2026-11-28)

| Version | Breaking or behaviour change |
|---|---|
| 5.0.0 | Rewritten in TypeScript with flat named exports. There is no default export, and the three repo imports fail without the change above (run: `import yaml from "js-yaml"` under 5.5.0 throws `does not provide an export named 'default'`). |
| 5.0.0 | `load` defaults to `CORE_SCHEMA` without `!!merge`, so `<<` merge keys, `!!timestamp`, `!!binary`, `!!omap`, `!!pairs` and `!!set` are not resolved by default. A plain ISO date loads as a string, not a `Date`. |
| 5.0.0 | `dump` uses `YAML11_SCHEMA` plus `CORE_SCHEMA` for its quoting check. The changelog gives backward compatibility as the reason. |
| 5.0.0 | `load()` throws on empty input. 4 returned `undefined`. |
| 5.0.0 | `!!set` loads as a JS `Set`. |
| 5.0.0 | Removed `safeLoad`, `safeLoadAll`, `safeDump`, `DEFAULT_SCHEMA`, the nested `types` export, `Type` (replaced by tags API), `Schema.extend` (now `withTags`). |
| 5.0.0 | Removed loader options `onWarning`, `legacy`, `listener`; dumper options `styles`, `replacer`, `noCompatMode`, `condenseFlow`, `quotingType`, `forceQuotes`; `noArrayIndent` renamed `seqNoIndent`. |
| 5.0.0 | Object mappings reject complex keys instead of stringifying them. Browser build moved to `js-yaml/browser`. Importing from `lib/` no longer works. |
| 5.1.0 | [breaking] `quoteStyle` picks the preferred quote style. `forceQuotes` is restored. |
| 5.2.0 | `maxMergeSeqLength` replaced by `maxTotalMergeKeys` (10000). New `maxAliases` option. Fix for integers in exponential form round-tripping. |
| 5.2.1 | `!!omap` fixes (Map support, quadratic `addItem`). |
| 5.2.2 | Quotes flow scalars where a colon comes before a flow indicator. Security fix for nested flow sequence pairs. |
| 5.2.3 | No prototype fallback when resolving tags or mapping entries. `!!timestamp` years 0000 to 0099 fixed. Implicit null fixes. |
| 5.3.0 | Grouped constant exports, with the flat ones deprecated. `MERGE_KEY` export removed. `identify` is required for custom tags. `<<` outside a key resolves to the string `'<<'`, as in 4. `DUMP_SCHEMA` exported. |
| 5.4.0 | [breaking] AST node style flattened (AST users only). [breaking] `sortKeys` rewritten. Scalar style selection reworked: formatting can change, loaded values do not. Whitespace-only strings are now double-quoted. BOM accepted per document. |
| 5.4.1 | Merge sequence hard limit of 100. Empty mappings count toward `maxTotalMergeKeys`. |
| 5.4.2 | `forceQuotes` no longer quotes non-string scalars. |
| 5.4.3 | Whitespace-only block scalar fix. |
| 5.5.0 | `argparse` 3. Rejects `,`, `]` and `}` at the start of block plain scalars. Better error positions. |

The repo uses none of the removed APIs or options (read). `merge-macos-update-metadata.mjs` calls `load(text)` and `dump(obj, { lineWidth: 120, noRefs: true })`, both still supported. `release-publish-step.test.mjs` calls `load` on `.github/workflows/release.yml` and `dump` on plain objects.

## Override decision

### Evidence for (b)

- `npm ls js-yaml --all` after the change (run): root `js-yaml@5.5.0`. `pm2`, `electron-updater`, `app-builder-lib`, `builder-util` and `dmg-builder` each have a nested `js-yaml@4.3.2`.
- `rm -rf node_modules && npm ci` from the new lockfile (run): exit 0.
- `npm audit --json | jq .metadata.vulnerabilities` (run): `moderate 6, total 6` on main and after the change. No change.
- Lowest 4.x each could resolve to (read, from each `package.json`): `pm2@7.1.1` pins `js-yaml` to exactly `4.3.2`. `electron-updater@6.8.11`, `app-builder-lib`, `builder-util` and `dmg-builder@26.18.1` declare `^4.1.0`, so 4.1.0 is the floor in theory. The lockfile pins 4.3.2 for all five, and npm resolves a caret to the newest 4.x (inferred). 4.1.0 predates the 4.1.1 security fix the changelog mentions. That risk applies only if someone regenerates the lockfile with a cap. It also existed on main under any override change.
- The shipped app gets 4.3.2 (run). `electron-updater` is bundled into the Electron main by esbuild, because `nodeExternals` in `build/esbuild.config.mjs:85` lists only `electron`, `better-sqlite3` and the builtins. A scratch `npx esbuild packages/electron/src/main/update-service.ts --bundle --platform=node --external:electron --metafile` pulls in only `node_modules/electron-updater/node_modules/js-yaml`.
- Nothing pins the override (read). `tests/architecture/dependency-overrides.test.mjs` checks only the ai-gateway `glob` override, baseui and styletron, and `core-js` install scripts. No other architecture or package test mentions `js-yaml` or the `$js-yaml` override. `gateway-dependency.test.mjs` does not mention it either.
- The override's origin (run): `git log -S'"js-yaml": "$js-yaml"' -- package.json` gives only `e38f9bc2 Refactor router configuration and request handling` (upstream), with no stated reason. pm2 now pins 4.3.2 itself, so the override no longer does anything for pm2's js-yaml version (read).

### Why not (a): call sites that the override would force onto 5 (read)

| Package | File:line | Call | Options and schema | Does 5 change the result? |
|---|---|---|---|---|
| pm2 7.1.1 | `lib/Common.js:308` (`Common.parseConfig`) | `load(confObj.toString())` for `.yml` and `.yaml` ecosystem files | default (4: DEFAULT_SCHEMA; 5: CORE without merge) | Yes for files that use `<<` merge keys (they stop merging), dates (they become strings), or empty files (5 throws). LLMR source never imports pm2: `grep -rn pm2 packages/*/src build` finds nothing, and `packages/core/package.json:23` only declares it. So no LLMR path reaches this (read). |
| electron-updater 6.8.11 | `out/providers/Provider.js:97` (`parseUpdateInfo`) | `load(rawData)` of `latest*.yml` | default | Values are the same for electron-builder output, whose strings come out quoted (run, the round-trip script checks `y5.load`). For an empty file, 5 throws and 4 returns `undefined`. Both reach `ERR_UPDATER_INVALID_UPDATE_INFO` (read; not run). This is runtime code in the shipped app, outside electron-updater's declared range. |
| electron-updater | `out/providers/PrivateGitHubProvider.js:34` | `load(httpResponse)` | default | Same as above. Private GitHub provider only. |
| electron-updater | `out/AppUpdater.js:486` | `load(app-update.yml)` | default | Same values for electron-builder's `app-update.yml` (inferred from the same dump path). |
| app-builder-lib 26.18.1 | `out/util/config/load.js:48` | `load(data)` for a yml or yaml builder config | default | Would change for `<<` or dates. LLMR uses `build/electron-builder.local.cjs`, so this branch is not taken (read). |
| app-builder-lib | `out/targets/nsis/nsisLang.js:68` | `load(nsis template)` | default | Windows NSIS only. Templates not audited for 1.1 types. |
| app-builder-lib | `out/targets/snap/coreLegacy.js:65`, `coreCustom.js:42` | `load(snapcraft yaml)` | default | Snap only. LLMR does not build snaps (inferred from the build scripts). |
| app-builder-lib | `out/targets/snap/coreCustom.js:48`, `core24.js:53,120` | `dump(snap, { indent: 2, lineWidth: -1, noRefs: true })` | default dump schema | Formatting can change (5.4.0). Options are still supported. Snap only. |
| builder-util 26.18.1 | `out/util.js:95-100` (`serializeToYaml`) | `dump(obj, { lineWidth: 8000, skipInvalid, noRefs })` | default dump schema | Writes `latest-mac.yml`, `latest.yml` and `app-update.yml` (`updateInfoBuilder.js:194`, `PublishManager.js:89`) plus debug and effective-config dumps (`packager.js:528`). Bytes change (quoting) but values do not, per the round trip below (inferred for these inputs). |
| dmg-builder 26.18.1 | `out/dmgLicense.js:70` | `load(license.yml, { schema: CORE_SCHEMA })` | explicit `CORE_SCHEMA` | 5's CORE_SCHEMA is the "spec-compliant" rework, so int and float edge cases may resolve differently. Only used when a DMG license file is configured. LLMR's config was not checked for one. |

(a) puts five packages on a major version none of them declare. That includes electron-updater, which runs in users' apps. In return, one copy of js-yaml is saved on disk. (c) is not needed: (b) passes everything and keeps every third-party reader on the version it was written for.

## Round trip (run)

Script: `roundtrip.mjs`. Each case's inputs are written the way electron-builder writes them: js-yaml 4.3.2 `dump(info, { lineWidth: 8000, noRefs: true })`, which is `serializeToYaml(info, false, true)`. Then:

1. The repo's merge script runs with js-yaml 5.5.0, and a copy of the same script runs next to js-yaml 4.3.2.
2. Both outputs are parsed with js-yaml 4.3.2, and the script asserts deep equality.
3. The 5.5.0 output is also parsed with 5.5.0 and asserted equal.
4. The script asserts that `version`, `path`, `sha512`, `releaseDate` and every file's `sha512` load as strings.

The cases are the test fixtures, a real shape (88-character base64 sha512, `size`, `blockMapSize`, ISO `releaseDate`), sha512 values `2026-11-16`, `=leadingEquals+abc/def==` and `1e5`, 22 odd scalars (`123 0x1F true null ~ 0o17 .inf 1_000 <ISO> yes on << "- a" "a: b" #x " lead" "trail " "" "   " 012 +1 1.0`), and version `10.0`.

Result: every value matches under 4 and 5. The bytes differ on three lines.

```
v4: "    sha512: '=leadingEquals+abc/def=='"   v5: "    sha512: =leadingEquals+abc/def=="
v4: "    sha512: '   '"                         v5: "    sha512: \"   \""
v4: "    sha512: 1_000"                         v5: "    sha512: '1_000'"
```

js-yaml 4.3.2 reads all three as the same strings. 4 does not implement the YAML 1.1 `!!value` type for `=`, and has not resolved underscore numbers since 4.2.0. The test fixtures and the version case are byte-identical apart from the `=` line. `releaseDate` stays quoted (`'2026-...Z'`) in both, so shipped apps never get a `Date`.

## In-repo test (run)

`tests/architecture/merge-macos-update-metadata.test.mjs` gets "the js-yaml that electron-updater ships reads the merged file with every value a string". The test loads the js-yaml that electron-updater itself resolves, through `createRequire(path.resolve("node_modules/electron-updater/package.json"))("js-yaml")`, which is 4.3.2 under (b) (run). It loads only js-yaml, never electron-updater. It merges inputs whose sha512 values are `=leading+equals== 1e5 2026-11-16 0x1F 1_000 012 true null ~ on`, with version `10.0` and an ISO releaseDate. It then asserts the exact strings for every sha512, plus `version`, `path`, `sha512` and `releaseDate`.

`import.meta.url` cannot be used here. `build/test.mjs` bundles the tests to CJS and esbuild leaves `import.meta` empty (run, the first attempt failed for that reason).

Mutation (run): adding `schema: yaml.CORE_SCHEMA` to the merge script's `dump` options fails the new test, and only that test (6 pass, 1 fail). The failure is `+ 2026-11-16T00:00:00.000Z  - '2026-11-16'`: under that option 5 writes the date-like sha512 unquoted, and 4 reads it as a `Date`. A first try with `FAILSAFE_SCHEMA` was rejected as a mutation, because it makes `dump` fail on the integer `size` and breaks four tests for an unrelated reason. Reverted after the run.

## Suite counts after the change (run)

| Suite | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `rtk bypass npm run lint` (run as `RTK_DISABLED=1`) | exit 0, 948 files, no findings |
| `npm run test:architecture` | 219 tests, 219 pass (218 before the new test) |
| `npm run test:electron` | 46 tests, 46 pass |
| `npm run test:cli` | 21 tests, 21 pass |
| `LLMR_TEST_GATEWAY_ENTRY=... npm run test:core` | 2559 tests, 2543 pass, 0 fail, 16 skipped |

## Not checked

- Whether main also shows 16 skipped in core. Not compared; the skips are assumed to come from the environment.
- `npm run build:assets`, packaging, e2e and the desktop app (off limits). The bundle check used a scratch esbuild run of `update-service.ts` only.
- The real `release.yml` merge job on CI with real electron-builder output. The round trip used synthetic inputs in electron-builder's dump format. Fields electron-builder can add (`releaseNotes`, `minimumSystemVersion`, `stagingPercentage`) were not in the fixtures.
- Under (a): NSIS templates and DMG license loading under 5's CORE_SCHEMA, and electron-updater's empty-file path. Read only, not run.
- Whether the pm2 dependency in `packages/core` is still needed. No source imports it. This is a finding only and outside this change.
