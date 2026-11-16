# Research: proxy key injection, retry mode and marketplace integrity

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal.** The owner wants the best design for three core behaviours before the audit-fix plan is written. I changed nothing in the repo. Paths are relative to `packages/core/`.

## 1. Answer

**(1) Proxy key injection: delete the injection instead of guarding it.**
- **Recommendation.** In gateway mode, forward the client's own credential and let the gateway authorizer validate it. The user pastes an LLMR key into the tool once.
- **Why not the proposed guard.** "Has any credential" is a speed bump. A local process sends `x-api-key: x`. A web page sends `?key=x`, which needs no CORS preflight, so that clause reopens the browser case (inferred from the Fetch rules below).
- **Threats.**

| Threat | Today | Proposed guard | Client presents LLMR key |
|---|---|---|---|
| Web page via system proxy | open | open via `?key=` unless the `Origin` check lands | closed |
| Other OS user on loopback | open | open | closed |
| Same-user process | open | open | open (it can read the config file) |

- **Other designs.**
  - `Origin` / `Sec-Fetch-Site` rejection is a real browser boundary, since both are forbidden headers. It also blocks Electron renderers and does nothing for other users.
  - `Proxy-Authorization` fails under a system proxy, because the browser authenticates too and pages ride along (inferred).
  - Per-process identification is platform-specific and racy.
  - A per-target opt-in is not a boundary.
- **Cost.** Apps signed in by OAuth with a fixed endpoint lose the key swap. If the owner wants it back, add an opt-in `proxy.injectApiKey` that also rejects `Origin`, any `Sec-Fetch-Site` other than `none`, and `?key=`.
- **Side gain.** Proxy traffic gets per-key limits and expiry. Today it all runs as the first key.

**(2) Retry mode: do not narrow the statuses. Honour `x-should-retry` and document the stacking.**
- 408, 409, 429 and 5xx is exactly the Anthropic and OpenAI SDK default (measured), so narrowing makes LLMR stricter than the baseline.
- The earlier plan's `cause.code` rule is misdirected. LLMR's fetch goes to the local core runtime, so a rejection is a loopback failure. A provider connect failure arrives as core's own 502, which a narrowed list would stop retrying (measured in the dist).
- Core already retries any fetch exception once (measured: enabled, 2 attempts, 150 ms, status list empty). LLMR sets no override. Client SDK retries multiply on top.
- A streamed response is never retried after headers arrive (measured, `executor.ts:556`).
- Double billing on 500/502/504 is undocumented. I found no official Anthropic or OpenAI statement, and third-party guides say non-streaming 5xx is generally not billed. The real case is a timeout after the provider finished.
- Idempotency keys are not available. The Anthropic SDK has none, and the OpenAI SDK sends none by default (measured).

**(3) Marketplace: require sha256. Skip signing and load-time checks.**
- With integrity the cache file is content-addressed and never overwritten. Only the no-integrity branch re-fetches over an installed file.
- The live manifest is `{"plugins": []}` (measured, HTTP 200), so nothing breaks.
- Three fixes belong with it.
  - Hash raw bytes. Today the hash covers `response.text()`, which strips a BOM, so it can differ from the documented `shasum`.
  - Write atomically.
  - Re-download when a cached file fails its hash. Today a truncated write hides the entry for good (inferred from `:247-251`).
- Load-time verification only guards against a same-user edit. Signing only pays off with an offline key.
- On failure, list the entry with Install disabled and "Integrity check failed". Today it vanishes behind a `console.warn`.
- **Separate finding, yes.** Plugins run through in-process `import()` with full Node access (`plugins/service.ts:976-980`), so permissions gate only the registration API. Listing downloads every module in the manifest before the user picks one.

## 2. Evidence

- **Injection.** `src/proxy/service.ts:1266-1276`. `primaryApiKey` has one caller (measured, grep).
- **Authorizer.** `readAuthToken` accepts every `sdkCompatibleTokenHeaderNames` header (`src/gateway/http/io.ts:63`). It reads no `?key=`.
- **Proxy purpose.** `docs/src/content/docs/en/configuration/server.md:41-56`: system proxy for apps that honour it, "primarily a desktop feature". I found no descriptive UI copy.
- **SDK auth (measured, curl of GitHub and unpkg sources).**
  - `@anthropic-ai/sdk` 1.8.0 sends `Authorization: Bearer` for `apiKey`.
  - `openai` 7.57.0 sends Bearer.
  - `@google/genai` 3.3.0 sends `x-goog-api-key` (`src/node/_node_auth.ts:11,63`).
  - Claude Code, Codex, OpenRouter, DeepSeek and Mistral were not checked. All use names the authorizer accepts (inferred).
- **SDK retry (measured).**
  - Anthropic `src/client.ts:1942-1958` and OpenAI `src/client.ts:2146-2162`: obey `x-should-retry`, else 408/409/429/>=500, `maxRetries ?? 2`, `retry-after-ms` then `retry-after`.
  - OpenAI `idempotencyHeader` is declared and never set.
  - `@google/genai` does not retry unless `retryOptions` is passed.
- **Browser headers (measured, MDN `Headers/Origin` and `Headers/Sec-Fetch-Site`).** Both are forbidden headers. `Origin` is absent on a cross-origin no-cors GET. `Sec-Fetch-Site` goes only to potentially trustworthy URLs.
- **Core runtime (measured, text read of `node_modules/@the-next-ai/ai-gateway/dist/index.js`).** `GATEWAY_UPSTREAM_RETRY_*` defaults; `stage:"upstream_connect",status:502`.
- **Retry config.** Default mode is `off` (`src/config/default-config.ts:44-48`). `retryCount` goes to 9999, bounded by `API_TIMEOUT_MS` (`executor.ts:357-361`). Docs table at `docs/.../routing.md:485-495`.
- **Marketplace.** Install copies the cache path into `plugins[].module` (`packages/ui/src/pages/home/App.tsx:2263`). Docs say "Prefer an `integrity` field" (`docs/.../extensions.md:328`).
- **Not checked.** mitmproxy, Proxyman, Charles, LiteLLM, OpenRouter, Vercel, upstream claude-code-router, npm, VS Code and Claude Code marketplaces. One LiteLLM search suggests retries are off by default.

## 3. Plan inputs

Run one file with `node build/test.mjs core && node --test .test-dist/core/test/unit/<path>.test.js`.

**PR-2, item 1 (S, net deletion).**
- `src/proxy/service.ts`: delete `:1270-1276` and `primaryApiKey` (`:1284-1290`). Keep the `config` parameter only if something else still uses it.
- `test/unit/proxy/proxy-peer.test.mjs:76`, rewrite as two tests.
  - "gateway mode forwards the client's own key unchanged". Send `authorization: Bearer sk-client`. Upstream sees exactly that and no `x-api-key`.
  - "gateway mode adds no key to a keyless request". Upstream `authorization` is undefined.
  - `proxyGet` needs a headers argument.
- `server.md:41-56`: say tools must carry an LLMR key.

**PR-7 (S).**
- `src/gateway/upstream/retry-policy.ts`: change to `shouldFallbackAfterStatus(statusCode: number, mode: RouterFallbackMode, headers?: Headers): boolean`. In `retry` mode only, `x-should-retry: false` returns false and `true` returns true. Otherwise the classifier decides.
- `src/gateway/upstream/executor.ts:504`: pass `response.headers`.
- `src/routing/failure-classifier.ts`: unchanged.
- `test/unit/gateway/upstream-executor.test.mjs`:
  - "retry mode stops when the upstream sends x-should-retry: false". A 500 with the header gives one fetch.
  - "retry mode retries a 400 that sends x-should-retry: true".
  - "model-chain ignores x-should-retry".
- `routing.md:485-495`: add the header rule and one sentence on core and client retries stacking.
- No existing test changes.

**PR-6 (S, or M with the UI message).**
- `src/plugins/marketplace.ts`:
  - `cachedMarketplaceModulePath` throws "Marketplace module must declare a sha256 integrity" when `!expectedSha256`.
  - Add `fetchBytes(url, maxBytes): Promise<Buffer>`. `fetchText` keeps the manifest.
  - `verifySha256(source: Buffer, …)`.
  - Write with `writeFileAtomic` from `src/profiles/backup-files.ts`.
  - A hash mismatch on a cached file falls through to re-download unless offline.
  - Delete `hashString` once it is unused.
- `test/unit/plugins/marketplace-manifest.test.mjs`:
  - "a module entry without integrity is skipped". `normalizeMarketplaceManifest({plugins:[{id:"x",module:"https://e.test/x.js"}]}, url, {offline:true})` returns `[]`.
  - "an app-only entry needs no integrity".
- The bytes and re-download tests need `LLMR_INTERNAL_HOME_DIR` and `HOME` pointed at a temp dir before import, per the isolated-run memory.
- `extensions.md:328`: "Prefer" becomes "Each module requires".
- Optional M: add `error?: string` to `PluginMarketplaceEntry` (`src/contracts/app.ts:1223`) and a disabled card in `packages/ui/src/pages/home/components/extensions.tsx`.

**Ordering.** None between the three. PR-6's atomic write uses a helper that already exists.

## 4. Risks and unknowns

- **(1)** A real client may depend on the swap, such as an OAuth-only app with a fixed endpoint. This is the owner's call. A list of the apps the owner routes this way settles it.
- **(2)** I could not confirm that core relays `x-should-retry` and `retry-after` on error responses. A live trace of a provider 429 through the gateway settles it. If core drops them, the PR-7 rule does nothing.
- **(2)** Billing for failed requests is unconfirmed. The check is each provider's usage console for a failed request ID.
- **(3)** `response.text()` BOM stripping is from the Fetch spec, not run here.
- I ran no repo tests, per the brief.

Skipped: the comparable-tool survey for (1) and (3), and the Claude Code and Codex header check. Risk: the (1) recommendation removes automatic key swap, so confirm with the owner before planning it.
