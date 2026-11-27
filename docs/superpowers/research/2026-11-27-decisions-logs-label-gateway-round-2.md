# Decisions research, round 2: Logs, client label, gateway and one provider status display

Second round for the seven rows of [`2026-11-27-decisions-logs-label-gateway.md`](2026-11-27-decisions-logs-label-gateway.md), at tag `v9.1.0` (`6596e807`) on 2026-11-27. Round one ran nothing against LLM Router. This round ran the gateway child in both layouts, the status panel, two agent CLIs, two SDKs and Fastify 6. Each claim is labelled run, read or inferred.

**How it was run.** A detached worktree at `v9.1.0` with `npm ci`, removed at the end. Wire tests started the real gateway child from `node_modules/@the-next-ai/ai-gateway` (`llmr.4`) against a loopback stub, in the single layout and in the compatibility layout, under `env -i` with a `mktemp -d` home and the repo's own test-home isolation and network guard. Claude Code 2.1.332 and Codex 0.172.0 ran under `env -i` with a temporary `HOME`, their own config directory inside it, a stand-in key, a logging stub for `security`, and a loopback mock that replays the bodies the wire tests recorded. `~/.codex/config.toml` and `~/.claude/settings.json` have the same checksums before and after. Prototypes, tests and logs are under `private/research/2026-11-27-decisions-round-2/logs-label-gateway/` (not in git). Nothing was pushed, committed or tagged.

## Summary

| ID | Round one | Round two | When | Confidence |
|---|---|---|---|---|
| F-UI-1 | Grey until checked, green after a pass, amber after a failure | Stands, with a change: the protocol row also reads the check's result | Remediation release | High |
| F-LABEL-1 | Leave for 9.1.0, then the key's name in both layouts | Stands. The run shows every row agrees after a five-line change, proxied requests included | Remediation release | High |
| F-LOGS-1 | Keep the prefix. Drop it only as a passenger on a fork release | Stands for the prefix. Overturned on weight: the single layout's refusal body also loses the reason and the error code, which matters more, and needs the same fork release | Remediation release, in the fork release of F-GATEWAY-1 | Medium |
| F-GATEWAY-1 | Hold for 9.1.0, release no later than the remediation release | Stands. Fastify 6 ignores the old option in silence and turns access logs back on. A branch push runs no workflow | Remediation release | High |
| F-GATEWAY-2 | Remediation release first, re-audit phase 1 before it is built | Stands. The name check found the plan nearly current: two obsolete lines and one instruction that breaks a later rule | After the remediation release | High |
| F-LOGS-2 | Keep the narrow rule | Stands, confirmed by run | No change | High |
| F-LABEL-2 | Keep `[redacted]` for every key | Stands, confirmed by run. The LiteLLM id is the same e-mail as the field LLM Router keeps | No change | High |

## F-UI-1: green ticks on a local login nobody checked

1. **Re-measured (run).** A new component test renders `AddProviderForm` for a saved Codex login in three states. On `v9.1.0` all three render the same: row 1 `Local login provider` green, row 2 `Available after saving` green, Verify step `Done`. Confirmed.
2. **Closed.**
   - **Save is not gated (read).** `connectionVerified` feeds only the `verified` prop of `ProviderSetupProgress`. `providerDialogStepReady("verify")` returns `true`, and Save reads `canSubmit`, so a local login saves unchecked today and under the change.
   - **The two step markers (run).** Lines 2116 and 3749 both compute `(localAgentImport && !claudeLoginProvider) || passed`. The test shows `Done` in all three states.
   - **Can a check run (read).** Yes for every local login except the Claude Code login provider. The automatic protocol probe is skipped when a saved local login is edited (`App.tsx:1500`) and for the Claude login provider (`App.tsx:1508`). Check Connection is offered when the form has an address, the placeholder key and a model, and not for the Claude login provider. `checkProviderDraft` sends the local login's plugins with the check. So "grey for ever" happens only for the Claude login provider, which already shows grey `Not checked` and "LLMR does not test this provider." That is the right display, since LLM Router has nothing to check with.
   - **A check result is not kept (read).** Every open of the dialog sets `providerConnectivityProbe` to undefined (`App.tsx:436`, `:860`). A saved local login therefore opens grey each time, as an ordinary provider opens amber each time.
3. **Prototype.** One file, `providers.tsx`: the panel's two row states and two texts, the two step markers, and an unused local removed. 12 lines in, 13 out. Row 2 reads `Not checked` (grey) before a check, `Connection verified` (green) after a pass, `Last check failed` (amber) after a failure, with the line "The saved local login is used as it is. Check Connection sends one real model request with it." The new test fails on `v9.1.0` and passes on the prototype. Typecheck passes. Of 337 UI tests one breaks: `a Codex login provider keeps its heading...` asserts the old text `Available after saving`.
4. **What the prototype showed that reading had not.** Row 1 stays grey after a passed check, because it reads `probe` and the check writes `connectivityProbe`. The panel then shows grey "LLMR has not asked this provider which protocols it supports" beside green "Connection verified". The change should let row 1 count a passed check's protocol too. Round one's description of row 1 missed this.
5. **Attack.** Nobody is worse off: no data changes, nothing upgrades. "Do nothing" leaves VP-9 standing (a hand-typed placeholder key with every probe refused shows two green ticks, `2026-11-24-decisions-vm-pass.md`), which this change also turns grey (inferred, not run for that draft).
6. **Verdict.** Stands with the row 1 change. Remediation release. High confidence. Jason reading a green tick as "a login was found" would change it to the smaller variant round one gave.

## F-LABEL-1: one request, two names

1. **Re-measured (run).** On `v9.1.0`, 12 requests per layout, with request logs on and off. Labels split in 7 of 12 rows, in Logs and in usage alike: an unnamed key is `Node.js` or `curl` in the single layout and `wire` in compat; the marked key is `Node.js` or `Claude` against `forwarder`; the profile key `Node.js` or `Codex` against `Profile: Codex`; `codex` and `Team CI` keys are `curl` and `Claude` against their names. A keyed request with no `User-Agent` at all is `unknown` in the single layout (re-run of batch 16's review wire test). Confirmed, and wider than the row says.
2. **Closed: `x-llmr-proxy-mode: gateway` (run).** With that header the `User-Agent` name wins in both layouts, before and after the change: `Claude`, `Node.js` and `curl` in all four cases. The header causes no split. Only LLM Router's own proxy sends it (`proxy/service.ts:1350`), and the proxy forces the compatibility layout.
3. **Prototype.** `readRawTraceRequestLogBundle` in `raw-trace-sync.ts` builds its caller with `gatewayClientCallerForKey` when the trace's key id is a stored key. 5 lines in, 4 out, one import changed. Result (run): all 12 rows read the same in both layouts, with logs on and off. The full core suite, isolated and with the gateway entry, gave 2523 passed, 11 failed, 16 skipped. Six failures are tests pinning the old single-layout label: four wire tests in `october-issues-wire.test.mjs` and two unit tests in `raw-trace-sync.test.mjs`. The other five are Codex wire tests that fail the same way on `v9.1.0` under `env -i` (`october-wire-v9.1.0.log`).
4. **Agent Analysis (run).** PR 174 names a row's agent from its label only after the headers, the body and the session marker. Under the change one row moves: a key named `codex` sending `curl/8.0` becomes agent `codex` in the single layout, as it already is in compat. The profile key's rows become `codex` in both. A key named `codex` cannot outrank a `User-Agent` that names an agent. Agent Analysis still differs by layout in three rows, for a reason unrelated to the label (see New findings).
5. **Attack.** A Claude Code request through the Claude apps gateway reads as the forwarder key's name, not `Claude`, in the single layout too. Compat already does that, and the developer is in "Gateway user". Round one's third option (store the tool and the key apart) remains the cleanest and is new work on two stores. Nothing upgrades badly: old rows keep their labels, and Client Analysis counts by the new name from then on.
6. **Verdict.** Stands. Remediation release. High confidence. A wish to see tool names first would change it.

## F-LOGS-1: the refusal body

1. **Re-measured (run).** Each refusal was sent to `/v1/messages`, `/v1/chat/completions` and `/v1/responses` in both layouts. The three paths answer alike.

   | Refusal | Single layout | Compatibility layout |
   |---|---|---|
   | No key | 401 `Missing auth token header: authorization` | 401 `API key is missing.` |
   | Wrong key, by `authorization` or `x-api-key` | 401 `Gateway plugin "llmr-public-auth-context" beforeAuth failed: Invalid API key.` | 401 `Invalid API key.` |
   | Expired key | 401, the same prefix, `API key is expired.` | 401 `API key is expired.` |
   | `profile_model_not_allowed` | 403 `Gateway plugin "llm-router-request-transform" request transform failed: Model "Provider/beta" is not allowed for this profile.`, code under `error.details.code` | 403 the bare message, code under `error.code` |
   | Model not configured | 400 `All target providers failed.`, reason only inside `attempts` | 400 `All target providers failed. [provider\|model_resolution\|400] Model "nope/none" is not configured... Requested model: nope/none.` |
   | Key over its limit | not reachable: a limit forces compat | 429 `API key requests limit exceeded.`, `error.code` `rate_limit_exceeded` |

   Round one's "only the 401" was too narrow. LLM Router's own refusal from the request transform stage is prefixed as well.
2. **What callers show (run, replaying those exact bodies).**
   - **Claude Code 2.1.332.** 401: retried 11 times over 180 seconds, then `Failed to authenticate. API Error: 401 Gateway plugin ... Invalid API key.` 403: one request, `Failed to authenticate. API Error: 403 Gateway plugin ... not allowed for this profile.` 400 in the single layout: `API Error: 400 All target providers failed.` with no reason. 400 in compat: the full reason.
   - **Codex 0.172.0.** 401 and 403: `unexpected status 401 Unauthorized: <message>`. 400: the raw JSON body, so the reason survives in both layouts.
   - **OpenAI SDK 7.64.0.** `e.message` is `<status> <error.message>`. Single layout 400: `400 All target providers failed.` `e.code` is `profile_model_not_allowed` in compat and undefined in the single layout. Its README documents `status` and `headers` and retries 408, 409, 429 and 5xx twice ([README](https://github.com/openai/openai-node/blob/master/README.md)).
   - **Anthropic SDK 1.14.0.** `e.message` is the status and the whole raw body, so prefix and reason both show.
3. **Can LLM Router fix it on its side (inferred, read).** No, in the single layout. The body is written by the fork after the hook returns, and nothing of LLM Router's sits between the child and the caller. The compat summary is built in LLM Router's `gateway/http/error-detail.ts:122`, which the single layout never runs. Not prototyped in the fork: its clone is read-only for this round.
4. **Attack.** The prefix is cosmetic in every client: the reason ends the sentence. The lost reason is not cosmetic. A Claude Code or OpenAI SDK user in the default layout whose request fails for any provider reason sees `All target providers failed.` and nothing else. A program reading `error.code` misses `profile_model_not_allowed` only in the default layout.
5. **Verdict.** Stands for the prefix, overturned on what the fork release must carry. One fork change, beside F-GATEWAY-1's commit: put the attempts' summary into `error.message` as compat does, put a hook refusal's code at `error.code`, and drop the prefix when a hook returned a refusal. Medium confidence, because the fork change is not built and its size is a guess of tens of lines. A finding that the fork already passes the summary somewhere a client reads would change it.

## F-GATEWAY-1: the unreleased fork commit

1. **Re-measured (run).** `d35913c` on local branch `fastify-log-controller`, one ahead of `v1.0.22-llmr.4` and on no remote. LLM Router resolves Fastify 5.12.7. A ten-line server passing top-level `disableRequestLogging: true` on 5.12.7 prints `FSTDEP023` once. Confirmed. The commit also deletes `pnpm-lock.yaml`, on purpose by its message.
2. **Fastify 6 (run).** `fastify@next` is `6.0.0-alpha.6` (2026-11-02), `latest` 5.12.8. The same server on alpha 6 neither throws nor warns, and logs `incoming request` and `request completed` for the one request. The option is ignored in silence and access logging returns. The fork's tag passes it as `disableRequestLogging: !config.logging.accessLog` (inferred from the commit's diff), so on Fastify 6 without this commit the child would log every request to stderr, which LLM Router prints under `[gateway]`.
3. **Date (run).** The v6.0.0 milestone has 11 open and 19 closed issues and no due date (GitHub API, 2026-11-27). Seven alphas since 2026-08-11.
4. **A branch push with no tag (read and API).** `ci.yml` runs on a push to `llmr`, on a pull request and by hand. `release.yml` runs on a `v*` tag. A push of `fastify-log-controller` runs neither, publishes no release and changes no pin. It does make the branch public (the repository is public), and the repository's one webhook, subscribed to `create`, `delete`, `pull_request` and `check_run`, receives a `create` event. No ruleset applies, and code scanning is not configured. It still needs his word (decision 5).
5. **Attack.** Nothing forces a date: LLM Router's range is `^5.8.2`. The risk of holding is a lost disk, which a branch push removes at no cost to anyone running LLM Router.
6. **Verdict.** Stands. Release with the remediation release, carrying F-LOGS-1's fork change. A branch push before then is worth asking him for. High confidence. A Fastify 6 release candidate would bring it forward.

## F-GATEWAY-2: phase 1 beside the remediation release

1. **Re-measured (run).** 92 commits from the plan's audit point `0ebbdd53` to `v9.1.0`. Nine of them touch the plan's files: 182 lines in and 86 out across ten of them.
2. **The cheap half of the audit (run).** Each file, function and interface the six tasks name was checked by search against `v9.1.0`, and the behaviour claims behind them by reading. The plan names no line numbers. All of these hold: `pickConfig`, `writeSanitizedConfig` and its stored-theme line (`config.ts:805`), `enqueueAppConfigWrite`, `updatePersistedAppConfig`, `AppConfigConflictError` answered with 409 (`management-server.ts:320`), `saveApiKeysConfig(next, base)`, `appConfigRevision` leaving out `theme`, `normalizeClaudeAppsGatewayUrl`, `gatewayRequest(url, init, label)` with three parameters, `claudeAppsGatewaySessionExpired`, `refreshInFlight`, `refreshClaudeAppsGatewaySession`, `resolveClaudeAppsGatewaySession`, `readClaudeAppsGatewaySession`, `ClaudeAppsGatewayAuthError`, the login's start, wait and persist functions and its delete-on-confirm, the three login types, `ClaudeAppsGatewaySignOutResult`, `runClaudeAppsGatewayLogin(api, url, events)` with one caller, `getAppInfo().desktop`, `ViewId` in `shared/types.ts`, `navigation`, `viewUsesInternalScroll`, `MainViewProps`, the Setup group `["providers", "profile", "routing"]` in `layout.tsx` and twice in `layout.test.tsx`, `persistApiKeys`, `configSaveQueue`, `setConfigSnapshots`, `ApiKeysView` with its `motion.div` and `Card`, `appConfigFixture`, the guide's "What LLMR records", the harness's `--load-test` and `--keep`, `web-rpc-contract.test.mjs`, and the existing tests each step extends. `Waypoints` is still unused in `options.ts`.
3. **What no longer matches.**
   - Task 3 relies on phase 0 making `removeClaudeAppsGatewaySession` a promise. It now is (`922626dc`). The precondition holds and the text can say so.
   - Task 5's stop condition ("if `shared/options.ts` still declares its own `type ViewId`, stop") is met. Phase 0 Task 1 is built.
   - "Where this fits" names batches 8, 16 and 17 as not to be open beside it. All are merged. The row is obsolete.
   - Task 5 Step 4 says to run `npm run test:e2e` once. That breaks his 2026-11-26 rule on Electron launches (`e2e runs steal focus` in memory) and should be removed from the plan text.
   - `appConfigRevision` also leaves out `APIKEY` and `APIKEYS` (`config-repository.ts:57`). The plan's "as it does theme" is true and incomplete, which matters to nobody building it.
4. **Size of the staleness.** Small. Four text lines to change, no interface to redesign. What this check does not cover is the semantic half: whether the autosave rule in `App.tsx` (63 lines changed since) still starts a whole-config save the way Task 5 Step 3 assumes, and whether batch 16's guide edits move Task 6's section. That half is the one that needs a reader on another model, as his method says, and is about an hour's read.
5. **Attack.** Phase 1 first would put an unpassed page into the remediation release, as round one said. Nothing found here changes that.
6. **Verdict.** Stands. The re-audit is cheaper than round one implied. High confidence.

## F-LOGS-2: the narrow provider rule

1. **Re-measured (run).** `a trace names the provider of a usage event recorded as unknown` in `raw-trace-sync.test.mjs` passes on `v9.1.0`: a refused event under `unknown` takes the trace's provider, a named one keeps its own, and one with tokens stays `unknown`. The SQL at `store.ts:446` reads as round one said. Confirmed.
2. **Not closed.** No count of token-bearing `unknown` events, because no real database was opened.
3. **Verdict.** Stands. No change. High confidence.

## F-LABEL-2: identity headers as `[redacted]`

1. **Re-measured (run).** Batch 16's review wire test re-run on `v9.1.0`: compat Logs rows hold `[redacted]` for each identity header sent, single-layout rows hold none (they store the provider-bound headers), and `forwardedUserEmail` and `forwardedUserId` are filled only for the marked key. No row holds the forged values. Confirmed.
2. **The LiteLLM id (run and fetched).** Batch 16's harness ran Claude Code's gateway and recorded that it sends `x-litellm-end-user-id` holding the e-mail, the same value as `x-claude-gateway-user-email`, and omits both when the token has no e-mail. LiteLLM reads `x-litellm-customer-id`, then `x-litellm-end-user-id`, as the end user of a spend row, and calls the header part of its legacy tracking ([legacy end users](https://docs.litellm.ai/docs/proxy/legacy_end_users)). By default it does not forward client headers to a provider ([request headers](https://docs.litellm.ai/docs/proxy/request_headers)). So LiteLLM in front of LLM Router sends no such header unless configured to, and behind the Claude apps gateway the value is already in "Gateway user". Nothing is lost.
3. **Verdict.** Stands. No change. High confidence. A gateway that sends a LiteLLM id unlike its e-mail would change it.

## New findings

1. **The single layout's failure body drops the reason** (run). A request that fails at every provider answers `All target providers failed.` with the reason only in `attempts`. Claude Code and the OpenAI SDK show only that sentence. Compat appends the summary. Folded into F-LOGS-1's verdict.
2. **The single layout moves a refusal's code** (run). `profile_model_not_allowed` sits at `error.details.code` there and at `error.code` in compat.
3. **The no-key message differs** (run). `Missing auth token header: authorization` against `API key is missing.`, even for a caller that would have used `x-api-key`.
4. **Claude Code retries a 401 for three minutes** (run). 11 requests over 180 seconds before it shows the message, in both layouts. A wrong key in Claude Code looks like a hang. A 403 is not retried.
5. **Agent Analysis differs by layout apart from the label** (run). A request whose `User-Agent` names Claude Code is agent `claude-code` in compat and `unknown` in the single layout, because single-layout rows store the provider-bound headers. A real Claude Code body carries its session marker and would still be found (inferred, not run with a real body).
6. **A keyed request with no `User-Agent` is `unknown`** in the single layout and named by its key in compat (run). F-LABEL-1's change fixes it.
7. **A connection check is forgotten when the dialog closes** (read). Under F-UI-1's change a saved local login opens grey every time.

## Still not checked

- The F-LOGS-1 fork change: not built, so its size and its effect on the fork's tests are guesses.
- The semantic half of the phase 1 audit (F-GATEWAY-2, point 4).
- F-UI-1 in a window. The panel was rendered to a string only. VP-9's hand-typed placeholder draft was not rendered.
- Why five Codex wire tests in `october-issues-wire.test.mjs` fail with 502 under `env -i` on `v9.1.0`. They fail the same before and after the prototype.
- Real Claude Code and Codex request bodies through the gateway child, for Agent Analysis. The runs used hand-built requests.
- Token-bearing `unknown` events on a real install (F-LOGS-2).
- One `~/.codex/tmp/arg0-macos` entry is newer than this run's start marker. It is dated 16:32, five minutes before the first Codex run, whose home was a temporary folder. Some other process wrote it.
