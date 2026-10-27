# LLM Router CLI

[English](README.md) · [完整文档](https://ccrdesk.top/) · [GitHub](https://github.com/musistudio/claude-code-router)

`@claude-code-router/cli` 是 LLM Router `llmr` 命令背后的工作区包。它提供浏览器管理界面、本地模型网关和 Agent 配置启动能力，不需要安装 Electron。

CLI 适合开发机和无桌面的服务器。如果你需要系统托盘、桌面通知、应用自动更新或桌面端专属的浏览器集成，请安装桌面应用。

## 环境要求与安装

- Node.js 22 或更高版本
- 一个可用的上游模型供应商，或 LLMR 支持导入的本机 Agent 登录态
- 使用配置启动命令时，本机需要已经安装对应 Agent

这个包不发布到 npm。桌面应用首次启动时会把 `llmr` 加入 `PATH`：

```sh
llmr --help
```

## 快速开始

启动后台服务并打开管理界面：

```sh
llmr ui
```

然后按以下顺序配置：

1. 添加上游供应商和至少一个模型。
2. 在 **API 密钥** 页面创建 LLMR 客户端密钥。
3. 如果默认供应商 / 模型不够用，再配置路由规则。
4. 在 **服务** 页面确认网关已经运行。
5. 把客户端指向界面显示的网关地址。网关默认是 `http://127.0.0.1:3456`，管理界面默认是 `http://127.0.0.1:3458`。

管理 Token 和 LLMR 客户端 API Key 是两种不同凭据。管理 Token 保护浏览器 UI 和 RPC 接口，LLMR 客户端 Key 用于验证发送到模型网关的请求。

## 服务命令

| 命令 | 行为 |
| --- | --- |
| `llmr start` | 在后台启动管理服务和网关，并打印带认证信息的管理 URL。 |
| `llmr ui` | 复用或启动后台服务，然后打开管理界面。 |
| `llmr stop` | 停止由 `llmr start` 或 `llmr ui` 启动的后台服务。 |
| `llmr serve` | 在前台运行管理服务和网关；`llmr web` 是别名。 |
| `llmr <配置>` | 按名称或 ID 打开一个已启用的 Agent 配置。 |

### `llmr start`

```text
llmr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

- `--host <host>`：管理服务监听地址，默认 `127.0.0.1`。
- `--port <port>`：管理服务首选端口，默认 `3458`。
- `--open` / `--no-open`：是否打开浏览器。
- `--gateway`：明确要求启动模型网关；这是默认行为。
- `--no-gateway`：只启动管理服务，不启动模型网关。

### `llmr ui`

```text
llmr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` 默认会打开浏览器。在 SSH 或其他无桌面环境中使用 `--no-open`。

### `llmr serve`

```text
llmr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` 会留在当前终端并处理 `SIGINT` / `SIGTERM`，适合交给进程管理器托管。`llmr stop` 只管理后台服务；前台服务需要在终端或进程管理器中停止。

如果首选管理端口已被占用，LLMR 会继续尝试后续端口并打印实际 URL。`start` 或 `ui` 复用已运行服务时，新传入的 Host、Port 和 `--no-gateway` 不会重配该进程；要修改这些选项，请先运行 `llmr stop`。

## Agent 配置启动

先在 **Agent 配置档案** 中创建并启用配置，然后按名称或 ID 启动：

```sh
llmr "Codex - Work"
llmr "Codex - Work" app
llmr "Claude - Review" cli -- --model sonnet
llmr profile-id -- --help
```

完整语法：

```text
llmr <配置名称或 ID> [cli|app] [-- <Agent 参数>]
```

- `--cli` 和 `--app` 也可以代替位置形式的入口类型。
- Agent 自己的参数建议统一放到 `--` 后，避免被识别为 LLMR 参数。
- 省略入口类型时，Claude Code、Codex、Grok CLI、Kimi CLI、Pi 默认使用 CLI，ZCode 默认使用 App。
- Grok CLI、Kimi CLI 和 Pi 只支持 CLI，ZCode 只支持 App。Claude App 和 ZCode App 不接受额外 Agent 参数。
- 启动桌面 App 时，本机必须已安装对应应用，并且当前环境必须有图形会话。
- 大多数配置需要先启动 LLMR 服务。Grok CLI、Kimi CLI 和 Pi 配置可以自动启动一个临时共享服务，并在最后一个受管会话退出后停止。

桌面 Agent 配置档案卡片复制出来的命令同样使用 `llmr`。

## 配置与运行文件

| 平台 | 配置目录 |
| --- | --- |
| macOS / Linux | `~/.llm-router` |
| Windows | `%APPDATA%\claude-code-router` |

重要文件包括：

- `config.sqlite`：当前应用配置。
- `app-data/`：API Key、用量、请求日志、证书等运行数据库和文件。
- `service.json`：后台 CLI 服务的状态和私有 Token。
- `gateway.config.json`：生成的网关运行配置。
- `profiles/` 和 `bin/`：隔离的 Agent 配置和启动包装器。

LLMR 写入 SQLite 时不要直接编辑或复制活跃数据库。优先使用 UI 导出；要做文件级备份，请先停止 LLMR。

## 环境变量与安全

| 变量 | 说明 |
| --- | --- |
| `CCR_WEB_HOST` | 省略 `--host` 时使用的管理服务监听地址。 |
| `CCR_WEB_PORT` | 省略 `--port` 时使用的管理服务端口。 |
| `CCR_WEB_AUTH_TOKEN` | 固定管理 UI / RPC 的认证 Token；不设置时每个进程会生成随机 Token。 |

认证后的管理 URL 会在查询参数中包含 `ccr_web_token`。请把这个 URL 当作密码，不要复制到日志、工单或公开的 Shell 历史中。除非确实需要远程访问，否则监听地址应保持 `127.0.0.1`。远程访问时，应同时使用防火墙或私网，并在可信反向代理上启用 TLS。

不要在未创建 LLMR 客户端 API Key 的情况下暴露网关。上游供应商凭据保存在 LLMR 本地数据目录中，因此也要保护该目录及其备份。

## 常见问题

### 找不到 `llmr` 命令

打开一次 LLM Router 桌面应用，让它写入 `llmr` 并把 `bin/` 目录加入 `PATH`，然后打开一个新终端。

### 管理 URL 的端口发生变化

首选端口已被占用。请使用 LLMR 打印的实际 URL，或停止占用端口的进程后重启 LLMR。

### UI 能打开，但网关不可用

管理服务可以在没有可用网关时单独运行。请添加供应商和模型、创建客户端 API Key，然后从 **服务** 页面启动或重启网关。排查启动错误时，可以使用 `llmr serve` 查看前台输出。

### 找不到 Agent 配置

只有已启用的配置才能启动。名称匹配不区分大小写，也接受清理后的名称；如果多个名称产生歧义，必须使用配置 ID。生成的启动器缺失时，请重新保存配置。

### 后台服务仍使用旧参数

停止并重新创建服务：

```sh
llmr stop
llmr start --host 127.0.0.1 --port 3458
```

## Docker

仓库还提供面向模型网关和浏览器 UI 的 Docker 镜像。运行时镜像不会安装 `llmr` 命令。请参阅 [Docker 部署文档](https://github.com/musistudio/claude-code-router/blob/main/docker/README.md)。

## 许可证

[MIT](LICENSE)
