# Claude App takeover opt-in and Claude Code token refresh

Decided 2026-10-28 after the claude-multipass incident. Two independent changes, one spec, two plans.

## Why

While LLMR runs with an enabled Claude Code profile that has an App entry, it writes `deploymentMode: "3p"` and an applied config-library entry into the shared `~/Library/Application Support/Claude-3p/` dir (`packages/core/src/agents/claude-app/gateway-service.ts`, `syncClaudeAppGatewayConfig`). Claude Desktop reads that dir at every launch (its bundle: `readPersistedDeploymentMode` over `<userData>-3p/claude_desktop_config.json`, `resolve3pForcingSource`), so a Dock launch or an account switcher's `open -a Claude` boots the third-party instance: no claude.ai account, Code tab sessions under `Claude-3p`, inference through LLMR only. PR 48 limited the write to System default profiles. The operator chose a stricter contract: never by default, opt-in per profile.

Separately, LLMR's imported Claude Code provider reads the Keychain item `Claude Code-credentials` on every request (`authenticateClaudeCode` in `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts`) but never checks `expiresAt` and never refreshes, unlike the Grok and Kimi providers. Under LLMR's `apiKeyHelper` takeover the CLI does not refresh its own login either, so after a switch to a profile saved hours ago LLMR sends an expired token and answers 401 until something else refreshes it.

## Change 1: explicit opt-in for taking over direct Claude App launches

- New optional `ProfileConfig` field `claudeAppTakeover?: boolean` (`packages/core/src/contracts/app.ts`). Absent or `false` means never write the shared `Claude-3p` dir for this profile. The per-profile data dir LLMR launches with (`<settings dir>/.llm-router/claude-app-user-data/<profile>` and its `-3p` sibling) is unaffected: the play button and `llmr <profile>` keep working without the toggle.
- `claudeAppTakesOverDirectLaunches(profile)` becomes `profile.enabled && profile.agent === "claude-code" && profile.surface !== "cli" && profile.claudeAppTakeover === true`. Scope no longer matters for the App surface; the CLI surface keeps its scope semantics.
- The profile editor shows the toggle only for `claude-code` with surface App or Auto, labelled **Route Claude App launched outside LLMR through LLMR**, with the hint "Also applies to launches from the Dock or an account switcher. Claude App then opens in third-party mode, signed out of claude.ai." Default off.
- Turning the toggle off, disabling the profile, or quitting LLMR restores the shared dir (existing `restoreClaudeAppGatewayConfig` on the no-entry branch of sync).
- Migration: no stored profile has the field, so every existing profile stops taking over after upgrade. Release note required. Profiles the UI parses with the old shape keep working (field optional).
- Docs: the field rows in `docs/src/content/docs/en/configuration/agents/claude-code.md` and `docs/src/content/docs/en/configuration/profiles.md`; the troubleshooting entry from PR 48 reworded to name the toggle.

## Change 2: Claude Code OAuth expiry and refresh

- `OAuthTokenSet` gains `expiresAt?: number` (epoch ms), parsed from `claudeAiOauth.expiresAt` in both the Keychain record and `.credentials.json` (`readOauthTokenSetFields` in `packages/core/src/agents/local-providers/shared.ts`). Claude Code 2.1.312 stores it as epoch milliseconds (measured on this Mac: `expiresAt: 1793249706961`).
- `claudeCodeAccessTokenExpired(auth)` is true when `expiresAt <= Date.now() + 60_000`, the same 60 s margin as `grokAccessTokenExpired`. No `expiresAt` means not expired (older records).
- `resolveClaudeCodeAuth()` mirrors `resolveGrokAuth`: returns the live token set when not expired; otherwise refreshes once per credential (coalesced by `sourceFile`), persists the result, and on a 401/403 adopts a token the CLI or Desktop rotated in the Keychain since the read (same shape as `adoptPeerRotatedGrokAuth`).
- Refresh request: `POST https://platform.claude.com/v1/oauth/token` with `grant_type=refresh_token`, `refresh_token`, `client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e` (endpoint and client id read from the installed Claude Code 2.1.312 binary). Encoding (form vs JSON) is verified in the plan before the code is written; env override `LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT` for tests, like `GROK_OIDC_TOKEN_ENDPOINT`. Through `fetchWithSystemProxy`. The response's `refresh_token`, when present, replaces the stored one (Anthropic rotates it).
- Persistence writes the whole record back to where it came from. Keychain: `security add-generic-password -U -a <account> -s <service> -X <hex of JSON>`, the shape Claude Code's own write and claude-multipass's `keychain_put` use (`/Users/jason/dev/claude-multipass/bin/claude-multipass:330-352`), so the item keeps the partition Claude Code reads without a prompt. File: rewrite `.credentials.json` with mode 0600. Only `claudeAiOauth` changes; `mcpOAuth` and the other keys are kept.
- The hook (`authenticateClaudeCode`) and the usage connector (`localClaudeCodeAccountCredential`) call `resolveClaudeCodeAuth()`; import (`importClaudeCodeProvider`) refreshes too so an import from a stale profile works. The candidate scan stays synchronous and reports a `locked` candidate with the reason "access token expired and refresh failed" when refresh fails.
- Not persisting is not an option: a refresh rotates the refresh token server side, so an in-memory-only refresh would strand the CLI's copy, which is the "OAuth token revoked" failure seen on 2026-10-28 at 18:44.

## Out of scope

- Any change to claude-multipass.
- Binding the provider to a claude.ai account or showing which account it currently routes to.
- Refreshing the Desktop app's own token cache.
