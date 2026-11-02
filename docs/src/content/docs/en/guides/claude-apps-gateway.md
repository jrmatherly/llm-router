---
title: Behind a Claude apps gateway
pageTitle: Behind a Claude apps gateway
eyebrow: Quick start
lead: "Run LLMR as the upstream of Anthropic's Claude apps gateway: the gateway signs developers in and enforces policy, LLMR routes to providers and attributes every request to the developer the gateway forwards."
---

## What the gateway does and where LLMR sits

The Claude apps gateway is the `claude gateway` subcommand of the Claude Code binary. It signs developers in through your identity provider, issues short-lived tokens, enforces model allowlists and spend limits, and forwards every `/v1/messages` request to one upstream. LLMR is that upstream: it does provider routing, credential pools and quotas behind the gateway, on one machine or on a shared host.

## Point the gateway at LLMR

Add LLMR as the `anthropic` upstream in the gateway's `gateway.yaml`, with a client key created under **API Keys** in LLMR:

```yaml
upstreams:
  - provider: anthropic
    base_url: http://<llmr-host>:3456
    auth: { api_key: ${LLMR_CLIENT_KEY} }
    forward_user_identity: true
```

The gateway appends `/v1/messages` itself, so `base_url` carries no `/v1` suffix. `GET /v1/models` is answered by the gateway from its own `models:` catalog and never reaches LLMR, and the gateway resolves a model alias such as `claude-sonnet-4-5` to its dated id (`claude-sonnet-4-5-20250929`) before forwarding, so the LLMR provider that should answer must list the dated id.

## What LLMR records

With `forward_user_identity: true` the gateway adds `x-claude-gateway-user-email`, `x-litellm-end-user-id` and `x-claude-gateway-user-id` to each forwarded request. LLMR takes the client label of the request from `x-claude-gateway-user-email`, or from `x-litellm-end-user-id` when the first is absent, so the request log shows the developer's e-mail as the client. A request that also carries `x-llmr-client` keeps that label; an LLMR-aware proxy in front of the gateway wins.

LLMR drops the three identity headers before the request leaves it, so the provider it routes the request to never sees the developer's e-mail or user id. There is no per-provider opt-in: a LiteLLM instance behind LLMR does not receive `x-litellm-end-user-id`, so its own spend attribution sees only the LLMR credential, and the request log in LLMR is where per-developer usage lives. Request logs are local and keep that e-mail for the current day. Enable **Request logs** under **Settings → Logs & Observability** to see the rows.

## Claude Code profiles on a gateway-pinned machine

A machine whose managed settings set `forceLoginMethod: "gateway"` or `allowedProviders: ["gateway"]` runs Claude Code against the gateway only; a session that authenticates with an API key or `apiKeyHelper` exits at startup. LLMR's Claude Code profile apply writes exactly that kind of authentication (an API key or `apiKeyHelper`), so before writing it reads the per-OS managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json` on macOS, `/etc/claude-code/managed-settings.json` on Linux and WSL, `%ProgramFiles%\ClaudeCode\managed-settings.json` on Windows, plus `managed-settings.d/*.json` beside each) and the profile's own settings file. When either pins the machine, the apply is refused with:

```text
Claude Code on this machine is pinned to a Claude apps gateway by <key> in <file>. LLMR did not change <settings file>; sign Claude Code in to the gateway, or point the gateway's upstream at LLMR instead.
```

`<key>` is whichever of `forceLoginMethod` or `allowedProviders` pinned the machine. Managed settings delivered through a macOS plist or the Windows registry are not read. Sign Claude Code in to the gateway on such a machine, and route the gateway to LLMR as above.

## Try it locally

The repository ships a harness under `docker/claude-apps-gateway/` that runs PostgreSQL and a mock OpenID Connect issuer in Docker and the native `claude gateway` on the host, pointed at a local LLMR:

```bash
node scripts/claude-apps-gateway-dev.mjs --api-key <llmr-client-key>
```

`--load-test` replaces the upstream with the gateway's canned reply so the sign-in surface can be checked without LLMR. `--port`, `--dex-port` and `--upstream` move the gateway, the issuer and the LLMR endpoint. Every login through the mock issuer is `kilgore@kilgore.trout`; after one request, LLMR's Logs page shows that e-mail as the client. Tear down with:

```bash
docker compose -f docker/claude-apps-gateway/compose.yaml down -v
```

## Use a gateway as an LLMR provider

The other direction also works. LLMR signs in to your organization's gateway and adds it as a provider, so every agent LLMR fronts (Codex, Kilo, OpenCode, Pi, Claude Code through a profile) reaches the organization's Claude models through the gateway.

1. Open **Providers**, click **Add**, and find **Import local agent provider** at the top of the dialog.
2. Enter the gateway URL (`https://` for a remote gateway; plain `http://` is accepted only for `localhost`, `127.0.0.1` or `[::1]`) and click **Sign in**.
3. LLMR opens the gateway's sign-in page in your browser and shows a code. Approve the sign-in there with your identity provider.
4. When the panel says the sign-in is confirmed, a **Claude apps gateway (host)** row appears. Click **Import**, pick models, and save.

The token names the developer who approved the sign-in, not LLMR. The gateway's spend limits and model allowlist for that developer therefore apply to every agent LLMR routes to this provider, and the model list LLMR imports is that developer's allowlist.

The session refreshes itself in the background. When the gateway refuses a refresh, for example after the developer is removed from the identity provider or the gateway's JWT secret rotates, requests to the provider fail with a message to sign in again. Signing in again from the same panel repairs a provider you already imported; there is no need to import it a second time.

To sign out, delete the session file for that gateway host under `~/.llm-router/claude-apps-gateway/` (`%APPDATA%\llm-router\claude-apps-gateway\` on Windows). The gateway offers no revocation endpoint, so sign-out is local.

Verified 2026-11-01 against the local harness in load-test mode (`claude gateway` from Claude Code 2.1.316, LLMR commit `215c6d19`, `llmr serve` web UI): device sign-in, import, Check Connection on all 14 models, and a `/v1/messages` request through LLMR that returned the gateway's canned reply with `authorization` logged as `[redacted]`.

## Reference deployments

- [sample-claude-apps-gateway-on-aws](https://github.com/aws-samples/sample-claude-apps-gateway-on-aws): an AWS reference deployment of the gateway.
- Anthropic's documentation: [Claude apps gateway](https://code.claude.com/docs/en/claude-apps-gateway), [configuration](https://code.claude.com/docs/en/claude-apps-gateway-config), [spend limits](https://code.claude.com/docs/en/claude-apps-gateway-spend-limits).
