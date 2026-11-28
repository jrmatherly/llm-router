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
| `/` and `/pages/home/index.html` | Browser management UI. `/` redirects to the page. Nginx never adds the token and no URL query carries it. |
| `/api/llmr/rpc` | Authenticated management RPC. |
| `/health` | Gateway health, not container/UI health. It can return `502` until a provider and model are configured and the gateway starts. |
| `/v1/*`, `/v1beta/*`, `/messages`, `/chat/completions`, `/responses`, `/interactions`, `/mcp/*` | Supported model and MCP gateway requests. |

## Quick Start With Compose

From the repository root:

```sh
npm run docker:compose:up
docker compose logs -f llmr
```

Open the management URL that the entrypoint prints in the container log, `http://127.0.0.1:3458/#llmr_web_token=<token>`. It is only printed when the token was generated; if you set `LLMR_WEB_AUTH_TOKEN` yourself, open `http://127.0.0.1:3458/` and type the token when the page asks. The token is kept per browser tab, so a new tab asks again. On a new volume, the management UI is immediately available. Add a provider and model, create an LLMR client key under **API Keys**, and start the gateway from **Server**.

When `LLMR_DOCKER_GATEWAY_SOURCE_DIR` points at a local ai-gateway checkout, the npm Compose script packs it before building so the image uses that plugin-capable ai-gateway runtime. Without one, the image uses the package-lock dependency. If you run `docker compose up -d --build` directly, run `npm run docker:prepare-gateway` first. `npm run docker:build` performs the same preparation automatically.

The repository Compose file publishes `127.0.0.1:3458:8080`, stores data in the `llmr-data` named volume, and restarts the service unless explicitly stopped. Only this machine can reach it. Management RPC needs `LLMR_WEB_AUTH_TOKEN`, and it also rejects a browser request whose `Origin` or `Referer` is not trusted. Nginx forwards both headers as the browser sent them. Trusted origins are loopback addresses, `LLMR_PUBLIC_BASE_URL`, and the comma-separated `LLMR_WEB_ALLOWED_ORIGINS`. A client that sends neither header, such as `curl`, needs only the token. To expose it on a LAN deliberately, set a stable strong `LLMR_WEB_AUTH_TOKEN` (32 characters or more) and set `LLMR_PUBLIC_BASE_URL` to the address the browser uses, or the management UI's requests get `403`. Then publish on a specific host address, or on every interface:

```yaml
ports:
  - "3458:8080"
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
  -e LLMR_PUBLIC_BASE_URL=http://127.0.0.1:3458 \
  -v llmr-data:/data \
  llm-router:local
```

The temporary run script is also available:

```sh
npm run docker:run
```

`npm run docker:run` uses port `3458` and the `llmr-data` volume, but runs an ephemeral container without a fixed name or restart policy.

## Published Image

Each release publishes a public `linux/amd64` and `linux/arm64` image to GHCR, tagged with the version, the major.minor, and `latest`. To run it without building, replace `llm-router:local` in the command above with `ghcr.io/jrmatherly/llm-router:latest`, or with a version tag such as `:7.1.1` to pin a release.

## Authentication And Network Security

There are two independent authentication layers:

1. `LLMR_WEB_AUTH_TOKEN` protects management RPC. A generated token is offered once in the URL fragment (`/#llmr_web_token=<token>`), which is not sent to any server; a token you set is typed into the page. The browser sends it to RPC as `x-llmr-web-auth`. Nginx never sends it to a client.
2. LLMR client API keys created in the **API Keys** page protect model gateway requests. These are separate from upstream provider credentials.

If `LLMR_WEB_AUTH_TOKEN` is unset, the entrypoint generates a new random token on each container start and prints the management URL once to the container log. Opening `/` without a token loads the page, which asks for the token before it shows anything. The page keeps the token for the browser tab session. A stable token is recommended for persistent or remote deployments.

Avoid putting the token directly in shell history. Create a protected environment file instead:

```dotenv
LLMR_WEB_AUTH_TOKEN=replace-with-a-long-random-value
LLMR_PUBLIC_BASE_URL=http://127.0.0.1:3458
```

Then use it with `docker run --env-file` or map the same variables under the Compose service's `environment` section. Keep this file out of version control.

Security guidance:

- Bind the published port to `127.0.0.1` unless LAN or remote access is intentional.
- Never expose the management UI over untrusted networks without TLS, a firewall/private network, and a fixed strong management token.
- Treat a management URL that carries `#llmr_web_token=` as a secret. The fragment stays out of server and proxy logs, but it may be recorded in browser history, screenshots, and support tickets.
- The web management API hides upstream provider credentials from the browser. In the configuration it returns, the secret fields of providers, provider plugins and Tool Hub are replaced by references that begin `[LLMR REDACTED]`: API keys, pool keys, authentication and cookie headers, private keys, access keys and session tokens, fields named like `*_TOKEN`, `*_SECRET`, `*_PASSWORD` or `*_API_KEY`, upper-case names ending `_KEY` or `_PAT`, and a `key` inside a URL `query` object. A credential read while importing a local agent or a provider manifest is hidden the same way. Leave a reference in place to keep the saved credential, type a new value to replace it, or clear the field to remove it. References stop working when the container restarts, so reload the page afterwards. This guards against a credential being read off the screen or out of a captured response. It does not limit a holder of the management token, who can change where a saved key is sent and can run commands on the host through a saved MCP server, so treat that token as full access. Not covered: LLMR client keys, the upstream proxy password, MCP servers under Agent Profiles, and bot credentials are returned as saved.
- Create scoped LLMR client API keys before exposing gateway routes. Do not reuse upstream provider credentials as client keys.
- Protect `/data` and its backups because they contain configuration, provider credentials, LLMR client keys, request data, and generated certificates.

## Changing The Public Address

The host-facing URL is separate from the container's internal ports. Whenever the host port, hostname, or scheme changes, set `LLMR_PUBLIC_BASE_URL` to the exact URL clients should use:

```yaml
services:
  llmr:
    ports:
      - "127.0.0.1:8088:8080"
    environment:
      LLMR_PUBLIC_BASE_URL: http://127.0.0.1:8088
      LLMR_WEB_AUTH_TOKEN: ${LLMR_WEB_AUTH_TOKEN:?set LLMR_WEB_AUTH_TOKEN}
```

`LLMR_PUBLIC_BASE_URL` is written to LLMR's public router endpoint. It does not publish a Docker port by itself.

For a reverse proxy or ingress that terminates HTTPS:

```yaml
services:
  llmr:
    ports:
      - "127.0.0.1:3458:8080"
    environment:
      LLMR_PUBLIC_BASE_URL: https://llmr.example.com
      LLMR_WEB_AUTH_TOKEN: ${LLMR_WEB_AUTH_TOKEN:?set LLMR_WEB_AUTH_TOKEN}
```

Proxy all paths to Nginx and preserve streaming. The external proxy should allow long-lived responses and should not buffer SSE/model streams. Keep the host port private when the reverse proxy is the public entrypoint.

## Persistent Data

The entrypoint sets `HOME=/data`, so LLMR stores files under:

```text
/data/.llm-router/
├── config.sqlite
├── app-data/
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
docker compose stop llmr
docker compose cp llmr:/data/. ./llmr-data-backup/
docker compose start llmr
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
docker compose logs --tail=200 llmr
```

Configuration migrations run against the persistent data. To roll back, use the previous image/source revision together with a backup created before the upgrade; do not assume a newer database can always be read by an older build.

## Environment Variables

Most deployments should set only `LLMR_WEB_AUTH_TOKEN`, `LLMR_PUBLIC_BASE_URL`, and the Docker port mapping. Internal listener values normally should remain unchanged.

| Variable | Default | Description |
| --- | --- | --- |
| `LLMR_WEB_AUTH_TOKEN` | Random per container start | Management UI/RPC token. Set a stable strong value of at least 32 characters (`openssl rand -base64 32`) for persistent or remote use; a shorter one stops the container. |
| `LLMR_PUBLIC_BASE_URL` | `http://127.0.0.1:3458` | Exact public gateway/UI base URL written into LLMR configuration. Its origin is the one a non-loopback browser may call management RPC from. Overrides `LLMR_PUBLIC_HOST` and `LLMR_PUBLIC_PORT`. |
| `LLMR_WEB_ALLOWED_ORIGINS` | Empty | Comma-separated extra browser origins that may call management RPC, such as `https://tools.example.com`. |
| `LLMR_PUBLIC_HOST` | `127.0.0.1` | Used only to derive `LLMR_PUBLIC_BASE_URL` when the full URL is unset; it does not change Docker port publishing. |
| `LLMR_PUBLIC_PORT` | `3458` | Used only to derive `LLMR_PUBLIC_BASE_URL` when the full URL is unset. |
| `LLMR_DATA_DIR` | `/data` | Container data root and process `HOME`. Mount persistent storage here. |
| `LLMR_NGINX_PORT` | `8080` | Container-private Nginx listen port. Match the container side of the published mapping if changed. |
| `LLMR_WEB_HOST` | `127.0.0.1` | Container-private management server host. It must stay loopback: any other address makes the container refuse to start unless `LLMR_WEB_ALLOW_REMOTE=1` is set. In Docker, what you publish with `-p` is what is exposed: no LLMR flag checks it. |
| `LLMR_WEB_PORT` | `3459` | Container-private management server port. |
| `LLMR_GATEWAY_HOST` | `127.0.0.1` | Container-private gateway listener host. |
| `LLMR_GATEWAY_PORT` | `3456` | Container-private gateway listener port used by Nginx. |
| `LLMR_NO_GATEWAY` | `0` | Set to `1`, `true`, or `yes` to run the management UI without starting the gateway at boot. |
| `LLMR_DOCKER_INIT_CONFIG` | `1` | Set to `0` to disable minimal first-run `config.json` bootstrap. |
| `LLMR_DOCKER_SYNC_PUBLIC_ENDPOINT` | `1` | Set to `0` to stop startup from syncing existing JSON/SQLite listener and public endpoint fields to Docker values. |

Changing internal ports requires corresponding Nginx/PM2 variables and offers no benefit in normal deployments. Publish only `LLMR_NGINX_PORT`.

## Build Options And Smoke Test

The Dockerfile builds and runs on `node:24-bookworm-slim`, pinned by digest. Renovate opens a PR when that tag is rebuilt (`docker buildx imagetools inspect node:24-bookworm-slim` shows the current digest). Override the base images when required:

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

The test builds the image, starts a temporary container and volume, verifies that only Nginx is published, checks UI/RPC authentication, tests public-endpoint migration, starts a configured gateway, checks `/health`, and removes its resources. Set `LLMR_DOCKER_TEST_SKIP_BUILD=1` to reuse an existing image or `LLMR_DOCKER_TEST_IMAGE` to test a different local tag.

## Operations And Troubleshooting

Useful commands:

```sh
docker compose ps
docker compose logs -f llmr
docker compose restart llmr
docker compose config
```

### `/` returns `302`

This is expected. Nginx redirects the root URL to the management page. It does not add a token, and the browser carries a `#llmr_web_token=` fragment across the redirect by itself.

### `/health` returns `502`

`/health` checks the model gateway, not Nginx or the management UI. On a fresh volume it returns `502` until a provider/model exists and the gateway has started; after startup, the plugin-capable ai-gateway runtime returns `200` with status `ok`. Use `docker compose ps` for container health and open the UI to configure/start the gateway.

### The UI returns `401` after a token change

Type the current token when the page asks for it (for a generated token, open the `/#llmr_web_token=<token>` URL from `docker compose logs llmr`). Close stale tabs and avoid bookmarks that contain an old token.

### Clients still use the old port or hostname

Update `LLMR_PUBLIC_BASE_URL` and recreate the container. Leave `LLMR_DOCKER_SYNC_PUBLIC_ENDPOINT=1` so existing SQLite configuration is synchronized at startup.

### Configuration disappears after recreation

Confirm that `/data` is mounted and that the same named volume or bind-mount path is being reused. `docker compose down` keeps named volumes; `docker compose down --volumes` deletes them.

### A bind mount fails with permission errors

Verify that the host directory exists, is writable by the container, and is not mounted read-only. Named volumes avoid most host ownership and labeling issues.

### The container is healthy but model requests fail

Container health only verifies Nginx/UI reachability. Check **Server** status, provider connectivity, LLMR client-key authentication, routing, and request logs. Then inspect `docker compose logs --tail=200 llmr` for startup or runtime errors.
