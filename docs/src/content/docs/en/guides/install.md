---
title: Install and start LLMR
pageTitle: Install and start LLMR
eyebrow: Quick start
lead: Choose among the desktop app, the llmr CLI, and Docker, complete installation and first startup, and verify the management UI and model gateway addresses.
---

## Choose a distribution

| Distribution | Best for | Entry | Default management address | Default gateway address |
| --- | --- | --- | --- | --- |
| Desktop app | Daily local use, tray, multi-instance Agent Apps, desktop integrations | App UI, `llmr` | In-app window | `http://127.0.0.1:3456` |
| CLI | Terminal, SSH, external process supervisors | `llmr` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | Persistent servers and container operations | Nginx | Shared public endpoint | `http://127.0.0.1:3458` with the default mapping |

In desktop/CLI deployments, management and the model gateway use different ports. CLI management uses `3458` by default, while the model gateway uses `3456`. Docker intentionally combines both through one Nginx endpoint.

## Install the desktop app

1. Open [GitHub Releases](https://github.com/musistudio/claude-code-router/releases).
2. Download `.dmg`/`.zip` for macOS, `.exe` for Windows, or `.AppImage` for Linux.
3. Install and open **LLM Router**.
4. Add a provider/model, create a client key under **API Keys**, then click **Start** under **Server**.

When Server shows Running, the model gateway defaults to `http://127.0.0.1:3456`. Enable automatic startup under Server if the gateway should start whenever the app opens.

## Use the CLI

The desktop app puts `llmr` on `PATH` on first launch. Open a new terminal, then run:

```sh
llmr ui
```

`llmr ui` starts a background service and opens the browser. Use `llmr ui --no-open` on a headless host or `llmr serve --no-open` under a process supervisor. See the [CLI installation and reference](../cli/) for all commands and profile launches.

## Use Docker

From a source checkout:

```sh
docker compose up -d --build
```

Open <http://127.0.0.1:3458>. Docker publishes one Nginx endpoint shared by management and the gateway. Add a provider/model, create an LLMR client key, and start the gateway under Server. See [Docker deployment](../docker/) for ports, authentication, persistence, backups, and remote access.

## Verify the installation

After configuring a provider, model, and LLMR client key:

1. Confirm Server shows Running.
2. Request `/health` on the deployment's gateway address and expect a `200` running response.
3. Send one minimal model request to a compatible endpoint using the LLMR client key.
4. Confirm requested/resolved model, provider, status, and latency under Logs.

A reachable management UI does not prove that the model gateway is usable. Docker `/health` returning `502` is expected before a provider/model has been configured.

## Data locations

| Distribution | Configuration location |
| --- | --- |
| Desktop / CLI on macOS or Linux | `~/.llm-router` |
| Desktop / CLI on Windows | `%APPDATA%\claude-code-router` |
| Docker | `/data/.llm-router`; persist `/data` |

Current configuration is stored in `config.sqlite`. Legacy `config.json` is only a migration source when SQLite does not exist, or an initial Docker bootstrap. Do not edit live SQLite files.
