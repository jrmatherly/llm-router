# Audit remediation: Codex runtime source and profile service extraction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Codex CLI middleware runtime script under the type checker, and shrink `profiles/service.ts` by the two agent clusters that can leave it without a redesign.

**Architecture:** The runtime script moves verbatim from a `String.raw` template into `cli-middleware-runtime-source.runtime.cjs`, which esbuild loads as text, so the script LLMR writes to disk stays byte-identical. A second `tsc` project then checks that file with `checkJs` and `strict: false`. For the profile service, a new leaf module `profiles/apply-support.ts` takes the helpers Grok and Kimi need, and the two clusters move to `agents/grok/profile-config.ts` and `agents/kimi/profile-config.ts`. Agent modules import the profiles leaf, as `agents/{kilo,opencode,pi,zcode}/profile-config.ts` already do.

**Tech Stack:** TypeScript 6.0.3, esbuild 0.28.2, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md` (findings F-G1 and F-G2, decisions D-7 and D-8).

## Global Constraints

Copied from the spec:

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

- All line numbers are from `136ad730`. Earlier plans in the program move them, so find each edit by its symbol or text anchor.
- The runtime script must stay one self-contained file. `profiles/service.ts` and `profiles/launch-service.ts` write the return value of `codexCliMiddlewareRuntimeScript()` to `CONFIGDIR/bin/llmr-codex-cli-middleware.js`, and wrappers run that file with `node`.
- `codexCliMiddlewareRuntimeScript(): string` keeps its name, signature and module path.
- ST-3, ST-4 and ST-5 are move-only. A moved declaration changes only by gaining `export`. No rename, no reformat, no merge with a same-named helper in another file.
- Land ST-3 to ST-5 when no open branch touches `packages/core/src/profiles/service.ts`. The file had 29 commits in the 90 days before the audit, and a move-only PR conflicts with every one of them.
- Biome does not lint the `.runtime.cjs` file. If TL-1 in the [tooling plan](completed/2026-11-16-audit-tooling.md) has merged, ST-1 adds `"!packages/core/src/agents/codex/*.runtime.cjs"` to `files.includes` in `biome.json` in the same PR. Nobody edits the script to satisfy lint, because that breaks the byte-identical gate.
- JSDoc type annotations in the `.runtime.cjs` file are allowed. They are how D-7's check is satisfied, and they count as a non-obvious why.

## Measurements behind this plan

Run on 2026-11-16 at `136ad730` with the repo's own esbuild and TypeScript, against scratch copies. Nothing in the repo was built or changed.

- The emitted script is 301,916 bytes and 7,344 lines, sha256 `e35ead7b47ca5dc816950ef265c2c2ad93e6c00ec97ec14f0577f63b20ee2af1`. The scratch copy of ST-1 gives the same hash, bundled both plain and with `--minify`.
- The template has one interpolation (`${JSON.stringify(codexBaseInstructions)}` at `:4701`) and one escaped backtick (`:541`), which `String.raw` already emits as written. Cutting the text between the two backticks is therefore a pure text move.
- A build without the loader entry does not fail. esbuild exits 0 and compiles the file as a CommonJS module whose body is the script code, required at module scope. The host process would then run the middleware script at startup. With the loader, the same wrapper holds one string (`module.exports = \`#!/usr/bin/env node…\``). This was read from the two bundles, not run.
- Only three production entry points reach the module: `packages/electron/src/main/main.ts`, `packages/cli/src/cli.ts` and `packages/core/src/entrypoints/server.ts` (esbuild metafile, `write: false`). The four lightweight MCP bundles, `toolhub-mcp`, both workers, the gateway runtime files, the renderer bundles and `build/benchmark-request-logs.mjs` do not.
- `tsc` with `checkJs` and `strict: false` reports 11 errors in the `.cjs` file and takes 0.6 s. Six JSDoc annotations clear all 11 (see ST-2).
- A scratch copy of ST-3, ST-4 and ST-5 type-checks clean under the root `tsconfig.json`. `service.ts` goes from 4,539 to 3,805 lines.

---

## ST-1: Move the Codex runtime script into a .cjs source file

**Fixes:** F-G1 (first half)
**Depends on:** UL-2, for ordering only, as the [program index](2026-11-16-audit-remediation-index.md) orders it. See the ordering note below.
**Branch:** `refactor/codex-runtime-source-file`
**Size:** M (7,343 moved lines, about 60 new)
**Owner steps:** Optional. After the next Windows release build, open `bin\llmr-codex-cli-middleware.js` under the LLMR config directory (`CONFIGDIR`) and confirm it has no carriage returns. Nobody has checked whether the Windows runner checks files out with CRLF.

**Status:** Merged 2026-11-18 with ST-2 as [PR 106](https://github.com/jrmatherly/llm-router/pull/106), squash commit `1f8cb7c8`, branch `refactor/codex-runtime-source-file`. The move is byte-identical. The emitted script hashed to `94dcdc02669d55a8ffd58ff9fc70007729b46d10a5e1fb639fd0700ffa0a3354` (298,663 bytes) on the base and on the ST-1 commit. A reviewer got the same hash by another route, through `node build/test.mjs core`. The new file has 7,290 lines, because UL-1 and UL-2 had already edited the text.

The review of PR 106 changed these points:

- **The loader test in Step 2 could be fooled, so it was replaced.** It matched source text in three named functions. A fourth config with no loader passed it, a later `loader` key that overrode the first passed it, and a loader spread from a shared object failed it. `tests/architecture/package-boundaries.test.mjs` now builds every `create*BuildOptions` config in memory. For each bundle whose inputs include a `.runtime.cjs` file, it requires a hashbang past offset 0. It takes under a second.
- **The marker in Step 11 is not proof on its own.** esbuild drops comments only when it minifies. An unminified bundle keeps a comment from the script even when it compiled the script as a module. The production bundles are minified, so the Step 11 counts were right, but the reliable marker is the hashbang. esbuild keeps one only at the top of an entry, so one further in is string data.
- **A lost loader shipped green.** With the loader removed from `createCliBuildOptions`, `npm run build:assets` exits 0, and `cli.js --help` then runs the Codex middleware in the host and launches `codex` when it is installed. The e2e job, the unit job and the Docker smoke all passed that build. `tests/e2e/cli-web.spec.ts` now runs the built CLI's `--help` in a temporary home and requires exit 0 and an empty stderr.

TL-1 had merged, so `biome.json` excludes `*.runtime.cjs` as the constraints say. The optional Windows check under Owner steps is still open.

**Ordering against the [upstream leftovers plan](2026-11-16-audit-upstream-leftovers.md).** UL-1 and UL-2 edit this script (the `TZ` override and the `CODEXL_*` names). Either order works, and neither needs a fixed hash.

- If the leftovers PRs merged first, this PR moves the edited text. The emitted hash is then not `e35ead7b…`. That is expected.
- If this PR merges first, the leftovers PRs edit `cli-middleware-runtime-source.runtime.cjs` instead of `cli-middleware-runtime.ts`, at the same text anchors, three lines earlier.

The gate is that the emitted script is byte-identical between this PR's base commit and its head. Never compare against the hash recorded at `136ad730`.

### Task 1: Move the script and load it as text

**Files:**
- Create: `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs`
- Create: `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.d.cts`
- Create: `.gitattributes`
- Modify: `biome.json`, only if TL-1 has merged. Add `"!packages/core/src/agents/codex/*.runtime.cjs"` to `files.includes`. Do not edit the script to satisfy lint.
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime.ts` (whole file, 7,348 lines become 6)
- Modify: `build/esbuild.config.mjs` (`createMainBuildOptions` `:281`, `createCliBuildOptions` `:318`, `createCoreServerBuildOptions` `:353`)
- Modify: `build/test.mjs:113-121` (the `loader` map of the single `esbuild.build` call)
- Test: `tests/architecture/package-boundaries.test.mjs`
- Test: `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`

**Interfaces:**
- Produces: `codexCliMiddlewareRuntimeScript(): string`, unchanged, from `@llmr/core/agents/codex/cli-middleware-runtime`.
- Produces: the sentinel `"__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__"`, a quoted string literal inside the `.cjs` file. The wrapper replaces the literal with its quotes. A quoted sentinel keeps the `.cjs` file valid JavaScript without a global declaration, so `node --check` and ST-2's `tsc` pass read it as it is.
- Produces: the esbuild loader entry `".runtime.cjs": "text"`. ST-2 relies on the file name.

Build entry points that can bundle core, and what each needs:

| Build | Where | Bundles the runtime | Change |
|---|---|---|---|
| Electron main | `build/esbuild.config.mjs:281` `createMainBuildOptions` | Yes, through `main.ts` | Add `loader` |
| CLI | `build/esbuild.config.mjs:318` `createCliBuildOptions` | Yes, through `cli.ts` | Add `loader` |
| Core server (Docker) | `build/esbuild.config.mjs:353` `createCoreServerBuildOptions` | Yes, through `entrypoints/server.ts` | Add `loader` |
| Tests | `build/test.mjs:99-125`, one call for every project | Yes, core, cli and electron tests | Add one key to the existing `loader` map |
| Dev watch | `build/dev.mjs:436` and `:447` | Reuses `createMainBuildOptions` and `createCliBuildOptions` | None |
| Lightweight MCP bundles | Entry points of the three configs above (`lightweightMcpBundleNames`, `:73`) | No | None. The config-level `loader` covers them anyway |
| Renderer, tray, browser, web bridge, log worker, bot gateway SDK | `build/esbuild.config.mjs:385-489` | No | None |
| Request log benchmark | `build/benchmark-request-logs.mjs:18` | No | None |

- [ ] **Step 1: Create the branch and record the base hash**

```bash
git switch -c refactor/codex-runtime-source-file origin/main
runtime_hash() {
  node_modules/.bin/esbuild packages/core/src/agents/codex/cli-middleware-runtime.ts \
    --bundle --format=cjs --platform=node --alias:@llmr/core=./packages/core/src \
    --loader:.runtime.cjs=text --log-level=warning --outfile="$1" &&
  node -e 'const s=require(process.argv[1]).codexCliMiddlewareRuntimeScript();console.log(require("node:crypto").createHash("sha256").update(s).digest("hex"),Buffer.byteLength(s))' "$1"
}
runtime_hash /tmp/llmr-runtime-base.cjs | tee /tmp/llmr-runtime-base.txt
```

Expected: one line with a 64-character hash and a byte count. At `136ad730` it prints `e35ead7b47ca5dc816950ef265c2c2ad93e6c00ec97ec14f0577f63b20ee2af1 301916`. On a later base the values differ, and the printed line is the one to match. The `--loader` flag does nothing on the base commit.

- [ ] **Step 2: Write the failing architecture tests**

Append to `tests/architecture/package-boundaries.test.mjs`. Add `execFileSync` from `node:child_process` to the imports.

```js
const runtimeSourceFile = "packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs";

test("every bundle that can include core loads .runtime.cjs sources as text", () => {
  const buildConfig = readFileSync(path.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  for (const name of ["createMainBuildOptions", "createCliBuildOptions", "createCoreServerBuildOptions"]) {
    const section = buildConfig.split(`export function ${name}(`)[1].split("\nexport function ")[0];
    assert.match(section, /loader:\s*\{\s*"\.runtime\.cjs":\s*"text"\s*\}/, `${name} must load .runtime.cjs as text`);
  }
  assert.match(readFileSync(path.join(projectRoot, "build", "test.mjs"), "utf8"), /"\.runtime\.cjs":\s*"text"/);
});

test("the Codex runtime source is checked out with LF line endings on every platform", () => {
  const attribute = execFileSync("git", ["check-attr", "eol", "--", runtimeSourceFile], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(attribute.trim(), `${runtimeSourceFile}: eol: lf`);
  assert.equal(readFileSync(path.join(projectRoot, runtimeSourceFile), "utf8").includes("\r"), false);
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/package-boundaries.test.js`
Expected: FAIL. The first test reports `createMainBuildOptions must load .runtime.cjs as text`. The second reports `eol: unspecified`.

- [ ] **Step 4: Add the placeholder test**

In `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`, add `import { codexBaseInstructions } from "@llmr/core/agents/codex/base-instructions.ts";` and this test after `generated Codex CLI middleware runtime is valid JavaScript` (`:11`).

```js
test("generated Codex CLI middleware runtime has no unreplaced placeholder", () => {
  const runtime = codexCliMiddlewareRuntimeScript();
  assert.equal(runtime.includes("__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__"), false);
  assert.equal(runtime.includes(`base_instructions: ${JSON.stringify(codexBaseInstructions)},`), true);
  assert.equal(runtime.startsWith("#!/usr/bin/env node\n\"use strict\";\n"), true);
  assert.equal(runtime.includes("\r"), false);
});
```

This test passes on the base commit too. It is a guard for the new mechanism, so there is no failing run to observe for it. The architecture tests in Step 2 are the ones that fail first.

- [ ] **Step 5: Create the `.cjs` source by cutting the template text**

Do not retype or copy by hand. This command writes the text between the two backticks and swaps the one interpolation for the sentinel. It throws if the file has any other `${`.

```bash
node -e '
const fs = require("node:fs");
const [from, to] = process.argv.slice(1);
const src = fs.readFileSync(from, "utf8");
const start = src.indexOf("String.raw`") + "String.raw`".length;
const body = src.slice(start, src.lastIndexOf("`"));
const interpolation = "${JSON.stringify(codexBaseInstructions)}";
if (body.split(interpolation).length !== 2 || body.replace(interpolation, "").includes("${")) throw new Error("expected exactly one interpolation");
fs.writeFileSync(to, body.replace(interpolation, "\"__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__\""));
' packages/core/src/agents/codex/cli-middleware-runtime.ts packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
node --check packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
grep -c '__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__' packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
```

Expected: `node --check` prints nothing and exits 0, and `grep -c` prints `1`. At `136ad730` the new file has 7,343 lines, starts with `#!/usr/bin/env node`, and the sentinel line reads `    base_instructions: "__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__",`.

- [ ] **Step 6: Add the declaration file, the wrapper, and the line-ending rule**

`packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.d.cts`:

```ts
declare const source: string;
export = source;
```

`packages/core/src/agents/codex/cli-middleware-runtime.ts`, the whole file:

```ts
import { codexBaseInstructions } from "@llmr/core/agents/codex/base-instructions";
import runtimeSource from "@llmr/core/agents/codex/cli-middleware-runtime-source.runtime.cjs";

export function codexCliMiddlewareRuntimeScript(): string {
  return runtimeSource.replace("\"__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__\"", () => JSON.stringify(codexBaseInstructions));
}
```

The function replacer matters. A string replacement would expand `$&` and `$1` if the instructions ever contain them.

`.gitattributes` (new file, one line):

```
*.runtime.cjs text eol=lf
```

A template literal turns CRLF into LF. The text loader does not, so without this rule a CRLF checkout would ship a different script on Windows.

Do not use `import … with { type: "text" }`. `tsc` rejects it with TS2856 here, because no `package.json` sets `"type": "module"`.

- [ ] **Step 7: Add the loader to every build that bundles core**

In `build/esbuild.config.mjs`, add this line after `legalComments: "none",` in `createMainBuildOptions` (`:306`), `createCliBuildOptions` (`:342`) and `createCoreServerBuildOptions` (`:374`):

```js
    loader: { ".runtime.cjs": "text" },
```

In `build/test.mjs`, add `".runtime.cjs": "text",` to the existing `loader` map, between `".png"` and `".svg"` (`:118-119`).

- [ ] **Step 8: Extend the architecture scans if they would stop reading this text**

At `136ad730` no change is needed, and this step confirms that on the PR's base.

```bash
grep -n 'ls-files\|-lI\|sx?)\|cjs' tests/architecture/english-only.test.mjs tests/architecture/package-boundaries.test.mjs scripts/llmr-rename.mjs
git grep -n 'cli-middleware-runtime' -- tests scripts .claude AGENTS.md docs/src build
git grep -ln 'CODEXL_' -- tests/architecture scripts
```

What each result means:

- `english-only.test.mjs` scans every tracked text file (`git ls-files`, `:17`), and its escaped-Han filter is `/\.(?:[cm]?[jt]sx?)$/` (`:32`), which matches `.cjs`. If either line changed and no longer covers `.cjs`, add it.
- `scripts/llmr-rename.mjs` scans every file `git grep -lI -e ""` lists (`:207`), minus `skippedPaths` (`:24-34`). The `.cjs` file is covered unless a path was added there.
- `package-boundaries.test.mjs` `sourceFiles` (`:58`) already lists `cjs`.
- The second command lists path references. Any test, script, rule or doc that names `cli-middleware-runtime.ts` as the place where script text lives must name `cli-middleware-runtime-source.runtime.cjs` instead. At `136ad730` it prints only source and test imports of the wrapper, which stay as they are.
- The third command finds a `CODEXL_` guard, which UL-2 adds as `tests/architecture/codexl-names.test.mjs`. If a guard exists, read its file filter. If the filter is an extension list without `cjs`, or a path list with the old `.ts` file, extend it in this PR and confirm the guard still fails when you add `CODEXL_X` to the `.cjs` file in a scratch edit.

- [ ] **Step 9: Run the tests and the type check**

```bash
npm run typecheck
node build/test.mjs architecture && node --test .test-dist/architecture/test/package-boundaries.test.js .test-dist/architecture/test/english-only.test.js .test-dist/architecture/test/llmr-rename.test.js
node build/test.mjs core && node --test .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js
```

Expected: `typecheck` exits 0. Every architecture test passes. The integration file reports one more passing test than the same command reports on the PR's base commit, and no failures. At `136ad730` that is 30 (29 plus the new one). The count is higher if UL-1 and UL-2 have merged, because they add tests to this file.

- [ ] **Step 10: Check the byte-identical gate**

```bash
runtime_hash /tmp/llmr-runtime-head.cjs | tee /tmp/llmr-runtime-head.txt
diff /tmp/llmr-runtime-base.txt /tmp/llmr-runtime-head.txt && echo IDENTICAL
```

Expected: `IDENTICAL`. If the lines differ, the move changed the script. Find the difference with `diff <(node -p 'require("/tmp/llmr-runtime-base.cjs").codexCliMiddlewareRuntimeScript()') <(node -p 'require("/tmp/llmr-runtime-head.cjs").codexCliMiddlewareRuntimeScript()')` and fix the source file. Do not continue until the two lines match.

If you rebase the branch, recompute the base line from the new merge base before comparing. `git worktree add --detach /tmp/llmr-st1-base "$(git merge-base origin/main HEAD)"` gives a checkout to run the Step 1 command in, with `node_modules/.bin/esbuild` replaced by the absolute path of this checkout's binary.

Put both lines in the PR description. Do not add a test that pins the hash, because every later edit to the script would break it.

- [ ] **Step 11: Confirm the production bundles carry the text**

```bash
npm run build:assets
grep -c 'Promoting it to an' packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
grep -c 'Promoting it to an' packages/electron/dist/main/main.js packages/cli/dist/main/cli.js packages/core/dist/main/server.js
git checkout -- packages/core/models.json packages/ui/src/generated
```

Expected: every count is `1`. The phrase is from a code comment in the script (`.cjs` `:215`, `// Keep the profile model as an environment default. Promoting it to an`). esbuild drops comments from code it compiles, so a comment from the script survives only where the script is a string. If the first command prints `0`, an earlier PR reworded that comment. Pick another `//` comment that sits in code, not inside a string or template literal, and use its text. A count of `0` means that bundle compiled the script as a module, and its config is missing the loader. In scratch bundles the marker count was 1 with the loader, plain and minified, and 0 without it. If a `dist` path differs, take it from `electronMainOutDir`, `cliMainOutDir` and `coreMainOutDir` in `build/esbuild.config.mjs`.

- [ ] **Step 12: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0.

- [ ] **Step 13: Commit**

```bash
git add .gitattributes build/esbuild.config.mjs build/test.mjs $(git ls-files biome.json) tests/architecture/package-boundaries.test.mjs packages/core/src/agents/codex packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs
git commit -m "refactor(core): move the Codex runtime script into a .cjs source file"
```

---

## ST-2: Type-check the Codex runtime script

**Fixes:** F-G1 (second half)
**Depends on:** ST-1
**Branch:** `chore/typecheck-codex-runtime`
**Size:** S
**Owner steps:** None

**Status:** Merged 2026-11-18 with ST-1 as [PR 106](https://github.com/jrmatherly/llm-router/pull/106), squash commit `1f8cb7c8`. The check reported the 11 errors in Step 4, with the same codes in the same order, at shifted line numbers. None was a bug. The emitted script is now 299,011 bytes, sha256 `0821e7998f0617ce39cdc6c45270c0e54886242ab13d9647f6470dae616e4570`.

Where the run differed from this plan:

- Anchor A, `textLen: commandReply.length`, occurs twice in the script now. The type checker flags only the `agent: "opencode"` call, so only that one has the cast.
- TL-2 had added a test that pinned `scripts.typecheck` to `tsc --noEmit`. Both tests in `tests/architecture/package-scripts.test.mjs` now share one expected string.
- The review found that one `// @ts-nocheck` line in the script turned the whole check off with nothing failing. The test now rejects `@ts-nocheck`, `@ts-ignore` and `@ts-expect-error` in the file.
- `AGENTS.md` describes the second type-check project.

This PR changes the emitted script on purpose. It adds six comments and one pair of parentheses, so the ST-1 hash gate does not apply here.

### Task 1: Add the non-strict check and clear its errors

**Files:**
- Create: `tsconfig.codex-runtime.json`
- Modify: `package.json:69` (`scripts.typecheck`)
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs` (six annotations)
- Test: `tests/architecture/package-scripts.test.mjs`

**Interfaces:**
- Consumes: the `.runtime.cjs` file from ST-1.
- Produces: `npm run typecheck` now runs two `tsc` projects. The commit gate (`.claude/hooks/gate-commit.mjs:8`), `test.yml:38`, `release.yml:36` and `scripts/release.mjs:15` all call `npm run typecheck`, so they pick the second project up with no edit.

- [ ] **Step 1: Create the branch and write the failing architecture test**

```bash
git switch -c chore/typecheck-codex-runtime origin/main
```

Append to `tests/architecture/package-scripts.test.mjs`:

```js
test("typecheck covers the Codex runtime script without strict mode", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.typecheck, "tsc --noEmit && tsc --noEmit -p tsconfig.codex-runtime.json");
  const runtimeProject = JSON.parse(readFileSync("tsconfig.codex-runtime.json", "utf8"));
  assert.equal(runtimeProject.compilerOptions.checkJs, true);
  assert.equal(runtimeProject.compilerOptions.strict, false);
  assert.deepEqual(runtimeProject.files, ["packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs"]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/package-scripts.test.js`
Expected: FAIL on the `scripts.typecheck` assertion, with actual value `tsc --noEmit`.

- [ ] **Step 3: Create `tsconfig.codex-runtime.json` at the repo root**

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "lib": ["ESNext"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "skipLibCheck": true,
    "strict": false,
    "target": "ESNext",
    "types": ["node"]
  },
  "files": ["packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs"]
}
```

`strict` must be written out. TypeScript 6 turns it on by default, and the strict pass reports 898 errors.

Change `package.json:69` to:

```json
"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.codex-runtime.json",
```

- [ ] **Step 4: Run the new project and compare the errors with this list**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.codex-runtime.json`
Expected at `136ad730` plus ST-1: 11 errors, exit code 2. Line and column numbers are positions in the `.cjs` file.

| # | Location | Code | Message, shortened | Kind | Fix |
|---|---|---|---|---|---|
| 1 | `1189,94` | TS2339 | `length` does not exist on `string \| { forwardText: string }` | Annotation | A |
| 2 | `4260,34` | TS2345 | `agentItemJson` result not assignable to the `userItemJson` shape | Annotation | B |
| 3 | `5093,42` | TS2339 | `session` does not exist on `unknown` | Annotation | C |
| 4 | `5121,59` | TS2339 | `events` does not exist on `unknown` | Annotation | C |
| 5 | `5121,78` | TS2339 | `events` does not exist on `unknown` | Annotation | C |
| 6 | `5739,128` | TS2339 | `command` does not exist on `{ env; transport }` | Annotation | D |
| 7 | `5919,52` | TS2339 | `electronRunAsNode` does not exist on `{}` | Annotation | D |
| 8 | `5920,25` | TS2339 | `electronRunAsNode` does not exist on `{}` | Annotation | D |
| 9 | `6802,20` | TS2345 | image item not assignable to `{ type; text }` | Annotation | E |
| 10 | `6919,21` | TS2339 | `threadId` does not exist on the `ref` literal type | Annotation | F |
| 11 | `6921,25` | TS2339 | `contextToken` does not exist on the `ref` literal type | Annotation | F |

None of the 11 is a real bug. Error 1 is the only one that reads like one, and it is not. `handleCommand` returns an object only from two places (`return prompt ? { forwardText: prompt + … } : "…"` at `:1609`, and `forwardSkillCommand` at `:2357`), and both always set a non-empty `forwardText`. The `else if (commandReply !== null)` branch at `:1187` therefore only ever sees a string. This was read from the code, not run.

If your run prints a different list, an earlier PR edited the script. For each extra error, read the code path. An error is a real bug only when a value the code can produce at run time reaches the flagged expression with the wrong type. A real bug gets its own failing test in `codex-cli-middleware-runtime.test.mjs`, written before the fix, in its own commit. Everything else gets a JSDoc annotation.

- [ ] **Step 5: Apply the six annotations**

Find each by its text anchor. Each anchor occurs once in the file.

- **A.** Anchor `textLen: commandReply.length` (the `agent: "opencode"` log call, `:1189`). Replace with `textLen: /** @type {string} */ (commandReply).length`.
- **B.** Anchor `const items = [userItemJson(turn)];` in `turnItems` (`:4258`). Add the line `/** @type {object[]} */` above it.
- **C.** Anchor `async request(method, suffix, body) {` (`:5149`). Add the line `/** @returns {Promise<any>} */` above it.
- **D.** Anchor `const commandOptions = Object.assign({}, command || {});` in `botGatewaySdkClientOptions` (`:5918`). Add above it: `/** @type {{ args?: string[], command?: string, cwd?: string, electronRunAsNode?: boolean }} */`
- **E.** Anchor `const input = [{ type: "text", text }];` in `botInputForEvent` (`:6791`). Add the line `/** @type {object[]} */` above it.
- **F.** Anchor `const ref = {` in `conversationRefFromEvent` (`:6913`). Add above it: `/** @type {{ contextToken?: string, gatewayConversationId?: string, platformConversationId?: string, threadId?: string, type: string }} */`

Two rules for any annotation in this file. Keep the braces inside a comment balanced, and never put a comment between `function name(` and that function's opening `{`. The tests cut functions out of the script by counting braces from `function <name>(` (`extractRuntimeFunctionSource`, test file `:1470`).

- [ ] **Step 6: Run the checks and see them pass**

```bash
npm run typecheck
node --check packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
node build/test.mjs architecture && node --test .test-dist/architecture/test/package-scripts.test.js
node build/test.mjs core && node --test .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js
```

Expected: `typecheck` exits 0 with no output from either project. `node --check` exits 0. Both test files pass with no failures.

- [ ] **Step 7: Confirm the diff to the script is only the annotations**

Run: `git diff --stat origin/main -- packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs`
Expected at `136ad730` plus ST-1: `6 insertions(+), 1 deletion(-)`. One changed line (A) and five added lines.

- [ ] **Step 8: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0.

- [ ] **Step 9: Commit**

```bash
git add tsconfig.codex-runtime.json package.json tests/architecture/package-scripts.test.mjs packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs
git commit -m "chore(core): type-check the Codex runtime script"
```

---

## Shared gate for ST-3, ST-4 and ST-5

Each of the three PRs is move-only and has no new test. Its gate has three parts.

**Part 1, the type check.** `npm run typecheck` exits 0. With `noUnusedLocals` on, it also proves the import lists are exact. A declaration left behind collides with its import (TS2440), and an import that is no longer used fails (TS6133).

**Part 2, the existing tests.**

```bash
node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js
```

Expected: the same test count as this command reports on the PR's base commit, and no failures. At `136ad730` that is 63. UL-1 and UL-2 add tests to this file, so record the base count first. Check that these four ran and passed, not skipped: `Grok profile source home follows profile and process environment overrides`, `Kimi profile source home follows profile and process environment overrides`, `profile service writes a Grok CLI wrapper that points model discovery and inference to LLMR`, and `profile service writes a multi-model Kimi CLI home that points inference to LLMR`. The last two skip unless `LLMR_INTERNAL_HOME_DIR` is set. `build/test-home.mjs` sets it in every compiled test file, so a skip means the test build is wrong.

**Part 3, the moved bodies are unchanged.** Save this script as `/tmp/moved-bodies.cjs`. It is a review tool and is not committed.

```js
const ts = require("typescript");
const fs = require("node:fs");
const [baseFile, headFile, ...newFiles] = process.argv.slice(2);
const decls = (file) => {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  return new Map(sf.statements.flatMap((st) => {
    const name = ts.isFunctionDeclaration(st) && st.name ? st.name.text
      : ts.isVariableStatement(st) ? st.declarationList.declarations[0].name.getText(sf) : undefined;
    return name ? [[name, st.getText(sf).replace(/^export /, "")]] : [];
  }));
};
const base = decls(baseFile);
const head = decls(headFile);
let compared = 0;
let problems = 0;
for (const file of newFiles) {
  for (const [name, text] of decls(file)) {
    compared += 1;
    if (base.get(name) !== text) { problems += 1; console.log(`CHANGED ${file}: ${name}`); }
    if (head.has(name)) { problems += 1; console.log(`STILL IN ${headFile}: ${name}`); }
  }
}
console.log(`${compared} declarations compared, ${problems} problems`);
process.exit(problems ? 1 : 0);
```

Run it with the PR's base copy of `service.ts`, the head copy, and the file the PR adds declarations to:

```bash
git show "$(git merge-base origin/main HEAD)":packages/core/src/profiles/service.ts > /tmp/service.base.ts
NODE_PATH="$PWD/node_modules" node /tmp/moved-bodies.cjs /tmp/service.base.ts packages/core/src/profiles/service.ts <new file>
```

Expected: `<N> declarations compared, 0 problems`, with N given in each PR below. `CHANGED` means a moved body differs from the base text by more than a leading `export`. `STILL IN` means a copy was left in `service.ts`. The script was tested on a scratch copy of all three moves (55 compared, 0 problems) and on a one-character edit (1 problem).

---

## ST-3: Extract the shared profile apply helpers

**Fixes:** F-G2 (first of three moves)
**Depends on:** UL-2, for ordering only, as the [program index](2026-11-16-audit-remediation-index.md) orders it. UL-1 and UL-2 edit `profiles/service.ts`.
**Branch:** `refactor/profile-apply-support`
**Size:** S (25 declarations, 141 lines)
**Owner steps:** None

**Which helpers move, and why only these.** The move takes exactly the helpers that Grok and Kimi reach, directly or through another helper. That is 22 functions and 3 constants. It has to land first, because otherwise the agent modules would import `service.ts`, which imports them. `service.ts` has about 50 more helpers that are leaves by the same test, but only the Claude Code, Codex and takeover clusters use them. They stay where they are until those clusters move (see Deferred), so that each one moves once, to the place its users end up.

### Task 1: Create `profiles/apply-support.ts`

**Files:**
- Create: `packages/core/src/profiles/apply-support.ts`
- Modify: `packages/core/src/profiles/service.ts` (declarations below, plus imports at `:1`, `:5`, `:46` and `:56`)

**Interfaces:**
- Produces, exported from `@llmr/core/profiles/apply-support` with unchanged signatures:

| Declaration | `service.ts` line at `136ad730` |
|---|---|
| `const privateDirMode = 0o700` | `:83` |
| `const privateExecutableMode = 0o700` | `:84` |
| `const privateFileMode = 0o600` | `:85` |
| `gatewayNoProxyHosts(config: AppConfig): string` | `:2462` |
| `linkProfileHomeEntry(source: string, target: string): void` | `:2650` |
| `firstTomlTableIndex(source: string): number` | `:3232` |
| `writeGeneratedFileIfChanged(file: string, content: string, options?: { mode?: number }): { changed: boolean }` | `:3400` |
| `uniqueOrderedStrings(values: string[]): string[]` | `:4013` |
| `disabledStatus(client: ProfileClientKind, file: string, message: string): ProfileClientApplyStatus` | `:4172` |
| `gatewayEndpoint(config: AppConfig): string` | `:4339` |
| `defaultClientModel(config: AppConfig): string` | `:4345` |
| `providerBaseUrl(provider: AppConfig["Providers"][number]): string` | `:4371` |
| `normalizeClientModel(value: string \| undefined): string` | `:4379` |
| `sanitizeProfilePathSegment(value: string): string` | `:4387` |
| `profileEnv(profile: ProfileConfig): Record<string, string>` | `:4460` |
| `stringRecord(value: unknown): Array<[string, string]>` | `:4473` |
| `tomlQuotedKey(value: string): string` | `:4490` |
| `tomlString(value: string): string` | `:4494` |
| `shellQuote(value: string): string` | `:4509` |
| `cmdQuote(value: string): string` | `:4513` |
| `trimLeadingBlankLines(value: string): string` | `:4517` |
| `isRecord(value: unknown): value is Record<string, unknown>` | `:4525` |
| `formatError(error: unknown): string` | `:4537` |

- Moves without `export`, because only moved helpers call them: `pathEntryExists(file: string): boolean` (`:2665`, used by `linkProfileHomeEntry`) and `isEnvName(value: string): boolean` (`:4482`, used by `profileEnv`).

Each of the 25 was checked with a TypeScript-AST script. None references an agent cluster, `applyQueue` (`:153`), `ownedGlobalProfileTakeovers` (`:130`) or a public export of `service.ts`. Their only references to other top-level declarations are `linkProfileHomeEntry` to `pathEntryExists` and `privateFileMode`, `profileEnv` to `stringRecord` and `isEnvName`, and `stringRecord` to `isRecord`.

Do not merge or re-point the same-named copies elsewhere. `sanitizeProfilePathSegment`, `shellQuote` and `cmdQuote` also exist in `profiles/launch-service.ts`, `profiles/launch-core.ts`, `agents/claude-app/launch.ts`, `agents/codex/app-launch.ts` and `gateway/context-archive.ts`, with different bodies. They are out of scope.

- [ ] **Step 1: Create the branch and the new file with its imports**

```bash
git switch -c refactor/profile-apply-support origin/main
```

`packages/core/src/profiles/apply-support.ts` starts with exactly these imports:

```ts
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync } from "node:fs";
import path from "node:path";
import { CLAUDE_CODE_AUTH_MODE_ENV } from "@llmr/core/agents/claude-code/auth-mode";
import { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV, isGatewayProviderEnabled, type AppConfig, type ProfileClientApplyStatus, type ProfileClientKind, type ProfileConfig } from "@llmr/core/contracts/app";
import { normalizeRouteSelector } from "@llmr/core/gateway/llm-router-plugin";
import { windowsBatchEscapeValue as cmdValue } from "@llmr/core/platform/windows-batch";
import { chmodFileIfRequested, writeFileAtomic } from "@llmr/core/profiles/backup-files";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";
```

None of these modules imports `profiles/service.ts` (checked with an esbuild metafile), so the new file is a leaf.

- [ ] **Step 2: Move the 25 declarations**

Cut each declaration from `service.ts` and paste it into `apply-support.ts`, in the order of the table (the order they have in `service.ts`), with `pathEntryExists` after `linkProfileHomeEntry` and `isEnvName` after `stringRecord`. Add `export` to the 23 in the table. Change nothing else in them.

- [ ] **Step 3: Fix the imports in `service.ts`**

- `:1`, the `node:fs` import. Remove `readlinkSync`, `statSync` and `symlinkSync`.
- `:5`, the `claude-code/auth-mode` import. Remove `CLAUDE_CODE_AUTH_MODE_ENV`.
- `:56`. Delete the line `import { normalizeRouteSelector } from "@llmr/core/gateway/llm-router-plugin";`.
- Add this line before the `@llmr/core/profiles/backup-files` import (`:47`):

```ts
import { cmdQuote, defaultClientModel, disabledStatus, firstTomlTableIndex, formatError, gatewayEndpoint, gatewayNoProxyHosts, isRecord, linkProfileHomeEntry, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, providerBaseUrl, sanitizeProfilePathSegment, shellQuote, stringRecord, tomlQuotedKey, tomlString, trimLeadingBlankLines, uniqueOrderedStrings, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
```

These lists are from a scratch run at `136ad730`. If an earlier PR changed `service.ts`, `npm run typecheck` names every import that is now unused or missing. Follow its output.

- [ ] **Step 4: Run the shared gate**

Run the three parts above, with `packages/core/src/profiles/apply-support.ts` as the new file.
Expected: `typecheck` exits 0, the profile service test file passes, and the script prints `25 declarations compared, 0 problems`.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles/apply-support.ts packages/core/src/profiles/service.ts
git commit -m "refactor(core): extract the shared profile apply helpers"
```

---

## ST-4: Move the Grok profile code to agents/grok

**Fixes:** F-G2 (second of three moves)
**Depends on:** ST-3
**Branch:** `refactor/grok-profile-config`
**Size:** S (10 functions, 181 lines)
**Owner steps:** None

### Task 1: Create `agents/grok/profile-config.ts`

**Files:**
- Create: `packages/core/src/agents/grok/profile-config.ts` (the `agents/grok/` directory is new)
- Modify: `packages/core/src/profiles/service.ts`
- Modify: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: from `@llmr/core/profiles/apply-support` (ST-3), `cmdQuote`, `defaultClientModel`, `disabledStatus`, `formatError`, `gatewayEndpoint`, `gatewayNoProxyHosts`, `linkProfileHomeEntry`, `normalizeClientModel`, `privateDirMode`, `privateExecutableMode`, `privateFileMode`, `profileEnv`, `sanitizeProfilePathSegment`, `shellQuote`, `writeGeneratedFileIfChanged`.
- Produces, exported from `@llmr/core/agents/grok/profile-config`:
  - `applyGrokProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus` (`service.ts:704`), called by `applyProfileConfigNow` and `applyProfileRuntimeConfig`.
  - `grokWrapperPath(profile: ProfileConfig): string` (`:2403`), called by `profilePath` and `disabledProfileStatus`.
  - `resolveGrokSourceHome(profile: Pick<ProfileConfig, "env">): string` (`:2605`), already exported.
- Moves without `export`: `writeGrokWrapper` (`:2388`), `grokWrapperFilename` (`:2407`), `grokWrapperShellScript` (`:2414`), `grokWrapperCmdScript` (`:2438`), `isGrokManagedEnvKey` (`:2563`), `ensureGrokProfileHome` (`:2574`), `ensureGrokProfileConfigCopy` (`:2618`).

The agent module imports the profiles leaf, and `service.ts` imports the agent module. `agents/grok/profile-config.ts` must not import `profiles/service.ts` or `profiles/launch-service.ts`.

- [ ] **Step 1: Create the branch and the new file with its imports**

```bash
git switch -c refactor/grok-profile-config origin/main
```

```ts
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIGDIR } from "@llmr/core/config/constants";
import type { AppConfig, ProfileClientApplyStatus, ProfileConfig } from "@llmr/core/contracts/app";
import { windowsBatchEscapeValue as cmdValue, windowsBatchSetLine as cmdSetLine } from "@llmr/core/platform/windows-batch";
import { cmdQuote, defaultClientModel, disabledStatus, formatError, gatewayEndpoint, gatewayNoProxyHosts, linkProfileHomeEntry, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, sanitizeProfilePathSegment, shellQuote, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";
```

- [ ] **Step 2: Move the 10 functions**

Cut them from `service.ts` and paste them in the order they have there. Add `export` to `applyGrokProfile` and `grokWrapperPath`. `resolveGrokSourceHome` keeps its `export`. Change nothing else.

- [ ] **Step 3: Fix `service.ts`**

- Add `import { applyGrokProfile, grokWrapperPath } from "@llmr/core/agents/grok/profile-config";` before the `agents/kilo/profile-config` import (`:26`).
- Do not re-export `resolveGrokSourceHome` from `service.ts` (decision D-9, no compatibility shims). Its only importer is `packages/core/test/integration/profiles/profile-service.test.mjs:13`. Remove the name from that `profiles/service.ts` import and add `import { resolveGrokSourceHome } from "@llmr/core/agents/grok/profile-config.ts";` beside the other `agents/*/profile-config.ts` imports. Confirm with `git grep -n resolveGrokSourceHome -- packages tests` that no other importer exists.
- `:1`, the `node:fs` import. Remove `chmodSync`, `copyFileSync`, `lstatSync` and `writeFileSync`.

The `node:fs` list is from a scratch run of ST-3 then ST-4 at `136ad730`. `npm run typecheck` is the authority if the base differs.

- [ ] **Step 4: Run the shared gate**

New file: `packages/core/src/agents/grok/profile-config.ts`.
Expected: `typecheck` exits 0, the profile service test file passes with both Grok tests run, and the script prints `10 declarations compared, 0 problems`.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/agents/grok/profile-config.ts packages/core/src/profiles/service.ts packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "refactor(core): move the Grok profile code to agents/grok"
```

---

## ST-5: Move the Kimi profile code to agents/kimi

**Fixes:** F-G2 (third of three moves)
**Depends on:** ST-3. The import lists below also assume ST-4 has merged. If ST-5 lands first, `npm run typecheck` gives the correct `service.ts` import edits for both PRs.
**Branch:** `refactor/kimi-profile-config`
**Size:** M (19 functions and 1 constant, 363 lines)
**Owner steps:** None

### Task 1: Create `agents/kimi/profile-config.ts`

**Files:**
- Create: `packages/core/src/agents/kimi/profile-config.ts` (the `agents/kimi/` directory is new)
- Modify: `packages/core/src/profiles/service.ts`
- Modify: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: from `@llmr/core/profiles/apply-support` (ST-3), `cmdQuote`, `defaultClientModel`, `disabledStatus`, `firstTomlTableIndex`, `formatError`, `gatewayEndpoint`, `gatewayNoProxyHosts`, `linkProfileHomeEntry`, `normalizeClientModel`, `privateDirMode`, `privateExecutableMode`, `privateFileMode`, `profileEnv`, `providerBaseUrl`, `sanitizeProfilePathSegment`, `shellQuote`, `tomlQuotedKey`, `tomlString`, `trimLeadingBlankLines`, `uniqueOrderedStrings`, `writeGeneratedFileIfChanged`.
- Produces, exported from `@llmr/core/agents/kimi/profile-config`:
  - `applyKimiProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus` (`service.ts:734`), called by `applyProfileConfigNow` and `applyProfileRuntimeConfig`.
  - `kimiWrapperPath(profile: ProfileConfig): string` (`:1936`), called by `profilePath` and `disabledProfileStatus`.
  - `resolveKimiSourceHome(profile: Pick<ProfileConfig, "env">): string` (`:2378`), already exported.
- Moves without `export`: `writeKimiWrapper` (`:1917`), `kimiWrapperFilename` (`:1940`), `kimiWrapperShellScript` (`:1947`), `kimiWrapperCmdScript` (`:1967`), `const kimiSingleModelEnvNames` (`:1987`), `isKimiManagedEnvKey` (`:2003`), `kimiProfileModels` (`:2131`), `writeKimiProfileConfig` (`:2140`), `buildKimiProfileConfigToml` (`:2156`), `stripKimiProviderAndModelConfig` (`:2209`), `kimiProfileCustomHeaderEntries` (`:2232`), `kimiProfileModelMetadata` (`:2247`), `kimiProfileReasoningMetadata` (`:2292`), `providerModelMetadataForKimi` (`:2333`), `providerModelDisplayNameForKimi` (`:2338`), `kimiPositiveInteger` (`:2344`), `ensureKimiProfileHome` (`:2350`).

Nothing outside this list calls any of the 17 unexported declarations. The import direction is the same as in ST-4.

- [ ] **Step 1: Create the branch and the new file with its imports**

```bash
git switch -c refactor/kimi-profile-config origin/main
```

```ts
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONFIGDIR } from "@llmr/core/config/constants";
import { availableGatewayModelIds, isGatewayProviderEnabled, type AppConfig, type ProfileClientApplyStatus, type ProfileConfig } from "@llmr/core/contracts/app";
import { findModelCatalogEntry, modelCatalogMaxInputTokens, readCatalogCapability, type ModelCatalogEntry } from "@llmr/core/gateway/model-catalog";
import { windowsBatchEscapeValue as cmdValue, windowsBatchSetLine as cmdSetLine } from "@llmr/core/platform/windows-batch";
import { cmdQuote, defaultClientModel, disabledStatus, firstTomlTableIndex, formatError, gatewayEndpoint, gatewayNoProxyHosts, linkProfileHomeEntry, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, providerBaseUrl, sanitizeProfilePathSegment, shellQuote, tomlQuotedKey, tomlString, trimLeadingBlankLines, uniqueOrderedStrings, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
import { getProviderCatalogModels } from "@llmr/core/providers/model-catalog";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";
import { resolveUsageModelAttribution } from "@llmr/core/usage/model-attribution";
```

None of these modules reaches `profiles/service.ts` or `profiles/launch-service.ts` (esbuild metafile check).

- [ ] **Step 2: Move the 20 declarations**

Cut them from `service.ts` and paste them in the order they have there. Add `export` to `applyKimiProfile` and `kimiWrapperPath`. `resolveKimiSourceHome` keeps its `export`. Change nothing else.

- [ ] **Step 3: Fix `service.ts`**

- Add `import { applyKimiProfile, kimiWrapperPath } from "@llmr/core/agents/kimi/profile-config";` after the `agents/grok/profile-config` import.
- Do not re-export `resolveKimiSourceHome` from `service.ts` (decision D-9). In `packages/core/test/integration/profiles/profile-service.test.mjs`, remove the name from the `profiles/service.ts` import and add `import { resolveKimiSourceHome } from "@llmr/core/agents/kimi/profile-config.ts";`. Confirm with `git grep -n resolveKimiSourceHome -- packages tests` that no other importer exists.
- The `contracts/app` import (`:4`). Remove `availableGatewayModelIds`.
- The `profiles/apply-support` import. Remove `linkProfileHomeEntry` and `uniqueOrderedStrings`.
- Delete three import lines: `@llmr/core/gateway/model-catalog` (`findModelCatalogEntry, modelCatalogMaxInputTokens, readCatalogCapability, type ModelCatalogEntry`), `@llmr/core/providers/model-catalog` (`getProviderCatalogModels`) and `@llmr/core/usage/model-attribution` (`resolveUsageModelAttribution`).

These lists are from a scratch run of ST-3, ST-4 then ST-5 at `136ad730`. `npm run typecheck` is the authority if the base differs.

- [ ] **Step 4: Run the shared gate**

New file: `packages/core/src/agents/kimi/profile-config.ts`.
Expected: `typecheck` exits 0, the profile service test file passes with both Kimi tests run, and the script prints `20 declarations compared, 0 problems`.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/agents/kimi/profile-config.ts packages/core/src/profiles/service.ts packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "refactor(core): move the Kimi profile code to agents/kimi"
```

---

## Review Focus

Each line names where it is pinned.

1. **A build config without the loader.** esbuild does not fail. It compiles the script as a module, and the host process runs the middleware at startup. Expected: the commit gate refuses the change. Pinned by `every bundle that can include core loads .runtime.cjs sources as text` (ST-1 Step 2) and by the comment-marker check in ST-1 Step 11.
2. **A CRLF checkout on Windows.** The text loader keeps carriage returns that the template literal used to drop, so the Windows build would write a different script. Expected: LF on every platform. Pinned by `.gitattributes` and `the Codex runtime source is checked out with LF line endings on every platform` (ST-1 Step 2), and by the `\r` assertion in the placeholder test. Whether the release runner checks out with CRLF is unverified. The owner step in ST-1 settles it.
3. **An edit that adds a second `${…}` or a second sentinel.** A `.cjs` file has no interpolation, so a future author who writes `${value}` at the top level of the script gets literal text. Expected: the author sees it fail. `node --check` on the source and the 30 integration tests run the emitted script, and the placeholder test (ST-1 Step 4) fails if the sentinel survives.
4. **A JSDoc comment that unbalances braces.** The tests cut functions out of the script by counting braces. Expected: annotations never change what the tests extract. Pinned by the two rules in ST-2 Step 5 and by the existing tests that extract `modelCatalogConfigItem` and `botGatewaySdkImportSpecifier`. No test extracts the other functions, so review each annotation by eye.
5. **A moved function edited in passing.** A move-only PR that also changes a quoting helper would change every generated wrapper. Expected: zero body changes. Pinned by `/tmp/moved-bodies.cjs` in the shared gate. The Grok and Kimi wrapper tests cover the shell path only on the platform that runs them, and CI is Ubuntu-only, so the `.cmd` scripts have no test. The body check is the only guard for them.

## Deferred

From the spec, for this workstream:

- **Claude Code, Codex and takeover extraction from `profiles/service.ts`.** The clusters depend on each other and need a takeover module designed first (D-8).

Also out of scope here, so that nobody extends these PRs:

- OpenCode, Kilo, Pi and Zcode. `applyOpenCodeProfile` and `applyKiloProfile` call `restoreDisabledGlobalProfile`, and Pi and Zcode call into the Codex and takeover clusters.
- The other leaf helpers in `service.ts` (about 50, used only by the deferred clusters).
- Merging the same-named helper copies in `launch-service.ts`, `launch-core.ts`, `agents/claude-app/launch.ts`, `agents/codex/app-launch.ts` and `gateway/context-archive.ts`.
- A stricter runtime check. `strict` with `noImplicitAny: false` reports 30 errors and full `strict` reports 898.
- Converting the runtime script to TypeScript or splitting it into modules. The emitted script would no longer be byte-identical.
