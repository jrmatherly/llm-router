# Research: the TZ override and the CODEXL_ names

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

Goal restated: give the owner a researched keep/remove call on two upstream leftovers before the audit-fix plan is written. Read-only; nothing in the repo was changed. Throughput checkpoint: n/a, read-only investigation.

## 1. Answer

**(1) `TZ=UTC` override. Recommend remove.** It is very likely a counter to a Claude Code fingerprint, not a date-bug fix. A 2026-06-30 post reports that Claude Code (2.1.91 onward) writes the system-prompt date as `YYYY/MM/DD` when the zone is `Asia/Shanghai` or `Asia/Urumqi`, as part of marking custom-endpoint traffic. Upstream added the override the next day (371520bb, 2026-07-01) in a commit titled only "Revise configuration docs…". The link is inferred from timing and matching zones; no commit message, issue, doc or comment states the reason (measured).
- What a China-zone user pays today: the whole Claude Code process tree runs in UTC, so Bash `date`, test output and Claude-made commit timestamps are UTC, and the model's "today" is a day behind from 00:00 to 08:00 local.
- What they lose on removal: the date line may again carry the China-zone format to whatever provider LLMR routes to. The post documents no blocking.
- Opt-in adds a setting, UI and docs for an English-only fork; a user who wants it can already put `TZ=UTC` in profile env.
- Whether this fork wants to ship an evasion workaround is the owner's call; I recommend not.

**(2) `CODEXL_*`. Recommend full migration to `LLMR_*` in one PR; the ccr precedent applies.** CodexL is musistudio's sibling Tauri launcher for Codex App workspaces (`~/.codexl/`); the names were carried in with the runtime at upstream's first commit. Nothing outside this repo reads them (details below). "Remove the dead ones only" is not safe as a blind delete, because two names are load-bearing with no `LLMR_` writer.

Inventory, 57 distinct names (measured by `rg`, classification by reading each site):

| Class | Names | Action |
|---|---|---|
| Load-bearing, no `LLMR_` writer | `CODEXL_CODEX_WORKSPACE_NAME` (CLI wrapper `service.ts:2911,3043`, `app-launch.ts:697`; `LLMR_` twin written only at `launch-service.ts:1362`), `CODEXL_ZCODE_WORKSPACE_NAME` (`service.ts:2869,3013`, `app-launch.ts:679`; no twin writer). `cli-middleware-runtime.ts:4347` reads `CODEXL_CLAUDE_CODE_MODEL` with no `LLMR_` in that expression | Add the `LLMR_` writer/read first, then delete |
| Redundant twin, `LLMR_` read first | 12 `CODEXL_BOT_*` (`bot-gateway/env.ts:64-75,278`; read `runtime:315-316,5247-5287`), `REAL_CODEX/ZCODE_CLI_PATH`, `BUNDLED_CODEX_CLI_PATH`, `{CODEX,ZCODE}_{PROFILE,MODEL_PROVIDER,MODEL_CATALOG_FILE,PROFILE_CONFIG_FORMAT}`, `*_CORE_MODE` (twin is `*_REMOTE_FRONTEND_MODE`, `runtime:2569`), `PROFILE_SURFACE`, `CLAUDE_CODE_{MODEL,MCP_CONFIG,BIN}`, `CODEX_CHATGPT_AUTH_FILE` | Delete write and read |
| Dead, written and never read | `CODEXL_HOME` writes (`qr-login-service.ts:189`, `runtime:5728`; the bot SDK reads only `BOT_GATEWAY_STATE_DIR`/`BOT_GATEWAY_PROXY_URL`), `CODEXL_PROFILE_API_KEY`, all 8 `CODEXL_WORKBUDDY_*`, `CODEXL_REAL_WORKBUDDY_CLI_PATH` (`app-launch.ts:658-660,710-714,825,892`) | Delete |
| Read, never written (user-set only) | `CODEXL_HOME` (`runtime:77`, the one place CODEXL beats LLMR, over `LLMR_CONFIG_DIR`), `CODEX_INSTANCE_NAME` (no twin), `CHATGPT_PATH`, `CODEX_PATH`, `ZCODE_PATH`, `WORKBUDDY_PATH` (`app-launch.ts:88,148,200`), `CLAUDE_CODE_CAPTURE_STDOUT`, `CLAUDE_CODE_EXTRA_ARGS`, `CODEX_ISOLATED_IDENTITY`, `SIGNED_CODEX_SUPERVISOR_NODE_PATH`, `CODEX_APP_{NET_RESPONDER,INSPECTOR}_DISABLE`, `*_MODEL_CATALOG_B64` | Delete; undocumented |
| Persisted on users' disks | Generated wrappers and runtime in `~/.llm-router/bin` (regenerated); Claude `settings.json` `env` keys `CODEXL_CLAUDE_CODE_MODEL`, `CODEXL_CLAUDE_CODE_MCP_CONFIG`, `CODEXL_BOT_*` | Keep the strip lists only |

`CODEXL_HOME` is worth removing on its own: a machine that also runs CodexL could redirect LLMR's config dir (inferred from `runtime:77`).

## 2. Evidence

- Measured: `git log -S claudeCodeUtcTimezoneEnvOverride` and `-S isChinaTimeZone` both bottom out at 371520bb; `git log --all --grep` for timezone/china finds nothing relevant; `gh issue list -R musistudio/claude-code-router --search "timezone OR TZ OR 时区"` returns no match; no docs mention.
- Measured: only test is `packages/core/test/unit/agents/claude-environment.test.mjs:12-24`.
- Measured: callers beyond the prompt's list are `agents/claude-app/launch.ts:69` and a duplicate implementation inside the runtime script, `cli-middleware-runtime.ts:59-74,170,4125`.
- Fingerprint claim: https://www.vincentschmalbach.com/claude-code-china-router-fingerprint/ (third-party, unconfirmed by Anthropic). Related blog https://www.80aj.com/2026/06/30/claude-code-timezone-fix/ returned 502.
- Measured: `grep -a -c "Asia/Shanghai"` on the installed Claude Code 2.1.325 binary returns 0. This proves nothing, since the post says the lists are encoded.
- Measured: `grep -rail codexl node_modules/@the-next-ai` is empty (ai-gateway and bot-gateway-sdk, binary-inclusive). `rg -l CODEXL` over `~/dev/claude-multipass`, `~/dev/claude-apps-gateway`, `~/dev/llm-router-extensions`, shell rc files, `~/.claude/settings.json`, `~/.codex/config.toml` is empty. No docs or UI reference.
- Measured: on this machine `~/.llm-router/bin/llmr-claude-code-wrapper-default-claude-code` (5 hits), `llmr-codex-cli-stdio-*` (17 each), `llmr-codex-cli-middleware.js` (49), `llmr-cli.js` (63).
- Measured: `upstream/main` still carries the same counts, so upstream has not migrated.
- CodexL identity: https://github.com/musistudio/codexl (search result summary; repo source not read).

## 3. Plan inputs

**PR A, remove TZ override (S).**
- `packages/core/src/agents/claude-code/environment.ts`: delete `chinaTimeZones` (35-44), `claudeCodeUtcTimezoneEnvOverride`, `currentTimeZone`, `isChinaTimeZone` (101-116).
- Drop calls and imports: `profiles/service.ts:18,483,496 (Object.assign arg),503,1724,1762` and the `timezoneEnv` parameter of `claudeCodeManagedSettingsEnvKeys` (~3345-3357); `profiles/launch-service.ts:10,187,1366`; `profiles/launch-core.ts:3,327`; `agents/claude-app/launch.ts:8,69`; `cli-middleware-runtime.ts` `CLAUDE_CODE_CHINA_TIME_ZONES`, 59-74, 170, 4125.
- Tests: delete the two cases at `claude-environment.test.mjs:12-24`. Add to `packages/core/test/integration/profiles/profile-service.test.mjs` "claude code settings env carries no TZ" (asserts `settings.env.TZ === undefined` and the wrapper text has no `export TZ=`).
- Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-environment.test.js`.
- Owner decision: existing China-zone installs keep `TZ: "UTC"` in settings `env`, because `TZ` is not in `isManagedClaudeCodeSettingsEnvKey` (`service.ts:3363`). Either strip `TZ` when it equals `"UTC"` once (clobbers a user's own value) or put it in release notes. I recommend the release note.

**PR B, CODEXL to LLMR (M, about 155 lines across 6 source and 6 test files).** Order inside the PR:
1. Add `LLMR_CODEX_WORKSPACE_NAME` / `LLMR_ZCODE_WORKSPACE_NAME` writers at the sites above; add `LLMR_CLAUDE_CODE_MODEL` at `runtime:4347`; give `CODEX_INSTANCE_NAME` no successor.
2. Delete every CODEXL write, read, prefix (`runtime:7209-7210,7284-7285`, `app-launch.ts:920-923`) and `shellCodexlProfileSurfaceExports` / `cmdCodexlProfileSurfaceExports` (`service.ts:2807,2942`).
3. Keep, as cleanup not compatibility: `deleteClaudeCodeToolHubEnv` (`service.ts:353`), `462`, `3094`, `3359`, `3371`, `4252`, and `CODEXL_CLAUDE_CODE_MODEL_ENV` in the managed-model key list (`environment.ts:18`).
4. Tests to update: the 6 files from `rg -n CODEXL_ packages/core/test`; flip `profile-service.test.mjs:1060` and `profile-launch-core.test.mjs:197` to assert `undefined`; switch `codex-cli-middleware-runtime.test.mjs:259,508` to `LLMR_CODEX_WORKSPACE_NAME`.
5. New guard, following `tests/architecture/llmr-rename.test.mjs`: fail on `CODEXL_` in `packages/*/src` outside a named allowlist of the cleanup lines. Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/llmr-rename.test.js`.
6. New case "stale CODEXL keys are stripped from settings env" in `profile-service.test.mjs`.

A and B are independent. Both touch `service.ts` and the runtime script, so land A first.

## 4. Risks and unknowns

- Not verified: whether Claude Code 2.1.325 still varies the date line by zone. The brief forbids starting a server. Check: a throwaway 127.0.0.1 capture listener, then `TZ=Asia/Shanghai CLAUDE_CONFIG_DIR=<scratch> ANTHROPIC_BASE_URL=http://127.0.0.1:<port> claude -p hi` against a `TZ=UTC` run, comparing the "Today's date" line.
- Not verified: that wrappers and `llmr-codex-cli-middleware.js` are always rewritten in the same apply. An old wrapper running a new runtime would lose the workspace name only. A stale `llmr-codex-cli-stdio-codex` sits beside `-default-codex` on this machine, so orphan wrappers do linger. Check: trace `applyProfileConfig` (`service.ts:155`) and the upgrade-time apply.
- Guess: Codex, ZCode and WorkBuddy apps do not read `CODEXL_*` from their environment. I did not read the CodexL source to confirm it never reads names LLMR sets.
- The stale-`TZ` persistence claim is from reading code, not a run.

Skipped: the claudeissues.com thread 67120 (DNS failure), CodexL's own source, and any test execution (forbidden by the brief).

Sources: [Schmalbach post](https://www.vincentschmalbach.com/claude-code-china-router-fingerprint/), [80aj post](https://www.80aj.com/2026/06/30/claude-code-timezone-fix/), [musistudio/codexl](https://github.com/musistudio/codexl), [claude-code issue 4514](https://github.com/anthropics/claude-code/issues/4514)
