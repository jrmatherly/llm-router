# Audit remediation: provider presets and repo hygiene implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every referral code and the six paid reseller presets that the fork inherited from upstream, and fix the repo hygiene findings F-B4 to F-B9.

**Architecture:** Three pull requests. HP-1 cleans the provider links and adds two guards, one over the preset registry and one over every tracked file. HP-2 deletes the six reseller presets and everything that names them. HP-3 fixes docs, license, ignore rules and the unused `blog/` folder. HP-1 must change `scripts/llmr-rename.mjs` and its test in the same commit as the links, because that script lists the referral codes as text that must stay.

**Tech Stack:** TypeScript, `node:test`, `git grep`, Astro docs (Markdown and CSS only).

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`. This plan fixes F-B1 to F-B9 under decisions D-1 and D-2. `README.md:216` (the `windows-latest` text in F-B9) belongs to RS-4 in the [release safety plan](../2026-11-16-audit-release-safety.md) and is not touched here.

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

- D-1 binds. No provider link keeps a referral, affiliate or tracking parameter, a sign-up path with a partner id, or a short link.
- D-2 binds. Delete `code0`, `claudeapi`, `fenno`, `infistar-ai`, `runapi` and `unity2`. Keep `qiniu-ai`, `kimi-coding`, `moonshot` and `moonshot-global` with clean links. Keep `teamorouter` and `y-api` as they are.
- Line numbers are from `136ad730`. Each edit also names a symbol or a text anchor. Use the anchor when the numbers have moved.
- Read a file with Read before you edit it. The rules under `.claude/rules/` load only on Read, Edit and Write.
- The rename guard in `tests/architecture/llmr-rename.test.mjs` scans every tracked text file outside `docs/superpowers/`. After HP-1 no kept entry protects a partner code. New test names, fixtures and docs text must not contain `ccr` in any letter case or the old one-word product name. `node scripts/llmr-rename.mjs --check all` prints `0 residual lines for alias, wire, env, rest, longform` when the tree is clean (measured at `136ad730`).
- Leave `docs/superpowers/**` alone. Old specs and notes there mention the codes and the `blog/` paths as history.

## Review Focus

1. A referral parameter inside a deeplink `source=` value is URL-encoded (`%3Faff%3D`, `%26utm_medium%3D`), and `&` in the docs HTML is written `&amp;`. A pattern that looks only for `?aff=` misses lines 89, 93, 101 and 105 of the deeplink page (measured). HP-1 Task 1 pins the encoded and escaped forms in the test `the referral pattern matches plain, HTML-escaped and URL-encoded parameters`.
2. `packages/core/models.json` is generated from models.dev and holds 61 lines with `?utm_source=github_models.dev` (measured). The repo-wide guard excludes that file. Without the exclusion a catalog refresh would block every commit. HP-1 Task 1 lists the exclusion.
3. A user who saved a provider from a deleted preset upgrades. The provider must keep its base URL, key and models, open as "Other / custom", and show the generic icon. HP-2 Task 1 pins the registry and the UI draft in two tests. Nobody has seen this in the app, so HP-2 Task 1 also has a manual check.
4. Moving the README screenshot can leave a broken image that no test notices. HP-3 Task 1 adds the test `README.md local images exist`.
5. Text added by this plan that contains `ccr` fails the rename guard, because HP-1 removes the kept entries that used to mask it. No new test covers this. Each PR's verify step runs `npm run test:architecture`, which includes the guard.

---

## HP-1: Strip referral codes from provider links

**Fixes:** F-B1, F-B2.
**Depends on:** None.
**Branch:** `chore/strip-referral-links`
**Size:** S.
**Owner steps:** None.

**Status:** Merged 2026-11-16 as [PR 69](https://github.com/jrmatherly/llm-router/pull/69), squash commit `78d61393`. A review changed four things from the steps below:

- The preset test has no `s.qiniu.com` hostname assertion. That literal trips the repo-wide guard, which still bans the short link. The test is named `no provider preset link carries a referral code, a fragment or a sign-up path`.
- The preset test also rejects a fragment and the paths `/signup` and `/invite`. A link such as `https://fenno.ai/#aff=x` passed both guards before (measured).
- `tests/architecture/no-referral-links.test.mjs` has a third test, `every source link on the provider deeplink page is a plain https page`. It decodes each `source=` link and applies the preset test's checks. Before it, an encoded `/register` path or an unlisted parameter in a `source=` value passed (measured).
- The grep uses `:(top)` pathspecs, so its exclusions hold from any working directory.

HP-2 Step 11's manual check and release note are still open. Nobody re-fetched the six reseller home pages.

All of HP-1 is one commit. Removing a code from a preset fails `every kept entry is still at the file it names` until the kept entry goes. Removing the kept entry first fails `no ccr identifier remains outside the kept list`. The commit gate runs both tests.

### Task 1: Clean the links, update the rename guard, add the two referral guards

**Files:**
- Modify: `packages/core/src/providers/presets/{kimi-coding,moonshot,qiniu-ai,code0,claudeapi,fenno,infistar-ai,runapi,unity2}/index.ts`
- Modify: `docs/src/content/docs/en/configuration/provider-deeplink.md:85,89,93,97,101,105`
- Modify: `scripts/llmr-rename.mjs:38-94` (the `kept` array)
- Modify: `tests/architecture/llmr-rename.test.mjs:40-41,55-56,70`
- Modify: `packages/core/test/unit/providers/provider-preset-utils.test.mjs:104,105,112,127,136`
- Create: `tests/architecture/no-referral-links.test.mjs`

**Interfaces:**
- Consumes: `providerPresets` from `@llmr/core/providers/presets/index.ts`. `kept`, `renameText` and `residue` from `scripts/llmr-rename.mjs`.
- Produces: nothing that later tasks import. HP-2 relies on one fact. After this task `scripts/llmr-rename.mjs` names no file under the six reseller preset folders.

- [ ] **Step 1: Create the branch**

```bash
git switch -c chore/strip-referral-links
```

- [ ] **Step 2: Write the failing preset test**

In `packages/core/test/unit/providers/provider-preset-utils.test.mjs`, rename the test at line 104 from `sponsor provider presets expose requested endpoints and protocols` to `reseller and Qiniu presets expose requested endpoints and protocols`. Change its four `websiteUrl` assertions to the cleaned values.

| Line | Anchor | New expected value |
|---|---|---|
| 105 | `fennoProviderPreset.websiteUrl` | `"https://fenno.ai/"` |
| 112 | `qiniuAiProviderPreset.websiteUrl` | `"https://www.qiniu.com/ai/agent"` |
| 127 | `unity2ProviderPreset.websiteUrl` | `"https://unity2.ai/"` |
| 136 | `infistarAiProviderPreset.websiteUrl` | `"https://infistar.ai/"` |

Add this test after it. The file already imports `providerPresets`.

```js
test("no provider preset link carries a referral code, a sign-up path or a short link", () => {
  const links = providerPresets.flatMap((preset) => [
    preset.websiteUrl,
    ...preset.endpoints.map((endpoint) => endpoint.websiteUrl)
  ]).filter(Boolean);
  assert.ok(links.length > 0);
  for (const link of links) {
    const url = new URL(link);
    assert.equal(url.protocol, "https:", link);
    assert.equal(url.search, "", link);
    assert.doesNotMatch(url.pathname, /\/register|\/agent\//, link);
    assert.notEqual(url.hostname, "s.qiniu.com", link);
  }
});
```

Every other preset link already passes these four checks (measured with `git grep -h websiteUrl -- packages/core/src/providers/presets`).

- [ ] **Step 3: Write the failing repo-wide guard**

Create `tests/architecture/no-referral-links.test.mjs`.

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const referral = "(\\?|&|&amp;|%3F|%26)(aff|ref_source|cps_key|utm_[a-z]+)(=|%3D)|s\\.qiniu\\.com";

// models.json is generated from models.dev, which adds its own utm_source to provider doc links.
const excluded = [
  "docs/superpowers/",
  "docs/package-lock.json",
  "package-lock.json",
  "packages/core/models.json",
  "tests/architecture/no-referral-links.test.mjs"
];

function referralLines() {
  try {
    return execFileSync(
      "git",
      ["grep", "-nIiE", referral, "--", ".", ...excluded.map((entry) => `:(exclude)${entry}`)],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    ).split("\n").filter(Boolean).map((line) => line.slice(0, 200));
  } catch (error) {
    if (error.status !== 1) throw error;
    return [];
  }
}

test("no tracked file carries a referral parameter or the Qiniu short link", () => {
  assert.deepEqual(referralLines(), []);
});

test("the referral pattern matches plain, HTML-escaped and URL-encoded parameters", () => {
  const pattern = new RegExp(referral, "i");
  for (const sample of [
    "https://x.test/?aff=abc",
    "https://x.test/register?a=1&ref_source=link",
    "source=https%3A%2F%2Fx.test%2F%3Faff%3Dabc",
    "source=https%3A%2F%2Fx.test%2F%3Fa%3D1%26utm_medium%3Dpartner",
    "href=\"https://x.test/?a=1&amp;utm_source=y\"",
    "https://x.test/?cps_key=1",
    "https://s.qiniu.com/abc"
  ]) {
    assert.match(sample, pattern);
  }
  for (const sample of [
    "llmr://provider?name=x&amp;base_url=y&amp;source=https%3A%2F%2Fteamorouter.com%2F",
    "https://github.com/a/b?ref=main",
    "https://x.test/?staff=1"
  ]) {
    assert.doesNotMatch(sample, pattern);
  }
});
```

The pattern is the same string for `git grep -E` and for `RegExp`. It was run against `136ad730` before this plan was written. It hits only files this task edits or the list excludes. A bare `source=` is a legitimate deeplink parameter, so the pattern does not ban it.

- [ ] **Step 4: Run both tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-preset-utils.test.js`
Expected: FAIL in two tests. The renamed test fails on the Fenno link. The new test fails on `https://www.kimi.com/code?aff=ccr`.

Run: `git add tests/architecture/no-referral-links.test.mjs && node build/test.mjs architecture && node --test .test-dist/architecture/test/no-referral-links.test.js`
Expected: FAIL in `no tracked file carries a referral parameter or the Qiniu short link`. The diff lists lines in nine preset files, `provider-deeplink.md` lines 89, 93, 97, 101 and 105, and `llmr-rename.test.mjs:41`. The pattern test passes. `git grep` reads tracked files only, which is why the new file is added first.

- [ ] **Step 5: Clean the preset links**

Replace every listed `websiteUrl` value. The three presets that stay are first.

| File | Lines | Old value | New value |
|---|---|---|---|
| `kimi-coding/index.ts` | 30, 35, 40 | `https://www.kimi.com/code?aff=ccr` | `https://www.kimi.com/code` |
| `moonshot/index.ts` | 84, 89 | `https://platform.kimi.com/?aff=ccr` | `https://platform.kimi.com/` |
| `moonshot/index.ts` | 100, 105 | `https://platform.kimi.ai/?aff=ccr` | `https://platform.kimi.ai/` |
| `qiniu-ai/index.ts` | 11, 17, 23, 29, 34 | `https://s.qiniu.com/AVjMVf` | `https://www.qiniu.com/ai/agent` |
| `code0/index.ts` | 14 | `https://code0.ai/agent/register/…` | `https://code0.ai/` |
| `claudeapi/index.ts` | 14 | `https://console.claudeapi.com/agent/register/…` | `https://claudeapi.com/` |
| `fenno/index.ts` | 14 | `https://api.fenno.ai/register?…` | `https://fenno.ai/` |
| `infistar-ai/index.ts` | 15 | `https://www.infistar.cc/register?…` | `https://infistar.ai/` |
| `runapi/index.ts` | 14 | `https://runapi.co/register?aff=IX1t` | `https://runapi.co/` |
| `unity2/index.ts` | 14 | `https://unity2.ai/register?source=…` | `https://unity2.ai/` |

All paths are under `packages/core/src/providers/presets/`. The Qiniu short link redirected to `https://www.qiniu.com/ai/agent` plus a `cps_key` and five `utm_` parameters on 2026-11-16, so the new value is the same page without them. The cleaned Kimi, Moonshot and Qiniu links returned HTTP 200 on that date. HP-2 deletes the last six rows. They are cleaned here so that HP-1 passes its own guards.

- [ ] **Step 6: Clean the encoded `source=` values on the deeplink page**

In `docs/src/content/docs/en/configuration/provider-deeplink.md`, replace the `source=` value inside the `href` of each listed button. Leave the rest of each line alone.

| Line | Button class | New `source=` value |
|---|---|---|
| 85 | `provider-unity2` | `https%3A%2F%2Funity2.ai%2F` |
| 89 | `provider-code0` | `https%3A%2F%2Fcode0.ai%2F` |
| 93 | `provider-claudeapi` | `https%3A%2F%2Fclaudeapi.com%2F` |
| 97 | `provider-qiniu-ai` | `https%3A%2F%2Fwww.qiniu.com%2Fai%2Fagent` |
| 101 | `provider-fenno` | `https%3A%2F%2Ffenno.ai%2F` |
| 105 | `provider-infistar-ai` | `https%3A%2F%2Finfistar.ai%2F` |

Each old value runs from `source=` to the closing `"` of the `href`. The RunAPI button (line 77) and the three Kimi buttons (lines 57, 61, 65) have no `source=` parameter and do not change.

- [ ] **Step 7: Remove the four kept entries from `scripts/llmr-rename.mjs`**

Delete these whole objects from the `kept` array. Find each by its `text` value.

| Lines | `text` |
|---|---|
| 39-45 | `"aff=ccr"` |
| 46-52 | `"aff=CCRCCR"` |
| 53-58 | `"aff%3DCCRCCR"` |
| 85-94 | `"claudecoderouter"` |

Keep every other entry, including `"musistudio/claude-code-router"` at lines 75-84.

- [ ] **Step 8: Update the three fixtures in `tests/architecture/llmr-rename.test.mjs`**

1. Line 40-41. Rename the test `hosts we do not own and the pre-5.0 cleanup names survive` to `the pre-5.0 cleanup names survive`. Delete the first assertion, the one whose input is `"\"https://example.test/?aff=ccr\""`. With the kept entry gone the helper returns `aff=llmr` for it (measured).
2. Line 55-56. Rename the test `longform keeps upstream attribution, partner codes and the names legacy cleanup matches` to `longform keeps upstream attribution and the names legacy cleanup matches`. Remove the word `utm_source=claudecoderouter` and one of the spaces around it from the `source` string. The string becomes `"github.com/musistudio/claude-code-router \"Claude Code Router CA\" # >>> Claude Code Router CLI >>>"`.
3. Line 70. In the `residue` fixture, replace `aff=ccr` with `CCR_GATEWAY_RUNTIME_ID`. That name is an `at` entry, so the helper masks it in every file and the expected result stays `["f.ts:2: x-ccr-route"]` (measured).

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-preset-utils.test.js`
Expected: PASS, 0 failures.

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/no-referral-links.test.js .test-dist/architecture/test/llmr-rename.test.js`
Expected: PASS, 0 failures.

Run: `node scripts/llmr-rename.mjs --check all`
Expected: `0 residual lines for alias, wire, env, rest, longform`

### Verify before opening the PR

- [ ] **Step 10: Run the full checks**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: each command exits 0. `npm run test:core` runs the whole core suite, which includes the preset test.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/providers/presets docs/src/content/docs/en/configuration/provider-deeplink.md scripts/llmr-rename.mjs tests/architecture/llmr-rename.test.mjs tests/architecture/no-referral-links.test.mjs packages/core/test/unit/providers/provider-preset-utils.test.mjs
git commit -m "chore(presets): strip referral codes from provider links"
```

Open the PR from `chore/strip-referral-links` and squash-merge it.

---

## HP-2: Delete the six reseller presets

**Fixes:** F-B3.
**Depends on:** HP-1. After HP-1 the rename script names no reseller preset file, so this PR does not touch `scripts/llmr-rename.mjs`.
**Branch:** `chore/remove-reseller-presets`
**Size:** M.
**Owner steps:** Step 9 is a manual check in the desktop app. It adds one provider to the owner's real LLMR config and removes it again.

**Status:** Merged 2026-11-16 as [PR 70](https://github.com/jrmatherly/llm-router/pull/70), squash commit `8723f8d4`. It was the first PR to merge under the four required checks. A review changed two things from the steps below:

- The core test `dropped reseller presets stay out of the registry and their base URLs resolve to no preset` is not in the tree. It pinned nothing a regression could plausibly break. The UI test `a saved provider whose preset was dropped opens as custom with no preset icon` covers the behaviour.
- The Qiniu preset test rejects a subdomain of the preset host (`https://eu.api.qnaigc.com`). The removed Unity2 and Infistar assertions were the only ones that did.

Still open:

- Step 9, the manual check in the running app, has not been done.
- The release note in Step 11 is in the PR description and still has to go in the release that ships it.
- Finding from the review, accepted by the owner on 2026-11-16 ("Leave it"). No change is planned, so do not raise it again. A provider deep link whose base URL matches no preset falls back to a name match in `resolveProviderDeepLinkPreset` (`packages/ui/src/pages/home/shared/providers.ts`). A name only has to contain a preset alias of four or more characters (`providerPresetIdentityMatchScore`, `packages/core/src/providers/presets/utils.ts`), and `providerIdentitySafetyIssueInList` always returns `undefined`. So a link named `claudeapi` gets the Anthropic preset and icon with its own base URL kept (measured by the reviewer against the real registry). Before this PR the `claudeapi` preset claimed that link by base URL. The match rule itself is pinned as intended by the test `provider identity lookup normalizes aliases and punctuation`, and it applies to any link that names itself after a known provider.

A saved provider (`GatewayProviderConfig`, `packages/core/src/contracts/app.ts:161-188`) stores no preset id. The UI finds the preset again by base URL each time (`findProviderPresetByBaseUrl` in `providerDisplayIcon` and `createProviderDraftFromProvider`, `packages/ui/src/pages/home/shared/providers.ts:531-541,746-774`). So a provider saved from a deleted preset keeps working and loses only its brand icon, its preset name in the edit dialog, and the website button. That effect is inferred from the code. Steps 2 and 9 check it.

### Task 1: Remove the presets and everything that names them

**Files:**
- Delete: `packages/core/src/providers/presets/{code0,claudeapi,fenno,infistar-ai,runapi,unity2}/index.ts` (each folder holds only `index.ts`)
- Modify: `packages/core/src/providers/presets/index.ts:3,4,6,8,18,21,69-71,73-75`
- Modify: `packages/ui/src/pages/home/shared/options.ts:48,49,51,53,61,64,361,362,364,366,378,381`
- Delete: `packages/ui/src/assets/provider-icons/{claudeapi.png,code0.png,fenno.jpg,infistar-ai.jpg,runapi.jpg,unity2.jpg}`
- Delete: `docs/public/provider-icons/{claudeapi.png,code0.png,fenno.jpg,infistar-ai.jpg,runapi.jpg,unity2.jpg}`
- Modify: `docs/src/content/docs/en/configuration/provider-deeplink.md:77-80,85-96,101-108`
- Modify: `docs/src/styles/global.css:1494-1498,1506-1522,1590-1594`
- Modify: `packages/core/test/unit/providers/provider-preset-utils.test.mjs`
- Modify: `packages/ui/test/integration/providers.test.ts`

**Interfaces:**
- Consumes: `findProviderPreset(id: string | undefined): ProviderPreset | undefined` and `findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined`, both exported from `packages/core/src/providers/presets/index.ts`. `createProviderDraftFromProvider`, `providerDisplayIcon`, `setProviderPresets` and `customProviderPresetId`, which `packages/ui/test/integration/providers.test.ts` already imports.
- Produces: nothing new.

- [ ] **Step 1: Create the branch from an up-to-date `main` that contains HP-1**

```bash
git switch main && git pull && git switch -c chore/remove-reseller-presets
```

- [ ] **Step 2: Write the failing tests**

In `packages/core/test/unit/providers/provider-preset-utils.test.mjs`, add `findProviderPreset` and `findProviderPresetByBaseUrl` to the existing import from `@llmr/core/providers/presets/index.ts`. Add this test.

```js
test("dropped reseller presets stay out of the registry and their base URLs resolve to no preset", () => {
  for (const id of ["code0", "claudeapi", "fenno", "infistar-ai", "runapi", "unity2"]) {
    assert.equal(findProviderPreset(id), undefined, id);
  }
  for (const baseUrl of [
    "https://console.code0.ai",
    "https://gw.claudeapi.com",
    "https://api.fenno.ai",
    "https://infistar.ai/v1",
    "https://runapi.co/v1",
    "https://unity2.ai/v1"
  ]) {
    assert.equal(findProviderPresetByBaseUrl(baseUrl), undefined, baseUrl);
  }
});
```

The six base URLs are the `endpoints[0].baseUrl` values of the presets at `136ad730`.

In `packages/ui/test/integration/providers.test.ts`, add `import { providerPresets } from "@llmr/core/providers/presets/index.ts";` beside the other preset imports (lines 6-10). Add this test.

```ts
test("a saved provider whose preset was dropped opens as custom with no preset icon", () => {
  setProviderPresets(providerPresets);
  const provider = {
    api_base_url: "https://runapi.co/v1",
    api_key: "sk-test",
    models: ["gpt-5.5"],
    name: "RunAPI",
    type: "openai_responses"
  };
  const draft = createProviderDraftFromProvider(provider);
  assert.equal(draft.presetId, customProviderPresetId);
  assert.equal(draft.baseUrl, "https://runapi.co/v1");
  assert.equal(draft.apiKey, "sk-test");
  assert.equal(draft.modelsText, "gpt-5.5");
  assert.equal(providerDisplayIcon(provider), "");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-preset-utils.test.js`
Expected: FAIL in the new test. `findProviderPreset("code0")` returns the preset.

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js`
Expected: FAIL in the new test with `'runapi' !== 'custom'`. `customProviderPresetId` is `"custom"` (`packages/core/src/providers/presets/types.ts:32`).

If `node build/test.mjs ui` cannot resolve `@llmr/core/providers/presets/index.ts`, stop and report the build error. The file already imports single presets from the same folder, so the import is expected to work, and a hand-built preset list would not test the real registry.

- [ ] **Step 4: Delete the presets from core**

```bash
git rm -r packages/core/src/providers/presets/code0 packages/core/src/providers/presets/claudeapi packages/core/src/providers/presets/fenno packages/core/src/providers/presets/infistar-ai packages/core/src/providers/presets/runapi packages/core/src/providers/presets/unity2
```

In `packages/core/src/providers/presets/index.ts`, remove the six imports (`claudeApiProviderPreset`, `code0ProviderPreset`, `fennoProviderPreset`, `infistarAiProviderPreset`, `runApiProviderPreset`, `unity2ProviderPreset`) and the same six names from the `providerPresets` array. The array then runs `…, qiniuAiProviderPreset, teamoRouterProviderPreset, yApiProviderPreset`.

In `provider-preset-utils.test.mjs`, remove the imports of `fennoProviderPreset`, `infistarAiProviderPreset` and `unity2ProviderPreset` (lines 24-29 and 50-52). In the test renamed by HP-1, remove the Fenno block (the two statements that start at `fennoProviderPreset.websiteUrl`), the Unity2 block (four statements from `unity2ProviderPreset.websiteUrl`) and the Infistar block (seven statements from `providerPresets.find((preset) => preset.id === "infistar-ai")`). Keep the Qiniu assertions. Rename the test to `Qiniu preset exposes requested endpoints and protocols`.

- [ ] **Step 5: Delete the icons and their map entries**

```bash
git rm packages/ui/src/assets/provider-icons/claudeapi.png packages/ui/src/assets/provider-icons/code0.png packages/ui/src/assets/provider-icons/fenno.jpg packages/ui/src/assets/provider-icons/infistar-ai.jpg packages/ui/src/assets/provider-icons/runapi.jpg packages/ui/src/assets/provider-icons/unity2.jpg
git rm docs/public/provider-icons/claudeapi.png docs/public/provider-icons/code0.png docs/public/provider-icons/fenno.jpg docs/public/provider-icons/infistar-ai.jpg docs/public/provider-icons/runapi.jpg docs/public/provider-icons/unity2.jpg
```

In `packages/ui/src/pages/home/shared/options.ts`, remove the six imports (`claudeapiProviderIconUrl`, `code0ProviderIconUrl`, `fennoProviderIconUrl`, `infistarAiProviderIconUrl`, `runapiProviderIconUrl`, `unity2ProviderIconUrl`) and the six keys of `providerPresetIconUrls` that use them (`claudeapi`, `code0`, `fenno`, `"infistar-ai"`, `runapi`, `unity2`).

- [ ] **Step 6: Remove the docs buttons and their CSS**

In `provider-deeplink.md`, delete six `<a class="provider-import-button …">…</a>` blocks of four lines each. Their classes are `provider-runapi` (77-80), `provider-unity2` (85-88), `provider-code0` (89-92), `provider-claudeapi` (93-96), `provider-fenno` (101-104) and `provider-infistar-ai` (105-108). Keep `provider-teamorouter` (81-84) and `provider-qiniu-ai` (97-100).

In `docs/src/styles/global.css`, delete five rules and the blank line after each. Their selectors end in `.provider-runapi` (1494-1498), `.provider-unity2` (1506-1510), `.provider-code0` (1512-1516), `.provider-claudeapi` (1518-1522) and `.provider-infistar-ai` (1590-1594). Keep `.provider-teamorouter` (1500-1504), which sits between them. There is no `.provider-fenno` rule.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-preset-utils.test.js`
Expected: PASS, 0 failures.

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js`
Expected: PASS, 0 failures. A leftover import of a deleted icon fails this build step.

- [ ] **Step 8: Check that no reference is left**

Run: `git grep -nIiE "code0|claudeapi|fenno|infistar|runapi|unity2" -- . ':!docs/superpowers' ':!package-lock.json' ':!docs/package-lock.json'`
Expected: the only hits are the id and base URL strings in the two new tests (`provider-preset-utils.test.mjs` and `providers.test.ts`).

Run: `git ls-files | grep -iE "code0|claudeapi|fenno|infistar|runapi|unity2"`
Expected: no output.

- [ ] **Step 9: Check the existing-provider case in the running app (owner)**

This step changes the owner's real LLMR config by one provider. Delete that provider at the end.

1. On `main` (with HP-1 merged), run `npm run dev:electron`. Open **Providers**, choose the **RunAPI** preset, enter any text as the API key, add one model, and save. Quit the app.
2. Switch to `chore/remove-reseller-presets` and run `npm run dev:electron` again.
3. Open **Providers**. Expected: the RunAPI provider is still listed with its base URL `https://runapi.co/v1`, key and model. Its icon is the generic fallback.
4. Open its edit dialog. Expected: the preset selector shows **Other / custom**, and there is no **Open provider website** button.
5. Open the add-provider list and type `runapi`, `fenno` and `code0`. Expected: no result for any of them.
6. Delete the test provider.

If step 3 or 4 shows anything else, stop and report what the app shows. Do not add a migration (D-9).

### Verify before opening the PR

- [ ] **Step 10: Run the full checks**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:ui
```

Expected: each command exits 0.

- [ ] **Step 11: Commit**

```bash
git add -A packages/core/src/providers/presets packages/core/test/unit/providers/provider-preset-utils.test.mjs packages/ui/src/pages/home/shared/options.ts packages/ui/src/assets/provider-icons packages/ui/test/integration/providers.test.ts docs/public/provider-icons docs/src/content/docs/en/configuration/provider-deeplink.md docs/src/styles/global.css
git commit -m "chore(presets): remove six reseller presets"
```

Open the PR from `chore/remove-reseller-presets` and squash-merge it. Put the result of Step 9 in the PR description. Put this sentence in the PR description and the release notes of the release that ships it: "Six reseller provider presets are removed (code0, claudeapi, fenno, infistar-ai, runapi and unity2), and a provider saved from one of them keeps working without its brand icon or website button."

---

## HP-3: Repo hygiene

**Fixes:** F-B4, F-B5, F-B6, F-B7, F-B8, and the `README.md:205` half of F-B9.
**Depends on:** None. HP-1 edits other lines of `scripts/llmr-rename.mjs`, and RS-4 in the [release safety plan](../2026-11-16-audit-release-safety.md) edits `README.md:216`. Rebase if either lands first.
**Branch:** `chore/repo-hygiene`
**Size:** S.
**Owner steps:** Confirm the copyright line in Task 2 Step 2 (`Copyright (c) 2026 Jason Matherly`) before merge. It is a legal notice in the owner's name.

**Status:** Merged 2026-11-16 as [PR 71](https://github.com/jrmatherly/llm-router/pull/71), squash commit `e18f0b4b`. The owner confirmed the copyright line as written. A review changed one thing from the steps below:

- Task 2 Step 5's first README sentence was true only when no `../../next-ai/gateway` folder existed, because `build/docker-local-gateway.mjs` fell back to that sibling path when no variable was set. The fallback is removed there and in `build/esbuild.config.mjs`, so a local ai-gateway checkout is used only when a variable names one. `docker/README.md` and `docs/src/content/docs/en/guides/docker.md` name `LLMR_DOCKER_GATEWAY_SOURCE_DIR` in place of the sibling path.

This plan stays out of `completed/` until HP-2's two owner steps are closed.

This is a PR and not a direct push to `main`, because Task 1 edits `scripts/llmr-rename.mjs` and a test. If the work were split, Task 2 would be docs-only (`AGENTS.md`, `SECURITY.md`, the two `LICENSE` files, the `README.md:205` text) plus a two-line `.gitignore` change that no check reads. Task 1 could not be split that way. The `README.md:23` change must land with the `blog/` deletion, and the script change makes it code.

The audit named a `sponsors/glm-en.jpg` file. No top-level `sponsors/` directory exists. The file is `blog/images/sponsors/glm-en.jpg`, and Task 1 deletes it with the rest of `blog/`.

### Task 1: Remove `blog/` and move the README screenshot

**Files:**
- Create: `.github/assets/llm-router.png` (moved from `blog/images/llm-router.png`, 813 KB)
- Delete: `blog/` (3 posts under `blog/en/`, 12 images under `blog/images/`)
- Modify: `README.md:23`
- Modify: `scripts/llmr-rename.mjs:25` (`skippedPaths`)
- Test: `tests/architecture/readme-identity.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Outside `docs/superpowers/`, only `README.md:23` and `scripts/llmr-rename.mjs:25` refer to `blog/` (measured with `git grep`). The screenshot goes to `.github/assets/` and not to `docs/public/`, so the docs site build does not ship it.

- [ ] **Step 1: Create the branch**

```bash
git switch main && git pull && git switch -c chore/repo-hygiene
```

- [ ] **Step 2: Write the image test**

In `tests/architecture/readme-identity.test.mjs`, change the `node:fs` import to `import { existsSync, readFileSync } from "node:fs";` and add this test.

```js
test("README.md local images exist", () => {
  const sources = [...readFileSync("README.md", "utf8").matchAll(/<img[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((source) => !/^https?:/.test(source));
  assert.ok(sources.length > 0);
  for (const source of sources) {
    assert.ok(existsSync(source.replace(/^\//, "")), `missing README image: ${source}`);
  }
});
```

The README uses only `<img>` tags, some with a leading `/` that GitHub resolves from the repo root.

- [ ] **Step 3: Move the screenshot, delete `blog/`, and see the test fail**

```bash
mkdir -p .github/assets
git mv blog/images/llm-router.png .github/assets/llm-router.png
git rm -r blog
```

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/readme-identity.test.js`
Expected: FAIL with `missing README image: blog/images/llm-router.png`.

- [ ] **Step 4: Repoint the README and drop the dead skip entry**

In `README.md:23`, change `src="blog/images/llm-router.png"` to `src=".github/assets/llm-router.png"`. Keep `width="820"` and the `alt` text.

In `scripts/llmr-rename.mjs`, delete the line `"blog/en/",` from `skippedPaths` (line 25).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/readme-identity.test.js .test-dist/architecture/test/llmr-rename.test.js`
Expected: PASS, 0 failures.

Run: `git grep -nE "blog/(en|images)" -- . ':!docs/superpowers'`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add README.md scripts/llmr-rename.mjs tests/architecture/readme-identity.test.mjs
git commit -m "chore: remove the upstream blog and move the README screenshot"
```

`git mv` and `git rm` in Step 3 already staged the move and the deletion.

### Task 2: Fix the facade sentence, license, security policy, ignore rules and Docker text

**Files:**
- Modify: `AGENTS.md:22`
- Modify: `LICENSE:3-4`, `packages/cli/LICENSE:3-4`
- Create: `SECURITY.md`
- Modify: `.gitignore` (append after line 30, `private/`)
- Modify: `README.md:205`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

No step here has a unit test. Step 6 is the verification.

- [ ] **Step 1: Correct the facade sentence in `AGENTS.md`**

On line 22, replace the text `the `gateway/service.ts` facade (20-line cap, no imports from gateway modules)` with this text.

```text
the `gateway/service.ts` facade (20-line cap, no `GatewayService` class or `node:http`; it re-exports `gateway/application/gateway-service` and `routing/protocol-endpoints`, and no other gateway module imports it)
```

Leave the rest of the line alone. The new wording matches the first two tests in `packages/core/test/architecture/gateway-service-architecture.test.mjs:19-40`. The check does not change, so the rule-and-check constraint holds.

- [ ] **Step 2: Add the fork's copyright line to both license files**

`LICENSE` and `packages/cli/LICENSE` are identical today. In each, keep line 3 (`Copyright (c) 2025 musistudio`) and add a new line 4 directly under it.

```text
Copyright (c) 2026 Jason Matherly
```

Change nothing else. The MIT text requires that the original notice stays.

Run: `diff LICENSE packages/cli/LICENSE`
Expected: no output.

- [ ] **Step 3: Create `SECURITY.md`**

```markdown
# Security policy

## Report a vulnerability

Report vulnerabilities privately through GitHub. Open the repository's **Security** tab and choose **Report a vulnerability**, or go to https://github.com/jrmatherly/llm-router/security/advisories/new. Do not open a public issue for a security problem.

## Supported versions

Only the latest release receives security fixes.
```

Private vulnerability reporting is already enabled on the repo (spec F-B7).

- [ ] **Step 4: Add the two ignore rules**

Append to `.gitignore`.

```text
CLAUDE.local.md
.superpowers/
```

Run: `git check-ignore -v CLAUDE.local.md .superpowers/x`
Expected: two lines, each starting with `.gitignore:`.

- [ ] **Step 5: Replace the Docker sentence in `README.md`**

On line 205, replace the sentence `The npm script prepares the local plugin-capable ai-gateway runtime before building the image when `../../next-ai/gateway` exists.` with these three sentences.

```markdown
The image uses the ai-gateway package from `package-lock.json`. To build it from a local ai-gateway checkout instead, set `LLMR_DOCKER_GATEWAY_SOURCE_DIR` to that checkout. Each release also publishes `ghcr.io/jrmatherly/llm-router:latest`, described in [`docker/README.md`](docker/README.md).
```

Keep the sentence before it and the Docker deployment guide sentence after it. `build/docker-local-gateway.mjs:16-23` reads `LLMR_DOCKER_GATEWAY_SOURCE_DIR` first, and `docker/README.md:81-83` documents the published image. Do not touch line 216.

### Verify before opening the PR

- [ ] **Step 6: Run the checks**

```bash
npm run typecheck
npm run test:architecture
node scripts/llmr-rename.mjs --check all
test -f .github/assets/llm-router.png && test ! -e blog && test -f SECURITY.md && echo ok
```

Expected: the first two commands exit 0. The third prints `0 residual lines for alias, wire, env, rest, longform`. The fourth prints `ok`.

`npm run test:architecture` covers `readme-identity`, `llmr-rename` and `english-only`. The `AGENTS.md` sentence describes a core test that the gate does not run. Run `npm run test:core` only if `packages/core` changed, which this PR does not do.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md LICENSE packages/cli/LICENSE SECURITY.md .gitignore README.md
git commit -m "docs: fix the facade rule text and add license, security and ignore hygiene"
```

Open the PR from `chore/repo-hygiene` and squash-merge it.

---

## Not verified

- Nobody ran the test suites while this plan was written. The rename-guard results in HP-1 come from an in-memory run of `scripts/llmr-rename.mjs` with the four kept entries removed and the links cleaned. The referral pattern was run with `git grep` against `136ad730`.
- The icon and edit-dialog effect on a saved provider is inferred from the code. HP-2 Step 9 settles it.
- `https://unity2.ai/` failed its TLS handshake from the research machine on 2026-11-16, and `https://claudeapi.com/` redirects to `apito.ai`. Both presets are deleted in HP-2, so the cleaned values live for one PR.
- Whether the UI test bundle resolves `@llmr/core/providers/presets/index.ts` is assumed from the single-preset imports in the same file. HP-2 Step 3 shows it.
