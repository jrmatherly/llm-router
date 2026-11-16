# Audit pass: dependencies and supply chain

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

- **The desktop app ships Electron 42, which no longer gets security fixes** | high | confirmed
  - Evidence: `npm view electron time` shows the last 42.x release is 42.11.18 on 2026-10-21, the day 45.0.0 came out. 43.8.10 and 44.11.3 were both released on 2026-11-12, and 45.3.3 on 2026-11-16. Electron supports only the three newest majors. The root `package.json` and `packages/electron/package.json` both declare `electron: ^42.3.3`, and `npm outdated` reports latest 45.2.3.
  - Impact: every desktop user runs a Chromium/V8 build that gets no more security fixes. The app's renderer loads the management UI and handles the `llmr://` protocol.
  - Recommendation: move to Electron 45. It is coupled to better-sqlite3: npm's newest 12.x (12.11.1) has prebuilds only up to Electron 42. better-sqlite3 13.x is N-API and drops `prebuild-install`, which `scripts/prepare-electron-sqlite.mjs:21` calls directly. The `better_sqlite3.electron-*.node` sidecar logic there, its filters in `electron-builder.json`, and the `rebuild:sqlite3` and `sqlite:electron` scripts then become simpler or can be deleted. Electron 45 still declares `@types/node ^24`, so the engines line holds. Size M.

- **Dependabot version updates have never run** | medium | likely
  - Evidence: `.github/dependabot.yml` has existed since 2026-10-25 (weekly npm and actions). `gh pr list --state all --limit 300` shows 0 PRs from a `dependabot/*` branch. The repo's workflow list has no "Dependabot Updates" workflow. `gh api repos/<owner>/llm-router` returns `fork: true` (parent musistudio/claude-code-router), and GitHub turns version updates off by default on forks. The config also leaves out `/docs` (its own lockfile) and the `docker` ecosystem.
  - Impact: patch drift piles up silently. `npm outdated` lists @playwright/test 1.65.0, pm2 7.1.2, undici 7.30.2, lucide-react 1.70.0 and tailwind 4.3.5. Fixes for docs, such as astro in PR 62, only land by hand.
  - Recommendation: turn on version updates in the repo's Dependabot settings, and add `directory: "/docs"` npm and `docker` entries. Size S.

- **The Docker base image digest is stale and nothing updates it** | medium | confirmed
  - Evidence: `Dockerfile:1-2` pins `node:24-bookworm-slim@sha256:55fb5f5a…` (added 2026-10-27, commit 1664bff2). Docker Hub's `24-bookworm-slim` now points to `sha256:dc26ae92…`, last updated 2026-11-11. No Dependabot docker ecosystem is configured.
  - Impact: Docker users get no Node or Debian patches until someone bumps the digest by hand.
  - Recommendation: add the Dependabot `docker` ecosystem, or a digest check in CI, and bump now. Size S.

- **baseui and styletron are only used as an empty provider wrapper** | medium | confirmed
  - Evidence: the only imports are in `packages/ui/src/lib/baseui-provider.tsx:2-4` (`BaseProvider` and `LightTheme`). The docs demos only import that wrapper. A search for `baseui/*`, `useStyletron` or `$theme` finds no other use. baseui 16 pulls `react-dropzone@9.0.0`, then `attr-accept`, then `core-js@2.6.12`, which is deprecated and runs an install script. That is the only reason `core-js@2.6.12` is in `allowScripts` (`npm explain core-js`).
  - Impact: three runtime dependencies in `packages/ui` and `docs/` do nothing. One of them carries an approved install script that is a supply-chain risk. They are also an upgrade cost: `npm outdated` shows baseui 18.2.0 available.
  - Recommendation: replace the wrapper with a `div` that keeps the `AppContainer` sizing (100% height and width, min 0). Then drop baseui, styletron-engine-atomic and styletron-react from the ui, root and docs manifests, and drop `core-js` from `allowScripts`. Check the layout in the app afterwards. Size S.

- **Five overrides inherited from upstream are dead or redundant and hold back patches** | low | confirmed
  - Evidence: all five come from upstream commit e38f9bc2, and no test guards them (only the ai-gateway/glob override has `tests/architecture/dependency-overrides.test.mjs`).
    - `socks → ip-address 10.7.4`: `npm ls socks ip-address --all` is empty, so this one is dead.
    - `pm2 → js-yaml 4.3.2`: pm2 7.1.1 and 7.1.2 already depend on js-yaml 4.3.2.
    - `minimatch@10.2.5 → brace-expansion 5.0.12`: minimatch asks for `^5.0.5`, and 5.0.13 is out.
    - `find-my-way@9.6.0 → 9.7.0`: fastify 5.12.7 asks for `^9.6.0`.
    - `fast-uri@3 → 3.1.9`: ajv asks for `^3.0.1`.
  - Impact: exact pins stop newer patch releases from installing, and readers can't tell which overrides still matter.
  - Recommendation: delete the five, run `npm install`, and confirm `npm audit` stays the same. Size S.

- **Runtime dependencies are declared three times** | low | confirmed
  - Evidence: the root `dependencies` copy core's list exactly, and `packages/cli` repeats it minus pm2. PR 62 (`git show --stat 8c0de61d`) had to edit node-forge in the root, cli and core manifests. Nothing ships the root manifest: the Electron app directory is `packages/electron` (`electron-builder.json`), and Docker runs `npm ci --workspace=@llm-router/core --include-workspace-root=false`.
  - Impact: every bump costs extra edits, and the three copies can drift apart.
  - Recommendation: drop the root `dependencies` block, after checking that build scripts resolve from hoisted `node_modules`, which workspaces do anyway. Size S.

- **Pending major versions and their rough cost** | low | confirmed (versions), likely (cost)
  - Evidence (`npm outdated`, `npm view`):
    - better-sqlite3 12 → 13: needed for Electron 45 (first finding).
    - undici 7 → 8: needs Node ≥22.19, so engines are fine. Used in core proxy and runtime code (`packages/core/src/proxy/*`, `gateway/core-runtime/supervisor.ts`). Size M.
    - react 18 → 19: baseui 18 and motion 14 accept React 19, and `@astrojs/react` 7 does too. Size M.
    - typescript 6 → 7: size L.
    - js-yaml 4 → 5: build-only, in `build/merge-macos-update-metadata.mjs`. Size S.
    - @types/node 26: should stay on 24 to match engines.
  - Recommendation: Electron and better-sqlite3 first; the rest as capacity allows.

**Unverified leads**
- Electron 43–45 breaking changes against `packages/electron/src/main`. Settle it with the Electron breaking-changes doc for 43, 44 and 45 plus `npm run test:e2e` on a branch.
- Whether removing `BaseProvider` changes layout or layering in the UI or the docs demos. Settle it by comparing screenshots before and after.
- Whether the new Node 24 image carries security fixes. Settle it by comparing `node --version` in both digests with the Node 24 changelog.
- I did not check what TypeScript 7 costs; running `tsc` under 7.x on a branch would show it.

**Checked and found fine**
- `npm audit` at the root reports only GHSA-g3hv-75wg-m249 (minimatch, alert 144, already known), and only through electron-builder (dev). `docs/` reports 0. This matches the only open Dependabot alert.
- Node engines agree everywhere: `>=24` in root, core and cli, `.node-version` 24, every CI `setup-node` (24 or `.node-version`), Docker `node:24`, esbuild `target: "node24"`.
- `allowScripts` matches the lockfile's `hasInstallScript` set exactly: 6 entries, 6 packages, same versions.
- esbuild 0.28.2 and electron-builder 26.18.0 are the latest releases. electron-updater 6.8.11 is current.
- `electron-updater` and `openai` as devDependencies are correct, because esbuild bundles them (`nodeExternals` lists only electron, better-sqlite3 and builtins). The packaged app ships only better-sqlite3.
- pm2 in core's dependencies is needed by `docker/entrypoint.sh:213-217`. Core's production dependencies in Docker are needed for runtime package resolution (`supervisor.ts:251`).
- The ai-gateway glob override is still needed (ai-gateway 1.0.21 declares `glob ^13.0.6`) and has a guard test.
- GitHub Actions are pinned by SHA.

I did not check the `docker/claude-apps-gateway/compose.yaml` images (postgres:16-alpine and dex v2.44.0, tag-pinned only) beyond noting them.
