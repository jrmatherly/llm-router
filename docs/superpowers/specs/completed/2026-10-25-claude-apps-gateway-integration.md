# Claude apps gateway integration, phase 1: LLMR as the gateway's upstream

Date: 2026-10-25. Status: approved for planning.

## What the Claude apps gateway is

Anthropic's enterprise gateway, shipped as the `claude gateway --config <yaml>` subcommand of the Claude Code binary (verified: `claude gateway --help` on 2.1.310 prints "Run the enterprise auth/telemetry gateway"). It signs developers in through a corporate OIDC issuer with a device flow, issues short-lived JWTs, enforces per-group model allowlists and per-user spend limits, delivers managed settings to Claude Code and Claude Desktop, relays OTLP telemetry, and proxies `/v1/messages` to one of six upstream kinds: `anthropic`, `bedrock`, `anthropicAws`, `vertex`, `foundry`, `mantle`. It needs PostgreSQL and an OIDC issuer at boot. The server runs on Linux; macOS is supported for local development. It has no admin UI.

Two repos on this machine deploy it:

| Repo | Role | Reuse for LLMR |
|---|---|---|
| `~/dev/claude-apps-gateway` | AWS reference: 7 CDK stacks, a GPG-verified gateway image (`gateway/Dockerfile`, pin 2.1.204), a FastAPI admin console over the gateway's spend-limits API, an ECS-env model allowlist trick. Validated to run locally on macOS with Docker Postgres and a Dex mock issuer on 2026-10-24 (`.serena/memories/local_dev.md`). | The local-run recipe only. CDK and the ECS allowlist stay there. |
| `~/dev/aan/claudegw-admin-console` | The work deployment: console with a versioned `gateway.yaml` control plane, a supervised gateway image (pin 2.1.272), Intune fleet, M365 add-in. | The topology, which fixes what LLMR should become. |

## The topology the work estate settled

`docs/architecture.md` in the work repo: every managed Claude client (Claude Code, Claude Desktop, Cowork) signs in to the gateway; the gateway's single upstream is an LLM router (their AIOps Hub) configured as

```yaml
upstreams:
  - provider: anthropic
    base_url: https://aiops-hub.aarons.com
    auth: { api_key: ${GATEWAY_UPSTREAM_KEY} }
    forward_user_identity: true
```

With `forward_user_identity: true` the gateway adds three headers to every `/v1/messages` and `/v1/messages/count_tokens` request (measured there on 2.1.272): `x-claude-gateway-user-email`, `x-litellm-end-user-id` (the same e-mail), `x-claude-gateway-user-id` (the OIDC `sub`). `GET /v1/models` is answered by the gateway and never forwarded. Upstream error bodies and `x-ratelimit-*` headers pass back to the client as-is when the request carried the e-mail header.

So the gateway is the identity and policy edge; the router behind it does provider routing, quotas and per-person attribution. LLM Router already is that router for one machine. Phase 1 makes it a correct upstream for an apps gateway, and gives the repo a local gateway to prove it against.

## Decision

Phase 1 ships four things in llm-router. Nothing from the two gateway repos is copied except the local-run recipe.

1. **Per-developer attribution from the forwarded identity headers.** `inferGatewayClient` in `packages/core/src/gateway/http/io.ts` already lets explicit headers name the request's `client`, which the request log, usage events and Agent analysis all key on. Add `x-claude-gateway-user-email`, then `x-litellm-end-user-id`, after the existing `x-ccr-client` and `x-client-name` sources and before the API-key fallback. No schema change. The e-mail is stored in local request logs, which the docs page says.
2. **A guard in the Claude Code profile apply.** The gateway docs state that on a machine whose managed settings set `forceLoginMethod: "gateway"`, a session that authenticates with `apiKeyHelper`, `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` exits at startup, and that `allowedProviders: ["gateway"]` refuses every non-gateway session. LLMR's profile apply writes exactly those settings into `~/.claude/settings.json`. Before writing, read the per-OS managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json` on macOS, `/etc/claude-code/managed-settings.json` on Linux and WSL, `C:\Program Files\ClaudeCode\managed-settings.json` on Windows, plus `managed-settings.d/*.json` beside each) and the target settings file itself (Claude Code 2.1.295+ honors the login keys there too). If either key pins the machine to a gateway, return `ok: false` with a message naming the file and key, and write nothing. Plist and HKLM sources are not read (`shortcut:` comment; they need platform APIs).
3. **A local apps gateway harness** under `docker/claude-apps-gateway/`, committed from the validated recipe: Compose runs `postgres:16-alpine` and Dex (`ghcr.io/dexidp/dex`, `mockCallback` connector, user `kilgore@kilgore.trout`, groups `[authors]`); a Node script renders `gateway.yaml` and runs the native `claude gateway --config` with `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`, `listen.host: 127.0.0.1`, upstream `provider: anthropic`, `base_url: http://127.0.0.1:<LLMR gateway port>`, `api_key: <an LLMR client key>`, `forward_user_identity: true`, `admin.write_keys` with a 32+ character key, `session.jwt_secret` 32+ bytes. `--load-test` swaps the upstream for `load_test_mode: { enabled: true, reply_seconds: 0 }` so the auth surface can be checked without LLMR. The script is the lever a reviewer re-runs; its config renderer is a pure function with a test.
4. **One docs page in both locales**, `docs/src/content/docs/{en,zh}/guides/claude-apps-gateway.md`: the topology, the upstream block to paste into a gateway's `gateway.yaml`, what LLMR does with the identity headers, the profile guard, the harness, and the two repos. The docs structure pairs every guide across en and zh (6 of 6 today), so the Chinese page is a translation, not a stub.

## Not in phase 1

- **LLMR signing in to an apps gateway as a client** (device flow, refresh-token grant, a `claude-apps-gateway` local-provider kind with a bearer plugin and a runtime hook like Kimi's). Real feature, separate plan. Data shape for that plan: `{ accessToken, refreshToken?, expiresAt, gatewayUrl, email?, models?, sourceFile }` stored under `CONFIGDIR/claude-apps-gateway/<host>.json` mode 0600; endpoints `POST /oauth/device_authorization` (no body), `POST /oauth/token` form `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=` polled at `interval` seconds with `authorization_pending` and `slow_down` handling, refresh via `grant_type=refresh_token`; `GET /v1/models` with the bearer for the catalog. The work estate does not use this direction (its non-Claude agents go elsewhere), so it waits.
- **Porting the admin console** (spend dashboard, limits, audit) into LLMR's UI. The work console already does it and owns the control plane.
- **LLMR speaking the gateway protocol to Claude Code** (`GET /protocol`, `/user/bootstrap`, managed settings delivery). Gateway sessions lose WebSearch, Remote Control, `/design-sync` and feature-flag features; wrong default for a local tool.
- CDK stacks, the ECS allowlist mechanism, Intune and M365 material.
- The existing `wif` auth mode is Anthropic's workload identity federation, unrelated to the apps gateway; untouched.

## Constraints carried into the plan

- Style per `AGENTS.md`: double quotes, semicolons, two-space indent, alphabetized keys where the file does, `node:` imports first then `@ccr/<pkg>/...`, no comments except a non-obvious why. Tests are `node:test` plus `node:assert/strict`, `*.test.mjs` under `packages/core/test/{unit,integration}` or `tests/architecture/`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`.
- Commit gate on any Bash `git commit`: typecheck plus `npm run test:architecture` (about 11 s).
- Nothing AI-written under `docs/` except `docs/superpowers/`; the guide page is product documentation and is allowed.
- The harness never commits secrets: the script generates the JWT secret and admin key per run into the scratch directory; `docker/claude-apps-gateway/.gitignore` ignores `*.rendered.yaml` and `.env`.

## Open questions settled by running, not asking

- Whether Dex over plain `http://127.0.0.1` is accepted as an issuer with `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`: yes on 2.1.310 (prior session, 2026-10-24).
- Whether Claude Code accepts `http://127.0.0.1:<port>` as `forceLoginGatewayUrl`: yes for loopback hosts (prior session). Re-verified by the harness task.
- Whether the gateway refuses `forward_user_identity: true` against a custom `base_url`: no, only against the default Anthropic URL (config reference).
