# Claude Code Login Pass-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who uses Claude Code through LLM Router with their Claude subscription keeps one login, the one Claude Code owns. LLM Router forwards it on each request and never reads, refreshes or writes it. A settings file placed directly in the home folder no longer makes LLM Router write `~/.claude.json`.

**Architecture:** One branch, one PR, nine tasks, one commit each. Task 1 is the `.claude.json` guard and stands alone. Tasks 2 to 5 build the request path. They are the gateway key header, the fork release, the routing rule and the forwarding. Task 6 adds the profile mode that makes Claude Code send the login. Task 7 is the UI. Tasks 8 and 9 delete the plan-usage display and the import. Two gates are not code. Gate A runs before any build. Gate B runs before merge.

**Tech Stack:** TypeScript, the gateway fork `@the-next-ai/ai-gateway` (Fastify), React, `node:test` with `node:assert/strict`, `vitest` in the fork.

**Status, 2026-11-23: Tasks 1 to 9 are merged.** [PR 146](https://github.com/jrmatherly/llm-router/pull/146), squash commit `b138ecbe`, on gateway fork release `v1.0.22-llmr.4`. It is not released. Gate A passed before the build. Still owed: the isolated probe runs, Gate B and the owner's local steps, all below.

As built, where it differs from the steps:

- **Predicate rule 3 changed in review.** A Claude-login request with no `Bearer` value is still routed to the pass-through provider, carrying the value `none`, and gets the no-login 400. The spec's "One predicate" has the reason.
- **Task 3.** The fork does not return the relayed response at each failure site. The failed attempt carries the upstream response, no further target is tried, and the existing tail relays it after publishing the raw trace. The trace mask also covers `bearer`, `csrf`, `jwt`, `apikey` and `signature` segments.
- **Task 4.** The front door's target selection gained a branch, because another provider that lists the same bare model id was named for a carried request.
- **Task 6.** Restore edits the custom-headers value where it sits and does not copy the `NO_PROXY` loop. A shared-home profile reads the user's lines from the user's file on every apply, and says so when that file cannot be read.
- **Task 9.** The pass-through provider's probe returns one `supported: false` entry with the message "Not checked", so the connectivity check never reports a call that did not run as verified. The pass-through provider is also found from its internal plugin entry, whose provider name ends in `::<protocol>`.
- **Not pinned by a test.** Five body-step guards in `gateway/request/pipeline.ts`: Cursor, the Codex bridges and Codex compact cannot fire on `POST /v1/messages`; web-search continuation and archive tool continuation need setup the tests do not build.
- **Open for the owner.** `.llmr-backup-*` copies of a settings file can keep a gateway key after a restore. The README heading "Upgrading to 9.0" names a version the owner has not chosen. A model id with `[1m]` reaches Anthropic unchanged, and whether Anthropic accepts it is for Gate B.

**Spec:** [`docs/superpowers/specs/2026-11-22-claude-code-login-pass-through.md`](../specs/2026-11-22-claude-code-login-pass-through.md). Decisions PT-1 to PT-11 and every `file:line` reference come from it. Read its Decisions table and its sections "The pass-through request" and "Profile settings and restore" before you start.

**Evidence status.** The plan author read the files named below at `main` `eb84a3ba` and the fork at `26e74df` on 2026-11-22 and ran nothing. A second model audited the plan. A fix round then read every cited line again and ran two throwaway prototypes in a scratch worktree, loopback only, with a `security` stand-in and a temporary home. The worktree is deleted. Claims those runs settled carry **ran (fix round)**. Everything else is **read**. No size here is measured.

What the fix round ran, in short:

- The header handling of Tasks 2, 4 and 5 in both layouts. A key in `x-llmr-api-key` with a login in `authorization` answered 200 for the pass-through provider, another provider, `count_tokens` and `GET /v1/models`. The stub saw the caller's login only on the pass-through provider.
- Three mutations of that prototype. Dropping the internal header at the top of `beforeAuth` broke the two-process layout (audit B-1). Writing the key into `authorization` only when it was absent gave 401 on all four requests in the single runtime (audit B-2). Without any drop, a forged internal header reached the stub in both layouts.
- Task 1's guard and its seven tests, with four mutations, each caught by exactly one test.

## Decisions this plan rests on

- **PT-1 to PT-8.** The owner's, 2026-11-22. Settled.
- **PT-9, PT-10.** The parent session's technical calls. Review may change them.
- **PT-11.** The spec author's calls, changeable in review without reopening the plan. They are the fork flag's name and scope, the bare-model rule, the model-list rule, no warning for existing route rules, and the spool masking.
- **Plan author and fix round, changeable in review.** The wording of every message and label below, the name of the new module, the path rule of the predicate (rule 6 in the spec), and the choice to drop the inbound internal header through the existing route-header list.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`. Fork tests are `vitest`, beside the source.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- The wire tests skip unless `LLMR_TEST_GATEWAY_ENTRY` is set (`gateway-child-env-wire.test.mjs:12-13`, read). Only CI sets it. Every command in this plan that runs a wire file or `npm run test:core` starts with `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"`. A run that reports the wire cases as skipped proves nothing.
- **Every commit leaves `npm run typecheck`, `npm run lint`, `npm run test:architecture` and the suites its task touches green.** `tsconfig.json:17-18` sets `noUnusedLocals` and `noUnusedParameters`, and Biome's unused rules are off, so `tsc` is the gate. A task that removes the last use of an import or a helper removes that import or helper in the same commit. Each task's step before the commit runs typecheck for this reason.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `gateway.md` applies to Tasks 2, 4, 5 and 9, and new protocol features go in `gateway/features/`.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before the PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`, `npm run test:electron`.
- No test, script or doc names a real provider host as a target or holds a real key or login. Stubs listen on loopback. Test values are made-up strings such as `sk-profile-key-0001` and `Bearer sk-ant-oat01-FAKE`.
- No test runs LLM Router against the real home, reads the real Keychain or contacts a real provider. **Until Task 9 lands, any test that compiles or serves a config holding a `claude-code-oauth` plugin reaches for the Keychain.** On macOS, with no config folder set, today's import asks `security` for the unsuffixed item `Claude Code-credentials` (`claude-code.ts:529-536`, `:555-566`, read), which is the developer's real login, and it can refresh and write it back. Such a test first puts a `security` stand-in that exits non-zero at the front of `PATH` and sets `CLAUDE_SECURESTORAGE_CONFIG_DIR` to a temporary folder, as `recent-issues-wire.test.mjs:177-185` does. Task 5 has the helper.
- Neither the gateway key nor the login may appear in a log line, an error message, a stored trace or a test's failure output. A test that could print one on failure compares a hash or a boolean.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word at that moment. Task 3 has the stop.
- Merging needs the owner's word.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no single task's own test covers alone. The test that pins it is named at the end.

1. A request that arrives with its own `x-llmr-caller-authorization` reaches no provider with that value, in either layout, and the two-process layout still carries the real login to the child. Task 5, Step 1, cases 1 and 5, and the mutation in Step 8.
2. A Codex key routed to the pass-through provider gets the 400 and the stub sees no request. Task 5, Step 1, case 4.
3. A Claude-login profile's request that is not carried is still authorized, and its login goes nowhere. That covers a model pinned to another provider, `count_tokens` and `GET /v1/models`. Task 2, Step 1, and Task 5, Step 1, case 6.
4. A rotated profile key reaches `settings.json` when nothing else changed, and the user's own custom headers survive apply and restore. Task 6, Steps 1 and 2.
5. With request logs and body capture on, no file under the data folder holds the login after a pass-through request. Task 5, Step 1, case 8.

## Findings this plan closes

Ids in this table are the design audit's and the PT decisions. The plan audit's ids are in the next table.

| Design audit finding or decision | Task |
|---|---|
| PT-6 | 1 |
| PT-10 | 2 |
| PT-3, C-6, C-9 | 3, wired in 5 |
| PT-5, C-3 | 4, 5 |
| PT-2, C-1, C-2, C-5 | 6 |
| B-1, C-11 | 6, 7 |
| PT-4 | 8 |
| PT-1, C-7 | 9 |
| C-10 | Gate A |
| PT-7 | Local steps for the owner |

## Plan audit findings (2026-11-22) and how each was resolved

The fix round read the code behind every Blocker and Correction. "Holds" means the finding was right.

| Finding | Verdict | Resolved in |
|---|---|---|
| B-1, the child would drop the carried login | Holds. Ran (fix round). | Task 2. The internal header joins `llmrRouteHeaderNames`, so it is removed exactly where untrusted route headers are removed and nowhere in the child. |
| B-2, the login stays in `authorization` in the single runtime | Holds. Ran (fix round). | Task 2, Step 4. A key read from `x-llmr-api-key` always replaces `authorization`. |
| C-1, a home path in another letter case | Holds. Ran (fix round). | Task 1, `realpathSync.native` and a case test |
| C-2, two guard branches without cover | Holds. Ran (fix round). | Task 1, tests 5 and 6. The doubled-separator test is gone. All tests fail before the guard. |
| C-3, the forged-header test passes today | Holds. Ran (fix round). | Task 2's unit test fails on today's code. The wire case moved to Task 5, case 5, where the header first has an effect. |
| C-4, wire tests skip locally | Holds. Read. | Global Constraints and every wire command |
| C-5, the wire config forces the single cases into two processes | Holds. Ran (fix round). | Task 5, Step 1. The context archive is on in `compat` only and is what selects that layout. |
| C-6, typecheck red until Task 9 | Holds. Read. | Global Constraints. Tasks 5 and 8 list what they leave unused and remove it. |
| C-7, one managed-key function, not two | Holds for the change check. The effect on backup pruning is inferred. | Task 6, Step 4 |
| C-8, the wrong function is filtered | Holds. Read. | Task 7 filters the two list outputs |
| C-9, the masking pattern is narrower than LLM Router's | Holds. Read. | Task 3, Step 4 |
| C-10, three more error sites | Holds. Read. The fork has nine `upstream_response` sites, three of them in `openai-json.ts`. | Task 3, Step 1 |
| C-11, the front door routes through the child | Holds. Read. | Spec "Routing and the body". Task 4 no longer deletes the header in `routeRequest`. |
| C-12, the request-log sentence | Holds. Read. | Spec "Logs and traces", and Task 5, case 8 |
| C-13, the fork flag's location | Holds. Read. | Task 5 names `config-compiler.ts:104-109` and `CoreGatewayProvider` |
| C-14, more body steps and the fallback order | Holds. Read. | Task 4, Step 7. The router decision carries `fallback: off`, so no later line can override it. |
| C-15, the deferred-tool hook | Holds. Read. It rewrites only when the user set `supportsDeferredTools: false` on the provider. | Task 4, Step 6 |
| C-16, Gate B reads a secret it does not need | Holds. | Gate B, B3 |
| C-17, probe P1 cannot isolate the custom-header rule | Holds as inferred. | Probe table, P1 and P7 |
| C-18, two conflicts with the backlog plans | Holds. Read in those plans. | "Conflicts with other plans" |
| N-1, N-2, N-4 to N-8, N-10 to N-14 | Applied. | Tasks 4, 6, 9, the gates, the spec |
| N-3, N-9 | No change needed. | |

One thing the audit did not find, found by the fix round's run. A routed id whose model is not in the provider's model list does not resolve to that provider. `ModelRegistry.resolve` matches only listed models (`routing/model-registry.ts:38-45`, read), so `Claude Code API/claude-opus-4-8` went to the first Anthropic provider and failed there (ran (fix round)). The fork flag alone does not fix this, because the choice of target happens in LLM Router's route resolver. Task 4, Step 6 adds the resolver branch.

## Conflicts with other plans

Read in the other plans on 2026-11-22 unless marked. This plan edits none of them.

- **Fork tag.** `docs/superpowers/plans/2026-11-22-backlog-harness.md` releases its own fork change as `v1.0.22-llmr.4` and edits the same two manifests and the lockfile (`:362`, `:388`, `:390`). The two plans share one rule. The tag is the next free one at the release stop. Whichever plan reaches its stop first takes `.4`. The other takes `.5`, or both ride one release if both commits are on `llmr` at that stop. Run `git -C ~/dev/llmr-gateway tag --list 'v1.0.22-llmr.*'` before you ask the owner. This plan writes the tag as `v1.0.22-llmr.N`.
- **`~/.claude.json` from the restore side.** `docs/superpowers/plans/2026-11-22-backlog-restore.md`, Task 3, adds `restoreClaudeCodeGlobalConfigCache` (`:226-231`). It returns early only for the `~/.claude` folder. For a profile whose `settingsFile` is `~/settings.json` its target is the real `~/.claude.json`. It may then remove a key from that file, delete the file, and delete `.claude.json.llmr-original` and the backups. **That function must return at once when `isClaudeCodeAccountFile(file)` is true.** Task 1 exports the helper from `agents/claude-code/environment.ts` so the restore plan can import it. Whoever builds the restore plan after this one adds that line and a test with `settingsFile: "~/settings.json"`.
- **The restore helpers.** Restore Task 3 rewrites the `NO_PROXY` loop that Task 6 copies. If it has merged, rebase and follow its shape. Reported by the audit's helper, not read again.
- **Takeover detection.** Restore's new detection keys on the helper path or the WIF rule. A Claude-login settings file has neither, so it is found only by endpoint. The restore plan needs a third signal, such as the `x-llmr-api-key` line. Reported by the audit's helper, not read again.
- **`replacePersistedApiKeys`.** The keys plan deletes it. If that plan has merged, Task 6's rotated-key test saves through whatever replaced it. Reported by the audit's helper, not read again.
- **The public branch of `beforeAuth`.** The logs and client-label plans edit the same block. The order that keeps all three correct is this. Strip untrusted headers. Resolve the key. Record a refusal. Carry the login and rewrite `authorization`. Set the auth context headers.

## Not in this plan

- Moving the compaction windows from `.claude.json` to `modelSettings.<model>.autoCompactWindow` (PT-8). Later research. The spec's "Not in this work" is the record.
- Rebuilding the plan-usage display from the `anthropic-ratelimit-unified-*` response headers (PT-4). A follow-up. The spec's "Follow-up, not in this work" is the record, and Gate A's notes feed it.
- A warning on the Routing page for rules that name the provider. Renaming the provider. Forwarding a Console key sent as `x-api-key`.

---

## Gate A, before any build

**What it decides.** Whether Anthropic accepts the login through a local hop with Claude Code's own header set, whether Claude Code refreshes an expired login by itself while pointed at a gateway, and what Claude Code does with a real 401. It uses a small relay, not LLM Router. It runs on the owner's throwaway macOS VM. **Never on the owner's own Mac.** The owner runs it, or gives his word for each step.

No build task starts until Gate A passes. Task 1 is independent of pass-through and may be built first.

**Result, 2026-11-23: passed.** The owner ran it on the VM with Claude Code 2.1.331, one patch version after the probe's 2.1.330. Every check A1 to A6 passed and no stop condition occurred.

- **Part 1.** Every `POST /v1/messages` carried the key header, the login in `Authorization`, no `x-api-key` and the OAuth beta. `/status` showed the relay URL and the claude.ai login. One request at the start of the interactive session got a 429 `rate_limit_error` with `x-should-retry` and no rate-limit headers. The next request got 200 and Claude Code showed nothing. Which request it was is not known.
- **Part 2.** With the stored login marked expired, Claude Code refreshed it by itself, wrote the new login back and got 200. No `oauth/token` path reached the relay.
- **Part 3.** A rejected token got one 401 with `x-should-retry: false`. Claude Code refreshed and sent the request again 0.75 s later, which got 200. It printed no message about the login and did not loop. The run with the wrapped error body behaved the same, so on a 401 this version acted on the status, not on the body wording.
- **Written down.** Only `HEAD /api/hello` and `POST /v1/messages?beta=true` reached the relay. `GET /v1/models` did not, with discovery switched on. `/model` listed Claude Code's own models. `/usage` showed the plan's usage with no request at the relay. Each 200 carried `anthropic-ratelimit-unified-status`, `-reset`, `-representative-claim`, `-fallback-percentage`, and the `7d` and `overage` sets of `-status`, `-reset` and `-utilization`. `/status` also reported that remote managed settings and the organization policy are not fetched with a custom base URL.

**Setup.**

1. On the VM, install Claude Code and Node 20 or later. Sign in with the subscription (`claude`, then `/login`). Confirm `claude -p "say ok"` prints an answer with no gateway.
2. Save this as `relay.mjs`.

```js
import { createServer } from "node:http";
const upstream = process.env.RELAY_UPSTREAM ?? "https://api.anthropic.com";
const port = Number(process.env.RELAY_PORT ?? 8787);
const wrap = process.env.RELAY_WRAP === "1";
const drop = new Set(["host", "connection", "content-length", "accept-encoding", "x-llmr-api-key"]);
createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) if (!drop.has(name)) headers[name] = Array.isArray(value) ? value.join(",") : value;
  const path = req.url.split("?")[0];
  console.log(new Date().toISOString(), req.method, req.url,
    "| key:", req.headers["x-llmr-api-key"] ? "PRESENT" : "MISSING",
    "| auth:", req.headers.authorization ? req.headers.authorization.slice(0, 20) : "MISSING",
    "| x-api-key:", req.headers["x-api-key"] ? "PRESENT" : "absent",
    "| oauth beta:", /(^|,)\s*oauth-/.test(req.headers["anthropic-beta"] ?? ""));
  try {
    const r = await fetch(upstream + path, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    console.log("  ->", r.status, [...r.headers.keys()].filter((name) => name.startsWith("anthropic-ratelimit") || name === "retry-after" || name === "x-should-retry").join(" "));
    if (wrap && !r.ok) {
      res.writeHead(r.status, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "All target providers failed.", attempts: [{ details: await r.text(), status: r.status }] } }));
    }
    const out = Object.fromEntries(r.headers);
    for (const name of ["content-encoding", "content-length", "transfer-encoding"]) delete out[name];
    res.writeHead(r.status, out);
    if (r.body) for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (error) {
    console.log("  -> relay error", String(error));
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "relay could not reach the upstream" } }));
  }
}).listen(port, "127.0.0.1", () => console.log(`relay on http://127.0.0.1:${port} -> ${upstream}`));
```

3. Run `node relay.mjs` in one terminal. In a second terminal set:

```sh
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_CUSTOM_HEADERS="x-llmr-api-key: vm-test-key"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

**Part 1, a normal session.** Run `claude -p "say ok"`. Then run `claude`, send two prompts, one of which makes Claude Code use a tool, then run `/status`, `/usage` and `/model`.

**Part 2, an expired login.** This makes Claude Code hold an access token it believes has expired. The `-w` form prints the whole record, so the files below hold the login. Step 7 removes them.

1. Find the item's account: `security find-generic-password -s "Claude Code-credentials" | grep acct`.
2. Save the record: `security find-generic-password -s "Claude Code-credentials" -a "<acct>" -w > ~/login-backup.json`.
3. Copy the file to `~/login-expired.json` and change only `claudeAiOauth.expiresAt` to `1000`.
4. Write it: `security add-generic-password -U -s "Claude Code-credentials" -a "<acct>" -w "$(cat ~/login-expired.json)"`.
5. Run `claude -p "say ok"` with the three variables still set. Watch the relay.
6. Read the record again into `~/login-after.json`. Compare `expiresAt` by value. Compare `accessToken` by hash, so no token is printed: `for f in backup after; do node -e 'const c=require("crypto"),r=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(c.createHash("sha256").update(r.claudeAiOauth.accessToken).digest("hex").slice(0,12), r.claudeAiOauth.expiresAt)' ~/login-$f.json; done`.
7. After Part 3, remove the files: `rm -P ~/login-*.json`.

**Part 3, a rejected login.** This produces a real 401 from Anthropic.

1. Copy the current record to `~/login-bad.json`. Change `claudeAiOauth.accessToken` to `sk-ant-oat01-not-a-real-token` and set `expiresAt` one year ahead. Keep the refresh token.
2. Write it as in Part 2, step 4. Run `claude -p "say ok"`. Watch the relay and the Claude terminal.
3. Stop the relay. Start it again as `RELAY_WRAP=1 node relay.mjs`, write `~/login-bad.json` again, and run `claude -p "say ok"` once more. This is what the fork does today, for comparison only.
4. Restore. Write `~/login-backup.json` back, or run `/login`. Unset the three variables and confirm `claude -p "say ok"` works. Then run Part 2, step 7.

**Pass, all of these.**

| # | Observation | Where |
|---|---|---|
| A1 | Every `POST /v1/messages` line in Part 1 shows `key: PRESENT`, `auth: Bearer sk-ant-oat01-`, `x-api-key: absent`, `oauth beta: true`, and is followed by `-> 200` | relay |
| A2 | Claude Code prints answers, streams, and completes the tool turn | Claude |
| A3 | `/status` shows the relay URL and the claude.ai login as the credential | Claude |
| A4 | In Part 2 the relay line is followed by `-> 200`, and step 6 shows a stored `expiresAt` in the future and a token hash that differs from the backup's | relay and Keychain |
| A5 | In Part 2 no line for a path containing `oauth/token` appears at the relay | relay |
| A6 | In Part 3, step 2, the relay shows `-> 401`, and Claude Code then either refreshes and succeeds or asks for `/login`. It does not loop | relay and Claude |

**Write down, pass or fail.** Every header name printed after `-> 200` (they feed the PT-4 follow-up). Every path other than `/v1/messages` that reaches the relay, and whether `GET /v1/models` is among them (the docs say it is not). What `/model` lists. For Part 3, the exact text Claude Code prints in step 2 and in step 3, and how many relay lines each produced.

**Fail, and what each means.**

| Observation | Meaning for the design |
|---|---|
| `-> 401` or `-> 403` on `/v1/messages` in Part 1 | Anthropic refuses this header set through a hop. Capture the response body. If it names a header or the missing `?beta=true`, the fork must forward that, and Task 3 grows. A relay on the same machine cannot be told apart from the client by address, so this is never "the hop was refused". |
| `-> 400` in Part 1 | A header and body pair broke. Capture the body. The dropped `?beta=true` is the first suspect. Same consequence as above. |
| `auth: MISSING` or `x-api-key: PRESENT` | Claude Code is not sending the subscription login. Look for `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or an `apiKeyHelper` on the VM. Not a design failure until those are ruled out. |
| `key: MISSING` on `/v1/messages` | Claude Code does not send custom headers there. PT-10 falls and the design goes back to the owner. `HEAD /api/hello` without a key is expected and is not a failure. |
| A4 fails with `-> 401` and the stored record unchanged | Claude Code does not refresh on its own behind a gateway. PT-1 cannot ship as designed. Stop and take it to the owner. |
| A5 fails | The refresh follows the base URL. LLM Router would have to relay the token endpoint, which is a new route and puts the refresh token in transit through it. Stop and take it to the owner. |
| A6 fails by looping or by a message that does not mention the login | Claude Code needs something from the 401 that the relay lost. Compare with step 3. If step 3 behaves the same, the body is not the cause. |
| Part 3, step 4 needs `/login` although the backup was restored | Expected if Anthropic rotated the refresh token in Part 2. Not a failure. |

**Not covered here, covered by Gate B.** The model id carries a provider prefix behind LLM Router and none here. A 429 at a plan limit cannot be produced on demand.

---

### Task 1: Never write the account file when a settings file sits in the home folder (PT-6)

First, because it is independent and guards a file LLM Router must never write.

Today a Claude Code profile whose `settingsFile` is `~/settings.json` makes apply write `~/.claude.json`, with a `.llmr-original` or `.llmr-original-missing` marker and `.llmr-backup-*` copies (ran (fix round)). After this task apply skips the auto-compact cache for that folder and says so, as it already does for the default `~/.claude` folder.

**Files:**
- Modify: `packages/core/src/agents/claude-code/environment.ts` (new export, beside `claudeCodeConfigDir` at `:46-51`)
- Modify: `packages/core/src/profiles/service.ts` (`writeClaudeCodeAutoCompactWindowsCache`, `:2388-2404`, and the import block at `:17`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `resolveUserPath` from `runtime/app-paths.ts`, which reads `LLMR_INTERNAL_HOME_DIR` on every call (`app-paths.ts:21-27`, `:66-74`, read), and `os.homedir()`.
- Produces: `export function isClaudeCodeAccountFile(file: string): boolean` in `environment.ts`. It is exported so the restore plan can call it (see "Conflicts with other plans").
  - It returns true when the file's name is `.claude.json` and the resolved folder of the file equals the resolved folder of `resolveUserPath("~")` or of `os.homedir()`.
  - "Resolved" means `realpathSync.native(folder)`, with `path.resolve(folder)` when that throws. The plain `realpathSync` keeps the letter case it was given, so on a case-insensitive volume `/Users/NAME` and `/Users/name` compare unequal (ran (fix round)). The native form returns the case on disk.
  - **A folder that does not exist yet** takes the `path.resolve` branch. It can then equal a home folder only when the home folder itself does not exist, and both sides took the same branch. So a missing folder under an existing home is never the account file, and apply creates it and writes the cache as today.
  - **A missing `.claude.json` in the home folder** is still the account file. The guard looks at the path, not at whether the file exists, so apply never creates it.

- [ ] **Step 1: Write the failing tests** beside the test at `profile-service.test.mjs:587`, each with `{ skip: !process.env.LLMR_INTERNAL_HOME_DIR }`. Use `defaultHomeClaudeFixture(id, { settingsFile })` (`:3330`) and `applyProfileFixture(config)` (`:3349`). Define `const accountFiles = (dir) => readdirSync(dir).filter((name) => name.startsWith(".claude.json"));`. Tests 1 and 3 to 6 share one body. Apply, then assert `applied.ok === true`, that `accountFiles(home)` deep-equals `[]`, and that the message matches `/Claude Code uses its own auto-compact windows for this profile\.$/`. Then set `profile.enabled = false`, apply again, and assert `accountFiles(home)` deep-equals `[]`.
  1. `a settings file directly in the home folder never creates ~/.claude.json`. `settingsFile: "~/settings.json"`.
  2. `a settings file directly in the home folder leaves an existing ~/.claude.json byte for byte`. Write `{"oauthAccount":{"emailAddress":"user@example.test"}}\n` first. After apply and after switch-off the text is equal and `accountFiles(home)` deep-equals `[".claude.json"]`.
  3. `a symlinked folder that resolves to the home folder is treated as the home folder`. `symlinkSync(home, path.join(home, "alias"))`, `settingsFile: path.join(home, "alias", "settings.json")`. Skip on `win32`.
  4. `a home path written in another letter case is treated as the home folder`. `const upper = path.join(path.dirname(home), path.basename(home).toUpperCase())`, `settingsFile: path.join(upper, "settings.json")`. Skip unless `upper !== home && existsSync(upper)`, which is true on macOS and Windows and false on a case-sensitive volume.
  5. `a settings file in the OS home is guarded when the runtime home is elsewhere`. Set `process.env.LLMR_INTERNAL_HOME_DIR` to a fresh `mkdtempSync` folder for the test, and `settingsFile: path.join(home, "settings.json")`. Assert `os.homedir() === home` first. Restore the variable in `finally`.
  6. `a settings file in the runtime home is guarded when the OS home is elsewhere`. Set `process.env.HOME` to a fresh `mkdtempSync` folder for the test, and `settingsFile: "~/settings.json"`. Assert `os.homedir() !== home` first. Restore the variable in `finally`. Skip on `win32`, where `os.homedir()` does not read `HOME`.
  - Each `finally` calls `restoreGlobalProfileConfigsOnExit([], { manageMarker: true })`, removes every name in `accountFiles(home)`, every `settings.json*` in the home folder, the symlink and the extra temp folder.
- [ ] **Step 2: Run them and watch all six fail.** `node build/test.mjs core && node --test --test-name-pattern="home folder|OS home|runtime home|letter case" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected today (ran (fix round)), tests 1 and 3 to 6 find `.claude.json` and `.claude.json.llmr-original-missing`, and test 2 finds `.llmr-original` and a `.llmr-backup-*` copy.
- [ ] **Step 3: Add the guard.** In `writeClaudeCodeAutoCompactWindowsCache`, after `const file = path.join(configDir, ".claude.json");`, return `{ changed: false }` when `isClaudeCodeAccountFile(file)`. The returned object has no `file`, so apply appends its existing sentence (`service.ts:622`). Add one comment line above `isClaudeCodeAccountFile` with the why. `claudeCodeConfigDir` compares without `realpath` because a miss there only keeps a run pinned, and a miss here writes the account file.
- [ ] **Step 4: Run the six tests and the neighbours.** Same command with `--test-name-pattern="home folder|OS home|runtime home|letter case|claude\\.json|auto-compact"`. Expected: all pass, including `a global Claude Code profile with its own settings file keeps CLAUDE_CONFIG_DIR and its auto-compact cache` at `:636`, which proves a folder of its own still gets the cache.
- [ ] **Step 5: Break it four times**, restoring after each. Each must fail exactly the named test (ran (fix round)).
  - Change `realpathSync.native` to `realpathSync`. Test 4 fails.
  - Change `realpathSync.native` to `path.resolve`. Tests 3 and 4 fail.
  - Remove the `os.homedir()` side. Test 5 fails.
  - Remove the `resolveUserPath("~")` side. Test 6 fails.
- [ ] **Step 6: Run `npm run typecheck` and `npm run lint`.**
- [ ] **Step 7: Commit.** `fix(claude-code): never write the account file when a settings file sits in the home folder`

### Task 2: Read the gateway key from `x-llmr-api-key`, and remove an inbound internal header

Second, because every later task relies on the key and the login arriving in separate headers.

A caller may now send the gateway key in `x-llmr-api-key` and anything else in `authorization`. Such a request is authorized by the key in both layouts, and the other value goes nowhere. A request that arrives with `x-llmr-caller-authorization` loses it at LLM Router's door.

**Files:**
- Modify: `packages/core/src/gateway/internal/shared.ts` (`sdkCompatibleTokenHeaderNames`, `:35-42`)
- Modify: `packages/core/src/gateway/core-runtime/router-plugin-contract.ts` (`llmrRouteHeaderNames`, `:52-64`)
- Modify: `packages/core/src/gateway/core-runtime/router-plugin.ts` (`beforeAuth`, `:371-402`)
- Test: `packages/core/test/unit/gateway/router-plugin.test.mjs`
- Test: `packages/core/test/integration/gateway/claude-login-pass-through-wire.test.mjs` (new)

**Interfaces:**
- Produces, in `shared.ts`: `export const llmrApiKeyHeader = "x-llmr-api-key";`. `sdkCompatibleTokenHeaderNames` gains it as its first member.
- Produces, in `router-plugin-contract.ts`: `export const llmrCallerAuthorizationHeader = "x-llmr-caller-authorization";`, added to `llmrRouteHeaderNames`.

**Why the list, and how it answers audit B-1.** `llmrRouteHeaderNames` is walked in exactly two places. `stripUntrustedLlmrRouteHeaders` at `pipeline.ts:109-125` runs at `:157` for every request the front door receives, before the `if (apiKey)` block. `stripUntrustedLlmrRouteHeaders` at `router-plugin.ts:1327-1334` runs at `:375`, inside `if (publicGatewayMode)`. The child of the two-process layout runs the same hook with `publicGatewayMode: false` (`config-compiler.ts:206`), so it removes nothing, and the header the front door carries in Task 4 arrives. A removal placed before that branch deleted it (ran (fix round)).

**Why an outside caller cannot set the header, in either layout.**
- Single runtime. The fork is the only listener and runs with `publicGatewayMode: true`. Every request passes the public branch of `beforeAuth` before anything reads the header, and the branch removes it. Step 2's unit test fails on today's code and pins it.
- Two-process layout. Every outside request passes `pipeline.ts:157`. The child does not remove the header, and does not need to. The child's key check accepts only the core token in `x-llmr-core-auth` (`config-compiler.ts:143`, `:219-221`). The front door removes that header from every inbound request (`proxyHeaderDenyList`, `shared.ts:293`, `io.ts:83-93`) and adds its own (`io.ts:112-119`). A request sent straight to the child's port without the token gets 401 before any provider hook runs. Task 5, case 5 sends that request.
- Both. Task 5, Step 8 removes the name from the list and watches the forged value reach the stub in each layout (ran (fix round) on the prototype).

**No wire test of the forged header exists in this task, on purpose.** Until Task 5 nothing reads the header, and the sanitizer drops every `x-llmr-*` name before an upstream (`upstream-header-sanitizer.ts:173`, `:204`). A wire case here would pass on today's code. The unit test in Step 2 is the one that fails today.

- [ ] **Step 1: Write the failing wire test.** Copy `send` and `startGateway(t, layout, edit)` from `gateway-child-env-wire.test.mjs:17-69`, with three changes. The upstream stub records each request's method, URL, headers and body, and answers `{"id":"msg_1","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}` with `content-type: application/json`. `send` adds `content-type: application/json` when it has a body. `startGateway` returns the recorded list. Keep the line that selects `compat` through `Router.fallback` for this task. Let `key = "sk-good-key-0001"` and `login = "Bearer sk-ant-oat01-FAKE"`. For each layout of `["single", "compat"]`, with `{ skip, timeout: 60000 }`:
  - `a gateway key in x-llmr-api-key is accepted (${layout})`. `POST /v1/messages` with `x-llmr-api-key: key`, no `authorization`, model `Provider/native`. Status 200. At the stub `x-api-key === "test-provider-secret"`, and no header is named `x-llmr-api-key` or holds `sk-good-key-0001`.
  - `a login beside the key does not replace the key (${layout})`. The same request plus `authorization: login`. Status 200. No header value at the stub contains `sk-ant-oat01`.
  - `count_tokens and the model list accept the key beside a login (${layout})`. `POST /v1/messages/count_tokens` and `GET /v1/models`, each with both headers. Status 200 for each, and the stub's request count is unchanged.
- [ ] **Step 2: Write the failing unit tests** in `router-plugin.test.mjs`, beside `LLMR router core plugin maps public API keys before gateway auth` (`:687`). Build the plugin as that test does, with `APIKEYS` holding `sk-good-key-0001`, and call `plugin.requestHooks[0].beforeAuth({ request: { headers, method: "POST", url: "/v1/messages" } })`.
  - `the public gateway removes an inbound x-llmr-caller-authorization`. `publicGatewayMode: true`, headers `{ authorization: "Bearer sk-good-key-0001", "x-llmr-caller-authorization": "Bearer forged" }`. Afterwards `"x-llmr-caller-authorization" in headers === false`. Fails on today's code (ran (fix round)).
  - `the gateway child keeps x-llmr-caller-authorization from the front door`. `publicGatewayMode: false`, same headers. Afterwards the header still equals `Bearer forged`. Passes today. It is the guard for audit B-1.
  - `a key in x-llmr-api-key replaces whatever authorization held`. `publicGatewayMode: true`, headers `{ authorization: "Bearer sk-ant-oat01-FAKE", "x-llmr-api-key": "sk-good-key-0001" }`. Afterwards `headers.authorization === "Bearer sk-good-key-0001"`, `headers["x-auth-api-key-id"]` is the key's id, and no value contains `sk-ant-oat01`.
  - `a key in authorization is left as it was`. `publicGatewayMode: true`, headers `{ authorization: "Bearer sk-good-key-0001" }`. Afterwards unchanged apart from the two `x-auth-*` headers.
- [ ] **Step 3: Run them and watch them fail.** `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/claude-login-pass-through-wire.test.js .test-dist/core/test/unit/gateway/router-plugin.test.js`. Expected: every wire case fails with 401, and the first and third unit tests fail. If the output says the wire cases were skipped, the variable is not set.
- [ ] **Step 4: Implement.** Three edits.
  - Add `llmrApiKeyHeader` and put it first in `sdkCompatibleTokenHeaderNames`. Both copies of `readAuthToken` walk that list in order (`io.ts:63-71`, `router-plugin.ts:1424-1432`), so the key wins over a login in `authorization`. `stripLocalGatewayAuthHeaders` (`io.ts:96-100`) then removes it before the child, and the sanitizer keeps it off every upstream (`upstream-header-sanitizer.ts:68-71`).
  - Add `llmrCallerAuthorizationHeader` to `llmrRouteHeaderNames`.
  - In the public branch of `beforeAuth`, after the `if (!authorization.ok)` return and before `setApiKeyAuthContextHeaders`: when `readHeader(headers, llmrApiKeyHeader)` holds a value, set `headers.authorization` to `Bearer <that value>`, **replacing whatever was there**. The reason is in the fork. In the single runtime its static check reads `authorization` first and does not know `x-llmr-api-key` (fork `src/gateway/auth.ts:613-658`, `config-compiler.ts:143`, read). A Claude Code signed in with its login always sends the login in `authorization`. Writing the key only when `authorization` was absent left the login there, and the fork answered 401 for `/v1/messages`, `count_tokens` and `/v1/models` (audit B-2, ran (fix round)). 401 is the status that makes Claude Code distrust its own login. The two-process layout needs no such line, because `pipeline.ts:164-165` removes both headers and the child is authorized by the core token.
- [ ] **Step 5: Check what the replacement can and cannot do.** Confirm by reading, and note it in the PR.
  - It runs only after `resolvePublicGatewayAuth` accepted the value in `x-llmr-api-key`, so it never turns a refused request into an accepted one.
  - After it, no header on the request holds the login. Task 4 adds the carry before this line, and only for pass-through traffic.
  - The value now in `authorization` is the gateway key. For a provider with no key of its own the fork sends the caller's bearer upstream (fork `src/adapters/builtins/common.ts:126-131`). That already happens today for a caller who sends the key in `authorization`. It is unchanged and is listed in the spec under "Not verified".
- [ ] **Step 6: Run both test files, then `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run typecheck`, `npm run lint` and `npm run test:architecture`.** Expected: all pass. The existing cases of `gateway-child-env-wire.test.mjs` and `credential-and-model-routing.test.mjs` are unchanged.
- [ ] **Step 7: Commit.** `feat(gateway): accept the gateway key in x-llmr-api-key and remove an inbound caller-authorization header`

### Task 3: Fork release with the pass-through provider flag and masked trace headers (PT-3)

Third, because Task 5's wire test needs the new fork build. Work in `~/dev/llmr-gateway` on the `llmr` branch. Nothing is pushed in Steps 1 to 6.

A provider that sets `clientCredentialPassthrough` gets the upstream's error status, body and headers relayed as they are, no forced 401 retry and no model-list check. The raw-trace spool stops holding credential header values.

**Files, in the fork:**
- Modify: `src/types.ts` (`ProviderConfig`, `:117-138`)
- Modify: `src/config.ts` (the provider parse near `:4303`, and the raw input type near `:178`)
- Modify: `src/gateway/handler.ts` (the `!upstreamResponse.ok` sites listed in Step 1, the 401 retry at `:7987-8030`, `validateModelForTarget` at `:6351-6373`, `normalizeHeadersForRawTrace` at `:9380-9392` and the `upstream_request_metadata` part at `:9444-9451`)
- Test: `src/gateway/handler.test.ts`, `src/config.test.ts`, `src/raw-trace.test.ts`

**Interfaces:**
- Produces: `ProviderConfig.clientCredentialPassthrough?: boolean`, parsed as `item.clientCredentialPassthrough === true`.
- Consumes: the existing `relayUpstreamResponseWithPayload(reply, upstreamResponse, payload)` at `handler.ts:8620`.

- [ ] **Step 1: Trace the error sites.** The fork builds a `ProviderAttemptFailure` with stage `upstream_response` in nine places (read, by search). Six are in `handler.ts`. Three are in `handleGatewayRequest` (`:909`, `:1394`, `:1870`). One is in `runTransparentToolExecutionLoop` (`:2446`), one in `handleVirtualModelRequest` (`:3110`) and one in `retryEmptyOutputResponseParseFailure` (`:6954`). Three are in `openai-json.ts` (`:636`, `:670`, `:1199`). For each, find out by reading whether a `POST /v1/messages` request, streamed or not, to a provider of type `anthropic_messages` can reach it. Nobody has traced this yet. Record the answer per site in the commit body. The flag is applied at every site such a request can reach. A site it cannot reach is left alone and named as such.
- [ ] **Step 2: Write the failing tests**, one commit per behaviour as V-22 did.
  - `a passthrough provider relays an upstream 429 with its body and headers`. Stub upstream answers 429 with body `{"type":"error","error":{"type":"rate_limit_error","message":"stub limit"}}` and headers `retry-after: 7`, `anthropic-ratelimit-unified-status: stub`, `x-should-retry: false`. The client receives status 429, a body that deep-equals the stub's, and those three headers with those values. A second target is configured and receives no request. Run it with `stream: true` as well.
  - `a passthrough provider's 401 is relayed after one upstream call`. The stub counts one request.
  - `a provider without the flag still gets the fallback envelope`. Message `All target providers failed.`
  - `a passthrough provider accepts a model id that is not in its list`. Provider `models: ["listed"]`, request model `unlisted-9`. The stub receives `unlisted-9`.
  - `the raw trace masks credential header values`. With `rawTrace.mode: "wire_raw"`, a request with `authorization: Bearer secret-1`, `x-api-key: secret-2`, `x-llmr-caller-authorization: Bearer secret-3`, `x-llmr-core-auth: secret-4`, `ocp-apim-subscription-key: secret-5`, `x-llmr-route-attempt: 2`, `x-auth-sub: key-id` and a `user-agent` writes a `client_request_metadata` part and an `upstream_request_metadata` part. In both, the five credential names are present with value `[redacted]` and no value contains `secret-`. `user-agent`, `x-llmr-route-attempt` and `x-auth-sub` keep their values, because LLM Router reads them from the trace (`raw-trace-sync.ts:1693-1699`, read, and the client-label plan).
- [ ] **Step 3: Run them and watch them fail.** `npx vitest run src/gateway/handler.test.ts src/config.test.ts src/raw-trace.test.ts`.
- [ ] **Step 4: Implement.**
  - At each site Step 1 kept, when `targetProviderConfig?.clientCredentialPassthrough` is true, publish the failed-attempt event as today and then return `relayUpstreamResponseWithPayload(reply, upstreamResponse, payload)`.
  - In the 401 retry, return the first response when the flag is set.
  - In `validateModelForTarget`, return `{ ok: true, value: model }` when the flag is set.
  - For the trace, replace a header's value with `[redacted]` when its name is `x-llmr-core-auth` or matches `/(?:^|[-_.])(authorization|cookie|credential|key|pass(?:word|wd)?|secret|token)(?:$|[-_.])/i`. Apply it in both request metadata parts and in every trace mode. Do not add a bare `auth` segment. It would mask `x-auth-sub`.
- [ ] **Step 5: Run the fork's suite.** `npm test -- --run`. Expected: all pass.
- [ ] **Step 6: Try it in LLM Router before any tag.** `npm pack` in the fork, then `npm install --no-save <tarball>` in LLM Router. Tasks 4 and 5 can be built against this. Do not commit the manifests or the lockfile in this state.
- [ ] **Step 7: STOP. Ask the owner for his word.** The push of `llmr`, the tag and the release each need it at that moment. Do not push, tag or release without it. First read "Conflicts with other plans" and list the fork's tags, so you ask for the right number. State what the release carries, each with its test: the provider flag, the trace masking, and the harness plan's commit if it is on `llmr`.
- [ ] **Step 8: Release and bump, after his word.** The recipe is Task 12, Step 4 of `docs/superpowers/plans/2026-11-21-v8-clean-vm-fixes.md`, and the commands are in `docs/superpowers/plans/completed/2026-11-18-gateway-fork.md`, which also records that this machine needs `git tag -m`. The fork's release workflow refuses a tag that does not match `package.json`, so the last fork commit is `npm version 1.0.22-llmr.N --no-git-tag-version` and `chore: release 1.0.22-llmr.N`. Then edit the gateway URL in `packages/core/package.json:19` and `packages/cli/package.json:39` and run `npm install`, which rewrites `package-lock.json`. `tests/architecture/gateway-dependency.test.mjs` pins the URL's shape.
- [ ] **Step 9: Run `npm run typecheck`, `npm run lint`, `npm run test:architecture` and `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`. Commit in LLM Router.** `fix(gateway): move to gateway 1.0.22-llmr.N, which relays a pass-through provider's errors unchanged`

### Task 4: Route pass-through traffic by one predicate and leave its body alone (PT-5)

Fourth, because the forwarding in Task 5 needs the login carried and the target chosen.

A request from a Claude-login profile that names a Claude model keeps its login inside LLM Router and is routed to the pass-through provider with its body untouched. Every other request behaves as today. No user sees a change yet, because the provider hook still supplies the stored token until Task 5.

**Files:**
- Create: `packages/core/src/gateway/features/claude-login-pass-through.ts`
- Modify: `packages/core/src/agents/claude-code/auth-mode.ts`
- Modify: `packages/core/src/gateway/request/pipeline.ts` (`:164-168`, and the body steps listed in Step 7)
- Modify: `packages/core/src/gateway/core-runtime/router-plugin.ts` (`GatewayRequestHookInput` at `:122-134`, `beforeAuth`, the deferred-tool hook at `:405-416`, `resolveLlmrGatewayRoute` at `:1138`)
- Modify: `packages/core/src/gateway/llm-router-plugin.ts` (`routeRequest`, `:70`)
- Test: `packages/core/test/unit/gateway/claude-login-pass-through.test.mjs` (new)
- Test: `packages/core/test/unit/agents/claude-code-auth-mode.test.mjs`
- Test: `packages/core/test/unit/gateway/router-builtins.test.mjs`, `packages/core/test/unit/gateway/router-plugin.test.mjs`

**Interfaces:**
- `ClaudeCodeGatewayAuthMode` becomes `"api-key-helper" | "claude-login" | "wif"`. `normalizeClaudeCodeGatewayAuthMode` maps `claude-login` and `login` to it. `"auto"` still resolves to `"api-key-helper"`. `resolveClaudeCodeGatewayAuthMode(profile)` keeps its signature. **It returns `"claude-login"` only when the profile's own env names it.** Today the preference falls back to LLM Router's process env (`auth-mode.ts:20-25`). A process-wide `LLMR_CLAUDE_CODE_AUTH_MODE=claude-login` must resolve to `"api-key-helper"`, or one variable would move every profile, against PT-2.
- Produces: `claudeLoginProviderNames(config: Pick<AppConfig, "Providers" | "providerPlugins">): string[]`, the names of enabled providers bound by a plugin for which `isLocalClaudeCodeOauthProviderPlugin` is true.
- Produces: `claudeLoginPassThroughTarget(input: { apiKey: ApiKeyConfig | undefined; config: Pick<AppConfig, "Providers" | "profile" | "providerPlugins">; headers: Record<string, unknown>; method: string; model: string | undefined; path: string }): string | undefined`. It returns `<provider name>/<model id>` when the spec's six rules hold, else `undefined`. It reads `x-llmr-api-key` and `authorization` from `headers`, so each caller calls it before it removes or rewrites them.
- Produces: `claudeLoginRoutedModel(config, model: string | undefined): string | undefined`, rule 5 alone. The predicate and the router both use it.
- Produces: `claudeLoginRouteFallback = { mode: "off", models: [], retryCount: 1 }`, the shape `replayContextArchive` uses at `pipeline.ts:1282`.

- [ ] **Step 1: Write the failing unit tests** for `claudeLoginPassThroughTarget`, with a config holding provider `Claude Code API` (`models: ["claude-sonnet-5"]`), its two plugins, a second provider `Other`, and a Claude Code profile `p1` whose env sets `LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login"`. The base input is headers `{ "x-llmr-api-key": "sk-profile-key-0001", authorization: "Bearer sk-ant-oat01-FAKE" }`, `method: "POST"`, `path: "/v1/messages"`.
  - Bare id `claude-opus-4-8`, which is not in the provider's list, returns `"Claude Code API/claude-opus-4-8"`.
  - Prefixed id `Claude Code API/claude-sonnet-5` returns itself.
  - `Other/model` returns `undefined`.
  - Key in `authorization` and no `x-llmr-api-key` returns `undefined`.
  - `authorization: "sk-ant-api-key"` with no `Bearer ` returns `undefined`.
  - A profile in helper mode, a Codex profile, and no profile each return `undefined`.
  - The provider disabled returns `undefined`.
  - `path: "/v1/messages/count_tokens"` returns `undefined`, and so does `method: "GET"`.
- [ ] **Step 2: Write the failing router tests.**
  - In `router-builtins.test.mjs`, built as its other cases build `LLMRouterPlugin` (`:29-52`). `routeRequest` with header `x-llmr-caller-authorization` set, ToolHub enabled, and a body whose system text holds an `<LLMR-SUBAGENT-MODEL>` tag (`llm-router-plugin.ts:789-790`) returns `decision.model === "Claude Code API/claude-opus-4-8"`, `decision.reason === "claude-login"`, `decision.source === "builtin"`, `decision.fallback` deep-equal to `claudeLoginRouteFallback`, and a body that deep-equals a `structuredClone` of the input taken before the call. The same body without the header is rewritten as today.
  - In `router-plugin.test.mjs`, beside `LLMR route resolver preserves the selected protocol for bare provider IDs` (`:32`). The resolver, given headers `{ "x-llmr-routed-model": "Claude Code API/claude-opus-4-8", "x-llmr-caller-authorization": "Bearer sk-ant-oat01-FAKE" }` and a body with model `claude-opus-4-8`, returns the pass-through provider's runtime name as `targetProviderName` and `model === "claude-opus-4-8"`. Without the internal header the same call returns `undefined`, as today.
  - In `router-plugin.test.mjs`. `beforeAuth` in public mode with the base headers and `request.body = { model: "claude-opus-4-8" }` leaves `headers["x-llmr-caller-authorization"] === "Bearer sk-ant-oat01-FAKE"` and `headers.authorization === "Bearer sk-profile-key-0001"`. With `body.model = "Other/model"` no header value contains `sk-ant-oat01`.
  - In `router-plugin.test.mjs`. The provider hook `llmr-deferred-tool-compatibility`, for a provider with `supportsDeferredTools: false`, returns the upstream body unchanged when `request.headers` holds the internal header, and rewrites it when it does not.
- [ ] **Step 3: Add the auth-mode cases** to `claude-code-auth-mode.test.mjs`. A profile env of `claude-login` resolves to `"claude-login"`. An unset value resolves to `"api-key-helper"`. With `process.env.LLMR_CLAUDE_CODE_AUTH_MODE = "claude-login"` and no profile value, the mode is `"api-key-helper"`.
- [ ] **Step 4: Run them and watch them fail.**
- [ ] **Step 5: Implement the predicate and the carry.**
  - Front door, `pipeline.ts`, inside `if (apiKey)` at `:164` and before `stripLocalGatewayAuthHeaders`. Call the predicate with `model: requestedModel` (`:149`). Keep the result in a local `claudeLoginTarget` declared before the block. When it is set, copy `headers.authorization` to `headers[llmrCallerAuthorizationHeader]`. The strip on the next line then removes `authorization` and the key.
  - Single runtime, the public branch of `beforeAuth`, straight before Task 2's replacement of `authorization`. Add `body?: unknown` to the `request` member of `GatewayRequestHookInput`. The fork hands the hook the Fastify request, and the body is parsed by then (ran (fix round): an object for a JSON `POST`, `undefined` for a `GET`). Read the model as `isRecord(body) ? stringValue(body.model) : undefined`. When the predicate returns a target, set the internal header from `authorization`. Task 2's line then overwrites `authorization` with the gateway key in every case.
- [ ] **Step 6: Implement the router rule, the resolver branch and the hook skip.**
  - `routeRequest`, as its first statement. When `input.headers` holds the internal header and `claudeLoginRoutedModel(this.config, body.model)` returns a target, return `{ body, decision: { diagnostics: [], fallback: claudeLoginRouteFallback, model: target, reason: "claude-login", source: "builtin", tokenCount: 0 } }` without running an enricher, a rule or a body step. Otherwise continue as today. Nothing deletes the header here. The front door reaches this function through a POST to the child that carries a copy of the headers (`pipeline.ts:411-426`, `:1300-1330`), so a delete would change only the copy. It is not needed either, because the sanitizer drops the header before any provider other than the pass-through one.
  - `resolveLlmrGatewayRoute`, before `modelRegistry.resolve`. When the request holds the internal header and the routed model's provider prefix is in `claudeLoginProviderNames(config)`, use `{ kind: "provider", model: <the id after the prefix>, provider }` as `resolved`, so the rest of the function builds the target as for any provider. The registry would return nothing for an id outside the provider's list, and the request would go to the default provider (ran (fix round)).
  - The front door's own target headers, `gateway/upstream/executor.ts:203-230`. Read it before you write the resolver branch. It resolves the routed model through the same registry to write `x-target-providers` and `x-gateway-target-provider`, and for an id outside the provider's list it resolves nothing. Confirm that it then forwards the request with `x-llmr-routed-model` intact, so the child's resolver branch picks the target. If it refuses the request or names another provider, give it the same branch. Nobody has run this path.
  - The provider hook at `:405-416`. Return the upstream unchanged when `hookInput.request?.headers` holds the internal header. Add `request?: { headers?: Record<string, HeaderValue> }` to the hook input's type.
- [ ] **Step 7: Skip the front door's body steps.** Guard each with `!claudeLoginTarget`. At `eb84a3ba` the steps are these, and `grep -n "bodyToForward = " packages/core/src/gateway/request/pipeline.ts` lists the assignments.
  - The Cursor compatibility body at `:190-194`.
  - The two discovered-model rewrites at `:230` and `:247`.
  - The Codex patch and multi-agent bridges at `:499` and `:529`, and the Codex compact step at `:717`. They act on Codex traffic, by their names. The guard makes that certain.
  - The web-search steps at `:575` and `:624`.
  - The two context-archive steps at `:652` and `:685`.
  - The plugin request transforms at `:753`.
  - The router output at `:444` is not guarded. It is `routeRequest`'s own return, which is the body it was given.
  - The fallback needs no line here. `routeFallback` takes `routed.decision.fallback` at `:434`, and `profileAllowedRouteFallback` at `:465` returns any mode other than `model-chain` as it is (`:1412-1414`).
- [ ] **Step 8: Run the test files, `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run typecheck`, `npm run lint` and `npm run test:architecture`.**
- [ ] **Step 9: Commit.** `feat(gateway): route a Claude-login request to the pass-through provider with its body untouched`

### Task 5: Forward the login the request carries, and stop supplying one

Fifth. It turns the provider hook from "supply a stored token" into "copy the caller's".

After this task a request from a Claude-login profile reaches the upstream with Claude Code's own `Authorization` and beta list, in both layouts. A caller without a login gets the 400 and its message. An imported provider no longer works for helper-mode profiles, Codex, OpenCode or Claude Desktop.

**Files:**
- Modify: `packages/core/src/gateway/features/claude-login-pass-through.ts` (the message)
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts` (`authenticateClaudeCode`, `:184-214`. Also removed in this commit, because they become unused: the imports `ClaudeCodeRefreshAuthError`, `readClaudeCodeOauth` and `resolveClaudeCodeAuth` at `:4-11`, the import at `:23`, the import at `:25`, `originalAnthropicBetaDefault` at `:487`, and `originalAuthHeaderValue` at `:498` if nothing else calls it)
- Modify: `packages/core/src/gateway/core-runtime/config-compiler.ts` (`:66`, `:77`, `:104-109`, `:548-573`, `:730-763`. Also removed: `resolveClaudeCodeAuthOrStored` from the import at `:6`, the two beta constants from `:18`, `mergeAnthropicBetaValues` from `:21`, and `configuredAnthropicBetaDefault` at `:816`)
- Modify: `packages/core/src/gateway/internal/shared.ts` (`CoreGatewayProvider`, `:12-21`)
- Modify: `packages/core/src/gateway/service.ts` (`:11`)
- Modify: `packages/core/src/gateway/upstream/executor.ts` (`:668`, `:732-775`. Also removed: the import at `:15`, and the two beta constants from the import at `:23`, which keeps `UpstreamRequestError`)
- Test: `packages/core/test/integration/gateway/claude-login-pass-through-wire.test.mjs`
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`
- Delete: `packages/core/test/unit/gateway/gateway-claude-code-oauth.test.mjs`, the only test that names the removed functions (read, by search)
- Modify: `packages/core/test/integration/gateway/recent-issues-wire.test.mjs` (`:176-222`, the OAuth rotation block is removed, and its static-key assertion at `:213-216` moves to the new wire test)

`claude-code.ts`, `agents/local-providers/service.ts:18`, `probe.ts`, `oauth-plugin.ts` and the two constants at `shared.ts:240-242` stay until Task 9. `probe.ts:18-19` and `account-service.ts:13` still import from them, and an unused export is not a typecheck error.

**Interfaces:**
- `authenticateClaudeCode(input, plugin)` reads `x-llmr-caller-authorization` from `input.request?.headers` with the file's `requestHeader` helper (`:521`). With a value starting `Bearer `, it returns the upstream request with `authorization` set to that value and the names from `originalRemoveHeaders(plugin)` removed, through `withBearerAuth`. Otherwise it returns `{ ok: false, error: claudeLoginMissingMessage }`. It adds nothing to `anthropic-beta`.
- Produces: `claudeLoginMissingMessage`, exported from the new module, with the exact text in the spec under "A caller without a login". The hook is bundled as its own runtime file (`build/test.mjs`, `runtime/local-agent-auth-provider-hook`), so keep the module's imports light.
- Produces: `withoutClaudeCodeStoredLogin(providerPlugins: unknown[]): unknown[]` in `config-compiler.ts`, which returns each Claude Code plugin without its `auth` key. It replaces `normalizeClaudeCodeOauthProviderPlugins` at `:66`, and `withClaudeCodeOauthRuntimeDefaults` is removed from the chain at `:77`.
- `CoreGatewayProvider` gains `clientCredentialPassthrough?: boolean`. In `compileCoreGatewayConfig`, the `flatMap` at `:105-107` sets it to `true` on every entry built from a provider whose `name` is in `claudeLoginProviderNames(config)`. `toCoreGatewayProviders` takes one provider and no config (`runtime-topology.ts:110`), so the flag cannot be set inside it.

- [ ] **Step 1: Write the failing wire test cases**, each for `["single", "compat"]`, in the file from Task 2.
  - **Keychain safety first.** Add a helper `withoutKeychain(t)` and call it at the top of `startGateway`. It makes a temporary folder, writes an executable `security` there that appends a line to a file `calls` beside it and exits 44, and uses `withEnv` to put the folder first on `PATH` and to set `CLAUDE_SECURESTORAGE_CONFIG_DIR` to it. Without it, Step 2 would run today's import against the developer's real Keychain item. See Global Constraints.
  - **Layout.** Replace Task 2's `Router.fallback` line. `config.contextArchive.enabled = layout === "compat"` and no router fallback. The context archive is a single-runtime blocker (`gateway-service.ts:797-802`), so it selects the two-process layout by itself (ran (fix round)), and it is one of the front door's body steps. A model-chain fallback must not be used here. With one, a 400 from the pass-through provider is answered by the fallback target with 200 (ran (fix round)), and cases 4 and 5 could not fail. `startGateway`'s own assertion on `service.server` proves each layout.
  - **Config.** Add provider `Claude Code API` (`type: "anthropic_messages"`, `api_base_url` the stub, `api_key: "llmr-local-agent-login"`, `models: ["claude-sonnet-5"]`), the plugin entry `{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API", auth: { headers: { authorization: "Bearer stored-token-0001" }, removeHeaders: ["x-api-key"], strict: true } }`, which is the shape `recent-issues-wire.test.mjs:199` uses and **holds** a stored token, a Claude Code profile `p1` in `claude-login` mode with key `sk-profile-key-0001`, and a Codex profile with key `sk-codex-key-0002`. Each key's `APIKEYS` entry has the id `profile:<profile id>`, as `defaultHomeClaudeFixture` writes it (`profile-service.test.mjs:3334`), so `profileForApiKey` finds the profile. Set `config.profile.enabled = true`. Let `loginHeaders = { authorization: "Bearer sk-ant-oat01-FAKE", "x-llmr-api-key": "sk-profile-key-0001" }` and `message = claudeLoginMissingMessage`.
  1. `a Claude-login request reaches the upstream with the caller's login`. Send `loginHeaders` plus `anthropic-beta: oauth-2025-04-20,made-up-beta-2099-01-01`, `anthropic-version: 2023-06-01`, `x-app: cli`, model `claude-opus-4-8`, a `tools` array, a `system` array with `cache_control` and an `<LLMR-SUBAGENT-MODEL>` tag, and a made-up top-level field `x_future_field: 1`. Status 200. At the stub `authorization === "Bearer sk-ant-oat01-FAKE"`, there is no `x-api-key`, `anthropic-beta` equals what was sent, no header is named `x-llmr-*` or `x-auth-*`, no value contains `sk-profile-key-0001` or `stored-token-0001`, and the body deep-equals the sent body. This is also the case that proves the child keeps the carried header (audit B-1), for `compat`.
  2. `the stored token of an earlier import is never sent, and the Keychain is not asked`. `JSON.stringify(await compileCoreGatewayConfig(config, "trace", "billing", "auth"))` does not contain `stored-token-0001`. Then start the gateway, send case 1's request, and assert the stand-in's `calls` file does not exist.
  3. `a streamed response arrives event by event`. `stream: true`, the stub sends two SSE events 200 ms apart. The client reads the first before the second is sent.
  4. `a caller without a login gets 400 and the provider is not called`. `authorization: Bearer sk-codex-key-0002`, model `Claude Code API/claude-sonnet-5`. Status 400, the stub's request count is unchanged, and `JSON.parse(response.body).error.attempts.at(-1).message.endsWith(message)`. Parse the body. The message holds double quotes, so it does not appear as written in the raw text. In `compat` the front door also appends a summary to `error.message` (`gateway/http/error-detail.ts:117-125`, ran (fix round)), which is why the assertion reads the attempt.
  5. `a request that brings its own x-llmr-caller-authorization gets 400 and the provider is not called`. Two requests. The first is case 4 plus `x-llmr-caller-authorization: Bearer forged`. The second sends `x-llmr-api-key: sk-codex-key-0002`, the same forged header and no `authorization`. Each gets status 400, the count is unchanged, and no recorded header value at the stub contains `forged`. For `compat` add a third request, sent straight to `corePort` with the first request's headers: status 401 and the count unchanged.
  6. `a Claude-login profile's request for another provider carries no login`. `loginHeaders`, model `Provider/native`. Status 200. The stub sees `x-api-key: test-provider-secret` and no value containing `sk-ant-oat01`. Then `POST /v1/messages/count_tokens` with `loginHeaders` and model `claude-opus-4-8`: status 200 and the count unchanged.
  7. `an upstream 429 reaches the caller unchanged`. The stub answers as in Task 3, Step 2. For `compat` also set `config.Router.fallback = { mode: "retry", models: [], retryCount: 3 }`. Status 429, body deep-equal, the three headers present, one request at the stub.
  8. `no file under the data folder holds the login`. With `observability.requestLogs = true` and `requestLogBodyCapture = "all"`, send case 1's request, then wait until the request's row exists in the request-log store or the raw-trace spool folder holds no bundle, polling for at most 10 s. Do not sleep a fixed time. Then a recursive read of the test home finds no file containing `sk-ant-oat01-FAKE`. It finds `sk-profile-key-0001` only in the config database and its `-wal` and `-shm` files. In `compat` this search covers the front door's own row, which stores its forwarded headers redacted by name (`pipeline.ts:364`, `request-log-store.ts:6214-6228`).
  9. `a static-key provider keeps its own key`. Moved from `recent-issues-wire.test.mjs:213-216`.
- [ ] **Step 2: Run it and watch cases 1, 2, 4, 5 and 7 fail.** Case 8 may already pass, because Task 3's masking is in place. Step 8 is what proves it can fail. `LLMR_TEST_GATEWAY_ENTRY=… node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY=… node --test .test-dist/core/test/integration/gateway/claude-login-pass-through-wire.test.js`. Expected on the code before this task (ran (fix round) for 1, 4 and 5): the stub receives `Bearer stored-token-0001` where case 1 wants the caller's login, and cases 4 and 5 get 200. Confirm the stand-in's `calls` file exists after this run, which shows the stand-in took the calls and the real `security` did not.
- [ ] **Step 3: Rewrite the hook's unit tests.** Replace the token-file cases in `local-agent-auth-provider-hook.test.mjs` with these. The header is copied. `x-api-key` is removed. A missing header returns the message. A value without `Bearer ` returns the message. The hook adds nothing to `anthropic-beta`.
- [ ] **Step 4: Implement the hook, the compile map and the flag.** Remove `withClaudeCodeOauthBetaHeader` and `claudeCodeOauthPluginMatchesTarget` from `executor.ts` with the call at `:668`. Remove the re-export at `gateway/service.ts:11`, keeping `normalizeCoreGatewayVirtualModelProfiles`, and run the architecture test that pins that file: `node build/test.mjs core && node --test .test-dist/core/test/architecture/gateway-service-architecture.test.js`.
- [ ] **Step 5: Run `npm run typecheck` and remove what it reports.** The Files list names what is expected. Typecheck must print nothing before the next step.
- [ ] **Step 6: Run `router-builtins.test.mjs`.** Its cases at `:1082` and `:1108` send `anthropic-beta: oauth-2025-04-20` themselves (read by the audit), so no change is expected. If a case fails because the merge is gone, change it to send the value from the client, which is what Claude Code does.
- [ ] **Step 7: Run the wire test, the hook test, `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run lint` and `npm run test:architecture`.** Expected: all pass in both layouts.
- [ ] **Step 8: Break it six times**, restoring after each.
  - Remove the `x-api-key` removal. Case 1 fails.
  - Remove `llmrCallerAuthorizationHeader` from `llmrRouteHeaderNames`. Case 5 fails in both layouts, with `Bearer forged` at the stub.
  - Move the removal of the internal header to the first line of `beforeAuth`, before the `publicGatewayMode` branch. Case 1 fails for `compat` only.
  - Change Task 2's replacement of `authorization` to run only when the header is absent. Cases 1 and 6 fail for `single` with 401.
  - Drop the fork flag from the compiled provider. Case 7 fails. Case 1 is expected to fail too, because `claude-opus-4-8` is not in the provider's list.
  - Install the fork build from before Task 3 for one run. Case 8 fails, with the login in a spool file. Reinstall the new build.
- [ ] **Step 9: Commit.** `feat(gateway): forward the login a Claude-login request carries and store none`

### Task 6: The Claude login auth mode writes `ANTHROPIC_CUSTOM_HEADERS` (PT-2)

Sixth, because it is what makes a real Claude Code send the two headers Tasks 2 to 5 handle.

A Claude Code profile in Claude login mode gets the gateway key as one line of `ANTHROPIC_CUSTOM_HEADERS` and no `apiKeyHelper`. The user's own custom headers are kept on apply and on restore. The helper script leaves the disk.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`applyClaudeCodeProfile` `:500-636`, `claudeCodeManagedSettingsEnvKeys` `:2854`, `withoutManagedClaudeCodeEnv` `:4008`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces, private: `claudeCodeCustomHeadersWithGatewayKey(current: string | undefined, token: string): string` and `claudeCodeCustomHeadersWithoutGatewayKey(current: string): string`. Lines split on `\n` and `\r\n`. A line is LLM Router's when its name, trimmed and lower-cased, is `x-llmr-api-key`. The first function appends `x-llmr-api-key: <token>` after the user's lines.
- The cleanup condition at `:586` is not changed. Every apply starts with `cleanupInactiveClaudeCodeGeneratedFiles` (`:2983-3007`, read), which removes the helper script of any profile that is not in helper mode. So a profile switched to Claude login loses the script without a change there.

- [ ] **Step 1: Write the failing apply tests.** Each uses a profile with `env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" }`.
  - `Claude login mode writes the gateway key as a custom header and no apiKeyHelper`. Global profile. After apply `settings.env.ANTHROPIC_CUSTOM_HEADERS === "x-llmr-api-key: <profile key>"`, `"apiKeyHelper" in settings === false`, and `settings.env.ANTHROPIC_AUTH_TOKEN` and `settings.env.ANTHROPIC_API_KEY` are undefined.
  - `Claude login mode keeps the user's own custom headers`. `beforeApply` writes `env.ANTHROPIC_CUSTOM_HEADERS: "X-Org-Route: prod\nX-Tenant: example"`. After apply the value is `"X-Org-Route: prod\nX-Tenant: example\nx-llmr-api-key: <profile key>"`. A second apply leaves the file byte for byte.
  - `a rotated profile key alone rewrites the settings`. Apply, change only the profile's key in `config.APIKEYS`, apply again. The value ends with the new key and no line holds the old one.
  - `a shared-home profile carries the user's own custom headers`. A generated profile with `claudeCodeSharedHome: true`, and the user's `settings.json` holding `X-Org-Route: prod`. LLM Router's file holds both lines, and the user's file is byte for byte unchanged.
  - `switching from the helper to Claude login removes the helper script`. Apply in helper mode, assert `CONFIGDIR/bin/llmr-claude-code-api-key-<slug>` exists, switch the mode, apply, assert it is gone. This passes once `claude-login` is a mode of its own, through the cleanup named under Interfaces. It is here to keep that true.
  - `Claude login mode without a pass-through provider says so`. No such provider in the config. `applied.ok === true` and the message contains `Claude login mode needs the Claude Code API provider`.
  - `a user's settings file that holds only custom headers still counts as the user's`. `beforeApply` writes a `settings.json` whose only content is `env.ANTHROPIC_CUSTOM_HEADERS: "X-Org-Route: prod"`. After apply and switch-off the file deep-equals what the user wrote.
- [ ] **Step 2: Write the failing restore tests.**
  - `a restore removes the gateway key line and keeps the user's headers`. After apply and switch-off, the value is `"X-Org-Route: prod\nX-Tenant: example"`.
  - `a restore removes the key when only the gateway key line was there`. `"ANTHROPIC_CUSTOM_HEADERS" in settings.env === false`.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="Claude login|custom header|rotated profile key|helper script" .test-dist/core/test/integration/profiles/profile-service.test.js`.
- [ ] **Step 4: Implement.**
  - In apply, after the `env` object is built at `:555-559` and only when `authMode === "claude-login"`, set the key from `env.ANTHROPIC_CUSTOM_HEADERS`. For a shared-home profile take the user's lines from the user's file at the path `:511` already builds, when LLM Router's own file and the profile env set none.
  - In every other mode, pass the current value through `claudeCodeCustomHeadersWithoutGatewayKey` and delete the key when nothing remains, so a switch back to the helper leaves no key line.
  - Add the key name to `claudeCodeManagedSettingsEnvKeys` **only**. That set feeds the change check (`:2804-2816`), which is what makes a rotated key rewrite the file. Do not add it to `isManagedClaudeCodeSettingsEnvKey` (`:2875`). That function also decides whether a whole settings file counts as LLM Router's own content (`isPureManagedClaudeCodeSettings`, `:4046-4061`, `isManagedClaudeCodeSettingsContent`, `:3972-3988`), and a file that holds only the user's custom headers must stay the user's.
  - In `withoutManagedClaudeCodeEnv`, filter the key and re-add the remaining lines, as the `NO_PROXY` loop at `:4029-4034` does.
- [ ] **Step 5: Read `backupBeforeWrite` and say in the PR what a rewrite leaves behind.** In Claude login mode `settings.json` holds the key line, so a `.llmr-backup-*` copy taken before a later rewrite can hold it too. The key already sits in plain text in `settings.json` and under `CONFIGDIR/bin`, so this adds copies and no new exposure. The spec lists it under "Where the gateway key sits". If the copies outlive a restore, name that in the PR for the owner.
- [ ] **Step 6: Run the tests, then the whole file, `npm run typecheck` and `npm run lint`.** Expected: all pass. See "Conflicts with other plans" for the restore and keys plans. If either has merged, rebase onto it and rerun.
- [ ] **Step 7: Commit.** `feat(claude-code): add the Claude login auth mode, which sends the gateway key as a custom header`

### Task 7: The profile toggle, the provider texts, and the model lists

Seventh. It makes the mode reachable and keeps a model that cannot work out of the lists.

A Claude Code profile gets a toggle "Sign in with my Claude login". The provider dialog and the import card say what the provider does. The pass-through provider's models no longer appear in `GET /v1/models` or in Claude Desktop's list.

**Files:**
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (beside the shared-home toggle at `:887-896`)
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (env-row helpers near `:1049`)
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (`:2315`)
- Modify: `packages/core/src/gateway/features/claude-login-pass-through.ts`
- Modify: `packages/core/src/gateway/features/model-discovery.ts` (`createGatewayModelsResponse`, `:104`)
- Modify: `packages/core/src/agents/claude-app/gateway-service.ts` (`applyClaudeAppGatewayConfig`, `:161-173`)
- Test: `packages/ui/test/component/profiles.test.tsx`, `packages/ui/test/component/provider-dialog-local-agent.test.tsx`
- Test: `packages/core/test/unit/gateway/claude-login-pass-through.test.mjs`

**Interfaces:**
- Produces, in `shared/profiles.ts`: `claudeLoginEnabled(envRows): boolean` and `withClaudeLogin(envRows, enabled: boolean)`, which adds or removes the row `LLMR_CLAUDE_CODE_AUTH_MODE = claude-login`.
- Produces, in the new core module: `withoutClaudeLoginProviders<T extends Pick<AppConfig, "Providers" | "providerPlugins">>(config: T): T`, a copy whose `Providers` leaves out every name in `claudeLoginProviderNames(config)`.
- **Where it is applied, and where it is not.** At the two list outputs only. `buildClaudeAppGatewayModelRoutes` is not filtered. It also feeds routing and the allowlist, through `resolveClaudeAppGatewayRouteModel` (`gateway-routes.ts:103`), `profileDeniedModel` (`model-allowlist.ts:2`) and the discovered-model rewrites in `model-discovery.ts`, and its config type has no `providerPlugins` (`gateway-routes.ts:46-47`).

- [ ] **Step 1: Write the failing UI tests** with `renderToStaticMarkup`.
  - The Claude Code profile form shows a toggle with `aria-label="Sign in with my Claude login"`, shown when `draft.surface !== "app"`.
  - Its help text is `Claude Code sends your claude.ai login and LLMR forwards it to Anthropic without storing it. The model list is Claude Code's own. The gateway key is written to settings.json.`
  - `withClaudeLogin(rows, true)` then `claudeLoginEnabled` is true, and `withClaudeLogin(rows, false)` removes the row and keeps the others.
  - The provider dialog for a `claude-code` candidate shows `This provider forwards the login Claude Code sends. Nothing is stored.` in place of the line at `:2315`. Update the assertion at `provider-dialog-local-agent.test.tsx:31`.
- [ ] **Step 2: Write the failing core tests.** `createGatewayModelsResponse(config, headers, apiKey)` for a config with the pass-through provider and `Other` lists `Other`'s models and none whose id starts with `Claude Code API/`. Assert it for a Claude Code user agent, for a plain one and for a Claude Desktop key. `withoutClaudeLoginProviders` leaves a config without such a provider deep-equal. `resolveClaudeAppGatewayRouteModel` for a pass-through model id returns what it returned before this task.
- [ ] **Step 3: Run them and watch them fail.**
- [ ] **Step 4: Implement.** In `createGatewayModelsResponse`, pass `withoutClaudeLoginProviders(config)` to the three response builders. In `applyClaudeAppGatewayConfig`, pass the filtered config to `hasAvailableGatewayModels` at `:162` and to `buildClaudeAppGatewayInferenceModels` at `:170`, so a config whose only provider is the pass-through one gets the existing no-models message and not an empty list.
- [ ] **Step 5: Look at it.** `npm run dev:electron`, open a Claude Code profile, switch the toggle, save, and confirm the env row appears and disappears. This is a visual check and is not covered by a test.
- [ ] **Step 6: Run `npm run test:ui`, `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run typecheck` and `npm run lint`.**
- [ ] **Step 7: Commit.** `feat(ui): add the Claude login toggle and leave the pass-through provider out of the model lists`

### Task 8: Delete the Claude plan-usage display (PT-4)

Eighth, before the import goes, because it is the last reader of the stored token outside the provider probe.

The 5-hour, weekly and plan-name meters for the Claude subscription disappear from the provider list, the tray and the account panels. Claude Code's own `/usage` is unchanged.

**Files:**
- Modify: `packages/core/src/providers/account-service.ts` (every Claude symbol, listed in the spec under "Plan-usage display", and `resolveClaudeCodeAuthOrStored` from the import at `:13`)
- Modify: `packages/core/src/contracts/app.ts` (`:280`, `:334`)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (`claudeCodeProviderAccountConfig`, `:178-195`, its use at `:163`, and the `ProviderAccountConfig` type import if nothing else in the file uses it)
- Delete: `packages/core/test/unit/providers/claude-oauth-usage-snapshot.test.mjs`
- Modify: `packages/core/test/unit/providers/provider-account-service.test.mjs`, `packages/ui/test/fixtures/index.ts` (`:237-258`), `packages/ui/test/component/overview-components.test.tsx` (`:90`), `packages/ui/test/component/tray-components.test.tsx` (`:37`), `packages/electron/test/unit/tray-balance-progress.test.ts`

- [ ] **Step 1: Write the failing check.** Add to `packages/core/test/unit/providers/provider-account-service.test.mjs`: `an imported Claude Code provider has no account connector`, asserting the provider returned by `importLocalAgentProvider` for the Claude candidate has no `account` key. Until Task 9 that import reads the login, so run it inside the existing `withKeychainLogin` helper of `packages/core/test/support/claude-code-keychain.mjs`, which stands in for the Keychain.
- [ ] **Step 2: Move the UI and Electron fixtures first.** Rename the Claude snapshot fixture to a provider-neutral one (provider `Example Provider`, meter ids `example_five_hour_quota` and `example_weekly_quota`) and update the three test files, so the generic meter code keeps its cover. Run `npm run test:ui` and `npm run test:electron`. Expected: pass, before any source change.
- [ ] **Step 3: Delete the source.** Remove the symbols and both connector branches. Remove the parser member and simplify the `Exclude` at `contracts/app.ts:334`.
- [ ] **Step 4: Prove nothing is left.** `git grep -n -i "claude" packages/core/src/providers/account-service.ts` prints nothing. `git grep -n "claude-oauth-usage\|oauth/usage\|oauth/profile" -- packages` prints nothing.
- [ ] **Step 5: Run `npm run typecheck` and remove every import or helper it reports as unused.** Then `npm run lint`, `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run test:ui`, `npm run test:electron`.
- [ ] **Step 6: Commit.** `feat(providers)!: remove the Claude plan-usage display`

### Task 9: Remove the import, the refresh and the write-back (PT-1)

Last, because every caller of the token code except the probe is gone by now.

LLM Router no longer reads the Keychain item or `.credentials.json` and no longer calls the token endpoint. Adding the provider needs no login on the machine at that moment.

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (shrinks to `claudeCodeCandidate` and `importClaudeCodeProvider`)
- Modify: `packages/core/src/agents/local-providers/service.ts` (`:18`)
- Modify: `packages/core/src/providers/probe.ts` (`:18-19`, `:405`, `:954-964`, `:981-983`)
- Modify: `packages/core/src/providers/oauth-plugin.ts` (remove `mergeAnthropicBetaValues`, whose last caller is `probe.ts:962`)
- Modify: `packages/core/src/gateway/internal/shared.ts` (`:240-242`)
- Delete: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`, `packages/core/test/unit/agents/local-agent-provider-claude-code-refresh.test.mjs`, `packages/core/test/support/claude-code-keychain.mjs`
- Modify: `packages/core/test/unit/providers/provider-account-service.test.mjs` (Task 8's test drops the Keychain helper)
- Create: `tests/architecture/claude-login-not-stored.test.mjs`
- Create: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs` (new, small)
- Modify: `tests/e2e/local-agent-login-import.spec.ts` (`:6-22`)
- Modify: `docs/src/content/docs/en/configuration/providers.md`, `docs/src/content/docs/en/configuration/profiles.md`, `README.md`

**Interfaces:**
- `claudeCodeCandidate(): LocalAgentProviderCandidate` returns one fixed object: `id: "claude-code-api"`, `kind: "claude-code"`, `name: "Claude Code API"`, `protocol: "anthropic_messages"`, `models: ["claude-sonnet-5"]`, `importable: true`, `status: "available"`, no `sourceFile`, and `detail: "Forwards the login Claude Code sends. Usable only from a Claude Code profile in Claude login mode. Nothing is stored."`
- `importClaudeCodeProvider(candidate, providerNames)` returns the provider and two plugin entries with keys ending `-claude-code-oauth` and `-claude-code-oauth-internal`, each with no `auth` key.
- `probeGatewayProvider(request)` returns `{ models: request.models ?? [], normalizedBaseUrl: request.baseUrl.trim(), protocols: [] }` with no network call when `isLocalClaudeProbe(request.apiKey, request.providerPlugins ?? [])`. Before you write it, check `GatewayProviderProbeResult` (`contracts/app.ts:634-647`) and one UI caller for what an empty `protocols` shows, and fill it with the `anthropic_messages` entry the caller expects if an empty list reads as a failure.

- [ ] **Step 1: Write the failing architecture test** `tests/architecture/claude-login-not-stored.test.mjs`. It reads every file under `packages/*/src` except `packages/ui/src/generated/` and fails when one contains `Claude Code-credentials`, `.claude/.credentials.json`, `claudeAiOauth`, `platform.claude.com/v1/oauth/token` or `oauth-2025-04-20`. It does not match `.credentials.json` alone, because Grok's and ZCode's own files use that name.
- [ ] **Step 2: Write the failing unit tests** in the new small file. Each test first puts a `security` stand-in that records its calls at the front of `PATH`, because the code under test still reads the Keychain until Step 4. `claudeCodeCandidate()` is importable with a temp home that holds no login, and the stand-in's record stays empty. `importClaudeCodeProvider` returns plugins whose JSON holds no `authorization` key. `probeGatewayProvider` for the provider leaves a loopback stub's request count at zero.
- [ ] **Step 3: Run them and watch them fail.** `npm run test:architecture` and the single core file.
- [ ] **Step 4: Delete.** Remove everything in the spec's list under "Import, refresh and write-back" that Task 5 did not already remove. Delete the three old test files.
- [ ] **Step 5: Prove nothing is left.** This prints nothing:

```sh
git grep -n -E "readClaudeCodeOauth|resolveClaudeCodeAuth|ClaudeCodeRefreshAuthError|claudeCodeAccessTokenExpired|resetClaudeCodeAuthStateForTest|normalizeClaudeCodeOauthProviderPlugins|withClaudeCodeOauthRuntimeDefaults|withClaudeCodeOauthBetaHeader|claudeCodeOauth(BetaHeader|RequiredBeta)|LLMR_CLAUDE_CODE_(OAUTH|KEYCHAIN)" -- packages tests docs/src
```

- [ ] **Step 6: Update the e2e spec.** The candidate at `local-agent-login-import.spec.ts:8-12` takes the new detail text, and the plugin fixture at `:22` loses its `auth` block. Run `npm run test:e2e`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
- [ ] **Step 7: Update the user docs** as the spec's "User docs to update" lists. `providers.md:12-25` is rewritten and the paragraph at `:23` is removed. `profiles.md` gains Claude login mode under both "Claude Code" headings, with the three sentences the spec names there. `README.md` gains the release-note line. Read `configuration/overview.md:15` and `configuration/tray.md:15` and change them only if they name the Claude meters.
- [ ] **Step 8: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY=… npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli`.
- [ ] **Step 9: Commit.** `feat(providers)!: stop importing and refreshing the Claude Code login`

---

## Isolated probe runs on this Mac

These need only the Claude Code binary and a loopback stub. The harness is the one in the probe report: `env -i` with a fresh `mktemp -d` home, a `security` stand-in first on `PATH`, `CLAUDE_CONFIG_DIR` set inside the temp home, a refusing loopback proxy, and `sandbox-exec` denying all outbound network except localhost. Record the safety readings (settings hash, `~/.claude.json` sizes, Keychain item modification time) before and after. LLM Router is not run. Run them before Task 6 where they can change it.

| # | Run | What it settles |
|---|---|---|
| P1 | Fake login, base URL, `ANTHROPIC_CUSTOM_HEADERS="x-llmr-api-key: k"`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, with `--debug-file`. Run it **without** the harness's `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which may switch discovery off by itself. Then run a positive control with `ANTHROPIC_AUTH_TOKEN=k` in place of the custom header, where the stub should see `GET /v1/models`. | Whether `GET /v1/models` reaches the stub. The docs say no, with a `[gatewayDiscovery] skipped` line in the debug log. This is the fact PT-2 rests on. The result counts only if the control shows the request. |
| P2 | Settings `env.ANTHROPIC_CUSTOM_HEADERS` set to `X-Org-Route: prod\nx-llmr-api-key: k` | That both headers arrive from a settings file with the `\n` join Task 6 writes. |
| P3 | Fake login with `expiresAt` in the past | Where the refresh goes. It is a `CONNECT` at the proxy, or a request at the stub. It also shows whether the stand-in sees a write. This is Gate A, Part 2, without a real login. |
| P4 | The stub answers every `POST /v1/messages` with 400 and the no-login body from the spec | What Claude Code prints and its exit code. Decides whether the message needs an Anthropic-shaped envelope. |
| P5 | The stub answers 401 with `{"type":"error","error":{"type":"authentication_error","message":"stub"}}` | Whether Claude Code tries a refresh (proxy log) and how many times it calls the stub. |
| P6 | `--model "claude-opus-4-8[1m]"`, then `ANTHROPIC_MODEL="Claude Code API/claude-sonnet-5"` | The exact model id in the request body in each case. Task 4's resolver branch forwards the id after the provider prefix as sent. |
| P7 | No login at all, base URL and the custom header set. The probe's `security` stand-in returns the fake login for the `-credentials` item today, so first change it to exit non-zero for that item. | Whether Claude Code starts a session and sends a request without `Authorization`, or stops and asks for `/login`. |

P4 and P5 need the probe's `stub.mjs` to take a status and a body from its arguments.

### Results, 2026-11-24

All eight ran on Claude Code 2.1.330 in `-p` mode, after PR 146 merged, so none changed Task 6. P8 is the run the follow-ups plan adds. The stub accepts every request, so no row says what Anthropic accepts. The safety readings were the same before and after.

| # | Result (ran) |
|---|---|
| P1 | No `GET /v1/models` reached the stub. The debug log has `[gatewayDiscovery] skipped: no credential (ANTHROPIC_AUTH_TOKEN, apiKeyHelper, or API key)`. The control with `ANTHROPIC_AUTH_TOKEN` sent `GET /v1/models?limit=1000`, so the result counts and the fact PT-2 rests on holds |
| P2 | Both headers arrived from the settings file, beside the login |
| P3 | The refresh went to `platform.claude.com:443` at the proxy and never to the stub. The stand-in saw one write-check item and no write of the login. After the failed refresh Claude Code sent the expired login to the stub once |
| P4 | Claude Code prints `API Error: 400` and the message in full, and exits 1. The same line appears with and without Anthropic's error envelope, so the message needs none. One prompt made six requests within 20 ms, the later ones with one or two beta values removed |
| P5 | Two requests at the stub and two refresh attempts at the proxy. It prints `Failed to authenticate. API Error: 401 stub` and exits 1 |
| P6 | `--model "claude-opus-4-8[1m]"` arrived as `claude-opus-4-8`. `ANTHROPIC_MODEL="Claude Code API/claude-sonnet-5"` arrived as set. Two more runs put `[1m]` on `ANTHROPIC_MODEL`, once in a settings file with the provider prefix and once in the process environment. Both arrived without the suffix, and no run added a `context-1m` beta value. So in `-p` mode Claude Code sends no suffix, which is what the "Not verified" item on the suffix asks of P6. Where LLM Router removes a suffix that another caller sends is still not traced |
| P7 | Claude Code prints `Not logged in · Please run /login` and exits 1. No request reached the stub |
| P8 | With `"ANTHROPIC_MODEL": ""` in a `--settings` file, and with an empty `ANTHROPIC_MODEL` in the process environment, the request carried `claude-opus-5-5`. A control with no `ANTHROPIC_MODEL` carried the same id. An empty value behaves as an unset one |

Not run: interactive mode, Claude Code 2.1.331, and the P4 refusal behind LLM Router, where six requests would be six rows in Logs. Gate B checks B6, G2, G3 and G7 cover these on the VM.

## Gate B, before merge

On the throwaway VM, with the branch's desktop build and the real apps. Never on the owner's own Mac.

| # | Check | Pass |
|---|---|---|
| B1 | Add the Claude Code API provider with no prior import. Create a global Claude Code profile, switch on "Sign in with my Claude login", apply. Run `claude -p "say ok"` and an interactive session with a tool turn | Answers arrive. LLM Router's Logs show the requests with provider `Claude Code API`. `/status` shows LLM Router's URL and the claude.ai login |
| B2 | Both layouts. Repeat B1 with a router fallback chain configured, which selects the two-process layout | Same result |
| B3 | `security find-generic-password -s "Claude Code-credentials" \| grep mdat` before and after an hour of use. No `-g` and no `-w`, so the secret is neither printed nor requested | Any change is at a time Claude Code itself refreshed. As a spot check only, `ps -axo pid,ppid,command \| grep security` during use shows no `security` child of LLM Router. A snapshot misses short-lived children. The proof is the architecture test of Task 9, Step 1 |
| B4 | `/model` in the Claude-login profile, pick another Claude model, send a prompt | The request succeeds with that model id |
| B5 | Pin the profile's small-fast model to another provider's model | Those requests appear in Logs under the other provider, and the others under `Claude Code API` |
| B6 | A helper-mode Claude Code profile, a Codex profile and Claude Desktop, each pointed at a `Claude Code API` model. The lists no longer offer it after Task 7, so type the model id | Each shows the no-login message. Write down how each app displays it |
| B7 | Switch the profile off | `settings.json` has no `x-llmr-api-key` line, the user's own custom headers are intact, and `claude -p "say ok"` works directly |
| B8 | With request logs and body capture on, after B1: `grep -rl "sk-ant-oat01" <LLM Router data folder>`, then `grep -rl "<the profile's gateway key>" <LLM Router data folder>` | No file for the login. For the gateway key, only the config database, its `-wal` and `-shm` files and the files under `bin/` |
| B9 | Leave a session open past the login's expiry, or repeat Gate A, Part 2, behind LLM Router | The next prompt succeeds with no `/login` |
| B10 | If a plan limit is reached during the pass | Claude Code shows its own limit message, not a generic 429. If no limit is reached, record B10 as not exercised |
| B11 | Put a settings file at `~/settings.json` in a profile and apply | `~/.claude.json` has the same hash before and after, and no `.claude.json.llmr-*` file exists in the home folder |

## Local steps for the owner

Not code, not in the diff. Each needs the owner's word at that moment.

1. **PT-7, leftover paths under `~/.codex`.** On the owner's Mac:

```sh
trash ~/.codex/.claude-code-router ~/.codex/claude-code-router.config.toml ~/.codex/claude-code-router.config.toml.llmr-original-missing ~/.codex/config.toml.pre-llmr-leak-fix-2026-10-26
```

Every `*.llmr-original` and `*.llmr-backup-*` file stays, because a restore falls back to them.

2. **The stored token of the current import, and the profiles that use it.** After the release that carries this work, remove the `Claude Code API` provider under Providers and add it again. The compile step already ignores the stored token (Task 5), and this removes it from the config database too. Then switch each Claude Code profile that should use the subscription to Claude login mode. A helper-mode profile, and any route rule that sends other callers to this provider, gets the no-login 400 from this release on.

3. **Tell dotfiles and claude-multipass** what the spec's section "What dotfiles and claude-multipass must be told" says, before the first Claude-login profile is applied on the owner's Mac. That is the new `ANTHROPIC_CUSTOM_HEADERS` key and its secret line, and that LLM Router no longer touches the Keychain item, `.credentials.json` or the token endpoint.

## Self-review

- Every PT decision and every finding of both audits has a task, a gate or a named section in the two tables above.
- Names used across tasks are the same: `llmrApiKeyHeader`, `llmrCallerAuthorizationHeader`, `claudeLoginPassThroughTarget`, `claudeLoginRoutedModel`, `claudeLoginRouteFallback`, `claudeLoginProviderNames`, `withoutClaudeLoginProviders`, `claudeLoginMissingMessage`, `clientCredentialPassthrough`, `isClaudeCodeAccountFile`, the mode value `claude-login`.
- Task 5 cannot pass before Task 3's build is installed. Task 3, Step 6 gives the unpublished route, and Step 7 is the only stop.
- Each task ends with typecheck and lint before its commit, and each task that leaves a symbol unused lists it under Files.

## Not verified

- Every item under "Not verified" in the spec.
- The fix round's prototype was not the code this plan describes. It carried the login on a simple model test, routed only a prefixed id that the provider lists, and skipped no body step. So these are still unrun: the predicate, the router decision, the resolver branch for an unlisted id, the body equality, and every case of Task 5 that depends on the fork flag.
- What the front door's `executor.ts:203-230` does with a routed id outside the provider's model list. Task 4, Step 6 reads it first.
- Where a `[1m]` suffix on a listed model id is removed today. In the fix round's run `Claude Code API/claude-sonnet-5[1m]` reached the stub as `claude-sonnet-5`, and the step that removed the suffix was not traced. Probe P6 shows whether Claude Code sends one. Task 5, case 1's body comparison would show a change to `model`.
- Which of the fork's nine `upstream_response` sites a `/v1/messages` request can reach. Task 3, Step 1.
- Whether the fork records the internal router POST, whose JSON body holds the carried header in the two-process layout, in any trace or log. Task 5, case 8 searches the data folder after such a request.
- How to wait for the trace ingestion in Task 5, case 8. The plan names the two conditions and not the function that reads them.
- That enabling the context archive leaves a carried request's body untouched once Task 4's guards are in. Task 5, case 1 for `compat` is the check.
- What an empty `protocols` list shows in the provider UI. Task 9 reads it first.
- The helper names in `packages/ui/src/pages/home/shared/profiles.ts` for env rows, beyond `keyValueRowsFromRecord` and `recordFromKeyValueRows`. Task 7.
- The fork's test commands (`npx vitest run`) were taken from its `package.json` script `test: vitest` and not run.
- The `security` commands of Gate A, Part 2, including the account name of the Keychain item. Step 1 of that part reads it.
- What `backupBeforeWrite` keeps of a Claude-login `settings.json`. Task 6, Step 5.
- The claims marked "not read again" under "Conflicts with other plans".

## Left open

Nothing.
