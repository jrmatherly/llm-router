# Stdio MCP framing feedback spec

This spec records what happens when a stdio MCP server is set to the wrong message framing, the options for fixing it, and what the owner decided. The plan is [`plans/2026-11-16-mcp-stdio-framing-feedback.md`](../plans/2026-11-16-mcp-stdio-framing-feedback.md).

## Goal

When a stdio MCP server fails its handshake because LLMR spoke `Content-Length` framing to it, tell the user that framing is the likely cause, at the place where they see the failure.

## Background

The MCP specification defines one stdio framing: "Messages are delimited by newlines" (<https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>, read 2026-11-16). LLMR also supports `Content-Length` framing, the LSP convention, because its own bundled MCP servers use it.

PR 76 (`75cb9c4d`, 2026-11-16) changed the default for a stdio server with no message mode from `content-length` to `newline-json`. It did not change servers that carry an explicit mode. The settings page used to write `content-length` explicitly into every stdio server it saved, so a server saved before PR 76 still has it.

## Findings

Each finding says how it was established.

| ID | Finding | Evidence |
|---|---|---|
| F-1 | A standard MCP server that receives `Content-Length` framing never answers. | Read from the official SDKs. The TypeScript SDK's `ReadBuffer.readMessage` splits on `\n` and skips a line that is not JSON (`packages/core-internal/src/shared/stdio.ts` in `modelcontextprotocol/typescript-sdk`). The Python SDK's stdin loop does the same (`src/mcp/server/stdio.py`). LLMR's frame has no trailing newline, so the JSON body never becomes a complete line. |
| F-2 | Tool discovery then waits for the whole timeout and reports only the timeout. | Measured 2026-11-16 with a server that parses stdin as F-1 describes: `newline-json` listed tools in 30 ms; `content-length` failed with "MCP tools discovery timed out after 3000 ms." after 3002 ms, with `startupTimeoutMs: 3000`. |
| F-3 | That timeout is ten minutes by default. | `mcpTimeoutMs` in `packages/core/src/mcp/tool-discovery.ts` uses `startupTimeoutMs`, and the UI default is `mcpServerStartupTimeoutMs = 600000` in `packages/ui/src/pages/home/shared/options.ts`. |
| F-4 | The ToolHub runtime waits twice as long and gives a worse message. | Read and measured. `StdioMcpClient.ensureInitialized` in `packages/core/src/mcp/toolhub-mcp.ts` waits `startupTimeoutMs` for `initialize`. When the catalog is empty, `ToolHubRuntime` probes every server a second time (`refreshServers(undefined, true)`), so the wait doubles: a server with `startupTimeoutMs: 1000` answered after 2006 ms. `ToolHubRegistry.probeServer` stores the failure in `entry.error`, and nothing reads that field. The caller gets "No MCP tools are available to resolve." |
| F-7 | In ToolHub, a server whose command does not exist loses its spawn error and waits for the timeout. | Measured 2026-11-16 by three reviewers. A missing command emits `error` and `close` on the child, never `exit`. `StdioMcpClient`'s `error` handler rejects the pending request and keeps `this.child`. The second probe (F-4) writes to the dead child and waits `startupTimeoutMs`, then overwrites the stored `spawn ... ENOENT` with a timeout. Four such servers at the 60 s default took 480 s to answer. |
| F-5 | The settings page cannot test a server. | Read. `packages/ui/src/pages/home/components/settings.tsx` has no call to `listMcpServerTools`. Only the virtual-model page runs discovery. |
| F-6 | The affected servers are the ones saved from the settings page before PR 76. | Read. `mcpServerConfigFromDraft` in `packages/ui/src/pages/home/shared/virtual-models.ts` always writes `draft.stdioMessageMode`, and the old draft default was `content-length`. |
| F-8 | With ToolHub turned off, neither of LLMR's stdio clients runs the user's servers for agent traffic. | Read 2026-11-16. `compileCoreGatewayConfig` in `packages/core/src/gateway/core-runtime/config-compiler.ts` puts `externalMcpServers` straight into the gateway child's `agent.mcpServers` when `toolHubMcpServer` returns nothing. The gateway child's stdio client is in the `ai-gateway` package, so option A cannot change its errors. Option B reaches it, because the compiler writes the mode the gateway child uses. |

Not verified: a real SDK-built server was not run, because the SDK is not installed in this repo. F-2 used a script that mirrors the parsing in F-1. The spawn behavior in F-7 was measured on macOS with Node 24 only.

A second pass on 2026-11-16 ran the plan's five discovery cases against `main` at `c3655c19`: every message matched the plan, and a missing command failed in 3 ms with `spawn ... ENOENT`. F-8 came from that pass.

Three reviewers on different models tried to break this spec and its plan on 2026-11-16, each by running probes and prototypes against the code. F-7, the doubling in F-4 and the plugin path in option B came from them.

## Options

| Option | What it does | Verdict |
|---|---|---|
| A | Add a framing hint to the errors of both stdio clients, show a failed backend's stored error when ToolHub has no tools, and stop reusing a child process that failed to start (F-7). It does not cover agent traffic with ToolHub turned off (F-8). | Recommended. Planned as MF-1. |
| B | Ignore `content-length` for every server LLMR's own stdio clients talk to, keep it for LLMR's bundled servers, and remove the dropdown. Old saved servers then work with no migration, with ToolHub on or off (F-8). Those clients also receive servers a plugin contributes (`coreGateway.config.agent.mcpServers`), so a plugin could no longer ask for `content-length`. No plugin in this repo does. | Chosen by OD-1. Planned as MF-2. |
| C | Retry in the other framing after a short silence. | Rejected. A slow first start, such as `npx` downloading a package, looks like silence and would trigger a wrong retry and a second `initialize`. |
| D | Give interactive discovery a shorter timeout than server startup. | Chosen by OD-2. Planned as MF-3. |
| E | Add a "test" action to the settings page. | Not planned. It needs a UI design first. |

## Decisions

| ID | Decision | Status |
|---|---|---|
| D-1 | No migration rewrites a saved server's mode. The project has no consumers (decision D-9 of `2026-11-16-audit-remediation.md`). | Standing. |
| D-2 | Option C is rejected. | Decided by the reasoning above; the owner has not objected. |
| OD-1 | Should every stdio server that LLMR's own clients talk to, user-configured or plugin-supplied, always use newline JSON (option B)? | Yes. Decided by the owner on 2026-11-16. |
| OD-2 | Should discovery time out sooner than server startup, and after how long (option D)? | Yes, after 60000 ms. Decided by the owner on 2026-11-16. |

## Constraints

- The fixed hint text is: `This server is set to Content-Length framing. MCP servers use newline JSON unless they document otherwise. Set its stdio message mode to newline-json.`
- The hint appears only when the server's mode is `content-length` and the handshake failed. A timeout or exit after a successful `initialize` gets no hint.
- LLMR's bundled MCP servers keep `content-length`. They set it explicitly in `packages/core/src/mcp/fusion-config.ts`, `packages/core/src/mcp/grok-media-config.ts` and `packages/electron/src/main/electron-web-search-mcp.ts`, and they read only that framing.
- `packages/core/src/mcp/**` follows `.claude/rules/mcp-subprocess.md`: run `npm run build:assets` after touching a file there, then restore the generated files.
