<div align="center">

# LLM Router

### 在一个地方，管理你所有的 Agent 与 Provider

让 Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode、WorkBuddy 和兼容 API 客户端连接你选择的供应商，并在一个应用里完成每次请求的路由、降级、增强与观测。

<p>
  <a href="#桌面端推荐"><img alt="下载桌面端" src="https://img.shields.io/badge/%E7%AB%8B%E5%8D%B3%E4%B8%8B%E8%BD%BD-%E6%A1%8C%E9%9D%A2%E5%AE%A2%E6%88%B7%E7%AB%AF-2563EB?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="#快速开始"><img alt="快速开始" src="https://img.shields.io/badge/%E7%AB%8B%E5%8D%B3%E4%BD%BF%E7%94%A8-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="https://jrmatherly.github.io/llm-router/"><img alt="查看文档" src="https://img.shields.io/badge/%E6%B7%B1%E5%85%A5%E4%BA%86%E8%A7%A3-%E5%AE%8C%E6%95%B4%E6%96%87%E6%A1%A3-0F172A?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
</p>

<p>
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://github.com/jrmatherly/llm-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/jrmatherly/llm-router" /></a>
</p>

<br />

<img src="blog/images/claude-code-router.png" width="820" alt="LLM Router 桌面端控制台" />

</div>

## 为什么使用 LLM Router？

LLM Router（LLMR）是面向编程 Agent 的本地模型网关与控制平面。它为 Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode、WorkBuddy 和兼容 API 客户端提供**一个稳定的本地入口**，让你在一个地方管理入口背后的供应商、模型、账号、路由规则与工具。

你可以使用 LLMR：

- **统一管理所有 Agent 与 Provider**，不再为每个客户端维护一套独立模型配置。
- **切换供应商或模型而不改变工作流**，无需反复修改 Agent 配置文件。
- **通过重试、凭据池、Key 轮换和 Fallback 保持请求可用**。
- **通过 Fusion 视觉、联网搜索、MCP 工具和 ToolHub 扩展现有模型**。
- **通过请求日志、最终路由、耗时、Token、成本估算和账号状态了解真实运行情况**。

LLMR 支持 OpenAI Chat / Responses、Anthropic Messages、Gemini Generate Content / Interactions、OpenRouter、DeepSeek、SiliconFlow、Moonshot、Kimi Code、Mistral、Z.AI、百炼以及自定义兼容供应商。

<details open>
<summary><strong>支持的 Agent</strong></summary>

<div align="center">

<table width="100%">
  <tr>
    <td align="center" width="20%">
      <a href="https://github.com/anthropics/claude-code">
        <img src="/packages/ui/src/assets/agent-logos/claude-code.png" width="44" height="44" alt="Claude Code 图标" />
        <br />
        <strong>Claude Code (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/openai/codex">
        <img src="/packages/ui/src/assets/agent-logos/codex.png" width="44" height="44" alt="Codex 图标" />
        <br />
        <strong>Codex (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/xai-org/grok-build">
        <img src="/packages/ui/src/assets/agent-logos/grok.ico" width="44" height="44" alt="Grok CLI 图标" />
        <br />
        <strong>Grok CLI (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/MoonshotAI/kimi-cli">
        <img src="/docs/public/provider-icons/moonshot.ico" width="44" height="44" alt="Kimi CLI 图标" />
        <br />
        <strong>Kimi CLI (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://kilo.ai/">
        <img src="/packages/ui/src/assets/agent-logos/kilo.svg" width="44" height="44" alt="Kilo Code 图标" />
        <br />
        <strong>Kilo Code (CLI)</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="20%">
      <a href="https://github.com/anomalyco/opencode">
        <img src="/packages/ui/src/assets/agent-logos/opencode.ico" width="44" height="44" alt="OpenCode 图标" />
        <br />
        <strong>OpenCode (CLI & APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://github.com/earendil-works/pi">
        <img src="/packages/ui/src/assets/agent-logos/pi.svg" width="44" height="44" alt="Pi 图标" />
        <br />
        <strong>Pi (CLI)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://zcode.z.ai/cn">
        <img src="/packages/ui/src/assets/agent-logos/zcode.png" width="44" height="44" alt="ZCode 图标" />
        <br />
        <strong>ZCode (APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://www.anthropic.com/news/claude-design-anthropic-labs">
        <img src="/packages/ui/src/assets/agent-logos/claude-code.png" width="44" height="44" alt="Claude Design 图标" />
        <br />
        <strong>Claude Design (APP)</strong>
      </a>
    </td>
    <td align="center" width="20%">
      <a href="https://www.workbuddy.ai/">
        <img src="/packages/ui/src/assets/agent-logos/workbuddy.png" width="44" height="44" alt="WorkBuddy 图标" />
        <br />
        <strong>WorkBuddy (APP)</strong>
      </a>
    </td>
  </tr>
</table>

</div>

</details>

## 快速开始

### 桌面端（推荐）

1. <details open>
   <summary><strong>下载 LLM Router，选择 macOS、Windows 或 Linux 版本并启动应用。</strong></summary>

   <div align="center">

   <table width="100%">
     <tr>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/windows.png" width="44" height="44" alt="Windows 图标" />
           <br />
           <strong>Windows</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/linux.png" width="44" height="44" alt="Linux 图标" />
           <br />
           <strong>Linux</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/macos.png" width="44" height="44" alt="macOS 图标" />
           <br />
           <strong>macOS (Apple Silicon)</strong>
         </a>
       </td>
       <td align="center" width="330">
         <a href="https://github.com/jrmatherly/llm-router/releases/latest">
           <img src="/docs/public/platform-icons/macos.png" width="44" height="44" alt="macOS 图标" />
           <br />
           <strong>macOS (Intel)</strong>
         </a>
       </td>
     </tr>
   </table>

   </div>

   </details>

2. 打开 **供应商 → 添加供应商**。选择内置预设或自定义端点，填写 API Key，选择协议与模型，然后保存。
3. 打开 **服务** 并点击 **启动**。本地模型网关默认监听 `http://127.0.0.1:3456`。
4. 打开 **Agent配置**，选择 Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode 或 WorkBuddy，指定模型并应用配置档案。
5. 开始使用 Agent。在 **日志** 中确认最终供应商、模型、状态、Token、耗时与错误。

现在 Agent 已经连接到 LLMR。如需增加条件规则、自动重试、请求改写或 Fallback 模型，请打开 **路由**。

### 从 4.x 升级

5.0 需要全新安装：退出 LLM Router，卸载 4.x，安装 5.0，然后重新注册 `llmr://` 供应商链接。`ccr` 和 `ccr-app` 命令现已改为 `llmr`。

### CLI

桌面应用首次启动时会把 `llmr` 命令加入 `PATH`。打开一个新终端，即可启动相同的模型网关与浏览器管理界面：

```sh
llmr ui
```

打开 `http://127.0.0.1:3458`，然后按照上面的 **供应商 → 服务 → Agent 配置档案** 流程操作。模型网关仍位于 `http://127.0.0.1:3456`。服务模式、鉴权和 Profile 命令见 [CLI 命令参考](https://jrmatherly.github.io/llm-router/guides/cli/)。

### Docker

```sh
npm run docker:compose:up
```

Docker 默认通过 `http://127.0.0.1:3458` 提供管理界面与网关路由。这个 npm 脚本会在存在 `../../next-ai/gateway` 时先准备本地支持插件的 ai-gateway runtime，再构建镜像。远程暴露 LLMR 前，请先阅读 [Docker 部署指南](https://jrmatherly.github.io/llm-router/guides/docker/)。

## 构建桌面应用

先安装 Node.js 24+，然后执行 `npm ci`。

| 目标 | 命令 | 产物目录 |
| --- | --- | --- |
| macOS 本地 DMG/ZIP | `npm run build:app:mac` | `release-local/` |
| Windows 本地 NSIS 安装包 | `npm run build:app:win` | `release-local/` |

Windows App 打包必须在 Windows x64 上运行，因为 `better-sqlite3` 包含 Electron 原生模块，不能从 macOS 或 Linux 交叉编译。推送 `v*` tag 时，release workflow 会分别在 macOS runner 和 `windows-latest` 上构建 macOS 与 Windows 产物。

## 工作方式

```text
Claude Code · Claude Design · Codex · Grok CLI · Kimi CLI · Kilo Code · OpenCode · Pi · ZCode · WorkBuddy · 兼容 API 客户端
                              │
                              ▼
                 LLM Router :3456
              配置档案 · 路由 · 凭据 · 工具 · 日志
                              │
                              ▼
                  命中的供应商、模型与账号
```

## 核心能力

| 能力领域 | 功能亮点 |
| --- | --- |
| **Agent** | Claude Code、Claude Design、Codex、Grok CLI、Kimi CLI、Kilo Code、OpenCode、Pi、ZCode 和 WorkBuddy 配置档案；模型覆盖；作用范围；环境变量；CLI / App 启动入口；多开工作流 |
| **供应商** | 内置预设和自定义端点；协议探测；模型发现；连通性检测；按支持情况导入本机登录态；单 Key 与凭据池 |
| **模型与路由** | 可搜索模型目录；用于任务选择的模型描述；Header / Body 条件；模型前缀；请求改写；重试；有序 Fallback |
| **工具与扩展** | Fusion 模型；ToolHub；内置浏览器自动化；Chrome 登录态导入；wrapper / core gateway plugin；本地路由与虚拟模型 |
| **访问与额度** | 独立的 LLMR 客户端 Key，可设置有效期以及本地请求、Token 和图片限额 |
| **日志与观测** | 请求 / 响应详情；最终供应商、模型与凭据；状态；耗时；Token；成本估算；工具调用；Agent 执行链路 |
| **AgentClaw** | 通过微信 iLink、企业微信、Slack、Discord、Telegram、LINE、飞书和钉钉接力 Agent |

## 准备好后，继续深入

完整文档位于 **[jrmatherly.github.io/llm-router](https://jrmatherly.github.io/llm-router/)**。

- [安装并启动 LLMR](https://jrmatherly.github.io/llm-router/guides/install/)
- [配置供应商](https://jrmatherly.github.io/llm-router/guides/provider/)
- [了解路由与完整配置](https://jrmatherly.github.io/llm-router/configuration/overview/)
- [使用 CLI](https://jrmatherly.github.io/llm-router/guides/cli/)
- [通过 Docker 部署](https://jrmatherly.github.io/llm-router/guides/docker/)
- [排查常见问题](https://jrmatherly.github.io/llm-router/troubleshooting/)

## 致谢

LLM Router 派生自 musistudio 的 [claude-code-router](https://github.com/musistudio/claude-code-router)。

## 许可证

本项目基于 [MIT License](LICENSE) 发布。
