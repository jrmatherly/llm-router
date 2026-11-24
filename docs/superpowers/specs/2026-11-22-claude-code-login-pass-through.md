# Claude Code login pass-through

Date 2026-11-22. LLM Router `main` at `eb84a3ba` (v8.1.0). Gateway fork `jrmatherly/llmr-gateway` at `26e74df` (`v1.0.22-llmr.3`).

**Goal.** LLM Router stops importing, refreshing and writing back the Claude Code subscription login. Claude Code sends its own login on each request, and LLM Router forwards it to Anthropic. Nothing about the login is stored.

**Plan.** [`docs/superpowers/plans/2026-11-22-claude-code-login-pass-through.md`](../plans/2026-11-22-claude-code-login-pass-through.md).

## How this was checked

A design draft, an audit of it by a second model and a probe of Claude Code 2.1.330 came first. They are private working notes and are not in the repository. This spec was then written against the code. Each claim carries one of these labels.

- **read**. The spec author read the code or the doc at that line on 2026-11-22.
- **ran (draft)**, **ran (audit)**, **ran (probe)**. The named earlier pass executed it, loopback only. The spec author did not repeat the run.
- **ran (fix round)**. After a second audit of this spec and its plan, a fix round ran two throwaway prototypes in a scratch worktree. They used loopback stubs, a temporary home and a `security` stand-in, and the worktree is deleted.
- **inferred**. Reasoned from code that was read.

The spec author ran nothing. The design audit's one blocker and eleven corrections are resolved in the sections named in the table under "Audit findings". The plan audit's two blockers and eighteen corrections are in the second table there.

The fix round's prototype was not the design below in full. It added the key header, the removal of an inbound internal header, the carry at both doors on a simple model test, the replacement of `authorization` in the single runtime, and the header copy in the provider hook. It changed no routing and skipped no body step.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| PT-1 | Pass-through replaces the import. LLM Router no longer reads, refreshes or writes the Claude Code login. The lock design for shared refresh is retired. | Owner, 2026-11-22 |
| PT-2 | Pass-through is chosen per Claude Code profile, as an auth mode "Claude login" beside the gateway-key modes. Nothing switches it on automatically. The reason is that with only a custom-header credential Claude Code skips gateway model discovery, so a Claude-login profile shows Claude Code's own model list and not LLM Router's. | Owner, 2026-11-22 |
| PT-3 | The gateway fork is changed in this work so that, for pass-through traffic, upstream error bodies and the `anthropic-ratelimit-unified-*` response headers reach Claude Code unchanged. A push or tag on the fork needs the owner's word at that moment. | Owner, 2026-11-22 |
| PT-4 | LLM Router's plan-usage display (PR 54) is deleted in this work. Rebuilding it from the rate-limit response headers that pass through is a follow-up, not a task here. | Owner, 2026-11-22 |
| PT-5 | Body rewrites do not apply to pass-through traffic. That covers subagent tags, the ToolHub instruction, the context archive, web-search continuation and model rewriting through `resolveBuiltInAgentRouteDecision`. The request goes upstream as Claude Code sent it. | Owner, 2026-11-22 |
| PT-6 | The `~/.claude.json` guard is the first task of the plan, on the same branch and in the same PR. It is independent of pass-through. | Owner, 2026-11-22 |
| PT-7 | A local cleanup of four leftover paths under `~/.codex` runs on the owner's Mac with his word at that moment. It is not code and not in the diff. Every `*.llmr-original` and `*.llmr-backup-*` file stays. | Owner, 2026-11-22 |
| PT-8 | Moving the compaction windows from `.claude.json` to `modelSettings.<model>.autoCompactWindow` is out of scope and recorded as later research. | Owner, 2026-11-22 |
| PT-9 | Both gateway layouts are supported. The single runtime is the default, so no blocker forces the two-process layout. | Parent session, changeable in review |
| PT-10 | The gateway key travels in `x-llmr-api-key`, set through `ANTHROPIC_CUSTOM_HEADERS`. The login travels inside LLM Router in `x-llmr-caller-authorization`, which is removed from every inbound request before it is set. Neither value may reach a log, the request-log database, a stored trace or an error message. | Parent session, changeable in review |
| PT-11 | These are the spec author's calls and any can change in review. The fork gains one provider flag that covers error relay, the forced 401 retry and model acceptance. A bare model id from a Claude-login profile goes to the pass-through provider. The pass-through provider is left out of every model list LLM Router serves. Existing route rules that name the provider are left as they are. The fork masks credential header values in its raw-trace spool. | Spec author |

Standing rules also apply. The fork has no consumers, so there is no compatibility path and no migration code. Upstream parity is never weighed. LLM Router never writes `~/.claude.json`.

## Basis in Anthropic's docs

All read in `~/.claude-code-docs/cache/` on 2026-11-22.

- Setting only `ANTHROPIC_BASE_URL`, with no gateway credential, keeps the saved claude.ai login as the active credential. A gateway that passes this traffic to Anthropic "must forward `Authorization` and the OAuth capability in `anthropic-beta`" (`claude-code__llm-gateway.md:54`).
- Forward `anthropic-version` and `anthropic-beta` unchanged, and `Authorization` when the gateway authenticates with the developer's login (`claude-code__llm-gateway-protocol.md:118`). Treat headers and body fields as open lists (`:165-169`). A gateway that rewrites bodies breaks header and body pairs, "so inspect without modifying" (`:216`).
- Forward error response bodies unmodified, because Claude Code's recovery matches on the upstream's wording (`:175`, `:251`). Return `retry-after`, `x-should-retry` and `anthropic-ratelimit-unified-*` unchanged on every response (`:180-182`).
- Model discovery sends `Authorization` only from `ANTHROPIC_AUTH_TOKEN` or `apiKeyHelper`. A credential supplied only through `ANTHROPIC_CUSTOM_HEADERS` leaves discovery skipped (`:334-341`).
- `ANTHROPIC_CUSTOM_HEADERS` takes one `Name: Value` pair per line, joined with `\n` in a settings file (`claude-code__llm-gateway-connect.md:273-297`).
- The compliance page says developers may not "intermediate Claude.ai credentials or session tokens", and that this does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription" (`claude-code__legal-and-compliance.md:55-57`). LLM Router here is a gateway the user runs on their own machine for their own unmodified Claude Code, and it stores nothing. The user doc says so in those words.
- Anthropic does not support routing Claude Code to non-Claude models through a gateway (`claude-code__llm-gateway.md:17`). That sentence covers LLM Router's other providers, as it does today.

## What Claude Code sends

From the probe of Claude Code 2.1.330 against a loopback stub (ran (probe)).

| Config | `Authorization` | `x-api-key` | OAuth beta |
|---|---|---|---|
| Base URL only, signed in | `Bearer <login>` | absent | `oauth-2025-04-20` present |
| Plus `ANTHROPIC_CUSTOM_HEADERS` | `Bearer <login>`, and the custom header beside it | absent | present |
| Plus `ANTHROPIC_AUTH_TOKEN` | the token | absent | gone |
| Plus `apiKeyHelper` | the helper value | the helper value | gone |

Every run made one `POST /v1/messages?beta=true`. Claude Code also contacted `api.anthropic.com` directly for its OAuth profile, outside the base URL. Settings `env` won over process env for `ANTHROPIC_BASE_URL`.

## Data shape

A pass-through provider is the existing imported provider with its token removed. There is no new provider kind.

| Piece | Today | After |
|---|---|---|
| Provider entry | `anthropic_messages`, base URL `https://api.anthropic.com`, placeholder key `llmr-local-agent-login` (`agents/local-providers/claude-code.ts:159-164`, read) | Same. The placeholder key stays, because without any key the fork stops at `passthrough_build` before the hook runs (ran (draft)). |
| `providerPlugins` entries | Two entries, keys ending `-claude-code-oauth` and `-claude-code-oauth-internal`, each holding `auth.headers.authorization: Bearer <token>` (`claude-code.ts:165-170`, read) | The same two keys with no `auth` block. They only bind the hook to the provider by name. |
| How code finds the provider | `isLocalClaudeCodeOauthProviderPlugin` (`providers/oauth-plugin.ts:3-6`, read) | Same function. It stays. The UI maps the same two suffixes at `packages/ui/src/pages/home/components/providers.tsx:1536` (read), which stays correct because the keys keep their names. |
| Stored token | In `config.providerPlugins`, refreshed from the Keychain at compile time (`gateway/core-runtime/config-compiler.ts:548-570`, read) | None. The compile step drops any `auth` block from these two entries, so a config saved by an earlier version sends no stored token. |
| Profile auth mode | `"api-key-helper" \| "wif"`, with an `"auto"` preference that resolves to the helper (`agents/claude-code/auth-mode.ts:3-18`, read) | One more value, `"claude-login"`. `"auto"` still resolves to the helper (PT-2). |

The mode is read from the profile's env key `LLMR_CLAUDE_CODE_AUTH_MODE` (`auth-mode.ts:20-25`, read). Today that read falls back to LLM Router's own process env. `claude-login` is accepted from the profile's env only. A process-wide value of `claude-login` resolves to the helper, because one variable would otherwise move every profile, against PT-2. The profile editor has no control for it today (a search of `packages/ui/src` for the key found nothing, read). This work adds a toggle that sets that env row to `claude-login`.

## The pass-through request

### One predicate

One pure function decides whether a request is pass-through traffic, and both layouts call it. It lives in a new module `packages/core/src/gateway/features/claude-login-pass-through.ts`. A request is pass-through traffic when all of these hold.

1. The gateway key arrived in `x-llmr-api-key`.
2. The key's profile is an enabled Claude Code profile whose auth mode resolves to `claude-login` (`profileForApiKey`, `profiles/model-allowlist.ts:9-23`, read).
3. `authorization` starts with `Bearer `. **Changed in review of PR 146:** this is no longer a condition of the predicate. A request that meets the other rules is routed to the pass-through provider either way. Without a `Bearer` value the internal header carries the value `none`, which the provider hook refuses with the 400 below. Before the change such a request took the normal route with the gateway key, and another provider that listed the same model id could answer it.
4. An enabled pass-through provider exists.
5. The model id, as Claude Code sent it, either has no provider prefix or is prefixed with the pass-through provider's name.
6. The request is `POST /v1/messages`. This rule is the fix round's. `count_tokens` is answered locally and the list routes call no provider, so carrying a login for them would only keep it on the request longer.

The function returns the routed id `<provider name>/<model id>`, or nothing. When it returns nothing the request takes LLM Router's normal path with the gateway key alone, and the login is dropped at LLM Router's door in both layouts.

The model id does not have to be in the provider's model list. Claude Code's own list changes with each release. Today LLM Router's route resolver finds a provider only for a listed model (`routing/model-registry.ts:38-45`, read), and a prefixed id outside the list went to the first Anthropic provider and failed there (ran (fix round)). So the resolver gains one branch. For a request that holds the internal header, a routed id whose prefix names the pass-through provider resolves to that provider with the id as sent.

Rule 5 is what lets one Claude-login profile use both. A model picked from Claude Code's own list arrives as a bare id and goes to the subscription. A model pinned as `OtherProvider/model` in the profile goes through LLM Router's normal routing, with every LLM Router feature, and never carries the login.

### Headers, hop by hop

| Hop | Header | Who sets it |
|---|---|---|
| Claude Code to LLM Router | `Authorization: Bearer <login>` and `x-llmr-api-key: <gateway key>` | Claude Code. The second comes from `ANTHROPIC_CUSTOM_HEADERS`. |
| Inside LLM Router | `x-llmr-caller-authorization: Bearer <login>` | The carry step, only for pass-through traffic. Any inbound copy is deleted first, at LLM Router's door, for every request. |
| LLM Router to Anthropic | `authorization: Bearer <login>`, and no `x-api-key` | The provider hook `authenticateClaudeCode`. |

**Authorizer.** `x-llmr-api-key` goes first in `sdkCompatibleTokenHeaderNames` (`gateway/internal/shared.ts:35-42`, read). Both copies of `readAuthToken` walk that list in order (`gateway/http/io.ts:63-71`, `gateway/core-runtime/router-plugin.ts:1424-1432`, read). Without this the login in `Authorization` is read as the key and refused (ran (audit)). No caller sends the header today, so nothing changes for other callers. Being in that list also means `stripLocalGatewayAuthHeaders` removes it before the child (`io.ts:96-100`, read) and `mergeUpstreamProviderHeaders` keeps it off every upstream (`gateway/core-runtime/upstream-header-sanitizer.ts:68-71`, `:204-212`, read).

**Removing an inbound copy.** The header name joins `llmrRouteHeaderNames` (`gateway/core-runtime/router-plugin-contract.ts:52-64`, read). That list is walked in two places and no others. The front door removes those names from every request at `gateway/request/pipeline.ts:157`, before the `if (apiKey)` block. The single runtime removes them in the public branch of `beforeAuth` (`router-plugin.ts:374-375`). The child of the two-process layout runs the same hook with `publicGatewayMode: false` (`config-compiler.ts:206`, read), so it removes nothing and the header the front door carried arrives. A removal placed before that branch deleted the carried login, and every two-process request then got the no-login 400 (ran (fix round)). Without any removal, a request that brought its own header had that value forwarded as `authorization` in both layouts (ran (fix round)).

An outside caller cannot set the header in either layout. In the single runtime every request passes the public branch. In the two-process layout every outside request passes the front door, and the child accepts only the core token in `x-llmr-core-auth` (`config-compiler.ts:143`, `:219-221`, read), which the front door removes from inbound requests and adds itself (`gateway/internal/shared.ts:293`, `gateway/http/io.ts:83-93`, `:112-119`, read).

**Two-process layout.** The carry step sits at `pipeline.ts:164-168`, before the line where the front door deletes the caller's `authorization` and the key (read). The child then receives the carried header and no `authorization` (ran (fix round)).

**Single runtime.** The fork's own key check reads `authorization` first and does not know `x-llmr-api-key` (fork `src/gateway/auth.ts:613-658`, `config-compiler.ts:143`, `gateway/core-runtime/supervisor.ts:385`, read). A Claude Code signed in with its login always sends the login in `authorization`, so the fork would refuse every request from a Claude-login profile with 401, including `count_tokens`, `GET /v1/models` and a model pinned to another provider (ran (fix round)). LLM Router's `beforeAuth` hook `llmr-public-auth-context` edits the request headers before that check (`router-plugin.ts:371-402`, read). When the key came in `x-llmr-api-key` and was accepted, the hook **always** sets `authorization` to `Bearer <gateway key>`. Before that it carries the login into the internal header when the predicate holds. Otherwise the login is gone from the request at that line. The fork hands the hook the Fastify request with its body already parsed, and the provider hooks later receive the same request object. A header written in `beforeAuth` reached the provider hook, and the four request kinds above answered 200 (ran (fix round)).

The replacement cannot send the login anywhere. After it, `authorization` holds the gateway key, as it does today for every caller that sends the key there. The login exists only in the internal header, only for pass-through traffic, and the sanitizer removes that header before every upstream.

**Why an internal header.** Leaving the login in `authorization` on the way to the child would send it to other providers. With a provider that has no key of its own, the fork uses the caller's bearer as that provider's key (fork `src/adapters/builtins/common.ts:128-131`, ran (draft)). The sanitizer drops every `x-llmr-*` name before any upstream (`upstream-header-sanitizer.ts:173`, `:204`, read).

### Routing and the body (PT-5)

`LLMRouterPlugin.routeRequest` (`gateway/llm-router-plugin.ts:70`, read) is the one router entry in both layouts. The single runtime calls it through `routeWithRouter` at `router-plugin.ts:435` and `:1065-1077` (read). The front door first POSTs the body and a copy of the headers to the child's router route, over loopback with the core token, and calls its own plugin only when that fails (`pipeline.ts:411-426`, `:1300-1330`, read). So in the two-process layout the carried header also travels inside that request's JSON body, and a change the child makes to those headers never reaches the front door's copy. When the request carries `x-llmr-caller-authorization`, `routeRequest` returns the routed id with reason `claude-login`, source `builtin` and a fallback of `off`, and returns the body it was given. It runs no rule, no built-in agent decision and no body step. The front door takes its fallback from that decision (`pipeline.ts:434`, `:465`, `:1412-1414`, read), so no profile or router fallback applies to a carried request.

The front door has body steps outside the router. For pass-through traffic it skips each of them. They are the Cursor compatibility body (`pipeline.ts:190-194`), the two discovered-model rewrites (`:230`, `:247`), the Codex bridges and the Codex compact step (`:499`, `:529`, `:717`), the web-search steps (`:575`, `:624`), the two context-archive steps (`:652`, `:685`) and the plugin request transforms (`:753`) (read). The router's own output at `:444` is the body it was given, serialized again.

The single runtime has none of those, because `pipeline.ts` runs only in the front door (inferred). It has one body step of its own, which also runs in the child. The provider hook `llmr-deferred-tool-compatibility` (`router-plugin.ts:405-416`, read) rewrites the upstream body for a provider whose `supportsDeferredTools` the user set to `false`. It is skipped for a request that holds the internal header.

"Unchanged" means every field as sent, with one exception. A provider prefix on `model` that names the pass-through provider is removed by the fork (fork `src/adapters/builtins/source/anthropic-messages.ts:21-46`, ran (draft)). The body is parsed and serialized again on the way, so it is equal field by field and not byte for byte. The fork also rewrites tool ids outside `[a-zA-Z0-9_-]` (ran (draft)).

Forwarded as sent (ran (draft), child alone): `anthropic-beta` with unknown values included, `anthropic-version`, `user-agent`, `x-app`, `x-claude-code-session-id`, `anthropic-dangerous-direct-browser-access`, the `x-stainless-*` set and every other client header. Never forwarded: `x-llmr-*`, `x-auth-api-key-id`, `x-auth-sub`, the gateway key and the placeholder `x-api-key`. The hook always removes `x-api-key` (`local-agent-auth-provider-hook.ts:458-467`, read by the audit).

Four places add `oauth-2025-04-20` today. All four go, because Claude Code sends the value itself. They are `local-agent-auth-provider-hook.ts:202-206`, `config-compiler.ts:730-763`, `gateway/upstream/executor.ts:732-757` and `providers/probe.ts:962` (read).

Two things are unchanged by this work. The child posts to `/v1/messages` with no query string, so `?beta=true` is dropped, as the shipped import path does today (ran (draft)). `count_tokens` is answered locally in both layouts (`router-plugin.ts:356-370`, read), so Claude Code gets LLM Router's estimate.

A profile's model allowlist still applies. `profileDeniedModel` runs after routing in both layouts (`pipeline.ts:465-467`, `router-plugin.ts:442-457`, read).

### The fork change (PT-3)

Today a non-2xx upstream response becomes a failed attempt, and the client gets `{"error":{"message":"All target providers failed.", "attempts":[…]}}` with the upstream body under `attempts[n].details` and without the upstream's headers (fork `src/gateway/handler.ts:1865-1877`, `:7110-7136`, read). An upstream 401 is retried once after the provider hooks run again (fork `handler.ts:7987-8030`, read). With pass-through the hook copies the same login, so that retry sends the rejected token twice. The fork also refuses a model id that is not in the provider's model list (fork `handler.ts:6351-6373`, read), and Claude Code's own list changes with each release.

The fork gains one provider field, `clientCredentialPassthrough: boolean`, parsed in fork `src/config.ts` beside the other provider fields and typed in `ProviderConfig` (fork `src/types.ts:117-138`, read). For a provider that sets it:

1. A non-2xx upstream response is relayed with its status, its body and its headers, through the existing `relayUpstreamResponseWithPayload` (fork `handler.ts:8620-8645`, read). No fallback target is tried.
2. The forced 401 retry does not run.
3. `validateModelForTarget` accepts any model id.

LLM Router's config compiler sets the field on every compiled provider entry that comes from a pass-through provider, in `compileCoreGatewayConfig` where the providers and the plugins are both in scope (`config-compiler.ts:104-109`, read). The front door also runs a pass-through request with fallback off and one attempt, so it does not retry what the child relays. It rewords only a body that has an `attempts` list (`gateway/http/error-detail.ts:60-125`, read), which an upstream's own error body does not have. The front door's retry code in `gateway/upstream/executor.ts` was read by the audit for the one-attempt case and not in full. Plan Task 5 pins the behaviour with a wire test in both layouts.

The flag has a cost. A fallback from the subscription to another provider, set by the user, no longer runs when the subscription answers 429 or another error. The user sees Claude Code's own limit message in its place. That is PT-3's intent.

Success responses already keep the upstream's headers. The child copies them (ran (draft)) and the front door drops only `connection`, `content-encoding` and `transfer-encoding` (`gateway/internal/shared.ts:295`, `gateway/http/io.ts:123-131`, read).

### A caller without a login

The provider hook is the one enforcement point. When the request carries no `x-llmr-caller-authorization`, `authenticateClaudeCode` returns an error and no upstream call is made.

- **Status.** 400. The fork maps a provider hook's failed `authenticate` to stage `provider_auth` with status 400 (fork `handler.ts:8347-8351`, read; ran (draft)). It is not 401, so Claude Code does not treat its own login as bad.
- **Body.** `{"error":{"message":"All target providers failed.","attempts":[{"stage":"provider_auth","status":400,"message":"Provider plugin \"<hook key>\" auth failed: <message>", …}]}}` (ran (fix round), with a stand-in message). In the two-process layout the front door appends a summary of the attempts and the requested model to `error.message` (`gateway/http/error-detail.ts:117-125`, ran (fix round)). The attempt's own `message` is the same in both layouts.
- **Message, exact.** `This provider forwards the Claude login that Claude Code sends, and this request carried none. Sign in with "claude /login" and use a Claude Code profile in Claude login mode, or route this request to another provider.`

Who gets it. A Codex, OpenCode, Pi or Kilo key. A Claude Code profile in helper or WIF mode, because the helper value or the gateway key replaces the login (ran (probe) for the helper; `auth/api-key-authorizer.ts:79-107`, read by the audit, for WIF). Claude Desktop, which sends a static key as `x-api-key` (`agents/claude-app/gateway-service.ts:177-182`, read by the audit). A logged-out Claude Code in Claude login mode, which sends no `Authorization` (inferred; Gate B checks whether Claude Code starts a session at all in that state).

When the route has a fallback target, it is tried after the 400, as for any failed attempt. With a model-chain fallback to another provider, a request without a login was answered 200 by that provider (ran (fix round), two-process layout).

### Logs and traces

- The request-log database stores header values redacted by name (`request-log-store.ts:6214-6228`, read). From the trace it stores the upstream headers (`observability/raw-trace-sync.ts:1716`). In the two-process layout the front door's own row also stores the headers it forwarded (`pipeline.ts:364`, read), and after the carry those include `x-llmr-caller-authorization`. Its value is stored as `[redacted]`, because both new names match both redaction patterns (`observability/route-trace.ts:40`, `observability/sensitive-headers.ts:17-18`, read; ran (audit)). The route trace records header changes with values redacted by path through the same patterns (`route-trace.ts:216-219`, `:355`, read).
- In the two-process layout the carried header is also inside the JSON body of the front door's POST to the child's router route. Whether the fork records that request anywhere was not checked. Plan Task 5 searches the data folder after such a request.
- The refused-key log stores client, reason and route, never headers (`refused-key-requests.ts:70-77`, read by the audit).
- The fork's raw-trace spool is the gap. With request logs on and body capture on, LLM Router sets `wire_raw` (`raw-trace-sync.ts:1478`, read), and the fork then writes the child's inbound headers and the upstream headers to the spool with no redaction (fork `handler.ts:9380-9392`, `:9425-9451`, read). The bundle is removed after ingestion. With this design both copies would hold the login. The fork release therefore masks the value of every header whose name matches a credential pattern in both request metadata parts, in every trace mode. The pattern covers the segments `authorization`, `cookie`, `credential`, `key`, `pass`, `secret` and `token`, and `x-llmr-core-auth` by name, so it is no narrower than LLM Router's own list for the names LLM Router sends. It has no bare `auth` segment, because LLM Router reads `x-auth-sub`, `user-agent` and `x-llmr-route-attempt` from the trace (`raw-trace-sync.ts:1693-1699`, read). LLM Router stores the masked headers redacted by name already, so it loses nothing.
- The no-login message and every other error message name no header value.
- Code in the child that is not the hook can see the internal header. That covers installed plugins' request transforms and provider hooks. The user doc says the login passes through those.

## Profile settings and restore

All in `packages/core/src/profiles/service.ts`, in `applyClaudeCodeProfile` (`:500-636`, read) and the restore helpers.

**What Claude login mode writes.** `env.ANTHROPIC_CUSTOM_HEADERS`. Its value is the user's own lines, minus any line whose name is `x-llmr-api-key`, plus `x-llmr-api-key: <profile key>`, joined with `\n`. It writes no `apiKeyHelper`. `claudeCodeNextSettings` already removes LLM Router's own helper entry when the mode is not `api-key-helper` (`:1576-1589`, read). `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` are already deleted from settings `env` (`:565-567`) and unset in the wrapper (`:1906`) (read). Either one would displace the login (ran (probe)).

**A change of only that key is written (audit C-1).** `writeClaudeCodeSettingsIfManagedChanged` writes only when a managed field differs (`:2778-2824`, read). `ANTHROPIC_CUSTOM_HEADERS` is in neither `claudeCodeManagedSettingsEnvKeys` (`:2854-2873`) nor `isManagedClaudeCodeSettingsEnvKey` (`:2875`) (read). So a rotated profile key would leave the old key in `settings.json`. The key name is added to `claudeCodeManagedSettingsEnvKeys` only, which feeds the change check (`:2804-2816`, read). It is not added to `isManagedClaudeCodeSettingsEnvKey`. That function also decides whether a whole settings file counts as LLM Router's own content (`:3972-3988`, `:4046-4061`, read), and a file that holds only the user's custom headers must stay the user's. What that content test steers downstream, in backup pruning and the restore snapshot, is inferred.

**Shared-home profiles (audit C-2).** A generated profile writes LLM Router's own file (`resolveClaudeCodeSettingsFile`, `:1031-1036`, read), and a shared-home profile loads it on top of the user's `settings.json` (`agents/claude-code/environment.ts:53-56`, read). LLM Router's value for the key would then replace the user's whole value. For a shared-home profile the merge reads the user's lines from the user's file, the same path apply already reads at `:511` (read). LLM Router does not write that file. If the user later edits their own headers, LLM Router's copy is stale until the next apply.

**Restore.** `withoutManagedClaudeCodeEnv` (`:4008-4036`, read) follows its `NO_PROXY` pattern. It filters the key out, then puts back the lines that are not `x-llmr-api-key`, and leaves the key absent when no line remains. The user's own lines never leave the file, so nothing is saved in `displacedEnv`. When the profile's own env names `ANTHROPIC_CUSTOM_HEADERS`, the key is a managed profile key and a restore removes it whole, as for any profile env key (`:534-537`, `:4018`, read).

**The helper script (audit C-5).** A profile switched from the helper to Claude login must not keep `CONFIGDIR/bin/llmr-claude-code-api-key-<slug>`, a script that prints the key. No change is needed for that. Every apply starts with `cleanupInactiveClaudeCodeGeneratedFiles`, which removes the script of any profile whose mode is not `api-key-helper` (`:2983-3007`, read). The design audit's premise that only the `wif` branch at `:586-588` cleans up was wrong. A test keeps the behaviour.

**`autoMode`.** A helper-mode apply deletes a user's `autoMode: true` and records the path as managed (`:542`, `:1597-1608`, read by the plan audit). Claude login mode keeps the setting. A profile moved from the helper to Claude login does not get a deleted value back.

**Where the gateway key sits.** `writeClaudeCodeWifIdentityToken` writes the key to `CONFIGDIR/bin/` in every mode today (`:575`, `:1775-1784`, read). So the key is already on disk in plain text. What changes is that in Claude login mode it also sits in `settings.json`, inside `ANTHROPIC_CUSTOM_HEADERS`. Claude Code offers no helper for custom headers. A `settings.json.llmr-backup-*` copy taken before a later rewrite can hold the same line (inferred, plan Task 6 reads the backup code).

**Discovery.** `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` is still written in every mode (`contracts/app.ts:980-983`, read). In Claude login mode Claude Code ignores it (PT-2).

**Isolated profile homes.** A generated profile that is not shared-home runs Claude Code with its own config directory, and Claude Code keys its Keychain item by config directory (ran (probe)). That profile has no login until the user runs `claude /login` inside it. Global and shared-home profiles use the user's normal login.

**When no pass-through provider is enabled.** Apply still succeeds, and its message gains one sentence saying that Claude login mode needs the Claude subscription provider. Requests then take the normal path with the gateway key.

## Model lists and existing routes

- The pass-through provider is left out of `GET /v1/models` for every caller (`createGatewayModelsResponse`, `gateway/features/model-discovery.ts:104-115`, read) and out of Claude Desktop's list (the call of `buildClaudeAppGatewayInferenceModels` in `agents/claude-app/gateway-service.ts:161-173`, read). The filter is applied to the config those two outputs are built from. `buildClaudeAppGatewayModelRoutes` itself is not filtered, because routing and the model allowlist also read it (`gateway-routes.ts:103`, `profiles/model-allowlist.ts:2`, read). A Claude-login profile never asks for the list, and no other caller can use the provider.
- A bare model id from a Claude-login profile skips Router rules, `Router.default`, the built-in Claude Code rule and virtual model names. A virtual model named without a provider prefix therefore goes to Anthropic and fails there. That follows from PT-5, and the profile doc says it.
- Router rules, fallback chains and profile models that name the provider keep routing to it. A request that arrives there without a login gets the 400 above, and a configured fallback target is tried next. Nothing rewrites or warns about existing references. The provider's detail text and the error message say who can use it. This includes the owner's own helper-mode profiles, which stop working with this provider until they are switched to Claude login mode. The plan's local steps say so.
- The provider's own model list is no longer probed. `probeGatewayProvider` returns its input model list for this provider and makes no network call. The fork accepts any id for it, so the list only feeds LLM Router's own pickers.
- The provider keeps the name "Claude Code API". Renaming it is the owner's call and is not in this work.

## What is deleted

### Import, refresh and write-back

`packages/core/src/agents/local-providers/claude-code.ts` shrinks from 706 lines to a fixed candidate and a token-free import. Deleted from it: `scanClaudeCodeLogin`, `scanClaudeCodeKeychain`, `discoverClaudeCodeKeychainItems`, `readClaudeCodeKeychainRecord`, `keychainErrorMessage`, `claudeCredentialFiles`, `claudeCodeStorageDir`, `claudeCodeExpectedKeychainServices`, `claudeCodeKeychainAccount`, `claudeCodeKeychainStore`, `claudeCodeScanDiagnostic`, `readClaudeCodeOauth`, `claudeCodeAccessTokenExpired`, `resolveClaudeCodeAuth`, `resolveClaudeCodeAuthOrStored`, `adoptPeerRotatedClaudeCodeAuth`, `postClaudeCodeRefresh`, `claudeCodeTokenEndpoint`, `persistClaudeCodePair`, `storeBaselineOf`, `writeBackError`, `writeBackFailureReason`, `readClaudeCodeStoreRecord`, `writeClaudeCodeStoreRecord`, `credentialState`, `storeKey`, `timeoutMsFromEnv`, `resetClaudeCodeAuthStateForTest`, `ClaudeCodeRefreshAuthError`, every `ClaudeCode*` token type, the Keychain and token-endpoint constants, and the env names `LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT`, `LLMR_CLAUDE_CODE_OAUTH_REFRESH_TIMEOUT_MS` and `LLMR_CLAUDE_CODE_KEYCHAIN_WRITE_TIMEOUT_MS`. The list is from the draft, and the audit confirmed each name exists. The plan's final task ends with a search that proves none is left.

Callers and imports that go with them. The files were confirmed with a search of `packages`, `tests` and `docs/src` by the spec author. The line numbers in `executor.ts` and at `config-compiler.ts:6`, `:18`, `:21` are the audit's, and the rest were read.

| File | What goes |
|---|---|
| `agents/local-providers/service.ts:18` | The re-export of `ClaudeCodeRefreshAuthError`, `readClaudeCodeOauth`, `resolveClaudeCodeAuth`, `resolveClaudeCodeAuthOrStored` |
| `gateway/core-runtime/local-agent-auth-provider-hook.ts` | The body of `authenticateClaudeCode` (`:184-214`), replaced by the header copy. `originalAnthropicBetaDefault`, and the imports that go unused |
| `gateway/core-runtime/config-compiler.ts` | `withClaudeCodeOauthRuntimeDefaults` (`:548-573`) and its call in the chain (`:77`). `normalizeClaudeCodeOauthProviderPlugins` (`:730-763`) and its call (`:66`), replaced by a map that drops the `auth` block. The imports at `:6`, `:18`, `:21` |
| `gateway/service.ts:11` | The re-export of `normalizeClaudeCodeOauthProviderPlugins`. The facade is pinned by `packages/core/test/architecture/gateway-service-architecture.test.mjs` |
| `gateway/upstream/executor.ts` | `withClaudeCodeOauthBetaHeader` (from `:732`), its call at `:668`, `claudeCodeOauthPluginMatchesTarget` (`:759`), the imports at `:15` and `:23` |
| `gateway/internal/shared.ts:240-242` | `claudeCodeOauthBetaHeader`, `claudeCodeOauthRequiredBeta` |
| `providers/probe.ts` | The token hash at `:405`, the token injection at `:954-964`, the imports at `:18-19`. `isLocalClaudeProbe` (`:981-983`) stays and becomes the skip test |
| `providers/oauth-plugin.ts` | `mergeAnthropicBetaValues`, once its three callers are gone. `isLocalClaudeCodeOauthProviderPlugin` stays |

Tests deleted whole: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`, `packages/core/test/unit/agents/local-agent-provider-claude-code-refresh.test.mjs`, `packages/core/test/support/claude-code-keychain.mjs`, `packages/core/test/unit/gateway/gateway-claude-code-oauth.test.mjs`. Tests edited: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`, the OAuth rotation block of `packages/core/test/integration/gateway/recent-issues-wire.test.mjs:176-222`, `packages/core/test/unit/gateway/router-builtins.test.mjs:1082` and `:1108` if they depend on the removed beta merge, and the Claude rows of `tests/e2e/local-agent-login-import.spec.ts:6-22`.

UI. The import card in `providers.tsx` is generic and takes its text from the candidate (`:1486-1507`, read). `claudeCodeCandidate()` returns one fixed, importable candidate with no Keychain read, so the "detected", "expired", "no token" and "could not be read" texts (`claude-code.ts:82-137`) go. The new detail text is `Forwards the login Claude Code sends. Usable only from a Claude Code profile in Claude login mode. Nothing is stored.` The provider dialog line at `providers.tsx:2315` gets a Claude-specific wording.

### Plan-usage display (PT-4)

| File | What goes |
|---|---|
| `providers/account-service.ts` | Every Claude symbol in the file: the constants at `:111-122`, `ClaudeProfileCacheEntry` (`:73`), the two connector branches at `:190-197` and `:740-745`, `claudeOauthUsageMetersForTest` (`:279`), `isClaudeOauthUsageConnector` (`:1256`), `claudeOauthUsageResult` (`:1260`), `readClaudeAccountPlan` (`:1282`), `resetClaudeAccountPlanCacheForTest` (`:1312`), `claudeFiveHourWindowAbsent` (`:1316`), `claudeOauthUsageMeters` (`:1321`), `claudePercentMeter` (`:1374`), the plugin branch at `:1733-1735`, `localClaudeCodeAccountCredential` (`:1895`), the import at `:13` |
| `contracts/app.ts:280`, `:334` | The `"claude-oauth-usage"` parser member and the `Exclude` that names it |
| `agents/local-providers/claude-code.ts:178-195` | `claudeCodeProviderAccountConfig`. The provider is imported with no account connector |
| Tests | `packages/core/test/unit/providers/claude-oauth-usage-snapshot.test.mjs` whole. The Claude cases of `packages/core/test/unit/providers/provider-account-service.test.mjs`. The Claude snapshot fixture in `packages/ui/test/fixtures/index.ts:237-258` and its users in `packages/ui/test/component/overview-components.test.tsx:90`, `packages/ui/test/component/tray-components.test.tsx:37` and `packages/electron/test/unit/tray-balance-progress.test.ts`, each moved to a provider-neutral fixture so the generic meter code keeps its cover |

The generic meter display stays. It serves the other account connectors. Claude Code's own `/usage` is unaffected, because Claude Code calls Anthropic directly for its account data (ran (probe) for the profile call).

**Follow-up, not in this work.** Rebuild the display from the `anthropic-ratelimit-unified-*` headers on forwarded responses. It needs no token and shows nothing until a request has passed.

## The `.claude.json` guard (PT-6)

`writeClaudeCodeAutoCompactWindowsCache` (`profiles/service.ts:2388-2404`, read) writes `<settings folder>/.claude.json` through `writeFileWithBackup`. When a profile's `settingsFile` sits directly in the home folder, that file is the real `~/.claude.json`. On 2026-11-22 a settings file `~/settings.json` made an apply create or rewrite `$HOME/.claude.json`, with `.llmr-original` and `.llmr-backup-*` copies beside it (reproduced by the parent session).

The fix skips the write when the resolved folder of that file equals the resolved folder of LLM Router's runtime home or of `os.homedir()`. "Resolved" means `realpathSync.native` on the folder, with a fall back to `path.resolve` when the folder does not exist. The native form matters. Plain `realpathSync` keeps the letter case it was given, so on a case-insensitive volume a home path written in another case compared unequal and the write went through (ran (audit), ran (fix round)). A symlinked folder resolves to its target either way.

A folder that does not exist yet can equal a home folder only when the home folder itself is missing, so a new folder under an existing home is never taken for the account file and gets its cache as today. A missing `.claude.json` in the home folder is still guarded, because the check reads the path and not the file. The check is exported from `agents/claude-code/environment.ts` as `isClaudeCodeAccountFile`, so the restore side can use the same test.

The fix round ran the guard and six tests in a scratch worktree. All six failed before the guard. Each of four mutations failed exactly one test or pair. The mutations were the plain `realpathSync`, `path.resolve` alone, and each of the two home sides removed.

PR 126 chose no realpath for the opposite check in `claudeCodeConfigDir` (`agents/claude-code/environment.ts:46-51`, read). That check decides when to unset `CLAUDE_CONFIG_DIR`, and a false negative there only leaves a run pinned to a named folder, which is the safe side. Here a false negative writes the user's account file, so this check must match more paths, not fewer.

## What dotfiles and claude-multipass must be told

**No more credential access.** After this work LLM Router has no code path that reads or writes the `Claude Code-credentials` Keychain item or `.credentials.json`, and none that calls the Claude token endpoint. Today every such access is in `agents/local-providers/claude-code.ts`. The only other hits for those store names in `packages/*/src` are Grok's and ZCode's own files and two doc strings in `packages/ui/src/generated/claude-code-config-options.json` (ran (draft), ran (audit)). An architecture test keeps it true.

**Keys a Claude-login profile writes.** Names only.

| Where | Keys |
|---|---|
| `env` | `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_BASE_URL`, `CLAUDE_AGENT_API_BASE_URL` |
| `env` | `NO_PROXY`, `no_proxy`, with LLM Router's hosts appended |
| `env` | `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` |
| `env` | `ANTHROPIC_MODEL`, `LLMR_CLAUDE_CODE_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL` |
| `env` | `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, `LLMR_CLAUDE_CODE_MCP_CONFIG`, `LLMR_CLAUDE_CODE_AUTH_MODE` |
| `env` | **`ANTHROPIC_CUSTOM_HEADERS`**, new. It holds the user's own lines and one line with the gateway key in plain text |
| `env`, blank values, shared-home only | The first-party provider keys, the WIF keys and the seven model keys |
| top level and `env` | Whatever the profile's own `claudeSettings` and env name |
| top level | No `apiKeyHelper` |

Sources: `service.ts:555-583`, `:2854-2873`, `agents/claude-code/environment.ts:6-24`, `contracts/app.ts:980-983` (read). The key lists at `service.ts:105-144` were read by the draft and the audit.

**What a sync filter must do.** `ANTHROPIC_CUSTOM_HEADERS` is the one key that mixes the user's value with an LLM Router secret. A filter by key name must drop the key or drop the `x-llmr-api-key` line. The same holds for a `settings.json.llmr-backup-*` copy beside the file. `~/.claude.json` is still never written, and after PT-6 that also holds for a settings file placed directly in the home folder.

## User docs to update

- `docs/src/content/docs/en/configuration/providers.md`. The "Claude Code" section under "Import local agent login" (`:12-25`) is rewritten. The usage paragraph (item 4) and the Keychain write-back paragraph (`:23`) are removed. The new text says what is forwarded, that nothing is stored, who can use the provider, and the sentence from "Basis in Anthropic's docs".
- `docs/src/content/docs/en/configuration/profiles.md`. The "Claude Code" sections (`:41`, `:132`) gain Claude login mode: what it writes, that the gateway key sits in `settings.json`, that the model list is Claude Code's own, and that a pinned `Provider/model` still routes through LLM Router. It also says three things in plain words. A model named without a provider prefix goes to the subscription and skips Router rules and virtual models. A fallback from the subscription to another provider does not run on a limit or an error. The login passes through installed gateway plugins on its way.
- `docs/src/content/docs/en/configuration/overview.md:15` and `docs/src/content/docs/en/configuration/tray.md:15` are read again after PT-4 and changed only if they name the Claude meters.
- `README.md` gains a release-note line for the removed import and the removed plan-usage display.

## Audit findings

| Finding | Resolved in |
|---|---|
| B-1, discovery is off in Claude login mode and `auto` would apply it everywhere | PT-2. "Data shape" keeps `auto` on the helper |
| C-1, apply does not rewrite on a key change alone | "Profile settings and restore" |
| C-2, shared-home profiles drop the user's headers | "Profile settings and restore" |
| C-3, the single runtime is the default | PT-9 and "Single runtime". The audit was right that `beforeAuth` can do the swap |
| C-4, the `auto` rule needs the config | Moot under PT-2. `resolveClaudeCodeGatewayAuthMode` keeps its signature |
| C-5, the helper script stays on disk | "Profile settings and restore" |
| C-6, wrapped errors and dropped headers | PT-3 and "The fork change" |
| C-7, missed callers and imports | "What is deleted" |
| C-8, wrong citations | Every citation here was re-read or carries the pass that ran it |
| C-9, a second plaintext copy in the raw-trace spool | "Logs and traces" |
| C-10, the VM check misses the refresh and an error | Gate A in the plan |
| C-11, the UI scope and existing route rules | "Model lists and existing routes" |

The design audit was wrong on one point. Its C-5 said only the `wif` branch removes the helper script. Every apply removes it for any mode other than the helper (see "The helper script"). Its C-3 remark that the header swap "was not run" no longer holds. The fix round ran it.

### Plan audit, 2026-11-22

A second model audited this spec and the plan. The fix round read the code behind each finding. All two blockers and eighteen corrections held. The plan's table "Plan audit findings" names the task for each. The ones that changed this spec are these.

| Finding | Resolved in |
|---|---|
| B-1, a removal at the top of `beforeAuth` deletes the carried login in the child | "Removing an inbound copy" |
| B-2, the login stays in `authorization` in the single runtime for traffic that is not carried | "Single runtime" |
| C-1, C-2, the guard's letter case and its untested sides | "The `.claude.json` guard" |
| C-7, one managed-key function | "A change of only that key is written" |
| C-8, the filtered function | "Model lists and existing routes" |
| C-9, the masking pattern | "Logs and traces" |
| C-11, the front door routes through the child | "Routing and the body" |
| C-12, what the request-log database stores | "Logs and traces" |
| C-13, C-14, C-15, the flag's location, the body steps and the fallback, the deferred-tool hook | "The fork change" and "Routing and the body" |
| N-1, N-4, N-5, N-6, N-7, N-8 | "The helper script", "`autoMode`", "Data shape", "The fork change", "Model lists and existing routes" |

The fix round also found one gap neither audit named. A model id outside the provider's list did not resolve to the provider. "One predicate" has the resolver branch.

## Not in this work

- Moving the compaction windows to `modelSettings.<model>.autoCompactWindow` (PT-8).
- Rebuilding the plan-usage display from response headers (PT-4).
- Forwarding a Console API key that Claude Code sends as `x-api-key`. Only a login in `Authorization` is forwarded.
- A warning on the Routing page for rules that name the provider.
- Renaming the provider.

## Not verified

- That Anthropic accepts the forwarded login through a local hop. Gate A settles it.
- That Claude Code refreshes an expired login on its own while pointed at a gateway, and where the refresh goes. Gate A settles it.
- The design as a whole. The fix round's prototype ran the header path only. The predicate with its six rules, the router decision, the resolver branch for an id outside the provider's list, the skipped body steps and everything that needs the fork flag are unrun. Plan Tasks 4 and 5.
- What the front door's `gateway/upstream/executor.ts:203-230` does with a routed id outside the provider's list. Plan Task 4 reads it first.
- Streaming with a forwarded login. Plan Task 5.
- How the front door's own retry code treats a 429 or 401 from the child. Not read in full. Plan Task 5.
- Whether the fork records the front door's POST to the child's router route. Plan Task 5.
- Which of the fork's nine `upstream_response` sites a `/v1/messages` request can reach. Plan Task 3.
- Where a `[1m]` suffix on a listed model id is removed today. `Claude Code API/claude-sonnet-5[1m]` reached the stub as `claude-sonnet-5` (ran (fix round)), and the step was not traced.
- What Claude Code prints for the 400 no-login body, and whether a logged-out Claude Code in Claude login mode starts a session. Gate B and the probe list.
- That Claude Code sends `ANTHROPIC_CUSTOM_HEADERS` on every path LLM Router authorizes, such as `/api/claude_cli/bootstrap`. The probe saw only `/v1/messages`.
- That discovery is skipped as the docs say. Read from the docs. The probe list has the run.
- Whether Claude Code sends a `[1m]` suffix in the model id of a request. The probe list has the run.
- That the installed gateway `dist` equals the fork source byte for byte. The audit checked the version and two fragments.
- The key lists at `service.ts:105-144` were not re-read by the spec author.
- In the single runtime, whether a provider with no key of its own receives the caller's gateway key today. The fork line that would do it was read (`common.ts:128-131`). It predates this work and was not run.

## Left open

Nothing. The reliance on the gateway pages against the compliance page is the owner's reading, made with PT-1, and is stated under "Basis in Anthropic's docs".
