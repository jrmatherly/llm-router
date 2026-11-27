# Logs rows with no usage row (F-PRICE-10 survey)

Survey of `main` at `b504d153`, read-only, 2026-11-27. Labels: read (code read), inferred (reasoned from code read), run (executed). Nothing here was run.

## Answer

Only when the compatibility layout serves a streaming request that the client cancels or whose stream fails partway, during the cold-start window before the price catalog loads (or while it fails to load). That Logs row carries the tokens and model seen so far and gets no usage row from the host, so it waits. The Overview back-fill copies it into the usage table, and a later sweep can price it, at the next launch at the latest, unless F-PRICE-11 marks it `unpriced` first (inferred).

The single layout, which is the default, writes a usage row before every Logs row it imports, so it gives none (read).

## How the layout is chosen

`shouldUseSingleGatewayRuntime` in `packages/core/src/gateway/application/gateway-service.ts` picks the single layout when `singleGatewayRuntimeBlockers` is empty. A blocker is any of these: a gateway runtime that is off, a public gateway that is off, router fallback, media tools, browser automation MCP, plugin gateway routes or request transforms, key limits, proxy, network capture or context archive (read). Every one of these is off in `default-config.ts` (read). With a blocker, the host's `GatewayRequestPipeline.proxyRequest` (`packages/core/src/gateway/request/pipeline.ts`) serves the request and the core runtime runs behind it.

## Paths

| Path | Writes a usage row | Can carry tokens | Can wait unpriced |
|---|---|---|---|
| Single layout, any outcome. `RawTraceSynchronizer.attemptStoredBundle` (`raw-trace-sync.ts:439`) calls `recordUsageCaptureFromRawTrace` before it enqueues the standalone Logs row | Always for non-GET/HEAD. Never for GET/HEAD. Sometimes not, when the usage write throws (`recordGatewayUsageCaptureIfMissing` only warns) | Yes | No. The usage row is swept and the update reaches the Logs row. A usage row with zero tokens beside a Logs row with tokens is the exception (see below) |
| Compatibility, completed non-streaming, `!upstreamResponse.body` and buffered error branches (`pipeline.ts:1002`, `:1025`) | Always (non-GET) | Yes | No |
| Compatibility, completed stream. `recordUsage` on `meteredClientResponseBody` `end` (`pipeline.ts:1245`) | Always (non-GET) | Yes | No |
| Compatibility, client cancels mid-stream. `onClientDisconnect` calls `writeStreamLog` with the sampled body, then destroys the streams (`pipeline.ts:1151`) | Never from the host, since a destroyed stream emits no `end` (inferred). Maybe from a core runtime trace, see Not checked | Yes. `record()` reads tokens from the partial body whatever the body capture setting | Yes |
| Compatibility, stream fails partway. `onResponseStreamError` (`pipeline.ts:1164`) | Never from the host (inferred, same reason) | Yes | Yes |
| Compatibility, upstream fetch throws (`pipeline.ts:854`) | Always (non-GET), status 502 | No, empty body and no response headers from upstream | No |
| Compatibility, client gone before or at the response headers (`pipeline.ts:850`, `:920`, `:957`) | Never | No, empty body. Only billing headers could carry tokens, and none are expected before the body (inferred) | No |
| Compatibility, error body unreadable (`pipeline.ts:981`) | Never | No, empty body | No |
| Compatibility, hosted web search unavailable, 503 (`pipeline.ts:609`) | Never | No, the body is LLM Router's own error | No |
| Compatibility, GET or HEAD proxied | Never (`shouldCaptureGatewayUsage`) | No (inferred) | No |
| Refused key, both layouts. `authorize` returns before `proxyRequest` (`request-handler.ts:258`), and the core runtime's refusals go to the in-memory refused-key log | No Logs row | n/a | n/a |
| Provider connectivity check. `recordProviderConnectivityRequestLog` (`providers/probe.ts:301`) | Never | No, the body is a report with no usage fields (inferred) | No |
| Raw trace update of an existing compatibility row (`writeBatch` update branch) | `recordUsageCaptureFromRawTrace` runs first, so it adds a usage row if the host wrote none | Yes | No |
| Billing sync. `GatewayBillingSynchronizer` (`usage/billing-sync.ts:203`) | Usage row only, no Logs row | n/a | n/a |
| Back-fill from Logs. `backfillFromAttachedRequestLog` (`usage/store.ts:611`) | Adds a usage row for each Logs row with none | Yes | See below |

### The back-fill is a partial second source

`backfillFromRequestLogs` runs inside `getStats` and `getTotalsSince` (read). The desktop tray calls `getTodayUsageTotals` on each usage event, and the Overview and account usage call the other two (read). It copies a Logs row with no usage row, `cost_usd` null and `cost_source` `request_log`, which the sweep's query takes. The copy is a plain SQL insert, so it starts no sweep. A sweep starts only from `record()` of a waiting row while the catalog is due or has just landed. After the catalog loads, new rows are priced at write, so a copied row waits for the next launch's first waiting request (inferred). The sweep then resolves it by `logs.model`, the response's alias, and F-PRICE-11 (run by the PR 176 reviewer) shows that this can mark it `unpriced` in both tables for good. A copy made before the cold-start sweep queries is priced in that same sweep.

### A usage row with no tokens

The sweep skips usage rows with zero tokens. If the usage parser finds no tokens where the Logs parser does, the Logs row waits too. F-PRICE-5 is one such body shape. No real provider stream was shown to send it.

## Settings

- Request logs and agent analysis. `shouldRecordRequestLogs` is true when either is on. Both are off by default, so a default install writes no Logs rows and has no such row (read).
- Success sampling. A cancelled or failed stream is not successful, so it is always logged. Sampling does not reduce the case (read).
- Body capture. Tokens are read from the response body before the capture setting applies, so `none` and `errors` still give the row tokens (read). In the compatibility layout `buildRawTraceConfig` turns the core runtime's traces off when capture is `none` or the body limit is under 1024 bytes, which removes the one source that could add a usage row for a cancelled stream (read; whether the trace adds it is not checked).
- Layout. Any blocker listed above moves every request to the compatibility layout.

## Fix, if the case is judged common

The smallest change works on the back-fill that already exists. In `UsageStore.backfillFromAttachedRequestLog`, copy `logs.resolved_model` into `price_model` (F-PRICE-11). In `UsageStore.backfillFromRequestLogs`, call `priceUnpricedEventsAfterCatalogLoads` when the insert added rows. The sweep then prices them and sends the update to the Logs row. Not written.

## Not checked

- Whether the core runtime (`@the-next-ai/ai-gateway` 1.0.22-llmr.4) writes a raw trace bundle for a request the client aborted. In the compatibility layout such a bundle would add the usage row. In the single layout it decides whether a cancelled stream has any row at all. The package ships minified.
- That a destroyed stream emits no `end` for the `recordUsage` listener. It is inferred from Node's stream rules and not run.
- How often users run a blocker, which sets how many installs use the compatibility layout.
- How long the cold-start window lasts, and how often clients cancel streams in it.
- No test was written. The answer turns on the core runtime and on timing in the running app, which a single-file test does not reach.
