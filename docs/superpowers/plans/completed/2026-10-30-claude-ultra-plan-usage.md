# Claude Ultra Plan Usage Meters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Claude Code provider's account meters show the Ultra plan, the overall weekly limit and every per-model weekly limit (Fable today), and drop the 5-hour meter only when the account has no 5-hour limit.

**Architecture:** A built-in `claude-oauth-usage` parser in `account-service.ts` replaces the static JSONPath mapping. The parser is chosen when `connector.parser` names it or when the endpoint is `api.anthropic.com/api/oauth/usage`, so configs imported before this change get it with no migration. A second read-only GET to a fixed `/api/oauth/profile` URL, cached 24 hours per token, supplies the plan label. The snapshot gains a `plan` field that the shared account label helpers append, so every card variant and the tray show it.

**Tech Stack:** TypeScript, `node:test`, React server rendering in UI component tests, esbuild test bundles.

**Spec:** this plan carries its own spec in the Findings section and the Fixtures appendix. The evidence comes from three places: the claude-multipass session "Anthropic subscription plan changes" (2026-10-30), the Ultra support article (support.claude.com/en/articles/17728952), and a run of llm-router's current mapping against the two measured bodies on 2026-10-30. Plan reviewed 2026-10-30 by an independent reviewer; its nine findings were checked against the code and folded in.

## Findings

Labels: **M** measured, **I** inferred.

1. **M.** The Fable weekly limit is not surfaced. `/api/oauth/usage` reports it only in `limits[]`, as `{kind: "weekly_scoped", percent, resets_at, scope: {model: {display_name: "Fable"}}}`. It does not appear in `five_hour` or `seven_day`, and `locked_reason` stays null at 100%. The current mapping (`claudeCodeAccountMapping`, `packages/core/src/agents/local-providers/claude-code.ts:92-121`) gives the spoons account 5h 17% and 7d 59%, so its status is `ok`, while its Fable limit is at 100% and blocks it.
2. **M.** A verified Ultra account reports `five_hour: {utilization: 0, resets_at: null}`, which llm-router shows as a 5h meter at 0% with no reset. That meter describes a limit the account does not have. An unverified Ultra account (spoons) has a real window, and its profile is identical to a verified one. Only the usage body tells them apart.
3. **M.** The plan name appears only in `GET https://api.anthropic.com/api/oauth/profile`, as `organization.plan_display_name` (`"Ultra"`) and `plan_display_label` (`"Ultra plan"`). The tier IDs did not change: `organization_type: "claude_max"`, `rate_limit_tier: "default_claude_max_20x"`, and the credential's `subscriptionType` is still `"max"`. Nothing in llm-router branches on those IDs.
4. **M.** The import writes the account connector into the user's config (`claudeCodeProviderAccountConfig()`, `claude-code.ts:220-235`), and `effectiveProviderAccountConfig` (`account-service.ts:566-585`) returns stored non-standard connectors unchanged. Editing the mapping alone would fix new imports only.
5. **M.** The `limit: 100` literal in `percentLimitMapping` defeats the "all values undefined" guard in `mappedMeterFromPayload` (`account-service.ts:1345-1373`). Null windows therefore become empty meters, which the UI's ratio filter hides.
6. **M.** The tray icon can be pinned to one meter id (`TrayBalanceProgressConfig.meterId`, `contracts/app.ts:1256-1259`). When that id is missing, `tray-controller.ts:404-405` draws progress 0, which reads as exhausted. Dropping the 5h meter on a verified Ultra account, and losing any old meter id, would trigger this.
7. **M.** In the nested-rings card, `providerAccountQuotaMetersForVisual` (`packages/ui/src/pages/home/components/dashboard.tsx:4187-4196`) returns `[7d, 7d]` when there is no 5h meter and two weekly meters exist. `fiveHour ?? sorted[0]` and `weekly` are then the same meter, so Fable never shows.
8. **M.** `providerEndpointCanReceiveProviderApiKeyInList` (`packages/core/src/providers/presets/utils.ts:68-78`) is a stub that returns `undefined`. Nothing else guards where a bearer token is sent, so the profile call needs its own guard.
9. **M.** Account snapshots are display-only. Only the UI, the tray and the management API read them, so a wrong meter never changes routing.
10. **I.** `limits[]` is an array, and the body also carries `seven_day_cowork`, so more than one `weekly_scoped` entry is plausible. Both measured bodies had exactly one. The parser emits one meter per entry either way.

**Rule carried over from claude-multipass (product call, Jason, 2026-10-30): "Window wins".** Show the plan for any account whose profile reports one. Drop the 5-hour meter only when the plan is Ultra and the body's `five_hour` has `utilization` 0 and `resets_at` null. Keep it in every other case. That includes an Ultra account still under its temporary limit, a Max or Pro account, and an account whose profile lookup failed.

## Global Constraints

- **Profile URL.** The module constant `claudeProfileEndpoint = "https://api.anthropic.com/api/oauth/profile"`, never derived from `connector.endpoint`. The lookup runs only when the usage connector's endpoint matches `claudeOauthUsageEndpointPattern = /^https:\/\/api\.anthropic\.com\/api\/oauth\/usage(?:$|[?#])/i` and `connector.auth !== "none"`, so a token is only ever sent to the host it already goes to.
- **Profile cache.** At most one call per token per 24 hours (`claudeProfileCacheTtlMs = 86_400_000`). A failure is cached as "no plan" for 15 minutes (`claudeProfileFailureTtlMs = 900_000`) and is never an error on the snapshot. The key is `hashSensitiveValue(providerApiKey(request.provider))`, taken after `materializeProviderAccountRequest`. Only `resetClaudeAccountPlanCacheForTest()` clears the cache. `invalidateProviderAccountSnapshotCache`, which every config save calls, does not touch it.
- **Plan text.** Show the plan verbatim from `plan_display_name`. No logic keys on its text except the case-insensitive equality `=== "ultra"` in the Window-wins rule.
- **Meter ids.** Kept from today: `claude_five_hour_quota`, `claude_seven_day_quota`, `claude_oauth_apps_quota`, `claude_opus_quota`, `claude_sonnet_quota`, `claude_extra_usage` and `claude_extra_usage_credits`, each emitted only when its window is a non-null record with a finite number. New: `claude_weekly_scoped_<slug>`, where the slug is the lowercased `display_name` with every run of non-alphanumeric characters replaced by `_`. An entry without a display name falls back to `claude_weekly_scoped_<index in limits[]>`.
- **Labels.** "5h quota", "7d quota", "OAuth apps quota", "Opus quota", "Sonnet quota", `${display_name} weekly quota` (fallback "Scoped weekly quota"), "Extra usage" and "Extra usage credits". Windows are `"5h"`, `"weekly"` or `"monthly"`.
- **Robustness.** A missing, null or malformed entry anywhere in the body means that meter is absent, never a throw.
- **Repo rules.** Double quotes, semicolons, alphabetized keys, no comments except a non-obvious why. Tests use `node:test` and `node:assert/strict`. Run one core file with `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-account-service.test.js`.

## Review Focus

1. A Max or Pro body with no `limits` key, or with `limits: []`: 5h and 7d still appear and no scoped meter does. Pinned in Task 1.
2. A `weekly_scoped` entry with `scope: null` or a non-numeric `percent`: that entry is skipped or falls back and the others survive. Pinned in Task 1.
3. A profile call that returns 429 or 500: the 5h meter stays, there is no `plan`, and status is unaffected. Pinned in Task 2.
4. A verified Ultra account in the nested-rings card: it shows "7d quota" and the Fable meter, not 7d twice. Pinned in Task 3.
5. A tray icon pinned to `claude_five_hour_quota` on an account that becomes verified Ultra: it follows the fullest remaining quota meter instead of drawing empty. Pinned in Task 3.

---

### Task 1: `claude-oauth-usage` parser and endpoint dispatch

**Files:**
- Modify: `packages/core/src/contracts/app.ts:277`. Add `"claude-oauth-usage"` to `ProviderAccountHttpJsonParser`.
- Modify: `packages/core/src/providers/account-service.ts`. Add the parser beside `kimiCodeUsageMeters` (around line 1155), and dispatch to it in `resolveHttpJsonConnector` (around line 703) and in `testProviderAccountConnector` (around line 187).
- Modify: `packages/core/src/agents/local-providers/claude-code.ts:79-121,220-235`. Delete `percentLimitMapping` and `claudeCodeAccountMapping`; the connector gets `parser: "claude-oauth-usage"` and `mapping: { meters: [] }`.
- Test: `packages/core/test/unit/providers/provider-account-service.test.mjs`.

**Interfaces:**
- Produces: `claudeOauthUsageMeters(payload: unknown, options: { omitFiveHour: boolean }, source?: ProviderAccountConnectorSource): ProviderAccountMeter[]`.
- Produces: `isClaudeOauthUsageConnector(connector: ProviderAccountHttpJsonConnectorConfig): boolean`, true when `connector.parser === "claude-oauth-usage"` or `claudeOauthUsageEndpointPattern` matches the endpoint.
- Produces: `claudeFiveHourWindowAbsent(payload: unknown): boolean`, true when `five_hour.utilization` normalizes to 0 and `five_hour.resets_at` is null or missing.
- Produces: `claudeOauthUsageMetersForTest`, exported the same way as `newApiKeyUsageMetersForTest` (line 255).

- [ ] **Step 1: Write the failing tests.** Paste the `spoons` and `matherly` bodies from the Fixtures appendix into a top-level `const claudeUsageBodies` in the test file, and add `max` as a copy of `spoons` with `limits` deleted.
  - `"Claude OAuth usage parser surfaces the Fable weekly limit"`: for `spoons`, `claude_weekly_scoped_fable` has used 100, remaining 0, label "Fable weekly quota" and resetAt `"2026-11-04T12:59:59.776339+00:00"`. For `matherly` it has used 96.
  - `"Claude OAuth usage parser skips null windows"`: for `spoons`, the meter ids are exactly `["claude_five_hour_quota", "claude_seven_day_quota", "claude_weekly_scoped_fable"]`. For `matherly` they also include `claude_extra_usage` and `claude_extra_usage_credits`.
  - `"Claude OAuth usage parser keeps per-model ids when present"`: `spoons` with `seven_day_opus: {utilization: 40, resets_at: null}` yields `claude_opus_quota` with used 40.
  - `"Claude OAuth usage parser tolerates Max-shaped and malformed bodies"`: `max` yields 5h and 7d and no `claude_weekly_scoped_*`. A scoped entry at index 2 with `scope: null` yields `claude_weekly_scoped_2`, labelled "Scoped weekly quota". An entry with `percent: "x"` is skipped. `null`, `[]` and `"text"` each yield `[]`.
  - `"Claude OAuth usage parser omits five-hour only when asked"`: `matherly` with `{ omitFiveHour: true }` has no `claude_five_hour_quota`. With `false` the meter is there at used 0.
  - `"Claude OAuth usage connector is chosen by endpoint for stored configs"`: mock `globalThis.fetch` as the Grok test does (lines 25-70). Have `/api/oauth/usage` return `spoons` and `/api/oauth/profile` return status 500. Pass the pre-change connector shape to `testProviderAccountConnector`: endpoint `https://api.anthropic.com/api/oauth/usage`, a legacy `mapping.meters` holding a `5h quota` entry, and no `parser`. Assert that exactly one meter has id `claude_five_hour_quota`, that `claude_weekly_scoped_fable` is present, and that `result.status === "critical"`.
- [ ] **Step 2:** Run `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-account-service.test.js`. Expected: FAIL, because `claudeOauthUsageMetersForTest` is not exported.
- [ ] **Step 3:** Implement the three functions. Put the dispatch ahead of the `connector.parser` checks at both call sites. Read numbers with `normalizeNumber`. Build every percent meter with `kind: "quota"`, `limit: 100`, `unit: "%"` and `remaining = 100 - used`, as `kimiCodeUsageMeter` does. Extra-usage meters appear only when `extra_usage.is_enabled === true` and the numbers are finite; the credits meter is `kind: "balance"` with `limit = monthly_limit` and `used = used_credits`. In both call sites the parser branch returns `status: statusFromMeters(meters, [], 1)`, as the Kimi branch does, so Fable at 100% reports `critical`. Delete the old mapping from `claude-code.ts`. Leave `omitFiveHour` false in this task; Task 2 sets it.
- [ ] **Step 4:** Run the Step 2 command, then `npm run typecheck` and `npm run test:core`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(core): surface Claude per-model weekly limits from the OAuth usage body`.

### Task 2: Plan lookup and the Window-wins rule

**Files:**
- Modify: `packages/core/src/contracts/app.ts:406` and `:540`. Add `plan?: string` to `ProviderAccountSnapshot` and to `ProviderAccountTestResult`.
- Modify: `packages/core/src/providers/account-service.ts`. Add `plan?: string` to `ConnectorResult` (line 71). Add the lookup and the profile cache. Pass `plan` through `mergeConnectorResults` (line 899) with the same first-wins rule `message` uses.
- Test: `packages/core/test/unit/providers/provider-account-service.test.mjs`.

**Interfaces:**
- Consumes: `claudeOauthUsageMeters`, `claudeFiveHourWindowAbsent` and `isClaudeOauthUsageConnector` from Task 1.
- Produces: `readClaudeAccountPlan(provider: GatewayProviderConfig, auth: ProviderAccountAuthMode | undefined, headers: Record<string, string>): Promise<string | undefined>`. It calls `fetchJson(claudeProfileEndpoint, provider, auth, headers)`, reads `organization.plan_display_name` with `readString`, and catches every error.
- Produces: `resetClaudeAccountPlanCacheForTest(): void`, exported.

- [ ] **Step 1: Write the failing tests.** Mock fetch to route by URL: `/api/oauth/usage` returns a fixture body, and `/api/oauth/profile` returns the `profile` fixture. Call `resetClaudeAccountPlanCacheForTest()` at the start of each test.
  - `"Verified Ultra drops the five-hour meter and reports the plan"`: with `matherly`, `result.plan === "Ultra"` and there is no `claude_five_hour_quota`.
  - `"Unverified Ultra keeps its five-hour window"`: with `spoons`, `plan === "Ultra"` and `claude_five_hour_quota` has used 17.
  - `"Profile failure keeps five-hour and omits plan"`: the profile returns 429. With `matherly`, `plan === undefined`, `claude_five_hour_quota` is present at 0, and `status` equals the status of a run where the profile returns `{}`.
  - `"Profile lookup is cached per token"`: two `testProviderAccountConnector` calls with the same apiKey make one profile fetch. A different apiKey makes a second.
  - `"Profile lookup never runs for a non-Anthropic usage endpoint"`: `parser: "claude-oauth-usage"` with endpoint `https://example.test/usage` makes zero requests to `api.anthropic.com`.
- [ ] **Step 2:** Run the Task 1 Step 2 command. Expected: FAIL, because `plan` is undefined.
- [ ] **Step 3:** Implement the lookup. In the parser branch of `resolveHttpJsonConnector`, call it with `request.provider` and the same merged headers the usage fetch uses. In `testProviderAccountConnector`, call it with that function's `provider` and `connector.headers`. Then set `omitFiveHour = plan?.toLowerCase() === "ultra" && claudeFiveHourWindowAbsent(payload)` and return `plan` on the result.
- [ ] **Step 4:** Run the Task 1 Step 2 command, then `npm run typecheck` and `npm run test:core`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(core): read the Claude plan label and hide the absent five-hour window on verified Ultra`.

### Task 3: Plan in labels, the nested-rings fallback, and the tray icon

**Files:**
- Modify: `packages/ui/src/pages/home/shared/provider-accounts.ts:21-24` (`providerAccountSnapshotLabel`) and `packages/ui/src/pages/tray/shared.tsx:340-343` (`accountSnapshotLabel`). Both are display-only. Selection uses the separate `*SnapshotKey` helpers, so changing the label text changes no ids.
- Modify: `packages/ui/src/pages/home/components/dashboard.tsx:4187-4196` (`providerAccountQuotaMetersForVisual`).
- Create: `packages/electron/src/main/tray-balance-progress.ts`. Move `calculateTrayBalanceProgress` (`tray-controller.ts:673`) here and add the fallback.
- Modify: `packages/electron/src/main/tray-controller.ts:404-405`.
- Modify: `packages/ui/test/fixtures/index.ts`. Add a separate exported `ultraClaudeSnapshot()`; do not touch `accountSnapshots()`, which 14 tests consume.
- Test: `packages/ui/test/component/overview-components.test.tsx`, `packages/ui/test/component/tray-components.test.tsx` and `packages/electron/test/unit/tray-balance-progress.test.ts`.

**Interfaces:**
- Consumes: `ProviderAccountSnapshot.plan` from Task 2.
- Produces: `trayBalanceProgress(snapshot: ProviderAccountSnapshot | undefined, meterId: string): number`. The pinned meter wins. When it is absent, use the quota meter (`kind !== "balance"` with a finite `limit` and `remaining`) that has the lowest remaining ratio. Return 0 only when there is no snapshot or no such meter.
- Produces: `ultraClaudeSnapshot(): ProviderAccountSnapshot`, with provider "Claude Code API", `plan: "Ultra"`, status `"critical"`, and two meters: `claude_seven_day_quota` (label "7d quota", used 69, remaining 31) and `claude_weekly_scoped_fable` (label "Fable weekly quota", used 96, remaining 4). Both have limit 100, unit "%" and window "weekly". There is no 5h meter.

- [ ] **Step 1: Write the failing tests.**
  - The overview test `"Ultra Claude account shows plan, weekly and Fable rings"`: render the account widget in the `nested-rings` variant with `[ultraClaudeSnapshot()]`. The HTML matches `/Claude Code API · Ultra/`, `/7d quota/` and `/Fable weekly quota/`, and does not match `/5h quota/`.
  - The tray test `"Tray account label shows the plan"`: `accountSnapshotLabel(ultraClaudeSnapshot()) === "Claude Code API · Ultra"`, and a snapshot without `plan` keeps today's label. The existing `/5h quota/` assertion at `tray-components.test.tsx:177` still passes.
  - The Electron test `"tray progress falls back to the fullest quota meter when the pinned one is gone"`: for `ultraClaudeSnapshot()` with meterId `claude_five_hour_quota`, the result is 0.04. With `claude_seven_day_quota` it is 0.31. With `undefined` as the snapshot it is 0.
- [ ] **Step 2:** Run `npm run test:ui` and `npm run test:electron`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the changes.
  - Both label helpers append `` ` · ${plan}` `` when `plan` is set.
  - In `providerAccountQuotaMetersForVisual`, the primary is `fiveHour ?? sorted[0]`. The secondary is `weekly` when `weekly` exists and is not the primary; otherwise it is the first sorted meter that is not the primary.
  - `tray-controller.ts` calls `trayBalanceProgress(snapshot, meterId)` and keeps `0` in its `catch`.
- [ ] **Step 4:** Run `npm run test:ui`, `npm run test:electron` and `npm run typecheck`. Expected: all pass. Then run `npm run dev:electron` with a real Claude Code provider imported, and confirm with a CDP screenshot that the card title ends in "· Ultra" and that the nested-rings card shows the 7d and Fable rings. The executor runs this check, not the user.
- [ ] **Step 5: Commit** `feat(ui): show the Claude plan and keep two distinct quota rings`.

### Task 4: Docs and release note

**Files:**
- Modify: `docs/src/content/docs/en/configuration/providers.md:20`. This is item 4 of the `### Claude Code` list, which already covers account usage. Edit that item; do not add a new one.

- [ ] **Step 1:** Replace item 4 with this text. Account usage reads the Anthropic OAuth usage endpoint and shows the 5-hour, weekly and per-model weekly windows (Fable today) as remaining percent in the provider list, the tray and the account panels. LLMR also reads the plan name from the OAuth profile endpoint at most once a day per login. A verified Ultra account has no 5-hour limit, so it shows its plan name instead of the 5-hour meter.
- [ ] **Step 2:** Run `npm run test:architecture`. Expected: PASS. Then run `npm --prefix docs run build` if `docs/node_modules` exists, and report it as not run otherwise. `docs` is not a root workspace, since the root `workspaces` is `packages/*`.
- [ ] **Step 3: Commit** `docs: describe Claude Ultra and per-model weekly meters`. Before the PR, run `/simplify`, `/code-review` and `/verify --e2e`. The release is a minor bump (`npm run release -- minor`), cut only on Jason's go-ahead.

## Fixtures appendix

These are the measured bodies from 2026-10-30, trimmed to the keys the parser reads. Organization ids and tokens are omitted.

```js
const spoons = {
  five_hour: { utilization: 17.0, resets_at: "2026-10-31T06:19:59.776155+00:00", locked_reason: null },
  seven_day: { utilization: 59.0, resets_at: "2026-11-04T12:59:59.776177+00:00", locked_reason: null },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
  limits: [
    { kind: "session", group: "session", percent: 17, severity: "normal", resets_at: "2026-10-31T06:19:59.776155+00:00", scope: null, is_active: false },
    { kind: "weekly_all", group: "weekly", percent: 59, severity: "normal", resets_at: "2026-11-04T12:59:59.776177+00:00", scope: null, is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 100, severity: "critical", resets_at: "2026-11-04T12:59:59.776339+00:00", scope: { model: { id: null, display_name: "Fable" }, surface: null }, is_active: true }
  ]
};
const matherly = {
  five_hour: { utilization: 0.0, resets_at: null, locked_reason: null },
  seven_day: { utilization: 69.0, resets_at: "2026-10-31T12:00:00.468172+00:00", locked_reason: null },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: { is_enabled: true, monthly_limit: 1900, used_credits: 351.0, utilization: 18.47368421052632 },
  limits: [
    { kind: "session", group: "session", percent: 0, severity: "normal", resets_at: null, scope: null, is_active: false },
    { kind: "weekly_all", group: "weekly", percent: 69, severity: "normal", resets_at: "2026-10-31T12:00:00.468172+00:00", scope: null, is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 96, severity: "critical", resets_at: "2026-10-31T12:00:00.468301+00:00", scope: { model: { id: null, display_name: "Fable" }, surface: null }, is_active: true }
  ]
};
const profile = {
  organization: { organization_type: "claude_max", plan_display_label: "Ultra plan", plan_display_name: "Ultra", rate_limit_tier: "default_claude_max_20x" }
};
```
