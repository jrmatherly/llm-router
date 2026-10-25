# Rebrand Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user-facing surface of the app, CLI and docs says LLM Router instead of Claude Code Router and LLMR instead of CCR, without touching the protocol and on-disk identifiers existing installs depend on.

**Architecture:** One committed sweep script holds the phrase table and the skip rules, and is run against the UI, core, CLI and docs trees in separate tasks so each diff is reviewable on its own. The handful of hardcoded labels and the Electron app name are fixed by hand with tests. Legacy markers that live in users' files gain read-both, write-new handling.

**Tech Stack:** Node 24 scripts under `scripts/`, `node:test` with `node:assert/strict`, esbuild test bundles via `node build/test.mjs <pkg>`.

**Spec:** `docs/superpowers/specs/2026-10-25-rebrand-phase-2.md`

## Global Constraints

- Phrase table, exactly as the spec lists it: every whole-word `CCR` → `LLMR`, so `CCR Desktop` → `LLMR Desktop`, `CCR Gateway` → `LLMR Gateway`, `CCR 网关` → `LLMR 网关`. "Claude Code Router" in copy → `LLM Router` where it is not in the keep list.
- Never rewrite: `CCR_` prefixed names, `x-ccr-`, `/__ccr/`, `ccr://`, the lowercase `ccr` command, `@ccr/` aliases, `window.ccr`, `.claude-code-router`, `com.claudecoderouter.desktop`, `@musistudio/claude-code-router`, the plugin id `claude-code-router`, the CA subject `Claude Code Router CA`, and code identifiers.
- Match rule for the sweep: `CCR` preceded and followed by a character that is not `[A-Za-z0-9_-]`, operating only inside string literals, JSX text, and Markdown prose. Chinese text counts as prose.
- Style per `AGENTS.md`: double quotes, semicolons, two-space indent, no comments except a non-obvious why, `node:test` plus `node:assert/strict`, generated files regenerated not edited.
- Commit gate: any Bash command containing `git commit` runs typecheck plus `npm run test:architecture` (about 11 s).
- Run one test file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`. The compiled bundle isolates HOME on its own.

## Review Focus

1. A user whose `.zshrc` already holds a `# >>> Claude Code Router CLI >>>` block re-saves a profile: expected one block with the new markers, not two blocks. Pinned in Task 6.
2. Chinese UI: a translation key renamed in English but not in the Chinese map falls back to English silently (`translateText` returns the key). Expected every renamed key to keep its Chinese value. Pinned in Task 4.
3. A string that quotes a command, such as "Make sure the LLMR app or `ccr ui` command is running", must keep `ccr ui` lowercase. Pinned in Task 3.
4. Docs code fences and the `CCR_PLUGIN_MARKETPLACE_URL` style env names inside prose must survive the docs sweep untouched. Pinned in Task 3.
5. The macOS menu label comes from the packaged `package.json`, so a correct `productName` in `electron-builder.json` alone does not fix it. Pinned in Task 1.

---

### Task 1: Electron app name

**Files:**
- Modify: `packages/electron/package.json` (add `"productName": "LLM Router"` after `"name"`)
- Test: `tests/architecture/packaging-contract.test.mjs`

**Interfaces:**
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

Append to `tests/architecture/packaging-contract.test.mjs`:

```js
test("the packaged Electron app and electron-builder agree on the product name", () => {
  const builder = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  const electron = JSON.parse(readFileSync(path.join(process.cwd(), "packages", "electron", "package.json"), "utf8"));
  assert.equal(builder.productName, "LLM Router");
  assert.equal(electron.productName, "LLM Router", "Electron derives app.name, and so the Hide and Quit menu labels, from the packaged package.json");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:architecture`
Expected: FAIL on the new test with `undefined !== 'LLM Router'`.

- [ ] **Step 3: Add `"productName": "LLM Router"` to `packages/electron/package.json`**

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:architecture`
Expected: PASS, 33 tests.

- [ ] **Step 5: Prove it on the real artifact**

Run, from the repo root: `npm run build:assets && npx electron-builder --config build/electron-builder.local.cjs --dir 2>&1 | tail -3`
Then, from a scratch directory so the extracted file does not land on the repo's own `package.json`: `cd "$(mktemp -d)" && npx @electron/asar extract-file "$(ls -d /Users/jason/dev/llm-router/release-local/mac*/LLM\ Router.app | head -1)/Contents/Resources/app.asar" package.json && jq -r .productName package.json`
The local config (`build/electron-builder.local.cjs`) skips signing and notarization and writes to `release-local/`; `@electron/asar` 3.4.1 comes with electron-builder. The check reads the `package.json` inside the asar, which is what Electron derives `app.name` from. `CFBundleName` in `Info.plist` already said LLM Router before this task, so it proves nothing. Expected: `LLM Router`. Afterwards, in the repo: `git checkout -- packages/core/models.json packages/ui/src/generated && rm -rf release-local`.

- [ ] **Step 6: Commit**

```bash
git add packages/electron/package.json tests/architecture/packaging-contract.test.mjs
git commit -m "fix(electron): name the packaged app LLM Router so menu labels follow"
```

---

### Task 2: Hardcoded brand labels in the UI

**Files:**
- Create: `packages/ui/src/pages/home/shared/brand.ts`
- Modify: `packages/ui/src/pages/tray/components/status-strip.tsx:20`, `packages/ui/src/pages/home/components/settings.tsx:2696`, `packages/ui/src/pages/home/components/share-cards.tsx:264,500`
- Test: `packages/ui/test/component/tray-components.test.tsx` (already renders `TrayStatusStrip` at line 117) and `packages/ui/test/component/share-cards.test.tsx` (create)

**Interfaces:**
- Produces: `export const productShortName = "LLMR";` in `brand.ts`. Later tasks import it where a label is built in code rather than passed through `t()`.
- `RouteMapCard` (`share-cards.tsx:253`) and `SharePosterHeader` (`share-cards.tsx:486`) become named exports so the test can render the two components that hold the literals without building a full `ShareCardWidget` fixture; `ShareCardWidget` needs `providerAccounts`, `type`, `usageRange` and `usageStats` and no test fixture for it exists.

- [ ] **Step 1: Write the failing tests**

In `tray-components.test.tsx`, add to the existing `TrayStatusStrip` test:

```tsx
assert.match(html, /LLMR/);
assert.doesNotMatch(html, />CCR</);
```

Create `share-cards.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteMapCard, SharePosterHeader } from "@ccr/ui/pages/home/components/share-cards.tsx";

test("share card route map and poster header name the product, not CCR", () => {
  const map = renderToStaticMarkup(<RouteMapCard usageStats={emptyUsageStats} />);
  assert.doesNotMatch(map, />CCR</);
  assert.match(map, /LLMR/);
  const header = renderToStaticMarkup(<SharePosterHeader {...minimalPosterHeaderProps} />);
  assert.doesNotMatch(header, />CCR</);
});
```

Build `emptyUsageStats` from the `UsageStatsSnapshot` type the component imports, with every list empty and every number zero, and `minimalPosterHeaderProps` from the props at `share-cards.tsx:486`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/tray-components.test.js .test-dist/ui/test/component/share-cards.test.js`
Expected: FAIL on `/LLMR/` not matching, and on the missing exports.

- [ ] **Step 3: Create `brand.ts`, export the two card components, and replace the three literals with `{productShortName}`**

- [ ] **Step 4: Run them to verify they pass**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home/shared/brand.ts packages/ui/src/pages/tray/components/status-strip.tsx packages/ui/src/pages/home/components/settings.tsx packages/ui/src/pages/home/components/share-cards.tsx packages/ui/test/component/tray-components.test.tsx packages/ui/test/component/share-cards.test.tsx
git commit -m "fix(ui): show LLMR in the tray header and share cards"
```

---

### Task 3: The sweep script

**Files:**
- Create: `scripts/rebrand-ccr.mjs`
- Test: `tests/architecture/rebrand-ccr.test.mjs`

**Interfaces:**
- Produces: `export function rebrandText(source: string, kind: "ts" | "js" | "json" | "md"): string` and a CLI: `node scripts/rebrand-ccr.mjs <path>...` that rewrites files in place and prints `changed <n> files`. `kind` by extension: `.md` → `"md"`, `.json` → `"json"`, `.cjs` `.mjs` `.js` → `"js"`, `.ts` `.tsx` → `"ts"`.
- `"ts"`, `"js"` and `"json"` modes parse with the project's own `typescript` package: `ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, scriptKind)` with `ScriptKind.TSX`, `ScriptKind.JS` or `ScriptKind.JSON`, then `ts.forEachChild` to collect `StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead`, `TemplateMiddle`, `TemplateTail` and `JsxText` nodes, and rewrite their text spans from the end of the file backwards. Do not use `ts.createScanner` alone: without the parser driving `reScanTemplateToken` it swallows everything after a template substitution, and a hand-rolled tokenizer trips on apostrophes in comments (19 files under `packages/core/src` have one). Identifiers, comments and regex literals are never touched.
- `"md"` mode skips fenced code blocks and inline code spans.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { rebrandText } from "../../scripts/rebrand-ccr.mjs";

test("whole-word CCR becomes LLMR inside string literals", () => {
  assert.equal(rebrandText("\"Open CCR Desktop or the CCR app via CCR.\"", "ts"), "\"Open LLMR Desktop or the LLMR app via LLMR.\"");
});

test("protocol identifiers, env names, commands and code identifiers survive", () => {
  const source = [
    "const CCR_HOME = env.CCR_INTERNAL_HOME_DIR;",
    "headers[\"x-ccr-route\"] = ccrRouterHttpRouteKey;",
    "const url = \"ccr://open?app=1\" + \"/__ccr/runtime\";",
    "const msg = \"Make sure the CCR app or ccr ui command is running.\";",
    "const dir = \"~/.claude-code-router\";"
  ].join("\n");
  const out = rebrandText(source, "ts");
  assert.match(out, /CCR_HOME = env\.CCR_INTERNAL_HOME_DIR/);
  assert.match(out, /x-ccr-route/);
  assert.match(out, /ccr:\/\/open/);
  assert.match(out, /\/__ccr\/runtime/);
  assert.match(out, /the LLMR app or ccr ui command/);
  assert.match(out, /\.claude-code-router/);
});

test("identifiers outside strings are untouched even when they spell CCR", () => {
  assert.equal(rebrandText("type CCR = string; const x: CCR = \"CCR\";", "ts"), "type CCR = string; const x: CCR = \"LLMR\";");
});

test("a literal that is exactly CCR is an identifier, not copy, and stays", () => {
  assert.equal(rebrandText("const client = { name: \"CCR\" };\nreturn \"CCR\";", "ts"), "const client = { name: \"CCR\" };\nreturn \"CCR\";");
});

test("comments with apostrophes, regex literals and template substitutions do not derail the rewrite", () => {
  const source = "// don't\nconst re = /CCR/;\nconst s = `CCR ${name} runs CCR`;\nconst t = \"CCR\";";
  assert.equal(rebrandText(source, "ts"), "// don't\nconst re = /CCR/;\nconst s = `LLMR ${name} runs LLMR`;\nconst t = \"LLMR\";");
});

test("json mode rewrites string values and keeps formatting", () => {
  const json = "{\n  \"id\": \"claude-design\",\n  \"description\": \"Open it in a dedicated CCR Electron window.\"\n}\n";
  assert.equal(rebrandText(json, "json"), "{\n  \"id\": \"claude-design\",\n  \"description\": \"Open it in a dedicated LLMR Electron window.\"\n}\n");
});

test("js mode handles a CommonJS bundle", () => {
  assert.equal(rebrandText("module.exports = { appDescription: 'Open in a CCR window.' };", "js"), "module.exports = { appDescription: 'Open in a LLMR window.' };");
});

test("markdown leaves code fences and inline code alone", () => {
  const md = "CCR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting CCR.";
  assert.equal(rebrandText(md, "md"), "LLMR routes requests.\n\n```bash\nCCR_LOG=1 ccr start\n```\n\nSet `CCR_PLUGIN_MARKETPLACE_URL` before starting LLMR.");
});

test("chinese copy is rewritten", () => {
  assert.equal(rebrandText("\"再启动 CCR 网关或通过 CCR 打开 Agent。\"", "ts"), "\"再启动 LLMR 网关或通过 LLMR 打开 Agent。\"");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:architecture`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/rebrand-ccr.mjs`**

One substitution, whole-word `CCR` → `LLMR`. Word boundary is "not `[A-Za-z0-9_-]`" on both sides. A string literal whose entire text is `CCR` is skipped: four such literals in the tree are protocol names or badges, not copy. The CLI walks the given paths, picks `kind` by extension, and skips `node_modules`, `.test-dist`, `dist`, `release*`, lockfiles, `packages/core/models.json` and `packages/ui/src/generated`. The docs fixtures Task 7 handles are rewritten by `sed`, not by this script.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:architecture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/rebrand-ccr.mjs tests/architecture/rebrand-ccr.test.mjs
git commit -m "build: add the CCR to LLMR copy sweep"
```

---

### Task 4: Sweep the UI and keep translations paired

**Files:**
- Modify: everything under `packages/ui/src` the script changes (19 files measured)
- Test: `packages/ui/test/component/i18n-pairing.test.ts` (create)

**Interfaces:**
- Consumes: `node scripts/rebrand-ccr.mjs packages/ui/src` from Task 3.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("every t() key used in the UI that mentions LLMR has a Chinese entry, and no key still says CCR", () => {
  const i18n = readFileSync("packages/ui/src/pages/home/shared/i18n.tsx", "utf8");
  const ccrKeys = i18n.match(/^\s*"[^"]*(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])[^"]*":/gm) ?? [];
  assert.deepEqual(ccrKeys, []);
  const used = execFileSync("git", ["grep", "-ohP", "t\\(\"[^\"]*LLMR[^\"]*\"", "--", "packages/ui/src"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((line) => line.slice(3, -1));
  const missing = [...new Set(used)].filter((key) => !i18n.includes(`"${key}":`));
  assert.deepEqual(missing, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/i18n-pairing.test.js`
Expected: FAIL, `ccrKeys` lists 44 entries.

- [ ] **Step 3: Run the sweep**

Run: `node scripts/rebrand-ccr.mjs packages/ui/src`
Expected: `changed 19 files` or close to it. Review `git diff --stat packages/ui/src`.

- [ ] **Step 4: Run the test, typecheck and the UI suite**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/i18n-pairing.test.js && npm run typecheck && npm run test:ui`
Expected: all PASS, ui suite 212 or more.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src packages/ui/test/component/i18n-pairing.test.ts
git commit -m "feat(ui): say LLMR instead of CCR in every string"
```

---

### Task 5: Sweep core, CLI, electron and bundled-plugin copy

**Files:**
- Modify: files under `packages/core/src`, `packages/cli/src`, `packages/electron/src` the script changes (about 58 measured), plus `packages/electron/bundled-plugins/*/plugin.json` (the `description` fields the Extensions page shows), `packages/electron/bundled-plugins/*/index.cjs` (22 strings in claude-design, 1 in new-api-account) and `packages/electron/bundled-plugins/*/README.md`
- Test: existing suites; plus `packages/core/test/unit/contracts/onboarding-copy.test.mjs` (create)

**Interfaces:**
- Consumes: Task 3 script.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";

test("the no-models startup error names LLMR in both languages", async () => {
  const { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } = await import("@ccr/core/contracts/app.ts");
  const { translateErrorMessage } = await import("@ccr/core/contracts/i18n.ts");
  assert.equal(NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "No available models. Configure at least one provider with a model before starting LLMR Gateway or opening an agent through LLMR.");
  const zh = translateErrorMessage("zh", NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
  assert.notEqual(zh, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE, "the Chinese table is keyed by the new English message");
  assert.match(zh, /LLMR 网关/);
});
```

`translateErrorMessage` returns its input unchanged when the Chinese table has no entry for it (`packages/core/src/contracts/i18n.ts:333`); the table itself is not exported.

```js
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/contracts/onboarding-copy.test.js`
Expected: FAIL on the English message.

- [ ] **Step 3: Run the sweep**

Run: `node scripts/rebrand-ccr.mjs packages/core/src packages/cli/src packages/electron/src packages/electron/bundled-plugins`
Then inspect `git diff` for any string that is a protocol value rather than copy. The bundled plugins have no source tree in this repo; `index.cjs` is the artifact, so editing it in place is the only option. The four literals that are exactly `"CCR"` (`packages/core/src/mcp/tool-discovery.ts:30`, the MCP client name; `packages/core/src/agents/codex/app-net-responder.ts:48`, an account name in a Codex payload; `packages/core/src/agents/codex/cli-middleware-runtime.ts:5273`, a profile-name fallback; `packages/ui/src/pages/home/shared/network.ts:171`, a client badge) are left alone by the script's whole-literal rule from Task 3. Expected file count: 55 under the three `src` trees plus the bundled plugins. Known false positives to revert by hand if the script touched them: none expected, the match rule excludes them; if one appears, add it to the script's skip list and a test case in Task 3's file, then rerun.

- [ ] **Step 4: Hand edits the sweep must not make**

`packages/electron/src/main/main-app.ts:141`: the sweep turns "Install CCR Proxy CA into the macOS System keychain?" into "LLMR Proxy CA", but the certificate the user then sees in Keychain Access is still named "Claude Code Router CA" (the spec defers renaming the CA). Set the message to `Install the proxy certificate authority "Claude Code Router CA" into the macOS System keychain?` so the dialog names what Keychain Access shows.

- [ ] **Step 5: Update the tests that pin the old copy**

Measured: 109 lines under `packages/*/test` carry bare `CCR`. Run the sweep over them too (`node scripts/rebrand-ccr.mjs packages/core/test packages/cli/test packages/electron/test packages/ui/test tests/e2e`), then fix by hand what the sweep cannot know about:

- `packages/core/test/unit/config/plugin-config-migration.test.mjs:21,28` assert the bundled plugin descriptions; the sweep rewrites both the fixture and the assertion, confirm they still agree.
- `tests/e2e/cli-web-runtime.ts:77` waits on stdout matching `/CCR web management is running at/`, which `packages/cli/src/cli.ts:508` no longer prints after the sweep; lines 64, 74 and 96 carry the same phrase. Without this, `cli-web.spec.ts` times out in Task 8.

- [ ] **Step 6: Run the suites**

Run: `npm run typecheck && npm run test:core && npm run test:cli && npm run test:electron`
Expected: PASS. List every test file whose assertions changed in the commit body.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/cli packages/electron tests/e2e
git commit -m "feat(core,cli,electron): say LLMR instead of CCR in messages and plugin descriptions"
```

---

### Task 6: Shell PATH block markers, read both and write new

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts:27-28` (markers) and `ensureShellRcPathBlock` at `:2005-2010` (the regex that finds an existing block)
- Test: `packages/core/test/unit/profiles/shell-rc-path-block.test.mjs` (create)

**Interfaces:**
- Produces: the existing `ccrPathBlockStart` / `ccrPathBlockEnd` constants (`launch-service.ts:27-28`) now hold `"# >>> LLM Router CLI >>>"` and `"# <<< LLM Router CLI <<<"`, and two new constants `legacyPathBlockStart = "# >>> Claude Code Router CLI >>>"` and `legacyPathBlockEnd = "# <<< Claude Code Router CLI <<<"` sit beside them. `ensureShellRcPathBlock(rcFile: string, binDir: string): void` becomes exported (the file already exports `...ForTest` helpers for this purpose) and its regex matches a block delimited by either marker pair, so one call replaces a legacy block with a new one.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("an rc file with the Claude Code Router PATH block ends up with one LLM Router block", async () => {
  const { ensureShellRcPathBlock } = await import("@ccr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "ccr-rc-")), ".zshrc");
  writeFileSync(rc, "export A=1\n# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n");
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  const text = readFileSync(rc, "utf8");
  assert.equal((text.match(/>>> .* CLI >>>/g) ?? []).length, 1);
  assert.match(text, /# >>> LLM Router CLI >>>/);
  assert.doesNotMatch(text, /Claude Code Router CLI/);
  assert.match(text, /\/opt\/llm-router\/bin/);
  assert.match(text, /^export A=1$/m);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/shell-rc-path-block.test.js`
Expected: FAIL, `ensureShellRcPathBlock` is not exported.

- [ ] **Step 3: Rename the markers, add the legacy pair, export `ensureShellRcPathBlock`, and widen its regex to either pair**

- [ ] **Step 4: Run it to verify it passes**

Run: same command, then `npm run test:core`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/profiles/launch-service.ts packages/core/test/unit/profiles/shell-rc-path-block.test.mjs
git commit -m "fix(profiles): write LLM Router PATH blocks and replace the legacy ones"
```

---

### Task 7: Docs sweep and fixture paths

**Files:**
- Modify: `docs/src/content/docs/**/*.md` (96 files measured), `docs/src/i18n/content.ts:15,44`, `docs/src/docs-structure.ts` (2 lines), `docs/src/layouts/DocsLayout.astro` (3), the twelve `docs/src/pages/**/*.astro` guide pages (1 or 2 lines each), `docs/src/components/interactive/mockData.ts` (1), `ObservabilityViewDemo.tsx` (1), `fixtures-agent-analysis.json` (6 bare `CCR` plus the upstream paths), `fixtures-request-logs.json` (upstream paths)
- Test: `tests/architecture/rebrand-ccr.test.mjs` (add one case)

`.astro` files fit neither parser mode; their twenty or so lines are edited by hand.

**Interfaces:**
- Consumes: Task 3 script in `"md"` mode.

- [ ] **Step 1: Write the failing test**

```js
test("the docs site no longer carries bare CCR or the upstream author's path", () => {
  const ccr = gitGrepFiles(["-P", "(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])", "--", "docs/src"]);
  assert.deepEqual(ccr, []);
  const paths = gitGrepFiles(["/Volumes/Data/Products/claude-code-router", "--", "docs/src"]);
  assert.deepEqual(paths, []);
});
```

`gitGrepFiles(args: string[]): string[]` wraps `execFileSync("git", ["grep", "-l", ...args])` and returns `[]` on exit code 1 (no matches). The pathspec is all of `docs/src`, not only `content`, because the site chrome and demo pages say CCR too. Four example lines inside fenced code blocks also say CCR as copy and are edited by hand in Step 3: `docs/src/content/docs/{en,zh}/configuration/extensions.md:146` ("hello from CCR") and `docs/src/content/docs/{en,zh}/configuration/fusion-mcp-tool.md:62` ("Bearer <CCR API Key>").

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:architecture`
Expected: FAIL listing docs files.

- [ ] **Step 3: Sweep**

Run: `node scripts/rebrand-ccr.mjs docs/src/content docs/src/i18n/content.ts docs/src/docs-structure.ts docs/src/components/interactive && sed -i '' 's#/Volumes/Data/Products/claude-code-router#/Users/you/llm-router#g' docs/src/components/interactive/fixtures-agent-analysis.json docs/src/components/interactive/fixtures-request-logs.json`
Then by hand: the `.astro` lines (`git grep -nP '(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])' -- 'docs/src/**/*.astro'`), the four fenced example lines named above, and in `docs/src/i18n/content.ts` drop the parenthetical so the descriptions read "LLM Router documentation: ..." and "LLM Router 文档：...".

- [ ] **Step 4: Verify the docs still build and the test passes**

Run: `npm run test:architecture && (cd docs && npm ci && npm run build 2>&1 | tail -3)`
Expected: architecture PASS; docs build reports its page count with no errors.

- [ ] **Step 5: Commit**

```bash
git add docs/src tests/architecture/rebrand-ccr.test.mjs
git commit -m "docs: say LLMR instead of CCR and drop upstream paths from fixtures"
```

---

### Task 8: Whole-branch verification and PR

**Files:** none new.

- [ ] **Step 1: Residue check**

Run: `git grep -nP '(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])' -- 'packages/*/src' | grep -v '`ccr \|"ccr \|CCR_' | head -40`
Expected: only identifiers or protocol values; each remaining line is either in the spec's keep list or gets fixed here.

Run: `git grep -n --fixed-strings "Claude Code Router" -- packages`
Expected: exactly the legacy matcher in `cli.ts`, `LEGACY_WINDOWS_CONFIGDIR`, the two legacy PATH markers, the CA subject lines and their keychain commands, and the legacy-windows test.

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron && npm run test:cli && npm run test:e2e; git checkout -- packages/core/models.json packages/ui/src/generated`
`test:e2e` runs `build:assets` and the sqlite sidecar build itself; run `npm run test:e2e:install` once first if Playwright's Chromium is not installed in this checkout. Expected: every suite PASS; e2e 21 or more.

- [ ] **Step 3: Prove it on the running app**

Run: `npm run dev:electron`, open the tray window, Settings → Tray, the onboarding error state and the macOS app menu. Expected: no "CCR" and no "@claude-code-router/electron" on any of them.

- [ ] **Step 4: Open the PR**

Body: the phrase table, the keep list from the spec, the deferred decisions, the residue grep output, and the suite counts. Do not merge; the ruleset requires the Tests checks and the owner merges.
