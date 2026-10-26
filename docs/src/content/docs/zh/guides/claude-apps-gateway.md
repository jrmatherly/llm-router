---
title: Claude apps gateway 上游
pageTitle: Claude apps gateway 上游
eyebrow: 快速开始
lead: 把 LLMR 作为 Anthropic Claude apps gateway 的上游：网关负责开发者登录与策略，LLMR 负责供应商路由，并把每条请求归属到网关转发过来的开发者。
---

## 网关做什么，LLMR 在哪里

Claude apps gateway 是 Claude Code 二进制自带的 `claude gateway` 子命令。它通过你的身份提供方让开发者登录、签发短期令牌、执行模型白名单和花费上限，并把每条 `/v1/messages` 请求转发给一个上游。LLMR 就是这个上游：在网关之后完成供应商路由、凭据池和配额，无论是单机还是共享主机。

## 把网关指向 LLMR

在网关的 `gateway.yaml` 里把 LLMR 配成 `anthropic` 上游，密钥用 LLMR **API Keys** 页创建的客户端密钥：

```yaml
upstreams:
  - provider: anthropic
    base_url: http://<llmr-host>:3456
    auth: { api_key: ${LLMR_CLIENT_KEY} }
    forward_user_identity: true
```

网关会自己补上 `/v1/messages`，所以 `base_url` 不带 `/v1` 后缀。`GET /v1/models` 由网关用自己的 `models:` 目录回答，不会到达 LLMR；网关在转发前会把 `claude-sonnet-4-5` 这类别名解析成带日期的 id（`claude-sonnet-4-5-20250929`），因此负责应答的 LLMR 供应商必须列出带日期的 id。

## LLMR 记录什么

开启 `forward_user_identity: true` 后，网关会给每条转发请求加上 `x-claude-gateway-user-email`、`x-litellm-end-user-id` 和 `x-claude-gateway-user-id`。LLMR 用 `x-claude-gateway-user-email` 作为请求的客户端标签，没有时退回 `x-litellm-end-user-id`，所以请求日志里的客户端就是开发者的邮箱。同时带有 `x-ccr-client` 的请求保留该标签；网关前面的 LLMR 感知代理优先。

LLMR 会把这三个身份头原样转发给请求最终路由到的供应商，因此开发者邮箱也会到达该供应商。请求日志只保留本地当天的数据，邮箱也随之保存。到 **设置 → 日志与观测** 打开 **请求日志** 才能看到这些记录。

## 被网关锁定的机器上的 Claude Code 配置

托管设置里写了 `forceLoginMethod: "gateway"` 或 `allowedProviders: ["gateway"]` 的机器只允许 Claude Code 通过网关登录；用 API 密钥或 `apiKeyHelper` 鉴权的会话会在启动时退出。LLMR 的 Claude Code 配置应用写入的正是这类鉴权（API 密钥或 `apiKeyHelper`），所以写入前会先读取各系统的托管设置（macOS 的 `/Library/Application Support/ClaudeCode/managed-settings.json`，Linux 和 WSL 的 `/etc/claude-code/managed-settings.json`，Windows 的 `%ProgramFiles%\ClaudeCode\managed-settings.json`，以及同目录下的 `managed-settings.d/*.json`）和配置自己的设置文件。任一处锁定了机器，应用就会被拒绝，并提示：

```text
Claude Code on this machine is pinned to a Claude apps gateway by <key> in <file>. LLMR did not change <settings file>; sign Claude Code in to the gateway, or point the gateway's upstream at LLMR instead.
```

`<key>` 是锁定机器的那个键，`forceLoginMethod` 或 `allowedProviders`。通过 macOS plist 或 Windows 注册表下发的托管设置不会被读取。这类机器上请让 Claude Code 登录网关，再按上文把网关的上游指向 LLMR。

## 本地试一下

仓库在 `docker/claude-apps-gateway/` 下提供了一套本地环境：Docker 里跑 PostgreSQL 和一个模拟的 OpenID Connect 发行方，主机上跑原生的 `claude gateway`，上游指向本地 LLMR：

```bash
node scripts/claude-apps-gateway-dev.mjs --api-key <llmr-client-key>
```

`--load-test` 用网关的固定回复替代上游，不需要 LLMR 也能检查登录链路。`--port`、`--dex-port` 和 `--upstream` 分别调整网关、发行方和 LLMR 的地址。通过模拟发行方登录的用户都是 `kilgore@kilgore.trout`；发一条请求后，LLMR 的日志页会把这个邮箱显示为客户端。清理：

```bash
docker compose -f docker/claude-apps-gateway/compose.yaml down -v
```

## 参考部署

- [sample-claude-apps-gateway-on-aws](https://github.com/aws-samples/sample-claude-apps-gateway-on-aws)：网关在 AWS 上的参考部署。
- Anthropic 文档：[Claude apps gateway](https://code.claude.com/docs/en/claude-apps-gateway)、[配置](https://code.claude.com/docs/en/claude-apps-gateway-config)、[花费上限](https://code.claude.com/docs/en/claude-apps-gateway-spend-limits)。
