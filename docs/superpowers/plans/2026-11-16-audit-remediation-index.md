# Audit remediation program index

> **For agentic workers:** This file orders the work. It holds no tasks. Open the plan a PR belongs to and run it with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Fix the findings of the 2026-11-16 project audit in an order where each pull request is small, verified on its own, and shipped through a release path that tests what it ships.

**Spec:** [`docs/superpowers/specs/2026-11-16-audit-remediation.md`](../specs/2026-11-16-audit-remediation.md). Read its Goal, Global constraints and Decisions in full before starting any PR. A plan line that contradicts a decision is wrong.

## The plans

| Plan | PR ids | Fixes |
|---|---|---|
| [Release safety](2026-11-16-audit-release-safety.md) | RS-1 to RS-5 | F-A1 to F-A13 |
| [Provider presets and repo hygiene](2026-11-16-audit-hygiene-and-presets.md) | HP-1 to HP-3 | F-B1 to F-B9 |
| [Core gateway](2026-11-16-audit-core-gateway.md) | CG-1 to CG-9 | F-C1 to F-C12 (F-C13 is deferred) |
| [Electron 45 upgrade](completed/2026-11-16-audit-electron-upgrade.md) | EU-1, EU-2 | F-D1 to F-D3 |
| [Desktop hardening and UI dependency cleanup](completed/2026-11-16-audit-desktop-hardening.md) | DH-1 to DH-3 | F-D4 to F-D11 |
| [Upstream leftovers](2026-11-16-audit-upstream-leftovers.md) | UL-1, UL-2 | F-E1, F-E2 |
| [Lint and test type-checking](2026-11-16-audit-tooling.md) | TL-1, TL-2 | F-F1 to F-F3 |
| [Codex runtime source and profile service extraction](2026-11-16-audit-structure.md) | ST-1 to ST-5 | F-G1, F-G2 |

## Order

Run the waves in order. Inside a wave, PRs on different rows of the conflict table below can be open at the same time.

### Batches

Jason decided on 2026-11-17 to cut the number of branches and PRs. These PR ids land together as one branch and one squash-merged PR, with one commit per task. Each batch only joins PRs that would never be reverted apart. A plan's "Branch" line for a batched PR is superseded by the branch here.

| Batch | Branch | Why these go together |
|---|---|---|
| CG-4 + CG-5 | `fix/gateway-guards-and-sse-reconnect` | Both are small reliability fixes in `packages/core` and touch different files. |
| ST-1 + ST-2 | Named when it starts | ST-2 type-checks the file ST-1 creates. ST-1's sha256 gate runs on the ST-1 commit, before ST-2 edits the script. |
| ST-3 + ST-4 + ST-5 | Named when it starts | Three move-only extractions from `profiles/service.ts` that already had to land one after another. |

Everything else stays one PR each. EU-1 and EU-2 stay apart so a packaging failure names its cause. TL-1 stays alone because adopting Biome touches many files. CG-7 needs a redesign first. The two ST batches are confirmed against the structure plan before they start.

### Wave 1. Make the release path trustworthy

| PR | What it does | Depends on | Size |
|---|---|---|---|
| RS-1 | CI builds and tests the gateway tarball that releases ship | None | M |
| RS-2 | The GitHub release stays a draft until every platform uploaded | RS-1 | M |
| RS-3 | `npm run release` refuses to run without a green Tests run on `HEAD` | RS-1 | S |
| RS-4 | Docs PR build, Dependabot entries, base-image digest bump, dead publish fields, unsigned-Windows note | None | S |
| RS-5 | Owner-only repository settings (not a PR) | Per step. RS-1, RS-2, RS-4. Step 1 (Dependabot) also waits for EU-2 in Wave 3 | Owner |

Everything after this wave ships through the fixed path. Cut a release after RS-2 and RS-3 have merged to prove the path before the larger changes use it. RS-5 step 1 waits until EU-2 has merged, because the grouped Dependabot npm PR would otherwise include Electron, better-sqlite3 and the deferred majors.

### Wave 2. Remove what should not be there

| PR | What it does | Depends on | Size |
|---|---|---|---|
| HP-1 | Strip referral codes from provider links | None | S |
| HP-2 | Delete the six reseller presets | HP-1 | M |
| HP-3 | Repo hygiene: `AGENTS.md` facade sentence, `blog/`, LICENSE, `SECURITY.md`, `.gitignore`, README | None | S |
| CG-1 | Delete dead core exports and `proxy.browserMode` | None | S |
| UL-1 | Remove the `TZ=UTC` override | None | S |
| UL-2 | Migrate `CODEXL_*` names to `LLMR_*` | UL-1 | M |

### Wave 3. Close the security findings

| PR | What it does | Depends on | Size |
|---|---|---|---|
| EU-1 | better-sqlite3 13, delete the Electron sqlite sidecar | RS-1, RS-2 | M |
| EU-2 | Electron 45 | EU-1 | S |
| CG-2 | Tunnel non-target hosts, bound the MITM cache, redact captured query strings | CG-1 | M |
| CG-9 | Delete the proxy key injection (decision D-12) | CG-2 | S |
| DH-1 | Electron renderer hardening | None | M |
| DH-2 | Chrome login import | None | M |
| CG-6 | Require marketplace module integrity, show failures in the UI | CG-1 | M |

### Wave 4. Fix the reliability defects

| PR | What it does | Depends on | Size |
|---|---|---|---|
| CG-3 | Write user-owned files atomically | CG-1 | M |
| CG-4 | Small gateway guards | CG-1, CG-2 | S |
| CG-5 | Reconnect a dropped SSE MCP stream | CG-1 | S |
| CG-7 | Refresh with the rotated Codex refresh token in the provider probe and account service | CG-1 | S |
| CG-8 | Document retry stacking (docs-only, straight to `main`) | None | S |

### Wave 5. Tooling, then structure

| PR | What it does | Depends on | Size |
|---|---|---|---|
| DH-3 | Remove `baseui`, dead overrides, root `dependencies`, dead UI exports | EU-2 | S |
| TL-1 | Adopt Biome for linting | CG-1, UL-2 | M |
| TL-2 | Type-check the TypeScript test files | None | M |
| ST-1 | Move the Codex runtime script into a `.cjs` source file | UL-2 | M |
| ST-2 | Type-check the Codex runtime script | ST-1 | S |
| ST-3 | Extract the shared profile apply helpers | UL-2 | S |
| ST-4 | Move the Grok profile code to `agents/grok` | ST-3 | S |
| ST-5 | Move the Kimi profile code to `agents/kimi` | ST-3 | M |

## Files that two PRs must not edit at the same time

Open only one PR from each row at a time. Rebase the next one after the previous merges.

| Shared file | PRs |
|---|---|
| `package.json`, `package-lock.json` | RS-4, EU-1, EU-2, DH-2, DH-3, TL-1, ST-2 |
| `.github/workflows/test.yml` | RS-1, TL-1 |
| `.github/workflows/release.yml` | RS-1, RS-2 |
| `packages/core/src/profiles/service.ts` | UL-1, UL-2, ST-3, ST-4, ST-5 |
| `packages/core/src/agents/codex/cli-middleware-runtime.ts` | UL-1, UL-2, ST-1, ST-2 |
| `packages/core/src/proxy/service.ts`, `packages/core/test/unit/proxy/proxy-peer.test.mjs`, `docs/src/content/docs/en/configuration/server.md` | CG-2, CG-9 |
| `packages/core/src/contracts/app.ts` | CG-1, CG-6 |
| `packages/core/src/agents/codex/app-launch.ts` | CG-1, UL-2 |
| `packages/core/src/observability/request-log-store.ts` | CG-1, CG-4, TL-1 |
| `packages/core/src/providers/account-service.ts` | CG-7, TL-1 |
| `packages/ui/src/pages/home/shared/extensions.ts` | CG-6, DH-3 |
| `packages/ui/test/component/layout.test.tsx` | CG-6, TL-1, TL-2 |
| `packages/core/src/profiles/launch-service.ts` | UL-1, UL-2, CG-3, TL-1 |
| `scripts/llmr-rename.mjs` | HP-1, HP-3 |
| `packages/electron/src/main/built-in-browser.ts` | EU-2, DH-1 |
| `packages/electron/src/main/browser-automation-mcp.ts` | DH-1, TL-1 |
| `AGENTS.md` | RS-1, RS-3, HP-3, EU-1, TL-1, TL-2 |
| `README.md` | RS-4, HP-3, EU-1, EU-2 |
| `docs/src/content/docs/en/guides/install.md` | RS-4, EU-2 |
| `docs/src/components/interactive/LogsViewDemo.tsx` | DH-3, TL-1 |
| `tests/architecture/workflow-permissions.test.mjs` | RS-1, RS-2, RS-4, TL-1 |
| `tests/architecture/ui-build-contract.test.mjs` | DH-1, TL-1 |
| `tests/architecture/package-scripts.test.mjs` | TL-1, TL-2, ST-2 |
| `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs` | UL-1, UL-2, ST-1 |
| `packages/core/test/integration/profiles/profile-service.test.mjs` | UL-1, UL-2, ST-4, ST-5 |
| `packages/ui/test/integration/providers.test.ts` | HP-2, TL-2 |
| `packages/ui/test/component/share-cards.test.tsx` | TL-1, TL-2 |

Three cross-plan notes:

- ST-1 moves the Codex runtime script to a `.cjs` file. Its gate compares the emitted script's sha256 on the PR's own base and head, so it must run after UL-1 and UL-2 have finished editing that script. If ST-1 ever lands first, UL-1 and UL-2 edit the `.cjs` file instead.
- Biome does not lint the `.runtime.cjs` file. Whichever of TL-1 and ST-1 lands second adds `"!packages/core/src/agents/codex/*.runtime.cjs"` to `files.includes` in `biome.json`. Nobody edits the script to satisfy lint.
- TL-1 runs after the PRs that delete or move a lot of code, so lint fixes do not land on lines about to be removed.

## Steps only the owner can do

- **Before EU-1, EU-2 and DH-2.** No longer an owner step. `npm config get min-release-age` returned `2` on 2026-11-17, not the `7` this program was written against. `tldts@7.5.0` (published 2026-11-12) and `better-sqlite3@13.2.0` (2026-11-14) install now. `electron@45.3.3` (2026-11-16T05:55Z) installs from 2026-11-18T05:56Z. Re-run the command before an install, because the setting has changed once already.
- **EU-1.** Approve the edit to `.claude/settings.json` that removes the `rebuild:sqlite3` deny rule together with the script it guards.
- **EU-1.** Run the Windows and Linux packaging checks if a machine is available. Otherwise the first release after it is the first packaging run on those platforms.
- **EU-2.** Merged as PR 103. Run the four manual macOS checks listed in the plan's status note, and the Windows and Linux packaging checks. Confirm auto-update from 7.2.1 on Windows. RS-2 publishes the release automatically, so without those machines check the published release on Windows and Linux as soon as it is out. If a check fails, pull it back with `gh release edit vX.Y.Z --draft` and fix forward. Paste the release note that the desktop app now needs macOS 13 or later (EU-2 Task 8 Step 7).
- **RS-5.** Enable Dependabot version updates in Settings (a fork needs the toggle) only after RS-4 and EU-2 have merged. Add the required checks, enforce SHA pinning, allow squash merges only, move the Apple secrets to a `release` environment, add the tag ruleset.
- **HP-2.** Confirm in the running app that a provider saved from a deleted preset still works. Paste the release note about the six removed presets (HP-2 Step 11).
- **HP-3.** Confirm the copyright line for the fork.
- **DH-2.** Merged as PR 100. Run the Chrome checks with the unpacked extension (Task 3 Steps 1 to 3), the reload check for an install that had extension 0.1.0, and one import that takes over 30 s. The plan's status note has the steps.
- **RS-2.** Run the first two commands of RS-5 step 5 (create the `release` environment and its `v*` tag policy) before RS-2 Task 2.3. They must also be in place before the first release after RS-2. Push the throwaway tag for the draft-release check, then delete the tag and its draft release.
- **RS-1.** If Task 1.1 ends in outcome C, triage the new `F-A14` finding.
- **DH-1.** RS-2 publishes the release automatically, so check the Windows build of the published release that carries DH-1 as soon as it is out. The IPC sender check fails closed, so a wrong path rule would break every renderer call there. If the home page is empty, pull the release back with `gh release edit vX.Y.Z --draft` and fix forward.
- **UL-1.** Paste the release note about `TZ: "UTC"` in existing Claude settings into the release that ships it.
- **UL-2.** Paste the release note that lists the `LLMR_` replacements for the `CODEXL_` names into the release that ships it.
- **CG-6.** Paste the release note that marketplace entries without `integrity` are skipped.
- **CG-9.** Run Task 2 Step 2, the three curl checks in the running app. It needs the proxy CA trusted in the system store and a real LLMR key. Paste the release note that Proxy mode no longer adds the LLMR key.

## When a plan has shipped

Move it to `docs/superpowers/plans/completed/` and repoint the links in this index. When every plan has shipped, move this index and the spec to their `completed/` folders too.
