# Open items validation, 2026-11-22

This record validates the 56 rows of the "Open items" table at the end of [`docs/superpowers/plans/completed/2026-11-21-v8-clean-vm-fixes.md`](../plans/completed/2026-11-21-v8-clean-vm-fixes.md) against `main` at `eb84a3ba` (v8.1.0), and records the owner's decisions on them. It is the spec for the six backlog plans listed under "Plans". Each plan cites rows by their id here.

## How it was checked

Five passes reproduced the rows in the code by area, and one read the outside facts the rows rest on. Each code pass ran the real functions in the test runner's temporary home through throwaway `node:test` files that were deleted afterwards. A row marked **run** was executed, **read** was read in the code and not executed, and **inferred** was reasoned from code that was read. Outside facts carry their source and date. The plan author re-read these claims in the code or the source before relying on them: the key-table replace (K-1), the apply handler that does not check the gateway (R-1), the Codex profile change and the Codex token command (S-0, X-1).

Not done by anyone: no real Codex binary loaded any output, no row was checked in the desktop app, and no fix in this record was prototyped.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| B-1 | A cost that is an estimate shows with a tilde (`~$0.000016`), an unknown cost shows as a dash, and a total carries a caption that says how much of it is approximate and how many requests had no price. Logs detail gains a "Price source" line. | Owner, 2026-11-22 |
| B-2 | Every agent gets a stripper, in this order: Workbuddy, OpenCode and Kilo, Pi, ZCode. This widens V-7 of the v8 plan, which left them on whole-file restore. | Owner, 2026-11-22 |
| B-3 | The Codex token command (`[model_providers.<id>.auth]`) is prototyped against a real Codex first. The owner decides after seeing the result. No plan changes how the token is written until then. | Owner, 2026-11-22 |
| B-4 | `smol-toml` is added as a dev dependency. Tests assert that every Codex file LLM Router writes still parses. Nothing ships to users, and there is no runtime parse guard. | Owner, 2026-11-22 |
| B-5 | A request's client label takes an identity header (`x-claude-gateway-user-email`, `x-litellm-end-user-id`) only when the request's API key is marked as a trusted forwarder under API Keys, and never for a refused caller. A refused caller is labelled from `User-Agent` alone. `x-forwarded-client-cert` leaves the label list. Every stored label is cut to a fixed length. The Claude apps gateway guide gains the step of marking the gateway's key. | Owner, 2026-11-22, after the research under "Client identity" |
| B-10 | Certificate authentication is not built now. The design under "Deferred: certificate authentication" is kept for when LLM Router is meant to serve several people over a network. | Owner, 2026-11-22, after the same research |
| B-6 | The test workflow also runs the unit suites on a Windows runner and an Intel Mac runner. No manual platform pass. | Owner, 2026-11-22 |
| B-7 | A stored retention value that is not a whole number from 1 to 90 becomes 90, with a warning. Pruning cannot be undone, and 90 keeps the most. | Owner, 2026-11-22 |
| B-8 | The plan author chose these, and any of them can change in review without reopening a plan: a key save merges and a delete wins (K-1); the refused-key notice puts its entries in a closed `<details>` (L-3); the three refusal reasons are one set in both processes (L-4); a long log value wraps (L-14); a restore owns a custom-path `.claude.json` by the values rule (R-9); the unpriced caption's wording. | Plan author |
| B-9 | These rows are closed with no change: R-2, L-13, L-16, P-8 as its own PR, and V-12 of the v8 plan stands (R-12). | Plan author, from the evidence under each row |

The v8 plan's decisions V-1 to V-22 stand except where B-2 widens V-7. The standing rules also stand: no consumers, so no compatibility path and no migration code; never weigh upstream parity; LLM Router never writes `~/.claude.json`; a push or tag on the gateway fork needs the owner's word each time.

## Outside facts

| # | Fact | Source |
|---|---|---|
| X-1 | Codex 0.134.0 and later no longer read `[profiles.<name>]` tables or the top-level `profile` selector in `config.toml`. A profile is `~/.codex/<name>.config.toml`, overlaid by `--profile <name>`. | Codex config-advanced page, read 2026-11-22. Latest stable Codex is `rust-v0.171.0` (2026-11-20). |
| X-2 | Codex supports `[model_providers.<id>.auth]` with `command`, `args`, `cwd`, `timeout_ms` (default 5000) and `refresh_interval_ms` (default 300000). The command gets no stdin and prints the token. It cannot be combined with `env_key` or `experimental_bearer_token`. `experimental_bearer_token` is documented as discouraged, not deprecated. | Codex config-advanced page and `config.schema.json` on `main`, read 2026-11-22 |
| X-3 | The provider ids `openai`, `ollama` and `lmstudio` are reserved in Codex and cannot be overridden. | Codex config reference, read through a summarising fetch |
| X-4 | Since January 2026 Codex writes through a symlinked `config.toml` instead of replacing the link (its PR 9445). VS Code treated replacing a symlinked settings file as a regression in 2023. | GitHub, read 2026-11-22 |
| X-5 | TOML 1.0: a bare key and a quoted key are the same key, and defining a key or a table twice is invalid. Arrays and `"""` or `'''` strings span lines, so a line can start with `[` inside a value. A newline is LF or CRLF. TOML 1.1.0 was released 2025-12-24. | toml.io |
| X-6 | `smol-toml` 1.9.1 (2026-10-09, BSD-3-Clause, no dependencies, 140 kB) passes the official `toml-test` suite and parses TOML 1.1. `@iarna/toml` and `@ltd/j-toml` have had no release since 2020 and 2023. Node has no built-in TOML parser. | npm registry and GitHub, 2026-11-22 |
| X-7 | Anthropic: only Claude Haiku 5.5 has a long-context price. A prompt over 100,000 tokens, counting cache reads and writes, costs 5 times the base price. Cache writes cost 1.25 times base input for 5 minutes and 2 times for 1 hour. Batch is half price. Fast mode is 2 times and shows in `usage.speed`. US-only inference is 1.1 times and shows in `usage.inference_geo`. | Anthropic pricing page, read 2026-11-22 |
| X-8 | OpenAI: a long-context tier starts above 272,000 input tokens for GPT-5.4 and later. The response's `service_tier` reports the tier used. | OpenAI pricing and guides, read through a summarising fetch |
| X-9 | models.dev carries `cost.tiers` as `{input, output, cache_read, cache_write, tier: {type: "context", size}}` and no batch, flex, priority or regional price. LiteLLM carries suffixed fields (`_above_100k_tokens` to `_above_512k_tokens`, `_batches`, `_flex`, `_priority`) that combine. | The two catalog files, fetched 2026-11-22 |
| X-10 | OpenRouter returns `usage.cost` in every response by default, in credits. `usage.include` no longer has any effect. In a Chat Completions stream it is in the last chunk before `[DONE]`. `cost_details.upstream_inference_cost` is set only for a bring-your-own-key request. | OpenRouter usage accounting page, read through a summarising fetch |
| X-11 | Claude Code labels its figure "Estimated cost". Langfuse separates a cost sent by the caller from one it inferred, and shows "Cost unavailable" when no price matched. | Their docs, 2026-11-22 |
| X-12 | WCAG 2.2 SC 1.4.13 exempts a browser `title` tooltip but does not endorse it. The HTML Standard discourages relying on `title`, because keyboard and touch users cannot reach it. SC 1.4.10 Reflow still applies to an individual table cell. | W3C and WHATWG, read 2026-11-22 |
| X-13 | SQLite allows one writer at a time. Its own protection covers a read and a write inside one transaction. Nothing detects a table that was read, edited in memory and written back in a later transaction. `BEGIN IMMEDIATE` is its recommendation for a read-then-write transaction. | sqlite.org |
| X-14 | Fastify's `logController` option arrived in 5.10.0 (2026-07-05). The top-level `disableRequestLogging` warns as FSTDEP023 and is removed in Fastify 6, which is at `6.0.0-alpha.6` with no release date. | Fastify docs at v5.12.8 |
| X-15 | Electron's docs give no way to stop the default `userData` folder being created. User reports from 2015 and 2020 say it exists before app code runs. Not checked on Electron 45. | Electron docs at v45.4.1 and two issues |

## Findings

A row id is the plan's letter and the row's number in that group. "Table" is the row's item text in the v8 plan's Open items table. "New" marks a finding that table does not hold.

### K. API keys and gateway reload

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| K-1 | "Two LLMR processes on one database can drop each other's API keys" | Confirmed by run, and the table names the lesser path | `saveApiKeysConfig` hands the caller's list to `replaceApiKeyRows`, which deletes every row and inserts that list (`config.ts:702`, `config-repository.ts:697`). A save from a stale list does not keep what was written since, and it needs no second process. The stored table then differs from what the other writer left. A profile key is rotated, so the token just written into an agent's files stops working. The table's own path, `loadAppConfig` with a legacy key in the stored config, also loses a key. Two `updatePersistedApiKeys` writers lost 0 of 1416 keys. | Keys |
| K-2 | "`llmr <profile>` while the desktop app runs the gateway" | Confirmed by run | Run against the real gateway child. The child gets its keys once, at spawn. A change another process makes to the stored key list, an added key or a removed one, is not picked up by the running gateway until a reload. The two layouts differ in which changes they pick up. | Keys |
| K-3 | New | Read | When the gateway does not yet accept a profile token, the CLI's probe goes on to other stored keys (`existingGatewayApiKeyCandidates`), so a gateway whose key list is out of date still reports healthy and the launch does not use the profile's own key. | Keys |

### H. Test harness, CI and the fork

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| H-1 | "The test runner leaves one empty folder in the temp directory per run" | Confirmed by run | `build/run-tests.mjs:7` imports `build/test-home.mjs`, whose top level creates a home. | Harness |
| H-2 | New | Run | A direct `node --test` run, the single-file command `AGENTS.md` gives, leaves its temporary home behind. 342 non-empty ones, up to 20 MB each, were on the test machine. The isolation architecture test leaks its child's home on every run. | Harness |
| H-3 | "Three tests still reach the public catalog hosts" | Confirmed by run, and the row undercounts | Six test files and two spawned runtime processes connect to `models.dev`, `openrouter.ai` or `raw.githubusercontent.com`. One fetch comes from the request log worker thread, which a stub in the test file cannot reach. A preload that refuses any non-loopback `net.Socket.connect` broke nothing: core 2019 pass, cli 21, ui 289, architecture 185, electron 46. | Harness |
| H-4 | "PR 139's tests do not parse TOML" | Confirmed | No TOML parser is in `node_modules` or the lockfile. | Harness (B-4) |
| H-5 | "Windows, Linux and the Intel mac build" | Read | `test.yml` runs every suite on `ubuntu-26.04` only. `release.yml` builds for macOS arm64 and x64, Windows and Linux and runs no test on macOS or Windows. | Harness (B-6) |
| H-6 | "Fastify `disableRequestLogging` deprecation" | Confirmed by run | The fork's `src/index.ts:73` sets the option, so FSTDEP023 prints at every start under the Fastify 5.12.7 that LLM Router installs. The fork's own lockfile pins 5.9.0, which has no `LogController`. | Harness (a fork commit, V-10) |
| H-7 | "Gateway CORS: whether the Claude desktop app sends an `Origin` header" | Needs the owner's run | The fork never refuses a request on CORS. A foreign `Origin` gets no grant, so a Chromium renderer would stop at the preflight. A caller that is not a browser is not affected. Pass: a reply and a Logs row. Fail: a network error in Claude Desktop and no row. | None until the owner's check |

### L. Logs, usage timing, retention and layout

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| L-1 | "A refused request's usage event and its Logs row name different providers in the compatibility layout" | Confirmed by run | The row says `Provider` and the event says `unknown`. The host records usage before the trace arrives, and the importer then finds the request id and writes nothing. The single layout names the provider in both. | Logs |
| L-2 | "A refused request's row appears up to 5 seconds late in the single gateway layout" | Confirmed by run, and wider | A normal 200 request's row appeared 4689 ms after the answer, a refused one 4702 ms. Every single-layout row is late. `sourceScanIntervalMs` is 5000. The usage event carries the import time, not the request time. | Logs |
| L-2b | New | Read | A trace still in the spool when the gateway stops is imported at the next start, and its usage event gets that start's time. | Logs |
| L-3 | "The refused-key notice is tall in a narrow window" | Read | Below a window width of about 812 px with the sidebar open, each entry wraps to two lines. | Logs |
| L-4 | "Two wordings for an expired key in the notice" | Read | `resolveApiKeyFromHeaders` already holds the matched key when it returns `undefined` for an expired one, so the child can say which without another read. | Logs |
| L-5 | "A refused request through a Claude apps gateway shows the user's email as its client" | Confirmed by run | `x-claude-gateway-user-email` from any caller became the client of the Logs row and of the usage event in both layouts. The label is uncut outside the notice, and `x-forwarded-client-cert` is one of its sources. See "Client identity". | Client label (B-5) |
| L-6 | "A paused gateway shows an empty log table" | Not reproducible by reading | Nothing on the read path depends on the gateway. The likely cause is L-2: rows sent just before a stop were not yet imported. | Closed by L-2 unless an app check says otherwise |
| L-7 | "The scroll container may clip the "Request logs are off" card's shadow" | Read | The wrapper PR 145 added has `overflow-y-auto` and no padding, so the card's shadow is cut at its edges. | Logs |
| L-8 | "The Logs page states the retention from the config, not from the database" | Confirmed by run | With the log database locked, a save of 3 returned ok after 5209 ms and the database kept 12. | Logs |
| L-8b | New | Run | A save waits out the 5 s busy timeout whenever the request log database is locked, because the retention write is awaited in both save handlers. | Logs |
| L-9 | "No test that a save or a `--no-gateway` start writes the retention" | Confirmed, and its premise is stale | One line points the global runtime at `.test-dist/core/runtime/request-log-worker.js`, as `october-issues-wire.test.mjs` already does. With it, a `--no-gateway` start wrote 5 and a save wrote 12. | Logs |
| L-10 | "A hand-edited `requestLogRetentionDays` is clamped" | Confirmed by run | 500 becomes 90, 0 becomes 1, 2.7 becomes 2, and a non-number becomes 7. | Logs (B-7) |
| L-11 | "The retention field closed while it has focus" | Run on a model of the code | Escape drops a typed value, because no blur fires. The Close button commits it. | Closed: Escape discarding is the safe outcome |
| L-12 | "A toast over the nav strip in a narrow window" | Read | At 720 px and below the stack starts at y 56, where the nav buttons sit, and the persistence toast takes clicks. | Logs |
| L-13 | "The window buttons against the sidebar's top row at 50% zoom" | Read | Nothing drawn overlaps until the zoom factor is below 0.44. | Closed (B-9) |
| L-14 | "A cut-off log value can be read only by hovering" | Read | `LogMetric` is `truncate` with `title`, about 27 uses in the expanded detail. | Logs (B-8, X-12) |
| L-15 | "Two `top-5` classes left in `feedback.tsx`" | Read | Both uncontained branches are unreachable from the two call sites. | Logs |
| L-16 | "The empty `~/Library/Application Support/LLM Router` folder" | Read | `setPath` already runs before `whenReady`. | Closed (B-9, X-15) |

### P. Costs and pricing

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| P-1 | "A median estimate looks like a listed price, and an unpriced request looks free" | Read | No contract type carries the price source. `formatUsdCost` maps a missing cost, 0 and a negative number to `$0.00`. Ten cost surfaces were mapped: a missing cost reads `$0.00` on most and `-` on two Agent Analysis panels. A zero-token row and a row waiting for a catalog share `cost_source ''`. | Pricing (B-1) |
| P-2 | "Requests written before the catalog loads are priced by a weaker rule" | Confirmed by run | On a fixture the writer's fallback gave $1 where the full rule gives $3, both labelled `models.dev`. The first request after every launch is priced before the catalog exists. The request log worker loads its own catalog copy. | Pricing |
| P-3 | "A catalog source that never loads is reported only in the log" | Run and read | With every fetch failing, the only trace is three `console.warn` lines, and rows stay unpriced. | Pricing |
| P-4 | "Long-prompt, batch and service-tier prices are not read" | Read | 904 models.dev offers carry `cost.tiers`. Neither fetcher reads a tier. No batch route exists, so batch pricing has nothing to apply to. | Pricing (X-7, X-8, X-9) |
| P-5 | "A cost the provider reports is not used" | Read | Neither usage extractor reads `usage.cost`. | Pricing (X-10) |
| P-6 | "The writer inputs keep `pricing` and `pricingSource` beside `price`" | Read | Every source caller already passes `price`. Three tests pass the old fields. | Pricing |
| P-7 | New | Run | `extractUsageSnapshot` exists twice, in `usage/store.ts` and `request-log-store.ts`, differing only in reasoning tokens. | Pricing |
| P-8 | "The price editor's call site can merge the catalog defaults back" | Read | No DOM test library is installed, so only a Playwright step can cover the call site. | Rides in the pricing plan's display task |

### S. The Codex config stripper

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| S-0 | Context | Outside fact | X-1: rows about a `[profiles.<provider>]` table in `config.toml` concern a legacy file. LLM Router already moves such a table into the profile file. | |
| S-1 | "A restore with an original cuts the user's profile table at a `[` line inside a value" | Confirmed by run | The restored file ends inside the array and fails to parse. `.llmr-original` and the safety copy keep the whole table. | Stripper |
| S-2 | "A displaced root key whose value spans lines" | Confirmed by run, and worse | The apply output itself is invalid, not only the restore. | Stripper |
| S-3 | "A fourth profile table added in a row pushes out the copy of the user's first settings" | Confirmed by run | After four identical re-adds, all three kept copies are the re-added table. | Stripper |
| S-5 | "The same `[profiles.<provider>]` table twice in `config.toml`" | Confirmed by run | The input is invalid TOML to begin with. | Stripper, for consistency only |
| S-6 | "A quoted root key is not seen by the Codex stripper" | Confirmed by run, and worse | The apply writes a duplicate key, so the file is invalid while the profile applies. Six regexes read a bare key only. | Stripper |
| S-7 | "A leftover `model_provider` line from another LLMR provider id counts as the user's" | The strip limit is confirmed; no product path produced the input | | Stripper, low |
| S-8 | "Three conditions in PR 138 have no test" | Read | A test gap. | Stripper |
| S-9 | "An unmanaged Codex file that still holds LLMR's ToolHub table" | Confirmed by run | `config.toml.llmr-original` holds the profile token and survives a restore. | Stripper |
| S-10 | "A displaced line is put back with a line feed" | Confirmed by run | Mixed line endings, which TOML allows. | Stripper |
| S-11 | "The Codex stripper on a real original" | Confirmed by run, and worse | With a provider id equal to the user's own, both the untouched and the edited restore lose the user's `model_provider` line. | Stripper |
| S-12 | "A marker line inside a user's multi-line string" | Confirmed by run, and worse | `isManagedCodexConfigContent` uses `includes`, so marker text anywhere makes LLM Router take the file for its own. No original is saved, and the restore fails with the token left in the file. | Stripper |
| S-13 | "A user's own `[model_providers.<providerId>]` table" | Confirmed by run, and worse | The original is never saved. The user's table, their own key included, is in no file afterwards. | Stripper |
| S-14 | New | Read | Four more helpers act on raw lines: `managedConfiguredModel`, `removeManagedConfiguredModelLine`, the `show_all_sessions` replace in `codexProfileFileUsersContent`, and `returnCodexProfileTable`. | Stripper |
| S-15 | New | Read | `saveRemovedConfigCopy` names a copy by millisecond, so two copies of one file in the same millisecond overwrite each other. | Stripper |

### R. Apply, restore and the other agents

| # | Table row or new finding | Verdict | What a run showed | Plan |
|---|---|---|---|---|
| R-1 | "The message of an apply that succeeded is shown nowhere", "A failed restore on a save is only logged", "One blocked file is reported three times" | Confirmed, and the table's fix is wrong | Only the Restore button shows a status. The table says to call `applyProfile()` after a save. That handler applies without checking that the gateway runs (`ipc.ts:282`), so it would point agents at a dead endpoint, and a second apply does not repeat a one-time message. One blocked file returned three identical statuses. | Restore |
| R-1b | New | Read and run | V-16 is not met: switching a profile off goes through autosave and shows no message. Every apply emits "Switch it on to undo this" for every disabled profile, one never switched on included. | Restore |
| R-2 | "A quit removes the Codex side files and the next launch writes them again" | Measured, not worth fixing | 1.2 to 15.9 ms per cycle, and nothing builds up. | Closed (B-9) |
| R-4 | "A token warning and a key that survives only cover the Restore button" | Confirmed by run | A save prunes the key before the restore, in the handler and inside `applyProfileConfigNow`. After a failed restore the agent holds a dead key. | Restore |
| R-6 | "Workbuddy and generated-scope Codex configs keep raw backups" | Run for Workbuddy | Three backups hold the token after a disable, and Workbuddy's side files stay. Generated scope holds a token only inside LLM Router's own folder. | Restore (B-2) |
| R-7 | "A symlinked agent config whose target is missing (F-22)" | Confirmed by run | The restore removes the user's link and leaves the token in the target. With the target present, both links survive. | Restore (X-4) |
| R-8 | "Claude Code values under LLMR's own key names (F-22)" | Confirmed by run, and worse | A user's `NO_PROXY` hosts and compat value are lost. With the user's own matching base-URL trio and any other setting, the restore reports success and leaves `env: {}`. A quit restore reports "restored to what it was before LLMR" after writing a stripped copy. | Restore |
| R-9 | "The Codex app's data under `~/.codex/.llm-router/` and a custom-path `.claude.json`" | Run for `.claude.json` | A restore leaves `autoCompactWindowsCache` and two copies of the user's account file. The Codex app directory is the app's own data and is left alone. | Restore (B-8) |
| R-10 | "Codex and Workbuddy on one config directory" | Confirmed by run | A Codex restore removed the file while Workbuddy was still enabled. | Restore |
| R-11 | "Agents with no stripper" | Run for OpenCode and Pi | OpenCode with no original: the file holding the user's added `mcp` is deleted. Pi: LLM Router replaces the whole `models.json`, and after the user adds a provider the disable finds nothing to restore. | Restore (B-2) |
| R-12 | "Installed-agent detection (V-12)" | Read | A CLI check needs a login-shell probe on macOS and Linux and still gives false negatives. | Closed (B-9) |
| R-13 | "Codex `experimental_bearer_token`" | Read, with X-2 | Written in one place. `env_key` would break a direct launch of `codex`. A token command would not. | Prototype (B-3) |
| R-14 | New | Read | `llmr <profile>` discards the apply result without logging it. | Restore |

### C. Client identity

Researched after the owner asked whether certificate authentication should be supported. One pass read and ran the code, and one read outside sources through a summarising fetch, so their exact wording is unconfirmed.

| # | Finding | Evidence |
|---|---|---|
| C-1 | The identity headers have no trust model. | Run: an ordinary profile key that sent `x-claude-gateway-user-email: ceo@example.com` was attributed to that address in the Logs row and the usage event. The guide asks for any key created under API Keys. `ApiKeyConfig` is `{ createdAt, expiresAt?, id, key, limits?, name? }`, with nothing to mark a key as the gateway's. `docker/claude-apps-gateway/README.md` recorded the same observation on 2026-10-26. |
| C-2 | A stored label has no length limit. | Run: a 1,987-character `x-forwarded-client-cert` value was stored whole in the Logs row and in the usage event, which is kept 90 days. Only the refused-key notice cuts it, to 60 characters. |
| C-3 | `x-forwarded-client-cert` and `x-client-name` are inherited from upstream's first commit. Nothing parses the certificate header. It is used whole as a label, in `gateway/http/io.ts` and in `proxy/service.ts` (`inferProxyClient`). | Read, and `git log -S` |
| C-4 | The label is display only, with one exception. `gateway/features/cursor-compat.ts` rewrites a chat body when the label is exactly `Cursor`, so `x-llmr-client: Cursor` from any caller turns that on. | Read |
| C-5 | Both identity headers are removed before a provider sees them. `client-cert` and `client-cert-chain` (RFC 9440) are not in the removal list, and neither is `x-client-name`. | Run for the first sentence, inferred for the second |
| C-6 | LLM Router serves plain HTTP everywhere. The gateway, the gateway child and the management server have no TLS option. In Docker every request reaches the gateway from nginx on loopback, and nginx passes a caller's `x-forwarded-client-cert` through untouched. | Read |
| C-7 | The fork has a `trusted_header` auth mode with a trusted-CIDR check and an HMAC signature, and trusted-proxy settings for the forwarded address. LLM Router sets none of them. Nothing in either repo handles a client certificate. | Read |

Outside facts for this group:

| # | Fact | Source |
|---|---|---|
| X-16 | OWASP ASVS 5.0.0 item 4.1.3 asks that a header set by an intermediary, such as `X-Forwarded-*` or `X-User-ID`, cannot be overridden by the end user. | ASVS at tag v5.0.0 |
| X-17 | The Claude apps gateway authenticates to an `anthropic` upstream with `api_key`, `oauth_token` or workload identity federation, and can add fixed headers. It has no client-certificate option. `forward_user_identity` adds `x-claude-gateway-user-id`, `x-claude-gateway-user-email` and `x-litellm-end-user-id`. Its docs do not say the headers are signed. They say to set the option only on an upstream "you operate". | Claude apps gateway config docs, read 2026-11-22 |
| X-18 | Of the agents, Claude Code (`CLAUDE_CODE_CLIENT_CERT`, `CLAUDE_CODE_CLIENT_KEY`) and OpenCode (a provider's `tls` settings) can present a client certificate. Codex documents a custom CA only. The Claude desktop app documents none for its own connections. | Their docs, read 2026-11-22 |
| X-19 | RFC 9440 defines `Client-Cert` and `Client-Cert-Chain`. The proxy that ends TLS must remove or overwrite incoming copies, and a backend must accept them only from a trusted proxy. Envoy's `x-forwarded-client-cert` is a comma-separated list of `key=value` elements, one per hop. | rfc-editor.org and Envoy docs |
| X-20 | LiteLLM leaves mutual TLS to the ingress: the ingress verifies the certificate, overwrites an identity header, and the proxy accepts requests only through it, with a key still required. LiteLLM, Portkey and Helicone treat a user header as self-declared. Kong and Cloudflare derive the user from the credential. | Their docs, read 2026-11-22 |
| X-21 | The Claude apps gateway keeps the pseudonymous user id in its spend records and emails in one table with its own retention. GDPR Article 5(1)(c) and (e) ask for data limited to what is necessary and kept no longer than necessary. | Gateway deploy docs and gdpr-info.eu |

### Deferred: certificate authentication (B-10)

Kept so the design does not have to be researched again.

- **When it is worth building.** When LLM Router is reached by several people over a network, through `llmr serve` or Docker. On loopback for one person a certificate adds nothing over a key.
- **Not in LLM Router's own listener.** Codex, the Claude desktop app and the Claude apps gateway cannot present a client certificate (X-17, X-18), so a listener that requires one would refuse them. LLM Router would also have to serve TLS and issue, rotate and revoke certificates.
- **The shape that fits (X-19, X-20).** A reverse proxy ends mutual TLS, removes any incoming copy of the identity header, and forwards the verified identity. LLM Router accepts that header only from a caller it trusts and maps the certificate's subject or fingerprint to an API key or a profile.
- **What it builds on.** B-5's trusted mark on a key is the trust anchor: the proxy calls LLM Router with a marked key. A loopback peer proves nothing in Docker (C-6), and a CIDR works only when the proxy is another host.
- **What it would need.** A parser for the chosen header, a mapping in the config, the check in LLM Router's own front (`authorize`) and in the gateway child's `beforeAuth` hook, `client-cert` and `client-cert-chain` added to the headers removed before a provider (C-5), and an nginx setup for the Docker image with `ssl_verify_client` and an overwritten header.
- **Questions for then.** Whether the email or the pseudonymous user id is what a row should store (X-21), and whether the fork's signed `trusted_header` mode (C-7) is a better anchor than a marked key.

## Plans

Build them in this order. Each is its own file and produces working software alone. A plan's tasks each become one branch and one squash-merged PR, reviewed by the owner's `review-pr` pass.

| Order | Plan | Rows | Why here |
|---|---|---|---|
| 1 | [`2026-11-22-backlog-keys.md`](../plans/2026-11-22-backlog-keys.md) | K-1, K-2, K-3 | The only rows where a user loses a key or a revocation today. |
| 2 | [`2026-11-22-backlog-harness.md`](../plans/2026-11-22-backlog-harness.md) | H-1 to H-6 | Every later plan's tests use the TOML check, the network guard and the platform jobs. |
| 3 | [`2026-11-22-backlog-logs.md`](../plans/completed/2026-11-22-backlog-logs.md) | L-1 to L-15 except L-5 | Late rows affect every user of the default layout. |
| 3b | [`2026-11-22-backlog-client-label.md`](../plans/2026-11-22-backlog-client-label.md) | L-5, C-1 to C-5 | After the logs plan, which changes the refusal path the label is read on. |
| 4 | [`2026-11-22-backlog-pricing.md`](../plans/2026-11-22-backlog-pricing.md) | P-1 to P-8 | The display row needs the single catalog first. |
| 5 | [`2026-11-22-backlog-stripper.md`](../plans/completed/2026-11-22-backlog-stripper.md) | S-1 to S-15 | Needs the TOML check. Rare inputs, one permanent loss (S-13). |
| 6 | [`2026-11-22-backlog-restore.md`](../plans/2026-11-22-backlog-restore.md) | R-1 to R-14 | Shares `profiles/service.ts` with the stripper plan, so it follows it. |

The Codex token prototype (B-3) is the last task of the restore plan. H-7 has no task: it waits for the owner's Claude Desktop check.
