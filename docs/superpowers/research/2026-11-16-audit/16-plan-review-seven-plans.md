# Plan review: seven plans against code, spec and index

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

Goal: check the seven audit-remediation plans against the code at `136ad730`, the spec and the index before the owner reads them. I fixed the mechanical problems in place and list everything else below. All 8 files are still untracked. Nothing is committed.

## Verdicts

| Plan | Verdict |
|---|---|
| release-safety | Ready after my fixes |
| hygiene-and-presets | Ready after my fixes |
| electron-upgrade | Ready after my fixes |
| desktop-hardening | Ready after my fixes |
| upstream-leftovers | Ready after my fixes |
| tooling | Ready after my fixes |
| structure | Needs author changes (issues 1 and 3) |

None of the seven plans contains a long dash or a curly quote (checked with `rg`, including a control match). There are no placeholders, and every task has a commit step. Every single-file test command uses the AGENTS.md form. No plan uses pnpm or yarn or runs `rebuild:sqlite3`. Tag pushes and settings changes are labelled as owner steps (RS-2 Task 2.3, RS-5).

## Edits made

- **release-safety.** RS-3 pointed at `AGENTS.md:15`. The `npm run release` bullet is line 14.
- **hygiene-and-presets.**
  - "another plan" now names RS-4 with a link, in two places.
  - `README.md:201` is now 205 in four places. The Docker sentence is on line 205; line 201 is a code fence.
- **electron-upgrade.**
  - The `windows-latest` text was credited to the repo-hygiene plan. It belongs to RS-4, which is now linked.
  - EU-1 "Depends on: None" now says RS-1 and RS-2 for ordering, matching the index.
  - The index and plan references are now links.
- **desktop-hardening.**
  - Line fixes: `built-in-browser.ts:1004-1008` is now 1009-1013, `provider-account-webcontent.ts:322` is now 317, `browser/main.tsx:65` is now 66, `providers.tsx:2929` is now 2928, and `confirm.js:23-25` is now 24-26.
  - DH-3 "Depends on" now says EU-2, matching the index.
  - References to "the Electron upgrade" now name EU-1 and EU-2 with links.
- **upstream-leftovers.**
  - "The structure plan's ST-1" is now a link with its id.
  - The appendix said "168 lines". That grep gives 168 matches on 155 source lines.
  - I rewrote two mid-sentence colons.
- **tooling.**
  - "core gateway plan", "upstream leftovers plan", "preset deletions" and "the D-7 PR" now name CG-7, CG-1, UL-1/UL-2, HP-2 and ST-1, with links.
  - "Depends on" now names CG-1 and UL-2.
  - I rewrote one mid-sentence colon.
- **structure.**
  - ST-1 and ST-3 said "Depends on: None". The index says UL-2, so they now say UL-2 for ordering.
  - The "upstream-leftovers plan" references now name UL-1, UL-2 and `codexl-names.test.mjs`.
- **index, shared-file table.**
  - Fixed rows: `AGENTS.md` adds RS-1, RS-3 and TL-2. `launch-service.ts` adds UL-2 and TL-1.
  - New rows: `README.md`, `install.md`, `browser-automation-mcp.ts`, `LogsViewDemo.tsx`, `workflow-permissions.test.mjs`, `package-scripts.test.mjs`, `codex-cli-middleware-runtime.test.mjs`, `profile-service.test.mjs`, `providers.test.ts` and `share-cards.test.tsx`.

## Issues not fixed, most important first

1. **The structure plan breaks D-9 with two re-exports.** ST-4 Step 3 and ST-5 Step 3 add `export { resolveGrokSourceHome/resolveKimiSourceHome }` to `service.ts` "to keep importers unchanged". `git grep` finds one importer, `profile-service.test.mjs:13`. That makes the re-exports compatibility shims, which the global constraint bans. Smallest fix: point that test import at the agent modules and drop both re-exports.

2. **The spec contradicts RS-1.** The spec's global constraint says never execute the `ai-gateway` package in a test. F-A3's fix runs two wire tests that spawn the gateway bin, in RS-1 Task 1.1 and in CI from Task 1.2. The plan carves out an exception only in its own constraints. Smallest fix: the owner amends the spec constraint to exempt those two tests (port reserved, child killed).

3. **Structure test counts assume the `136ad730` base, but the index runs ST after UL-2.** ST-1 Step 9 expects 30 runtime tests. UL-1 adds 1 and UL-2 adds 4, so the count would be 35. The shared gate expects 63 profile-service tests. UL-1 adds 1 and UL-2 adds 2, so it would be 66. Smallest fix: write "the base run's count plus one" and "the base run's count".

4. **The index's owner-step list misses three steps.**
   - RS-2 Task 2.3: push a throwaway tag, then delete the tag and its draft release.
   - DH-1: check one Windows build before release, because the sender check fails closed.
   - UL-1: paste the release note into the release.

   Smallest fix: add three bullets.

5. **Spec line numbers are off, and I did not touch the spec.**
   - F-B9 cites `README.md:201`. The sentence is on 205.
   - F-D4 cites `browser-automation-mcp.ts:2025-2040`. The function is at 2026-2041.

6. **Two statements in electron-upgrade are stale.**
   - Task 7 Step 2 says "No PR check builds the docs". That is false once RS-4 lands.
   - Task 8 Step 6 credits the draft release to "RS-1 and RS-2". Only RS-2 creates the draft.

7. **DH-2 Task 1 Step 1 writes an exact pin.** It runs `npm install --save-dev tldts@^7.5.4`. On this machine `save-prefix` is empty, so npm writes an exact pin. The EU plan edits manifests by hand for that reason. This is minor.

8. **All seven plans use title case for "Global Constraints" and "Review Focus".** These headings come from the writing-plans template, which requires them, so I left them.

## Claims sampled (held / checked)

- **release-safety, 19/20.** Checked: workflow line ranges, `docker-smoke.mjs:22-25`, `docker-local-gateway.mjs:32-33`, `Dockerfile:15-17`, merge script line 35, `release.mjs` lines 58-76, 86-90 and 103, the release-script test count of 5, `package.json:29-31,46-47`, `install.md:18-26`, `README.md:216`, `docs.yml` line 51, `gitHubPublisher.js:69-97`. Miss: `AGENTS.md:15`.
- **hygiene-and-presets, 17/18.** Checked: all 18 preset `websiteUrl` lines, the `kept` array lines, the rename-test and preset-test lines, `presets/index.ts`, `options.ts` (12 lines), the deeplink buttons, the `global.css` rules, `types.ts:32`, `providers.ts`, `LICENSE`, `.gitignore:30`, `docker/README.md:81-83`, the facade test. Miss: `README.md:201`.
- **electron-upgrade, 18/18.** Checked: the manifest lines, `electron-builder.json:9,34,38-40`, `verify-packaged-app.cjs` ranges and `normalizeArch`, `sqlite-native.ts` and its 6 importers, the leftover-reference grep, `main.ts:78`, `launch-at-login.ts:26`, `built-in-browser.ts:438,620,689`, `tray-controller.ts:235`, `README.md:122`, `.claude/settings.json:3-5`.
- **desktop-hardening, 19/24.** Checked: the normaliser call sites, the 80 `ipcMain.handle` calls (first at 69), all 13 `webPreferences` blocks pass the new test, the 11 `assertBrowserSender` calls, the deep-link and update-service lines, the chrome-login-import lines, the DH-3 manifest lines, the demo files, the UI export lines. Misses: the 5 fixed above.
- **upstream-leftovers, 15/16.** Checked: every UL-1 table line, the runtime anchors, the bot-gateway lines, the test helpers, the file and token counts (7 and 61). Miss: the line count.
- **tooling, 17/17.** Checked: `gate-commit.mjs:8`, `tsconfig.json`, `build/test.mjs:111`, the React imports, the share-cards lines, the usage-format, onboarding, layout and types anchors, `contracts/app.ts` lines.
- **structure, 20/20.** Checked: the esbuild and `test.mjs` anchors, `package.json:69`, the runtime facts (7,348 lines, interpolation at 4701, escaped backtick at 541), 24 declaration lines in `service.ts`, its import lines, the test counts at base, the English-only, rename and package-boundaries scan lines.

Not checked: the eighth plan (core-gateway), anything that needs `gh` or a network call, and every claim that depends on a build or test run. The tooling and upstream-leftovers plans now link to `2026-11-16-audit-core-gateway.md`, which does not exist yet.

Files: `docs/superpowers/plans/2026-11-16-audit-{release-safety,hygiene-and-presets,electron-upgrade,desktop-hardening,upstream-leftovers,tooling,structure,remediation-index}.md`
