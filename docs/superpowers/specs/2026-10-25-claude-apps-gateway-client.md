# Claude apps gateway integration, phase 2: LLMR signs in to a gateway as a client

Date: 2026-10-25. Status: approved for planning. Follows `2026-10-25-claude-apps-gateway-integration.md` (phase 1), which left this direction out.

## Why

Phase 1 puts LLMR behind a Claude apps gateway. This phase puts a gateway behind LLMR: a developer signs LLMR in to their organization's gateway once, and every agent LLMR fronts (Codex, Kilo, OpenCode, Pi, Claude Code through a profile) reaches the organization's Claude models through that gateway, with the gateway's SSO, model policy and spend limits applied to the developer's own token. Nothing else in the estate offers Claude behind the gateway to non-Claude agents.

The gateway allows this. A gateway sign-in token identifies the developer who approved it, not the program using it, and the docs say `User-Agent` and request fields are routing hints, never proof of client. Spend and model enforcement therefore land on the developer, which is the correct accounting.

## What the gateway exposes to a client

Verified against Anthropic's overview, configuration and spend-limits pages and the two deployments on this machine on 2026-10-25.

| Call | Shape |
|---|---|
| `GET {url}/.well-known/oauth-authorization-server` | `issuer`, `device_authorization_endpoint`, `token_endpoint`, `grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]`. Confirms the host is a gateway. |
| `POST {url}/oauth/device_authorization` | No body. Returns `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in` (600 in the quickstart), `interval` (5). Per-IP rate limit, 30 per 600 s by default. |
| `POST {url}/oauth/token` | Form-encoded `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=…`. `400 {"error":"authorization_pending"}` while the browser leg is open, `slow_down` means add 5 s, `expired_token` and `access_denied` end the flow. Success returns `access_token`, `token_type: "Bearer"`, `expires_in`, `refresh_token`, and optionally `email` (not from the binary's own server today). |
| `POST {url}/oauth/token` | Form-encoded `grant_type=refresh_token&refresh_token=…`. Same success shape. A `401` or `403` means the session is gone (IdP deprovisioning or JWT secret rotation). |
| `GET {url}/v1/models` | Bearer. `data[].id` is the short canonical id (`claude-sonnet-4-6`), `data[].display_name` the label. This is the developer's allowlist, filtered by their policy. |
| `POST {url}/v1/messages`, `/v1/messages/count_tokens` | Bearer. Anthropic Messages API. A request for a model outside the allowlist returns `400`; a spend cap returns `429` with `error.type: billing_error`, `x-should-retry: false`, `retry-after`. Successful responses carry `anthropic-ratelimit-unified-*` headers describing the developer's cap. |

Sessions last `session.ttl_hours` (1 by default, 8 in both local deployments). Claude Code refreshes silently; LLMR must too.

## Decision

Add a `claude-apps-gateway` kind to the existing local-agent provider machinery instead of a new credential type. The Kimi OAuth provider is the template: a candidate list, an import that produces a `GatewayProviderConfig` plus bearer auth plugins, and a runtime hook that swaps in a fresh token per request. What differs from Kimi is that LLMR owns the sign-in and the token file, so a start/wait/cancel RPC triplet drives the device flow from the UI, modelled on the bot-gateway QR login.

Data shape, named first:

```ts
export type ClaudeAppsGatewaySession = {
  accessToken: string;
  email?: string;
  expiresAt: number;        // unix seconds
  gatewayUrl: string;       // origin only, no trailing slash
  modelDisplayNames?: Record<string, string>;
  models: string[];         // the allowlist at sign-in or last refresh
  refreshToken?: string;
  sourceFile: string;
};
```

One file per gateway host at `CONFIGDIR/claude-apps-gateway/<host-slug>.json`, mode 0600, written by temp-file-and-rename like `persistKimiAuth`. The slug is the URL host and port with every character outside `[a-z0-9.-]` replaced by `-`.

Behavior:

- **Candidates.** One per stored session, `kind: "claude-apps-gateway"`, `id: claude-apps-gateway:<slug>`, `name: Claude apps gateway (<host>)`, `protocol: "anthropic_messages"`, `models` from the file. `importable` when the access token is valid or a refresh token exists; otherwise `status: "locked"` with a detail that says to sign in again. No `missing` candidate when there are no sessions; the sign-in form is the entry point.
- **Import.** Refresh if expired, fetch `/v1/models` live (fall back to the stored list on failure), build the provider with `providerPayload(candidate, name, gatewayUrl)`, and two plugins from `bearerAuthPlugin("claude-apps-gateway-oauth", token, {}, providerName)` carrying `claudeAppsGateway: { url: gatewayUrl }`, one for the public provider name and one for the internal placeholder, as Kimi does.
- **Runtime.** `localAgentOauthKind` recognizes the `claude-apps-gateway-oauth` suffix; the hook resolves a live token from the session file for `plugin.claudeAppsGateway.url`, refreshing and persisting when expired, and falls back to the token baked into the plugin.
- **Sign-in.** `startClaudeAppsGatewayLogin({ gatewayUrl })` validates the URL, reads the discovery document, requests a device code, and returns the user code and verification links with a `sessionId`. `waitClaudeAppsGatewayLogin({ sessionId, timeoutMs })` polls the token endpoint until confirmed, the device code expires, or `timeoutMs` (default 20 000, so the RPC returns and the UI calls again). On success it fetches `/v1/models`, persists the session, and returns `confirmed: true`. `cancelClaudeAppsGatewayLogin` drops the pending entry. Pending logins live in an in-process map keyed by `sessionId`, as the QR login does.
- **Sign-out.** `removeClaudeAppsGatewaySession(gatewayUrl)` deletes the file. The gateway's own server advertises no revocation endpoint, so sign-out is local only, as it is for Claude Code.
- **UI.** The local-agent import panel gains a one-line form above the candidate list: a gateway URL field and a Sign in button. Starting shows the user code and opens `verification_uri_complete` through `window.llmr.openExternal`; the panel polls `wait` until confirmed, then rescans candidates so the new one appears with its Import button. Errors render in the panel's existing error slot.
- **Spend headers.** Not surfaced in this phase. The `anthropic-ratelimit-unified-*` response headers are logged with the request like every other header; a meter is a later addition if wanted.

## Not in this phase

- Admin API calls (spend limits, audit). The work console owns those.
- A TLS fingerprint pin. LLMR uses normal TLS validation; the pin is a Claude Code client behavior tied to managed-settings delivery, which LLMR does not consume.
- Claude Code profiles switching to a gateway sign-in. A profile pointed at LLMR keeps using LLMR; the gateway sits behind it as a provider.
- Multiple users per gateway on one machine. One session per gateway host.

## Constraints carried into the plan

- Same `AGENTS.md` style and test rules as phase 1. UI copy is literal English in the component; the repo is English-only.
- The URL must be `http:` or `https:`; `http:` only for loopback hosts, since a gateway token over plain HTTP to a remote host would leak the developer's session. The harness from phase 1 runs on `http://127.0.0.1:18080`, so loopback HTTP has to work.
- Network calls go through `fetchWithSystemProxy` from `@llmr/core/proxy/system-proxy-fetch`, like Kimi's refresh.
- Tests use a fake gateway on `node:http` bound to `127.0.0.1:0`; nothing in the suite reaches the network.
