# Stub experiment: what Claude Code does when a gateway rejects or drops `safeguards`

Run on 2026-11-18 for the gateway fork spec ([`specs/2026-11-18-gateway-fork.md`](../../specs/2026-11-18-gateway-fork.md), "The safeguards rejection").

## Setup

- Claude Code 2.1.327, `claude -p ... --permission-mode auto`, a fresh `CLAUDE_CONFIG_DIR`, `ANTHROPIC_BASE_URL` pointed at the stub, a made-up `ANTHROPIC_AUTH_TOKEN`. No request reached a model provider.
- `stub.mjs` is a local server for `POST /v1/messages`. For a request that has a `Bash` tool it answers with a `tool_use` three times, then with text. It logs each request's model, tool count, whether `anthropic-beta` names `dangerous-tool-use`, and whether the body has `safeguards`.
- `run.sh <mode> <port>` starts the stub and one session. Modes: `spec` (400 in the form Claude Code's built-in gateway guidance names), `patch` (400 with the body the safeguards patch returns), `drop` (200 with no `safeguard_results`).
- `STUB_CMD` replaces the stub's harmless file-writing command with one that needs the auto mode check. The runs below that show classifier requests used `curl -s -m 1 http://127.0.0.1:9/x`.

## Results

Main requests are the ones with tools. "Pair" means the beta value and the `safeguards` field.

| Mode | Request 1 | Later main requests | Claude Code's debug log |
|---|---|---|---|
| `spec` | pair sent, 400 | no beta value, no field | `[server-classifier] the platform rejected a beta on this request (HTTP 400), most likely dangerous-tool-use, which this deployment does not know yet; it is not sent again this session and auto mode decides with the local classifier` |
| `patch` | pair sent, 400 | no beta value, no field | the same line |
| `drop` | pair sent, 200 | beta value sent, no field | `[server-classifier] the platform gave no classification for this request (server_no_result); treating that as this deployment's answer: auto mode classifies locally for the rest of this session and stops sending the classifier context` |

In every mode the session finished with exit code 0 and printed this on stderr:

> We're changing auto mode to no longer charge for classifier requests in Claude Code. However, this session isn't eligible because your requests go through 127.0.0.1:<port>, which isn't compatible with this update. Auto mode works for now, and its classifier requests are billed as before. An upcoming release removes this fallback. In sessions like this one, each checked action will then be asked about or denied.

With the checked command, each action produced about ten requests to `claude-sonnet-5` with no tools. Those are Claude Code's own classifier requests. The stub answers them with the word "done", which the classifier cannot use, so it retried and then blocked the action. That count and the blocking are artefacts of the stub, not findings.

## Limits

- `-p` sessions only. No interactive session, no subagents, no Agent SDK host.
- One Claude Code version.
- The stub is not Anthropic. What Anthropic answers to the beta value without the field was not tested.
