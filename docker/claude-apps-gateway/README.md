# Local Claude apps gateway harness

Runs Anthropic's Claude apps gateway on this machine with LLM Router as its single upstream, so the topology the gateway docs describe can be exercised end to end without a cloud account.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| `claude gateway` | Native process on the host, `http://127.0.0.1:18080` | The `gateway` subcommand of the installed Claude Code binary (2.1.282 or later). Started by the script with `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`. |
| PostgreSQL | Docker, `127.0.0.1:15432` | `postgres:16-alpine`, database `gateway`, user `gw`, password `pw`, named volume `pgdata`. |
| Dex | Docker, `http://127.0.0.1:15556` | Mock OIDC issuer. The `mockCallback` connector signs every login in as `kilgore@kilgore.trout` with groups `[authors]`. |
| LLM Router | Wherever you run it, default `http://127.0.0.1:3456` | The gateway forwards `/v1/messages` here with `forward_user_identity: true`, so LLMR's request log attributes each call to the developer's e-mail. |

The script renders `dex.rendered.yaml` and `gateway.rendered.yaml` into this directory from one options object, so the gateway's `public_url`, Dex's `issuer` and the registered redirect URI always agree. Both rendered files and `.env` are gitignored. The JWT secret and the admin write key are generated per run, printed once, and never committed.

## Run it

With LLMR serving on port 3456 and a client key created under API Keys:

```bash
node scripts/claude-apps-gateway-dev.mjs --api-key <llmr-client-key>
```

Without LLMR, to check the sign-in surface alone:

```bash
node scripts/claude-apps-gateway-dev.mjs --load-test
```

Flags: `--upstream <url>` (default `http://127.0.0.1:3456`), `--port <n>` (gateway, default 18080), `--dex-port <n>` (default 15556).

Check the gateway is up:

```bash
curl -s http://127.0.0.1:18080/.well-known/oauth-authorization-server | jq .device_authorization_endpoint
```

## Sign a Claude Code session in

1. Back up `~/.claude/settings.json`, then add `"forceLoginMethod": "gateway"` and `"forceLoginGatewayUrl": "http://127.0.0.1:18080"`. LLMR's Claude Code profile apply refuses to touch a settings file that carries these keys, so the pin survives a running LLMR.
2. Run `claude`, then `/login`. Accept the fingerprint prompt and approve the mock user in the browser.
3. Pick with `/model` a model id that LLMR routes. The gateway forwards the id unchanged to its `anthropic` upstream, so an LLMR provider or virtual model must answer to that exact id.
4. Send a prompt. With Request logs enabled under Settings, LLMR's Logs page shows a row whose detail panel reads Client `kilgore@kilgore.trout`. The gateway resolves a model alias such as `claude-sonnet-4-5` to its dated id (`claude-sonnet-4-5-20250929`) before forwarding, so the LLMR provider must list the dated id.
5. Restore `~/.claude/settings.json`.

## Tear down

```bash
docker compose -f docker/claude-apps-gateway/compose.yaml down -v
```

## Notes

- LLMR's gateway-pinned guard reads `managed-settings.json` and `managed-settings.d/*.json` plus the profile's own settings file. Managed settings delivered through a macOS plist or the Windows registry (HKLM) are not read.
- `--load-test` needs an empty database. The gateway refuses load-test mode once any developer has spent anything, so run the teardown command between a real run and a load-test run.

## Verified

2026-10-26, Claude Code 2.1.310 (`claude gateway`), Dex v2.44.0, postgres:16-alpine. Device-flow sign-in as `kilgore@kilgore.trout`, one `POST /v1/messages` through the gateway to an LLMR built from this branch with a local mock upstream: HTTP 200, the Logs detail panel shows Client `kilgore@kilgore.trout`, and the upstream received `x-claude-gateway-user-email`, `x-litellm-end-user-id` and `x-claude-gateway-user-id`.
