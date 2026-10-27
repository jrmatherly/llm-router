# LLM Router CLI

[Documentation](https://jrmatherly.github.io/llm-router/en/) · [GitHub](https://github.com/jrmatherly/llm-router)

`@llm-router/cli` is the workspace package behind LLM Router's `llmr` command. It provides the browser-based management UI, the local model gateway, and profile launch commands without requiring Electron.

Use the CLI on developer machines and headless hosts. If you want the tray, desktop notifications, automatic app updates, or desktop-only browser integrations, install the desktop application instead.

## Requirements And Installation

- Node.js 22 or newer
- A supported upstream model provider, or a locally logged-in agent account that LLMR can import
- A locally installed agent executable when using profile launch commands

This package is not published to npm. The desktop app puts `llmr` on `PATH` on first launch:

```sh
llmr --help
```

## Quick Start

Start the background service and open the management UI:

```sh
llmr ui
```

Then:

1. Add an upstream provider and at least one model.
2. Create an LLMR client key under **API Keys**.
3. Configure routing if the default provider/model is not sufficient.
4. Confirm that the gateway is running under **Server**.
5. Point your client at the gateway URL shown in the UI. The default gateway is `http://127.0.0.1:3456`; the management UI defaults to `http://127.0.0.1:3458`.

The management token and LLMR client API keys are different credentials. The management token protects the browser UI and RPC API. LLMR client keys authenticate model requests sent to the gateway.

## Service Commands

| Command | Behavior |
| --- | --- |
| `llmr start` | Starts a detached background management service and gateway, then prints its authenticated management URL. |
| `llmr ui` | Reuses or starts the background service and opens the management UI. |
| `llmr stop` | Stops the detached service started by `llmr start` or `llmr ui`. |
| `llmr serve` | Runs the management service and gateway in the foreground. `llmr web` is an alias. |
| `llmr <profile>` | Opens an enabled Agent Profiles profile by name or ID. |

### `llmr start`

```text
llmr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

- `--host <host>`: management listener, default `127.0.0.1`.
- `--port <port>`: preferred management port, default `3458`.
- `--open` / `--no-open`: enable or disable opening a browser.
- `--gateway`: explicitly request gateway startup; this is the default.
- `--no-gateway`: start only the management service.

### `llmr ui`

```text
llmr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` opens the browser by default. Use `--no-open` on SSH or other headless sessions.

### `llmr serve`

```text
llmr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` stays attached to the current terminal and handles `SIGINT`/`SIGTERM`. It is the appropriate mode for a process supervisor. `llmr stop` only manages the detached service; stop a foreground server through its terminal or supervisor.

If the preferred management port is occupied, LLMR tries the next available ports and prints the actual URL. When `start` or `ui` reuses an existing service, new host, port, and `--no-gateway` choices do not reconfigure that process. Run `llmr stop` first when those settings must change.

## Agent Profiles

Create and enable profiles in **Agent Profiles**, then launch one by name or ID:

```sh
llmr "Codex - Work"
llmr "Codex - Work" app
llmr "Claude - Review" cli -- --model sonnet
llmr profile-id -- --help
```

The syntax is:

```text
llmr <profile-name-or-id> [cli|app] [-- <agent arguments>]
```

- `--cli` and `--app` are accepted alternatives to the positional surface.
- Put agent-specific arguments after `--` so they cannot be confused with LLMR options.
- If the surface is omitted, LLMR uses the first surface allowed by the profile: CLI for Claude Code, Codex, Grok CLI, Kimi CLI, and Pi; App for ZCode.
- Grok CLI, Kimi CLI, and Pi support CLI only. ZCode supports App only. Claude App and ZCode App do not accept trailing agent arguments.
- Desktop App launches require that app to be installed and a graphical session to be available.
- Start the LLMR service before opening most profiles. Grok CLI, Kimi CLI, and Pi profiles can start a temporary shared service automatically and stop it after the last managed session exits.

Commands copied from desktop Agent Profiles cards use the same `llmr` command.

## Configuration And Runtime Files

| Platform | Config directory |
| --- | --- |
| macOS / Linux | `~/.llm-router` |
| Windows | `%APPDATA%\claude-code-router` |

Important files include:

- `config.sqlite`: current application configuration.
- `app-data/`: API key, usage, request-log, certificate, and other runtime databases/files.
- `service.json`: state and private token for a detached CLI service.
- `gateway.config.json`: generated gateway runtime configuration.
- `profiles/` and `bin/`: isolated profile configuration and launch wrappers.

Do not edit or copy live SQLite files while LLMR is writing to them. Use the UI export feature, or stop LLMR before taking a filesystem backup.

## Environment And Security

| Variable | Description |
| --- | --- |
| `CCR_WEB_HOST` | Default management listener when `--host` is omitted. |
| `CCR_WEB_PORT` | Default management port when `--port` is omitted. |
| `CCR_WEB_AUTH_TOKEN` | Fixes the management UI/RPC token instead of generating a random token for the process. |

The authenticated management URL contains `ccr_web_token` in its query string. Treat that URL like a password and avoid copying it into logs, tickets, or shell history. Bind to `127.0.0.1` unless remote access is intentional. For remote access, use a firewall or private network plus TLS at a trusted reverse proxy.

Do not expose the gateway without creating LLMR client API keys. Upstream provider credentials are stored in LLMR's local data directory, so protect that directory and its backups.

## Troubleshooting

### `llmr` is not found

Open the LLM Router desktop app once so it writes `llmr` and adds its `bin/` directory to `PATH`, then open a new shell.

### The management URL changed ports

The requested port was already occupied. Use the URL printed by LLMR, or stop the conflicting process and restart LLMR.

### The UI opens but the gateway is unavailable

The management service can run without a usable gateway. Add a provider and model, create a client API key, then start or restart the gateway from **Server**. Check the foreground output from `llmr serve` when diagnosing startup errors.

### A profile cannot be found

Only enabled profiles are launchable. Names are matched without case and sanitized names are accepted, but ambiguous names require the profile ID. Re-save the profile if its generated launcher is missing.

### A background service uses old options

Stop and recreate it:

```sh
llmr stop
llmr start --host 127.0.0.1 --port 3458
```

## Docker

The repository also includes a Docker image for gateway and browser-UI deployments. It does not install the `llmr` command into the runtime image. See the [Docker deployment guide](https://github.com/jrmatherly/llm-router/blob/main/docker/README.md).

## License

[MIT](LICENSE)
