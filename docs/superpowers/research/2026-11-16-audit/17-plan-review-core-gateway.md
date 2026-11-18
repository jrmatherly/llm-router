# Plan review: the core gateway plan

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

Goal: the owner asked for an independent review of `docs/superpowers/plans/completed/2026-11-16-audit-core-gateway.md` (CG-1 to CG-9), checked against the code at `136ad730` and the spec, before they read it. I read the code each task changes. I ran no builds, tests or app. I ran two scratch experiments outside the repo: esbuild bundling a missing named import, and `tsc` on an unused destructured parameter.

## Verdict per PR
- **CG-1:** ready. All 11 symbols, their lines and their orphans match. Only their own definitions reference them.
- **CG-2:** ready after my fixes, with two small design notes (issues 1 and 2 below).
- **CG-3:** ready after my fixes. Every read happens before the backup and the first write, so a parse error cannot leave a half-applied takeover. The passive call sites are real: `management-server.ts` 275 to 507, `ipc.ts`, `main-app.ts:209` and `deep-link.ts:125`.
- **CG-4:** ready after my fixes. A key created in the UI is accepted at once: `appSaveApiKeys` calls `gatewayService.updateConfig`, and `authorize` reads `config.APIKEYS`. Only keys written to the database by another process can be rejected for up to 1 s. No test depends on refresh-on-miss.
- **CG-5:** ready.
- **CG-6:** ready. `InstallExtensionDialog` in `virtual-models.tsx:1291` is the right component and is exported. The only other way an errored entry could install is as a marketplace dependency, through `pluginDependencyCandidate`, and the plan closes it.
- **CG-7:** ready after my fixes. The probe fix works: a stale entry now refreshes with `cached.refreshToken`. The `account-service.ts` defect is real, so I added steps for it (see the CG-7 edit below).
- **CG-8:** ready after my anchor fix.
- **CG-9:** ready after my fixes. The real gateway answers 401 to both the keyless and the wrong-key request from `authorize` in `api-key-authorizer.ts`: "API key is missing." and "Invalid API key.". It answers 403 only when no key exists. The two new tests fail as stated before the change (`'Bearer sk-test-proxy-peer' !== 'Bearer sk-client'`, and `'Bearer sk-test-proxy-peer' !== undefined`) and pass after it. Dropping `config` is safe at all three call sites (`:947`, `:1024`, `:1143`), because only `primaryApiKey` used it.

## Edits I made

**Plan file:**
- **CG-2, IPv6 tunnel.** Build the upstream-selection URL from the bracketed hostname, because `new URL("https://::1:8443")` throws. Strip the brackets only for `net.connect`.
- **CG-2, IPv6 test.** Added `assert.equal(mitmCalls, 0)` to the IPv6 test. Without it, the test passes today through the mocked echo sink, which contradicts its own Step 2.
- **Failing-first expectations (CG-2 Task 1 and CG-4 Task 2).** The test build bundles with esbuild, and a missing named export stops the build with `No matching export ... for import "X"`. I confirmed this in scratch. I corrected both expectations and said where to add the new import.
- **CG-3 Task 1.** The tests used `paths` without defining it. It is now defined as `claudeAppPaths()`, and `readdirSync` is added to the import.
- **CG-3 Task 2.** `withGrokHome` runs `rmSync` in its own `finally`, before `t.after`. On the locked `0o500` directory that fails with EACCES. The unlock now runs in a `finally` inside the callback.
- **CG-3 Task 3.** "seven other callers" is six; I listed their lines.
- **CG-4 Task 1.** The failure count can be 10 or 11.
- **CG-8.** `routing.md` anchor `485-497` is `486-498`.
- **CG-9 Step 1.** CG-2 already makes the second `proxyGet` parameter `url`. Headers are now the third parameter, and the test calls pass `undefined` for `url`.
- **CG-9 Step 5.** `noUnusedParameters` is on, which I confirmed with `tsc`. The step now names the actual cascade (three forward functions, then `forwardRequest`, then `handleProxyRequest`). The wrong claim that the `AppConfig` import becomes unused is gone.
- **CG-9 Step 7.** The grep is scoped to `packages/core`, because `App.tsx` has an unrelated local named `primaryApiKey`.
- **CG-9 Task 2, manual check:**
  - The proxy runs on the gateway listener (`gateway-service.ts:224` calls `proxyService.attach`), so the address is `127.0.0.1:3456`, not `7890`.
  - The CA must be trusted before Proxy mode starts (`requireTrustedCertificate`), so `-k` alone is not enough.
  - The expected status is now exactly 401.
- **CG-9 docs paragraph.** Added the `api-key` header, and said that a `?key=` query parameter is not accepted.
- **CG-7.** Steps 4a to 4c add a failing-first test in `provider-account-service.test.mjs` and the same `cached?.refreshToken || refreshToken` fix in `refreshCodexAccountToken`. The defect: its cache key is the presented token, the entry stores the rotated token, and line 1941 sends the presented token again. I also updated the Files list, the commit step and Known limits.

**Index:**
- CG-1 never edits `proxy/service.ts`, so I took it off that row.
- New rows: `proxy-peer.test.mjs` and `server.md` (CG-2, CG-9), `contracts/app.ts` (CG-1, CG-6), `agents/codex/app-launch.ts` (CG-1, UL-2), `request-log-store.ts` (CG-1, CG-4, TL-1), `account-service.ts` (CG-7, TL-1), `shared/extensions.ts` (CG-6, DH-3), `layout.test.tsx` (CG-6, TL-2).

## Issues not fixed (design calls)
1. **CG-2, IPv6 through an upstream proxy.** `shouldBypassUpstreamProxy` compares `hostname === "::1"`, but `URL.hostname` keeps the brackets (`[::1]`). A tunnelled `[::1]` CONNECT therefore goes to a configured upstream proxy. Smallest fix: also match `"[::1]"`. Review Focus 5 should cover it.
2. **CG-2 Task 3, eviction and `stop()`.** An evicted server leaves `secureServers`, so `stop()` never closes it, and its live streams keep running after the proxy stops. Either keep a set of evicted servers that `stop()` closes, or state it as a known limit.
3. **CG-2 Task 2, test steps.** The setup is written as comments; only the assertions are code. That is borderline under the writing-plans rule. Acceptable, but a weak executor may improvise the fake upstream proxy.
4. **CG-3 Task 1, stray file.** The fourth test leaves its `.corrupt-` file behind, and the fifth test cleans it up. Each test should clean its own.

The program-wide title colon ("Audit remediation: ...") is left alone, since all eight plans use it. No long dashes or curly quotes. No step runs `rebuild:sqlite3`, imports or runs `ai-gateway`, uses pnpm or yarn, or touches anything outside the repo.

## Sampling
I checked about 40 claims across all nine PRs: paths, line anchors, signatures, test names and helpers, expected failures, counts and commands. 31 held. The 9 misses are the corrected items above: the port, the grep, the `AppConfig` claim, the two build-failure expectations, the IPv6 test, the Grok cleanup order, the caller count and the routing anchor.

Not verified:
- the `profiles/service.ts:3958` rename pattern
- the toolhub test anchors `:542` and `:722`
- the retry facts in CG-8 (core-runtime single retry, SDK defaults)
- whether `renderToStaticMarkup` of the custom `Dialog` outputs the button markup the regex expects
- anything at runtime

Files:
- `docs/superpowers/plans/completed/2026-11-16-audit-core-gateway.md`
- `docs/superpowers/plans/2026-11-16-audit-remediation-index.md`
