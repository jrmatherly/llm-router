---
title: CLI installation and command reference
pageTitle: CLI installation and command reference
eyebrow: Quick start
lead: "Use the llmr command to manage the background service, gateway ports, and credentials, and launch local agents from Agent Config profiles."
---

## The `llmr` command

LLMR has one command, `llmr`. The desktop app writes it to LLMR's `bin/` directory and adds that directory to `PATH` on first launch. Commands copied from Agent Config cards use the same name.

## Install, upgrade, and uninstall

Install and open the LLMR desktop app once, then open a new terminal:

```sh
llmr --help
```

Opening an upgraded desktop app refreshes `llmr`. This fork does not publish the CLI to npm; the `@musistudio/claude-code-router` npm package is the upstream project and installs a different command.

If the command is not found, open LLMR once more, then open a new terminal.

## First start

Start LLMR in the background and open the management UI:

```sh
llmr ui
```

On SSH or headless environments:

```sh
llmr ui --no-open
```

Then complete the configuration in this order:

1. Add a provider and at least one model.
2. Create an LLMR client key on the **API Keys** page for gateway access.
3. Set the default model, routing rules, and fallbacks as needed.
4. Confirm the gateway is running on the **Server** page.
5. Point the client Base URL at the gateway address shown in the UI.

The management UI defaults to `http://127.0.0.1:3458`; the model gateway defaults to `http://127.0.0.1:3456`. The management token and LLMR client keys are two independent credentials: the former protects UI / RPC, the latter authenticates model requests.

## Service command summary

| Command | Mode | Purpose |
| --- | --- | --- |
| `llmr start` | Background | Starts the management service and model gateway, and prints the authenticated management URL. |
| `llmr ui` | Background | Reuses or starts the background service and opens a browser. |
| `llmr stop` | One-shot | Stops the background service started by `start` or `ui`. |
| `llmr serve` | Foreground | Runs in the current terminal; suitable for viewing logs or handing off to a process manager. |
| `llmr web` | Foreground | Alias of `serve`. |
| `llmr <profile-name-or-id>` | Foreground | Launches an enabled Agent Config profile. |

## `llmr start`

```text
llmr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

| Option | Description |
| --- | --- |
| `--host <host>` | Management service listen address, default `127.0.0.1`. `--host=value` is also accepted. |
| `--port <port>` | Preferred management service port, default `3458`. `--port=value` is also accepted. |
| `--open` | Open a browser after startup. |
| `--no-open` | Do not open a browser. |
| `--gateway` | Explicitly request model gateway startup; this is the default behavior. |
| `--no-gateway` | Start only the management service, without bringing up the model gateway during startup. |

If the preferred port is occupied, LLMR keeps trying following ports and prints the actual URL. The port must be an integer between `1` and `65535`.

## `llmr ui`

```text
llmr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` uses the same background service as `start`, but opens a browser by default. The management URL contains the `llmr_web_token` query parameter; treat the full URL as a password and do not paste it into logs, tickets, or public screenshots.

## `llmr serve`

```text
llmr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` stays in the foreground and shuts down the management service and configured services on `SIGINT` or `SIGTERM`. Prefer it when troubleshooting startup errors, because errors are printed directly to the current terminal.

`llmr stop` only manages background services. A foreground `serve` should be stopped from its terminal or by an external process manager.

## Background service reuse rules

`start` and `ui` write the process ID, URL, and a private service token into `service.json`. On the next invocation, LLMR first verifies the process and RPC identity:

- A valid service is reused directly; a second background process is not started.
- Newly passed host, port, and `--no-gateway` options do not reconfigure an already running process.
- If the new command requires the gateway, LLMR tries to start it inside the existing management process.
- If the state file is stale or the process has exited, LLMR cleans up the old state and starts a new service.

To change listener settings, stop first:

```sh
llmr stop
llmr start --host 127.0.0.1 --port 3458
```

## Launch Agent Config profiles

Create and enable a profile under **Agent Config** first, then use:

```text
llmr <profile-name-or-id> [cli|app] [-- <agent arguments>]
```

Examples:

```sh
llmr "Codex - Work"
llmr "Codex - Work" app
llmr "Claude - Review" cli -- --model sonnet
llmr profile-id -- --help
```

The rules:

- `--cli` and `--app` can replace the positional `cli` / `app` form.
- Put the agent's own arguments after `--` to avoid conflicts with LLMR options or the surface name.
- When the surface is omitted, Claude Code, Codex, and Grok CLI default to CLI; ZCode defaults to App.
- Grok CLI, Kimi CLI, Pi, and Kilo support CLI only; ZCode supports App only.
- Claude App and ZCode App do not support extra agent arguments.
- Launching an App requires the corresponding desktop application installed locally and a graphical session in the current environment.
- Only enabled profiles can be launched. Use the profile ID when the name is ambiguous.

Most profiles require the LLMR gateway to be running. Grok CLI, Kimi CLI, and Pi are the exceptions: if no service exists, they can automatically start a managed temporary shared service and shut it down after the last session exits.

## Configuration and data locations

| Platform | Configuration directory |
| --- | --- |
| macOS / Linux | `~/.llm-router` |
| Windows | `%APPDATA%\llm-router` |

Common files and directories:

| Path | Purpose |
| --- | --- |
| `config.sqlite` | Current application configuration. |
| `app-data/` | Runtime data such as API keys, usage, request logs, and certificates. |
| `service.json` | Background CLI service state and private token. |
| `gateway.config.json` | Generated gateway runtime configuration. |
| `profiles/` | Per-Agent-Config isolated files. |
| `bin/` | Agent launch wrappers generated by LLMR. |

Do not edit or copy live SQLite files while LLMR is running. Prefer **Settings → Export data**; stop the CLI and desktop app before taking a file-level backup.

## Environment variables and remote access

The public management authentication variables are:

| Variable | Description |
| --- | --- |
| `LLMR_WEB_HOST` | Management service listen address used when `--host` is omitted. |
| `LLMR_WEB_PORT` | Management service port used when `--port` is omitted. |
| `LLMR_WEB_AUTH_TOKEN` | Fixed management UI / RPC token; without it the process generates a random token. |

Listening on `0.0.0.0` exposes the management UI to the LAN or external networks. Only configure this when genuinely needed, and combine it with a fixed strong token, a host firewall or private network, and TLS provided by a trusted reverse proxy.

The model gateway additionally requires separately created LLMR client keys. Upstream provider credentials are stored in the local data directory, so both the directory and its backups should be protected as sensitive data.

## Process manager example

In production, use `llmr serve --no-open` and let an external manager handle restarts and logs. The start command should at least pin the working user, `HOME`, the listen address, and `LLMR_WEB_AUTH_TOKEN`. Do not also run a background service created by `llmr start`, otherwise you may end up with two management ports or two processes competing for the same configuration.

## Troubleshooting

### The UI opens, but `/health` or model requests fail

The management service can run without a usable model gateway. Add a provider and model, create an LLMR client key, then start or restart the gateway from the **Server** page. Use `llmr serve` to see startup errors.

### The management port shifted

Port 3458 was already occupied, so LLMR used the next available port. Trust the URL printed by the command; to pin a port, stop the conflicting process first.

### Agent Config profile not found

Confirm the profile is enabled and check for duplicate names. LLMR matches by ID, name, case-insensitive name, and sanitized name; when multiple results match, the ID must be used.

### The launcher does not exist

Open LLMR once or re-save that Agent Config profile so LLMR regenerates the launch wrappers under `bin/`.

### The background service cannot be stopped

Run `llmr stop` first. If the state file is already stale, the command cleans it up and reports that the service is not running. A foreground `llmr serve` is not managed by `llmr stop`; return to its terminal or process manager to stop it.

## Related pages

- [Install and start LLMR](../install/)
- [Agent Config](../../configuration/profiles/)
- [Server](../../configuration/server/)
- [Docker deployment](../docker/)
