# English-only parity audit: docs, blog and READMEs

Date: 2026-10-27. Base: `main` at 496e2af1.

This is the record that removing the Chinese docs, blog posts and READMEs lost no content. Each Chinese source was compared with its English twin section by section: headings, paragraphs, list items, table rows, notes, code blocks, commands, links, images and deeplink buttons. A gap is a fact present in Chinese and absent in English. Every gap was either ported into the English file or is listed with the reason it was not.

Totals: 15 gaps ported across 9 English files. No gap was left unported.

## Docs pages (`docs/src/content/docs/zh/` to `docs/src/content/docs/en/`)

| zh source | en target | gap | action |
| --- | --- | --- | --- |
| `index.md` | `index.md` | none | none |
| `guides.md` | `guides.md` | The Credential pool tab sits in the credentials step | ported (Multiple keys paragraph) |
| `guides/install.md` | `guides/install.md` | Docker row: Docker also gives one browser entry point | ported (install table, Docker row) |
| `guides/cli.md` | `guides/cli.md` | none | none |
| `guides/docker.md` | `guides/docker.md` | none | none |
| `guides/provider.md` | `guides/provider.md` | none | none |
| `guides/agent-profile.md` | `guides/agent-profile.md` | none | none |
| `guides/observability.md` | `guides/observability.md` | Long-term retention of request logs relies on export or separate archiving | ported (request logs paragraph; **Settings → Export data** includes the request-log database, checked in `exportAppData`) |
| `guides/claude-apps-gateway.md` | `guides/claude-apps-gateway.md` | none | none |
| `troubleshooting.md` | `troubleshooting.md` | none | none |
| `configuration.md` | `configuration.md` | none | none |
| `configuration/overview.md` | `configuration/overview.md` | none | none |
| `configuration/providers.md` | `configuration/providers.md` | (1) keep provider names short and stable; (2) "Models to check" avoids the usage cost of checking every model; (3) credential pool picks the key LLMR uses upstream, client keys pick the key a client uses to call LLMR; (4) with "Fetch usage" off the usage endpoint is not called | ported (Name row, Models to check row, paragraph after the limits example, Fetch usage row) |
| `configuration/profiles.md` | `configuration/profiles.md` | none | none |
| `configuration/api-keys.md` | `configuration/api-keys.md` | The key is not shown again for security reasons | ported (Edit API key row) |
| `configuration/observability.md` | `configuration/observability.md` | none | none |
| `configuration/server.md` | `configuration/server.md` | none (zh says host proxy/CA from containers is "not recommended", en says "not supported"; en is stricter) | none |
| `configuration/configuration-file.md` | `configuration/configuration-file.md` | none | none |
| `configuration/tray.md` | `configuration/tray.md` | none | none |
| `configuration/agents/claude-code.md` | same | none | none |
| `configuration/agents/claude-design.md` | same | none | none |
| `configuration/agents/codex.md` | same | none (en is ahead: it names `show_all_sessions`) | none |
| `configuration/agents/grok.md` | same | none | none |
| `configuration/agents/kilo.md` | same | none | none |
| `configuration/agents/kimi.md` | same | none | none |
| `configuration/agents/opencode.md` | same | none | none |
| `configuration/agents/pi.md` | same | none | none |
| `configuration/agents/workbuddy.md` | same | none | none |
| `configuration/agents/zcode.md` | same | none | none |
| `configuration/extensions.md` | `configuration/extensions.md` | (1) minimal marketplace directory layout example; (2) `"description"` field in the example JSON; (3) distribute multi-file extensions as a local directory; (4) the schema documents the recommended fields | ported (Distribution and marketplace manifests section) |
| `configuration/fusion.md` | same | none | none |
| `configuration/fusion-mcp-tool.md` | same | none | none |
| `configuration/fusion-vision.md` | same | none | none |
| `configuration/fusion-web-search.md` | same | none | none |
| `configuration/routing.md` | `configuration/routing.md` | Launch the desktop app from an environment that passes `CCR_JEV_*` and `TYPESAFE_API_KEY` through | ported (Jev section) |
| `configuration/toolhub.md` | same | none | none |
| `configuration/provider-deeplink.md` | `configuration/provider-deeplink.md` | none; two en buttons still carried Chinese provider names | fixed: Infistar button name is now "Infistar AI" (from the preset's English aliases), Qiniu button `name=` is now "Qiniu Cloud AI" (matching its visible label) |
| `fusion/image-generation.md` | same | none | none |
| `fusion/video-generation.md` | same | none | none |
| `agentclaw.md` | `agentclaw.md` | none | none |
| `agentclaw/setup.md` | same | none | none |
| `agentclaw/slack.md` | same | none | none |
| `agentclaw/discord.md` | same | none | none |
| `agentclaw/telegram.md` | same | none | none |
| `agentclaw/line.md` | same | none | none |
| `agentclaw/weixin-ilink.md` | same | none | none |
| `agentclaw/wecom.md` | same | none; en quoted Chinese console labels | labels now English only (`Create App`, `CorpID`, `Trusted Enterprise IPs`, ...) |
| `agentclaw/feishu.md` | same | none; en quoted Chinese console labels | labels now English only |
| `agentclaw/dingtalk.md` | same | none; en quoted Chinese console labels | labels now English only |

## Blog, READMEs and Docker README

| zh source | en target | gap | action |
| --- | --- | --- | --- |
| `blog/zh/项目初衷及原理.md` | `blog/en/project-motivation-and-how-it-works.md` | The `background` bullet's example tasks (haiku generation, conversation summaries) | ported (`background` bullet) |
| `blog/zh/从CLI工具风格看工具渐进式披露.md` | `blog/en/progressive-disclosure-of-agent-tools-from-the-perspective-of-cli-tool-style.md` | none. The zh file is twice the size because it is corrupted: line 15 cuts into an image URL and the whole post repeats from there. | none; translated one Chinese sentence inside a quoted tool listing in en |
| `blog/zh/或许我们能在Router中做更多事情.md` | `blog/en/maybe-we-can-do-more-with-the-route.md` | none | none |
| `README_zh.md` | `README.md` | none | removed the Chinese README badge; Credits kept |
| `packages/cli/README_zh.md` | `packages/cli/README.md` | none | removed the `中文` link; dropped `README_zh.md` from `packages/cli/package.json` `files` |
| `docker/README.md` "中文说明" section | `docker/README.md` English body | Two running containers must never share one data directory, named volume or bind mount (en said this only for bind mounts) | ported (Persistent Data); Chinese section and its link removed |

## Strings in docs site code

| zh source | en target | gap | action |
| --- | --- | --- | --- |
| `docs/src/docs-structure.ts` zh labels and paths | same file, en values | none; every entry had an en value | zh values and the `Locale` type removed |
| `docs/src/i18n/content.ts` zh UI strings | same file, en object | none | zh object, language label and options removed |
| `docs/src/layouts/DocsLayout.astro` zh fallbacks and switcher | same file | none | switcher, hreflang alternates and zh fallbacks removed |
| `docs/src/pages/**` root zh routes and zh redirect labels | `docs/src/pages/en/**` | none; every zh route had an en twin | zh routes deleted; `/` now redirects to `/en/` |
| `docs/src/components/interactive/*.tsx` zh titles, notice, button text, element finders | same files, en values | none | zh branches removed |
| `docs/src/components/interactive/fixtures-*.json` (captured demo data) | same files | n/a, sample data | Chinese provider name and captured snippets translated |
| `docs/public/provider-icons/zai-global-*.svg` layer ids `图层_1`, `图层_2` | same files | n/a | renamed to `Layer_1`, `Layer_2`; nothing references them |

## Images

`blog/images/wechat.jpg`, `wechat_group.jpg`, `alipay.jpg` and `sponsors/glm-zh.jpg` had no references anywhere in the repo, Chinese files included, and were deleted. No README or post had donation, sponsor or community content to port. `blog/images/sponsors/glm-en.jpg` is also unreferenced; it was out of scope and kept.
