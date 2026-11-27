# Decisions research: Logs, client label, gateway and one provider status display

Research for seven `decide` rows of [`../plans/2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md), read at `main` `b45e25c5` on 2026-11-27. Nothing here changes code. Each claim is labelled run, read or inferred.

**The two layouts.** `shouldUseSingleGatewayRuntime` in `packages/core/src/gateway/application/gateway-service.ts` picks the single layout, where the gateway child itself listens on the public port, when `singleGatewayRuntimeBlockers` returns nothing, and the compatibility layout, where LLM Router's own HTTP server takes the public port and the child sits behind it on the core port, when the config turns on any of these: the proxy, network capture, the context archive, a router fallback, media tools, the browser automation MCP, a plugin's gateway route or request transform, or an API key limit (read). A fresh desktop install has none of them, so it runs the single layout.

## Summary

| ID | Question | Recommendation | When | Confidence |
|---|---|---|---|---|
| F-LOGS-1 | Keep the fork's prefix in the single layout's refusal body? | Keep. Drop it only as a passenger on a fork release made for another reason | Never on its own | High |
| F-LOGS-2 | Keep the narrow rule for which usage event a trace may name a provider for? | Keep | No change | High |
| F-LABEL-1 | Leave the two layouts naming the same request differently? | Leave for 9.1.0. Then show the key's name in both | Remediation release | Medium |
| F-LABEL-2 | Keep identity headers `[redacted]` in Logs for every key? | Keep | No change | High |
| F-GATEWAY-1 | Hold the fork commit until another fork change needs a release? | Hold for 9.1.0, which he already answered. Release it no later than the remediation release | Remediation release | High |
| F-GATEWAY-2 | Remediation release before gateway phase 1? | Yes. Re-audit the phase 1 plan before it is built | After the remediation release | High |
| F-UI-1 | Should an unchecked local login show green? | No. Grey until checked, green after a pass, amber after a failure | Remediation release | Medium |

Two recommendations differ from the row's default: F-UI-1 (the default is "yes, as today") and the second half of F-LABEL-1.

## F-LOGS-1: the refusal body's prefix

1. **Still true (read).** The fork writes the prefix in two places: `createGatewayPluginPreAuthHandler` in `~/dev/llmr-gateway/src/gateway/routes.ts:626` and the WebSocket path in `src/gateway/websocket.ts:148`. Both send `Gateway plugin "<key>" beforeAuth failed: <error>`. LLM Router's hook `llmr-public-auth-context` in `router-plugin.ts` returns only `{ ok: false, status, error }`. The compatibility layout answers from LLM Router's own server with the bare reason. `october-issues-wire.test.mjs:325` pins the prefixed form for the single layout.
2. **Weight.** Only a caller whose key is wrong, expired or missing a scope sees it, in the single layout, as the text of a 401 in its agent's error line. The reason still ends the sentence. The Logs page and the refused-key notice are not affected, because the hook records the bare reason itself before it returns (read, `sharedRefusedKeyRequestPublisher.record`).
3. **Outside facts.** None apply. The fork is ours.
4. **Options.**
   - Keep. No cost.
   - Change the fork to send the bare `result.error` when a hook returned a refusal, and keep the prefix when the hook threw. Two lines in the two files above, the fork's tests for those strings, one regex in `october-issues-wire.test.mjs`, a fork push, a tag and a pin bump. It loses nothing useful, since a refusal the hook chose is not a plugin fault.
   - Strip it on LLM Router's side. Not available (inferred). The hook receives the Fastify request and no reply (`GatewayPluginRequestHookInput` in the fork's `src/types.ts`), the fork writes the body after the hook returns, and a Fastify hook cannot be added once the server listens. In the single layout nothing of LLM Router's sits between the child and the caller.
5. **Recommendation.** Keep. If a fork release happens for another reason (F-GATEWAY-1), the second option can ride in it for one extra commit. It is not worth a release of its own. A report from a real user who could not read the message would change this.
6. **Gaps.** The same wrapper prefixes three other hook stages (`beforeRouting`, `beforePrecheck`, `afterPrecheck`) and the provider plugin auth path in `websocket.ts`. Whether LLM Router's refusals from those stages, such as `profile_model_not_allowed`, reach a caller with a prefix was not checked.

## F-LOGS-2: the narrow provider rule

1. **Still true (read).** `UsageStore.setProviderIfUnknown` in `packages/core/src/usage/store.ts:446` updates a row only where `provider = 'unknown' AND total_tokens = 0 AND cost_usd IS NULL`. `recordGatewayUsageCaptureIfMissing` calls it when the request id already has an event. No later PR changed it.
2. **Weight.** The rule exists for a refused request, which has no tokens and no cost. An event with tokens under `unknown` keeps that provider and whatever price it was given. How many such events a real install holds was not counted. No database was opened.
3. **Outside facts.** None apply.
4. **Options.** Keep the narrow rule. Or fill in every `unknown` event and reprice it in the same write, which touches the pricing rule that PRs 176 to 178 just rebuilt and that Tasks 3 to 5 of the finish plan are about to change again.
5. **Recommendation.** Keep, no change in any release now planned. A count showing many token-bearing `unknown` events on a real install would change this, and the fix would then belong with the pricing rows F-PRICE-10 and F-PRICE-11, not here.
6. **Gaps.** None new. The duplicate event under `unknown` in the compatibility layout is already in the delivery index, under the PR 172 findings.

## F-LABEL-1: one request, two names

1. **Still true (read), and simpler than the row says.** The compatibility layout builds the caller with `gatewayClientCallerForKey`, which carries the key's name (`pipeline.ts:195`). The single layout's trace import builds `{ kind: "key", trustedForwarder }` with no name (`raw-trace-sync.ts:1723`). `gatewayClientLabel` in `gateway/http/io.ts` then returns `caller.name ?? userAgentClient`, so one side shows `Profile: Codex` and the other `Codex`. Since PR 174 moved the e-mail into its own fields, the label rule reads no identity header at all, so a marked key is no longer a separate case. It differs exactly as any key does.
2. **Weight.** Every request with a valid key and no display-name header. Kilo, Kimi, OpenCode and Pi send `x-llmr-client`, so they agree in both layouts (read, plan decision). The others split. A person who turns on a fallback or a key limit moves to the compatibility layout and from then on Client Analysis counts the same agent under a second name.
3. **Outside facts.** None apply.
4. **Options.**
   - Leave it. No cost today. The split in Client Analysis stays.
   - Key name in both. One argument in `readRawTraceRequestLogBundle`, which already has the key list. Default-layout rows change from agent names to key names. The name comes from the store, so a caller cannot choose it, which narrows F-LABEL-12.
   - `User-Agent` name in both. Drop the key name from the rule. A hand-made key named "CI" then reads `Python` or `curl`, and the label is text the caller picks.
   - Not named in the row: store both. Keep `client` as the tool and show the key in its own column. It is the cleanest answer to "the tool or the key" and it is new work on two stores.
5. **Recommendation.** Leave it for 9.1.0, as the default says. In the remediation release take the second option. The key is the only anchor LLM Router has for who called (the plan's X-16 and X-17), and with no outside users a change of label costs nobody. A wish to see agent names on the dashboard, more than key names, would change this to the third option.
6. **Gaps.** With `x-llmr-proxy-mode: gateway` the rule prefers the `User-Agent` name, so even after the second option the two layouts could differ for proxied requests. Not run.

## F-LABEL-2: identity headers as `[redacted]`

1. **Still true (read).** `sensitiveRequestLogHeaderNames` in `packages/core/src/observability/sensitive-headers.ts` lists `x-claude-gateway-user-email`, `x-claude-gateway-user-id` and `x-litellm-end-user-id`, for every key.
2. **Weight.** For a marked key nothing is lost. The same values are stored in `forwarded_user_email` and `forwarded_user_id` on the Logs row and the usage event, and the Logs detail shows them as "Gateway user" (read, `network-logs.tsx:1039`). For an unmarked key the header is a value any caller can type, and redaction keeps an unverified e-mail out of a database that holds rows for the retention period.
3. **Outside facts, fetched 2026-11-27.**
   - LiteLLM proxy stores no request or response content by default and does store identity metadata: the key alias and team, an end-user id, and from v1.109.0 the key owner's e-mail in spend logs. Its payload also keeps the caller's custom `x-` headers. [UI logs](https://docs.litellm.ai/docs/proxy/ui_logs), [logging spec](https://docs.litellm.ai/docs/proxy/logging_spec).
   - Langfuse says a `userId` "can be a username, email, or any other unique identifier". Masking is something the operator configures, and the page lists input, output and metadata, not the user id. [Users](https://langfuse.com/docs/observability/features/users), [masking](https://langfuse.com/docs/observability/features/masking).
   - Helicone's header directory gives an e-mail address as its example for `Helicone-User-Id`. [Header directory](https://docs.helicone.ai/helicone-headers/header-directory).
   - OpenRouter advises against it: "Avoid including personally identifiable information in user identifiers", and it hashes the value before sending it upstream. [User tracking](https://openrouter.ai/docs/guides/administration/user-tracking).

   The pattern is the one LLM Router now has. An administrator of a shared gateway expects to see who made a request, and gets it from a named identity field. None of the four documents raw identity headers as the place to look.
4. **Options.** Keep it for every key. Or redact only for an unmarked key, which needs the key where the row is stored and puts the e-mail in a second place on the same row for no gain.
5. **Recommendation.** Keep. On a single-user desktop install an e-mail in a local database matters little, since it is the owner's own machine and the request bodies in the same row say far more. The rule earns its place on a shared gateway, and there the dedicated field already answers the administrator. Removing the "Gateway user" field would change this.
6. **Gaps.** F-LABEL-10 stands: the trace bundle in the spool holds the raw values until the import removes it. `x-litellm-end-user-id` is redacted and has no field of its own, by the phase 0 session's choice (delivery index question 1), so a LiteLLM end-user id is visible nowhere in Logs.

## F-GATEWAY-1: the unreleased fork commit

1. **Still true (run).** `git -C ~/dev/llmr-gateway log` shows `d35913c` on the local branch `fastify-log-controller`, one commit ahead of the tag `v1.0.22-llmr.4`, pushed nowhere. LLM Router pins `llmr.4` (`packages/core/package.json:19`) and its lockfile resolves Fastify 5.12.7 (read). On 2026-11-27 the owner answered "not yet" for the push and the tag, so 9.1.0 ships on `llmr.4`. That is decided and not reopened here.
2. **What a user sees today.** Fastify 5.12.7 emits `FastifyDeprecation` `FSTDEP023` on every gateway start: "disableRequestLogging option is deprecated. Use the logController option with disableRequestLogging or isLogDisabled override instead. The disableRequestLogging top-level option will be removed in `fastify@6`." (read, `node_modules/fastify/lib/warnings.js`). The child's stderr goes to the parent's `console.warn` under a `[gateway]` prefix (`gateway-service.ts:339`) and into the text of a gateway failure message (`gatewayChildOutput` in `supervisor.ts`). So a person who starts `llmr` in a terminal sees one warning line per start, and a desktop user sees it only inside a failure message, where it reads like a cause and is not one. Not run here.
3. **Outside facts, fetched 2026-11-27.** npm lists `latest` 5.12.8 (2026-11-02) and `next` 6.0.0-alpha.6 (2026-11-02), with seven alphas since 2026-08-11. Fastify's `main` branch says "the APIs deprecated in Fastify v5 have been removed in Fastify v6", and the 5.x table lists FSTDEP023 with the `LogController` fix ([main](https://github.com/fastify/fastify/blob/main/docs/Reference/Warnings.md), [5.x](https://github.com/fastify/fastify/blob/5.x/docs/Reference/Warnings.md)). The [LTS page](https://fastify.dev/docs/latest/Reference/LTS/) lists no version 6 and no date, and the v6.0.0 milestone has 11 open issues and no due date. `LogController` arrived in 5.10.0 (2026-07-05).
4. **Options.**
   - Hold until another fork change needs a release. Costs the warning line, and leaves a tested commit on one disk only.
   - Release it as `llmr.5` now. The owner said not yet.
   - Not named in the row: push the branch without a tag. It removes the one-disk risk and changes nothing a user runs. It still needs his word (decision 5).
5. **Recommendation.** Hold for 9.1.0. Release it with the remediation release at the latest, or sooner if any other fork change comes first. Nothing forces it earlier: LLM Router's range is `^5.8.2`, so no install moves to Fastify 6 without a deliberate bump, and 6 has no release date. A Fastify 6 release candidate, or a user who reports the warning as a fault, would bring it forward.
6. **Gaps.** What Fastify 6 does with the old option, an error or a silent return to access logging, was not checked. LLM Router resolves 5.12.7 and the fork commit's own lockfile 5.12.8.

## F-GATEWAY-2: phase 1 beside the remediation release

1. **Still true (read).** Decision 8 puts phase 1 after the release and says nothing about the remediation release. The finish plan already carries "after it" as its default (its question 6).
2. **Sizes.** Phase 1 is one PR of six commits from a 471-line plan: a new saved config section with its own writer, a new core module, a sign-in for the web interface held in memory, a new page under Setup, and a proof run that needs Docker and the `claude` binary. Phase 0 is built (PR 174). The register holds 88 `remediation` rows (run, counted from its tables), and the VM pass will add more.
3. **Overlap.** One of the 88 rows names a file phase 1 touches, F-UI-4 on the navigation strip (run, a grep of the rows for phase 1's file names). That undercounts, because most rows name no file. By area the remediation work sits in the usage and request-log stores and `profiles/service.ts`, which phase 1 does not touch, and phase 1 sits in `contracts/app.ts`, `config.ts`, `ipc.ts`, `management-server.ts`, `App.tsx` and `layout.tsx`, which every wide change meets (inferred).
4. **Options.**
   - Remediation release first, then phase 1 as the next feature release.
   - Phase 1 first. The remediation release then carries a new page nobody ran on the VM, and decision 2's "what the pass finds is fixed afterwards" gains a feature that needs a pass of its own.
   - In parallel. Phase 1's plan allows a split after Task 3. Tasks 1 to 3 are core with tests and could be built while remediation batches run, as long as no remediation batch has `contracts/app.ts`, `ipc.ts` or `management-server.ts` open.
5. **Recommendation.** Remediation release first. It keeps that release a fix release that the one VM pass covers, and it lets phase 1 start from settled code. If the VM pass is slow to schedule, building Tasks 1 to 3 in the gap and holding the merge is a fair use of the time. A VM pass that finds little would make the order matter less, not reverse it.
6. **Gaps.** The phase 1 plan was audited once, at `26616b96` on 2026-11-25, by the session that owns it. About thirty PRs have merged since, several in the files it changes. It needs a fresh audit against the code before it is built.

## F-UI-1: green ticks on a local login nobody checked

1. **Still true (read).** `ProviderConnectionStatusPanel` in `packages/ui/src/pages/home/components/providers.tsx:1796` (the brief's path lacks `pages/home`). Its two rows turn green whenever `localAgentImport` is true and the provider is not the Claude login provider. Neither row reads the result of a check for such a provider. Not run in the app.

   | State | Row 1, protocols | Row 2, request |
   |---|---|---|
   | Saved local login, never checked | Green tick. "Local login provider". "LLMR has not asked this provider which protocols it supports." | Green tick. "Available after saving". "The imported local agent login is connected when this provider is saved." Check Connection button when the inputs are there |
   | Checked, passed | Green tick. Same title. The text changes only if a protocol probe also ran | Green tick. Same title and text as never checked. "Connection verified" is unreachable for a local login |
   | Checked, failed | Green tick, unchanged | Green tick, unchanged. The failure shows only as the form's error message |
   | Refresh ran and found no protocol | Green tick. "Local login provider". "Choose a provider endpoint so LLMR can detect compatible protocols." | Unchanged |
   | Claude login provider | Grey. "LLMR does not probe this provider." | Grey. "Not checked". No button |
   | Ordinary key provider | Green after detection, else grey | Green "Connection verified" after a pass, amber "Not verified yet" before one and after a failure |

   The same condition also marks the Verify step as done in two more places (`connectionVerified` at line 2116 and `verified` at line 3749).
2. **Weight.** Anyone who imports a local agent login and opens its form. The harm is a wrong belief: a login that has expired, or one the provider refuses, reads as connected until a request fails. A passed check and no check look the same, so the button gives no feedback when it works.
3. **Outside facts.** None apply.
4. **Options.**
   - As today. A green tick then means "a login file was found", which the text beside it contradicts.
   - Grey until checked. Row 2 reads "Not checked" with a line saying the saved login is used as it is and Check Connection sends one real request. After a pass it reads "Connection verified" in green. After a failure it reads "Last check failed" in amber. Row 1 is grey while it says LLMR has not asked, and green once a refresh found a protocol. This is one function plus its component test. A local login must still save without a check.
   - Amber until checked, the ordinary provider's "Not verified yet". It reads as a fault on a login that is probably fine.
5. **Recommendation.** The second option, in the remediation release. The behaviour is old and loses no data, so it does not belong before 9.1.0. A green tick should mean LLM Router saw the thing work, which is what it means on every other provider. If he reads the tick as "login found", the smaller change is to keep green on never-checked and still turn row 2 amber after a failed check, since green beside a failure message is wrong under either reading.
6. **Gaps.** Whether `connectionVerified` gates the Save button was not traced, so the fix must confirm a local login still saves unchecked. The step markers at lines 2116 and 3749 need the same rule or they will disagree with the panel.

## Not checked

- Nothing was run against LLM Router, the gateway or the app. The layout rule, the label rule, the redaction list, the status panel and where the child's stderr goes were read. The fork's state and the row counts were run.
- No real usage or request-log database was opened, so there is no count of token-bearing `unknown` events (F-LOGS-2) or of split client names (F-LABEL-1).
- Whether refusals from the fork's other hook stages reach a caller with a prefix (F-LOGS-1).
- Fastify 6's behaviour when it is passed the removed option, and any published date for 6.0.0. None was found.
- Helicone's and Langfuse's storage defaults beyond what the cited pages say. OpenRouter's own request log contents were not found in its docs.
- The file overlap between phase 1 and the remediation rows beyond a grep of the rows' text.
