<div align="center">

# LLM Router

### Manage every agent and provider from one place.

Connect Claude Code, Claude Design, Codex, Grok CLI, Kimi CLI, Kilo Code, OpenCode, Pi, ZCode, WorkBuddy, and compatible API clients to the providers you choose—then route, fail over, extend, and observe every request from one app.

<p>
  <a href="https://github.com/jrmatherly/llm-router/releases/latest"><img alt="Download Desktop" src="https://img.shields.io/badge/Download-Desktop_App-2563EB?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="#quick-start"><img alt="Quick Start" src="https://img.shields.io/badge/Get_Started-Quick_Start-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="https://jrmatherly.github.io/llm-router/en/"><img alt="Read the Docs" src="https://img.shields.io/badge/Explore-Documentation-0F172A?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
</p>

<p>
  <a href="README_zh.md"><img alt="Chinese README" src="https://img.shields.io/badge/%F0%9F%87%A8%F0%9F%87%B3-%E4%B8%AD%E6%96%87%E7%89%88-ff0000?style=flat" /></a>
  <a href="https://github.com/jrmatherly/llm-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/jrmatherly/llm-router" /></a>
</p>

<br />

<img src="blog/images/claude-code-router.png" width="820" alt="LLM Router Desktop dashboard" />

</div>

## Why use LLM Router?

LLM Router (LLMR) is a local model gateway and control plane for coding agents. It gives Claude Code, Claude Design, Codex, Grok CLI, Kimi CLI, Kilo Code, OpenCode, Pi, ZCode, WorkBuddy, and compatible API clients **one stable local endpoint**, while you manage the providers, models, accounts, routing rules, and tools behind it from one place.

Use LLMR to:

- **Manage all agents and providers together** instead of maintaining a separate model configuration for every client.
- **Switch providers or models without changing your workflow** or repeatedly editing agent configuration files.
- **Keep requests running** with retries, credential pools, key rotation, and ordered fallback models.
- **Add capabilities to existing models** with Fusion vision, web search, MCP tools, and ToolHub.
- **See what actually happened** through request logs, resolved routes, latency, token usage, cost estimates, and account status.

LLMR supports OpenAI Chat / Responses, Anthropic Messages, Gemini Generate Content / Interactions, OpenRouter, DeepSeek, SiliconFlow, Moonshot, Kimi Code, Mistral, Z.AI, Bailian, and custom compatible providers.

<details open>
<summary><strong>Supported Agents</strong></summary>

<div align="center">

<table width="100%">
  <tr>
    <td align="center" width="20%">
      <a href="https://github.com/anthropics/claude-code">
        <img src="/packages/ui/src/assets/agent-logos/claude-code.png" width="44" height="44" alt="Claude Code logo" />
        <br />
        <strong>Claude Code (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/openai/codex">
        <img src="/packages/ui/src/assets/agent-logos/codex.png" width="44" height="44" alt="Codex logo" />
        <br />
        <strong>Codex (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/xai-org/grok-build">
        <img src="/packages/ui/src/assets/agent-logos/grok.ico" width="44" height="44" alt="Grok CLI logo" />
        <br />
        <strong>Grok CLI (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/MoonshotAI/kimi-cli">
        <img src="/docs/public/provider-icons/moonshot.ico" width="44" height="44" alt="Kimi CLI logo" />
        <br />
        <strong>Kimi CLI (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://kilo.ai/">
        <img src="/packages/ui/src/assets/agent-logos/kilo.svg" width="44" height="44" alt="Kilo Code logo" />
        <br />
        <strong>Kilo Code (CLI)</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="20%">
      <a href="https://github.com/anomalyco/opencode">
        <img src="/packages/ui/src/assets/agent-logos/opencode.ico" width="44" height="44" alt="OpenCode logo" />
        <br />
        <strong>OpenCode (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/earendil-works/pi">
        <img src="/packages/ui/src/assets/agent-logos/pi.svg" width="44" height="44" alt="Pi logo" />
        <br />
        <strong>Pi (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://zcode.z.ai/en">
        <img src="/packages/ui/src/assets/agent-logos/zcode.png" width="44" height="44" alt="ZCode logo" />
        <br />
        <strong>ZCode (APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://www.anthropic.com/news/claude-design-anthropic-labs">
        <img src="/packages/ui/src/assets/agent-logos/claude-code.png" width="44" height="44" alt="Claude Design logo" />
        <br />
        <strong>Claude Design (APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://www.workbuddy.ai/">
        <img src="/packages/ui/src/assets/agent-logos/workbuddy.png" width="44" height="44" alt="WorkBuddy logo" />
        <br />
        <strong>WorkBuddy (APP)</strong>
      </a>
    </td>
  </tr>
</table>

</div>

</details>

## Quick Start

### Desktop app (recommended)

1. <details open>
   <summary><strong>Download LLM Router for macOS, Windows, or Linux, then launch the app.</strong></summary>

   <div align="center">

   <table width="100%">
     <tr>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/windows.png" width="44" height="44" alt="Windows logo" />
           <br />
           <strong>Windows</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/linux.png" width="44" height="44" alt="Linux logo" />
           <br />
           <strong>Linux</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/macos.png" width="44" height="44" alt="macOS logo" />
           <br />
           <strong>macOS (Apple Silicon)</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/macos.png" width="44" height="44" alt="macOS logo" />
           <br />
           <strong>macOS (Intel)</strong>
         </a>
       </td>
     </tr>
   </table>

   </div>

   </details>

2. Open **Providers → Add Provider**. Choose a built-in preset or a custom endpoint, enter the API key, select the protocol and models, then save.
3. Open **Server** and click **Start**. The local model gateway listens on `http://127.0.0.1:3456` by default.
4. Open **Agent Config**, choose Claude Code, Claude Design, Codex, Grok CLI, Kimi CLI, Kilo Code, OpenCode, Pi, ZCode, or WorkBuddy, select a model, and apply the profile.
5. Start using your agent. Open **Logs** to confirm the resolved provider, model, status, tokens, latency, and errors.

Your agent is now connected to LLMR. To add conditions, retries, request rewrites, or fallback models, open **Routing**.

### Upgrading from 4.x

5.0 is a clean reinstall: quit LLM Router, uninstall 4.x, install 5.0, then re-register any `llmr://` provider links. The `ccr` and `ccr-app` commands are now `llmr`.

### CLI

The desktop app puts the `llmr` command on `PATH` on first launch. Open a new terminal, then start the same gateway and a browser-based management UI:

```sh
llmr ui
```

Open `http://127.0.0.1:3458`, then follow the same **Providers → Server → Agent Profiles** flow above. The model gateway remains at `http://127.0.0.1:3456`. See the [CLI reference](https://jrmatherly.github.io/llm-router/en/guides/cli/) for service modes, authentication, and profile commands.

### Docker

```sh
npm run docker:compose:up
```

Docker exposes the management UI and gateway routes through `http://127.0.0.1:3458` by default. The npm script prepares the local plugin-capable ai-gateway runtime before building the image when `../../next-ai/gateway` exists. Read the [Docker deployment guide](https://jrmatherly.github.io/llm-router/en/guides/docker/) before exposing LLMR remotely.

## Build desktop apps

Install Node.js 24+, then run `npm ci`.

| Target | Command | Output |
| --- | --- | --- |
| macOS local DMG/ZIP | `npm run build:app:mac` | `release-local/` |
| Windows local NSIS installer | `npm run build:app:win` | `release-local/` |

Windows app packaging must run on Windows x64 because `better-sqlite3` ships a native Electron module. The release workflow builds macOS on macOS runners and Windows on `windows-latest` when a `v*` tag is pushed.

## How it works

```text
Claude Code · Claude Design · Codex · Grok CLI · Kimi CLI · Kilo Code · OpenCode · Pi · ZCode · WorkBuddy · Compatible API clients
                              │
                              ▼
                 LLM Router :3456
          Profiles · Routing · Credentials · Tools · Logs
                              │
                              ▼
             Selected provider, model, and account
```

## Core capabilities

| Area | Highlights |
| --- | --- |
| **Agents** | Profiles for Claude Code, Claude Design, Codex, Grok CLI, Kimi CLI, Kilo Code, OpenCode, Pi, ZCode, and WorkBuddy; model overrides; scopes; environment settings; CLI and app launch entries; multi-instance workflows |
| **Providers** | Presets and custom endpoints; protocol probing; model discovery; connectivity checks; local login import where supported; single keys and credential pools |
| **Models & routing** | Searchable catalog; model descriptions for task selection; conditions on headers and bodies; prefixes; rewrites; retries; ordered fallbacks |
| **Tools & extensions** | Fusion models; ToolHub; built-in browser automation; Chrome login-state import; wrapper and core gateway plugins; local routes and virtual models |
| **Access & quotas** | Separate LLMR client keys with expiration and local request, token, and image limits |
| **Observability** | Request and response details; resolved provider, model, and credential; status; latency; tokens; estimated cost; tool calls; agent traces |
| **AgentClaw** | Agent relay through Weixin iLink, WeCom, Slack, Discord, Telegram, LINE, Feishu, and DingTalk |

## Go deeper when you are ready

The complete documentation lives at **[jrmatherly.github.io/llm-router](https://jrmatherly.github.io/llm-router/en/)**.

- [Install and launch LLMR](https://jrmatherly.github.io/llm-router/en/guides/install/)
- [Configure providers](https://jrmatherly.github.io/llm-router/en/guides/provider/)
- [Explore routing and configuration](https://jrmatherly.github.io/llm-router/en/configuration/overview/)
- [Use the CLI](https://jrmatherly.github.io/llm-router/en/guides/cli/)
- [Deploy with Docker](https://jrmatherly.github.io/llm-router/en/guides/docker/)
- [Troubleshoot common issues](https://jrmatherly.github.io/llm-router/en/troubleshooting/)

## Credits

LLM Router is a fork of [claude-code-router](https://github.com/musistudio/claude-code-router) by musistudio.

## License

This project is licensed under the [MIT License](LICENSE).
