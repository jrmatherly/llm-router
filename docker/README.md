# Docker Deployment

[Project documentation](https://jrmatherly.github.io/llm-router/en/) · [GitHub](https://github.com/jrmatherly/llm-router)

The Docker image runs the LLMR core server under PM2 and serves the built management UI through Nginx. Nginx is the only public container entrypoint: the browser UI, management RPC, gateway API, and health route all share one published port.

The image is intended for a persistent gateway and browser-based administration. It does not include Electron, the `llmr` command, system tray features, desktop Agent/App launching, automatic desktop updates, or desktop-only browser integrations.

## Architecture And Ports

```text
host:3458 -> container Nginx:8080
                         |-> static management UI
                         |-> management RPC: 127.0.0.1:3459
                         `-> gateway:       127.0.0.1:3456
```

Only Nginx port `8080` should be published. The internal management and gateway ports are container implementation details and should not be exposed individually.

Nginx routes:

| Public route | Purpose |
| --- | --- |
| `/` and `/pages/home/index.html` | Browser management UI. `/` redirects to the page and keeps a `ccr_web_token` query parameter if the request has one. The token is never added by Nginx. |
| `/api/ccr/rpc` | Authenticated management RPC. |
| `/health` | Gateway health, not container/UI health. It can return `502` until a provider and model are configured and the gateway starts. |
| `/v1/*`, `/v1beta/*`, `/messages`, `/chat/completions`, `/responses`, `/interactions`, `/mcp/*` | Supported model and MCP gateway requests. |

## Quick Start With Compose

From the repository root:

```sh
npm run docker:compose:up
docker compose logs -f ccr
```

Open the management URL that the entrypoint prints in the container log, `http://127.0.0.1:3458/?ccr_web_token=<token>`. It is only printed when the token was generated; if you set `CCR_WEB_AUTH_TOKEN` yourself, add it to the URL. On a new volume, the management UI is immediately available. Add a provider and model, create an LLMR client key under **API Keys**, and start the gateway from **Server**.

The npm Compose script prepares a local `../../next-ai/gateway` checkout before building so the image uses that plugin-capable ai-gateway runtime. If you run `docker compose up -d --build` directly, run `npm run docker:prepare-gateway` first. `npm run docker:build` performs the same preparation automatically.

The repository Compose file publishes `3458:8080`, stores data in the `ccr-data` named volume, and restarts the service unless explicitly stopped. A mapping without a host IP binds on every host interface. For local-only access, change it to:

```yaml
ports:
  - "127.0.0.1:3458:8080"
```

Stop or remove the container without deleting its named volume:

```sh
docker compose stop
docker compose down
```

Do not add `--volumes` to `docker compose down` unless you intentionally want to delete all persisted LLMR data.

## `docker run`

Build and run without Compose:

```sh
npm run docker:build
docker run -d \
  --name llm-router \
  --restart unless-stopped \
  -p 127.0.0.1:3458:8080 \
  -e CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458 \
  -v ccr-data:/data \
  llm-router:local
```

The temporary run script is also available:

```sh
npm run docker:run
```

`npm run docker:run` uses port `3458` and the `ccr-data` volume, but runs an ephemeral container without a fixed name or restart policy.

## Authentication And Network Security

There are two independent authentication layers:

1. `CCR_WEB_AUTH_TOKEN` protects management RPC. You open the management page with it in the URL (`/?ccr_web_token=<token>`), and the browser sends it to RPC as `x-ccr-web-auth`. Nginx never sends it to a client.
2. LLMR client API keys created in the **API Keys** page protect model gateway requests. These are separate from upstream provider credentials.

If `CCR_WEB_AUTH_TOKEN` is unset, the entrypoint generates a new random token on each container start and prints the management URL once to the container log. Opening `/` without a token loads the page, but every management call fails with `401` until the token is supplied. The page keeps the token for the browser tab session. A stable token is recommended for persistent or remote deployments.

Avoid putting the token directly in shell history. Create a protected environment file instead:

```dotenv
CCR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
CCR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

Then use it with `docker run --env-file` or map the same variables under the Compose service's `environment` section. Keep this file out of version control.

Security guidance:

- Bind the published port to `127.0.0.1` unless LAN or remote access is intentional.
- Never expose the management UI over untrusted networks without TLS, a firewall/private network, and a fixed strong management token.
- Treat tokenized management URLs as secrets; URLs may be recorded in browser history, proxy logs, screenshots, and support tickets.
- Create scoped LLMR client API keys before exposing gateway routes. Do not reuse upstream provider credentials as client keys.
- Protect `/data` and its backups because they contain configuration, provider credentials, LLMR client keys, request data, and generated certificates.

## Changing The Public Address

The host-facing URL is separate from the container's internal ports. Whenever the host port, hostname, or scheme changes, set `CCR_PUBLIC_BASE_URL` to the exact URL clients should use:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      CCR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

`CCR_PUBLIC_BASE_URL` is written to LLMR's public router endpoint. It does not publish a Docker port by itself.

For a reverse proxy or ingress that terminates HTTPS:

```yaml
services:
  ccr:
    ports:
      - "127.0.0.1:3458:8080"
    environment:
      CCR_PUBLIC_BASE_URL: https://ccr.example.com
      CCR_WEB_AUTH_TOKEN: ${CCR_WEB_AUTH_TOKEN:?set CCR_WEB_AUTH_TOKEN}
```

Proxy all paths to Nginx and preserve streaming. The external proxy should allow long-lived responses and should not buffer SSE/model streams. Keep the host port private when the reverse proxy is the public entrypoint.

## Persistent Data

The entrypoint sets `HOME=/data`, so LLMR stores files under:

```text
/data/.llm-router/
├── config.sqlite
├── gateway.config.json
├── app-data/
│   ├── api-keys.sqlite
│   ├── request-logs.sqlite
│   ├── usage.sqlite
│   └── certs/
├── profiles/
└── bin/
```

Use a named volume unless a bind mount is operationally required. Bind mounts must be writable by the container. Never let two running LLMR containers share one data directory, whether it is a named volume or a bind mount.

The first-run bootstrap writes a minimal legacy `config.json` only when neither `config.json` nor `config.sqlite` exists. When the UI saves current settings, SQLite becomes authoritative. By default, every container start also synchronizes the stored gateway listener and `routerEndpoint` to the Docker public endpoint.

## Backup And Restore

The safest application-level backup is **Settings → Export data**. For a full volume backup, stop writes before copying the data directory:

```sh
docker compose stop ccr
docker compose cp ccr:/data/. ./ccr-data-backup/
docker compose start ccr
```

Keep the backup private. It contains secrets and may include request/response data.

For a full restore, use a new empty volume or empty `/data` directory, copy the backup contents into it while the LLMR container is stopped, then start the container. Do not overlay an old backup onto a populated live volume: stale SQLite WAL/SHM files and newer runtime files can produce an inconsistent result. Make a second backup before replacing existing data.

## Upgrade And Rollback

Back up `/data`, update the source revision, rebuild with fresh base layers, and recreate the service:

```sh
git pull
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 ccr
```

Configuration migrations run against the persistent data. To roll back, use the previous image/source revision together with a backup created before the upgrade; do not assume a newer database can always be read by an older build.

## Environment Variables

Most deployments should set only `CCR_WEB_AUTH_TOKEN`, `CCR_PUBLIC_BASE_URL`, and the Docker port mapping. Internal listener values normally should remain unchanged.

| Variable | Default | Description |
| --- | --- | --- |
| `CCR_WEB_AUTH_TOKEN` | Random per container start | Management UI/RPC token. Set a stable strong value for persistent or remote use. |
| `CCR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Exact public gateway/UI base URL written into LLMR configuration. Overrides `CCR_PUBLIC_HOST` and `CCR_PUBLIC_PORT`. |
| `CCR_PUBLIC_HOST` | `127.0.0.1` | Used only to derive `CCR_PUBLIC_BASE_URL` when the full URL is unset; it does not change Docker port publishing. |
| `CCR_PUBLIC_PORT` | `3458` | Used only to derive `CCR_PUBLIC_BASE_URL` when the full URL is unset. |
| `CCR_DATA_DIR` | `/data` | Container data root and process `HOME`. Mount persistent storage here. |
| `CCR_NGINX_PORT` | `8080` | Container-private Nginx listen port. Match the container side of the published mapping if changed. |
| `CCR_WEB_HOST` | `127.0.0.1` | Container-private management server host. |
| `CCR_WEB_PORT` | `3459` | Container-private management server port. |
| `CCR_GATEWAY_HOST` | `127.0.0.1` | Container-private gateway listener host. |
| `CCR_GATEWAY_PORT` | `3456` | Container-private gateway listener port used by Nginx. |
| `CCR_NO_GATEWAY` | `0` | Set to `1`, `true`, or `yes` to run the management UI without starting the gateway at boot. |
| `CCR_DOCKER_INIT_CONFIG` | `1` | Set to `0` to disable minimal first-run `config.json` bootstrap. |
| `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | Set to `0` to stop startup from syncing existing JSON/SQLite listener and public endpoint fields to Docker values. |

Changing internal ports requires corresponding Nginx/PM2 variables and offers no benefit in normal deployments. Publish only `CCR_NGINX_PORT`.

## Build Options And Smoke Test

The Dockerfile builds native dependencies with `node:24-bookworm`, then copies production dependencies and built assets into `node:24-bookworm-slim`. Override the base images when required:

```sh
docker build \
  --build-arg NODE_IMAGE=node:24-bookworm \
  --build-arg RUNTIME_NODE_IMAGE=node:24-bookworm-slim \
  -t llm-router:local .
```

Run the isolated Docker smoke test:

```sh
npm run test:docker
```

The test builds the image, starts a temporary container and volume, verifies that only Nginx is published, checks UI/RPC authentication, tests public-endpoint migration, starts a configured gateway, checks `/health`, and removes its resources. Set `CCR_DOCKER_TEST_SKIP_BUILD=1` to reuse an existing image or `CCR_DOCKER_TEST_IMAGE` to test a different local tag.

## Operations And Troubleshooting

Useful commands:

```sh
docker compose ps
docker compose logs -f ccr
docker compose restart ccr
docker compose config
```

### `/` returns `302`

This is expected. Nginx redirects the root URL to the management page and keeps the query string, so a `ccr_web_token` you supply survives. It does not add a token.

### `/health` returns `502`

`/health` checks the model gateway, not Nginx or the management UI. On a fresh volume it returns `502` until a provider/model exists and the gateway has started; after startup, the plugin-capable ai-gateway runtime returns `200` with status `ok`. Use `docker compose ps` for container health and open the UI to configure/start the gateway.

### The UI returns `401` after a token change

Open `/?ccr_web_token=<token>` again with the current token (for a generated token, read it from `docker compose logs ccr`). Close stale tabs and avoid bookmarks that contain an old `ccr_web_token`.

### Clients still use the old port or hostname

Update `CCR_PUBLIC_BASE_URL` and recreate the container. Leave `CCR_DOCKER_SYNC_PUBLIC_ENDPOINT=1` so existing SQLite configuration is synchronized at startup.

### Configuration disappears after recreation

Confirm that `/data` is mounted and that the same named volume or bind-mount path is being reused. `docker compose down` keeps named volumes; `docker compose down --volumes` deletes them.

### A bind mount fails with permission errors

Verify that the host directory exists, is writable by the container, and is not mounted read-only. Named volumes avoid most host ownership and labeling issues.

### The container is healthy but model requests fail

Container health only verifies Nginx/UI reachability. Check **Server** status, provider connectivity, LLMR client-key authentication, routing, and request logs. Then inspect `docker compose logs --tail=200 ccr` for startup or runtime errors.
