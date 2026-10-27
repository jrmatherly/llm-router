import type { SectionDocModule } from "./section-docs";

export type DocSectionKey =
  | "documentation"
  | "guides"
  | "configuration"
  | "fusion"
  | "toolhub"
  | "routing"
  | "providerImport"
  | "extensions"
  | "agentclaw"
  | "troubleshooting";

export interface DocPageDef {
  key: string;
  section: DocSectionKey;
  label: string;
  path: string;
  /** Markdown file relative to `src/content/docs/en/`. */
  source: string;
}

export type SidebarItemDef =
  | { page: string }
  | { key: string; label: string; anchor: true };

export interface SidebarGroupDef {
  key: string;
  icon: "rocket" | "book" | "wand" | "pen";
  label: string;
  activeItem?: string;
  items: SidebarItemDef[];
}

export interface DocSectionDef {
  key: DocSectionKey;
  navLabel: string;
  navPath: string;
  feature?: { key: string; label: string; featured?: boolean };
  /** Section index markdown when the index is not served as a page itself. */
  indexSource?: string;
  /** Standalone feature sections render a flat, section-only sidebar. */
  standalone?: boolean;
  /** Sections listed in the cross-section sidebar tree. */
  inSidebarTree?: boolean;
  groups: SidebarGroupDef[];
}

/**
 * Every doc page, keyed by a stable slug. Sidebar items reference these keys,
 * so item identity never depends on translated heading text.
 */
export const docPages: DocPageDef[] = [
  {
    key: "documentation",
    section: "documentation",
    label: "Documentation",
    path: "/en/",
    source: "index.md",
  },
  {
    key: "guides",
    section: "guides",
    label: "Quick start",
    path: "/en/guides/",
    source: "guides.md",
  },
  {
    key: "guides/install",
    section: "guides",
    label: "Install and start LLMR",
    path: "/en/guides/install/",
    source: "guides/install.md",
  },
  {
    key: "guides/cli",
    section: "guides",
    label: "CLI installation and command reference",
    path: "/en/guides/cli/",
    source: "guides/cli.md",
  },
  {
    key: "guides/docker",
    section: "guides",
    label: "Docker deployment",
    path: "/en/guides/docker/",
    source: "guides/docker.md",
  },
  {
    key: "guides/provider",
    section: "guides",
    label: "Add a provider",
    path: "/en/guides/provider/",
    source: "guides/provider.md",
  },
  {
    key: "guides/agent-profile",
    section: "guides",
    label: "Connect Agent Config",
    path: "/en/guides/agent-profile/",
    source: "guides/agent-profile.md",
  },
  {
    key: "guides/observability",
    section: "guides",
    label: "Enable logging and observability",
    path: "/en/guides/observability/",
    source: "guides/observability.md",
  },
  {
    key: "guides/claude-apps-gateway",
    section: "guides",
    label: "Behind a Claude apps gateway",
    path: "/en/guides/claude-apps-gateway/",
    source: "guides/claude-apps-gateway.md",
  },
  {
    key: "configuration/overview",
    section: "configuration",
    label: "Overview dashboard",
    path: "/en/configuration/overview/",
    source: "configuration/overview.md",
  },
  {
    key: "configuration/provider",
    section: "configuration",
    label: "Provider config",
    path: "/en/configuration/providers/",
    source: "configuration/providers.md",
  },
  {
    key: "configuration/profile",
    section: "configuration",
    label: "Agent Config",
    path: "/en/configuration/profiles/",
    source: "configuration/profiles.md",
  },
  {
    key: "configuration/agents/claude-code",
    section: "configuration",
    label: "Claude Code",
    path: "/en/configuration/agents/claude-code/",
    source: "configuration/agents/claude-code.md",
  },
  {
    key: "configuration/agents/codex",
    section: "configuration",
    label: "Codex",
    path: "/en/configuration/agents/codex/",
    source: "configuration/agents/codex.md",
  },
  {
    key: "configuration/agents/grok",
    section: "configuration",
    label: "Grok CLI",
    path: "/en/configuration/agents/grok/",
    source: "configuration/agents/grok.md",
  },
  {
    key: "configuration/agents/kimi",
    section: "configuration",
    label: "Kimi CLI",
    path: "/en/configuration/agents/kimi/",
    source: "configuration/agents/kimi.md",
  },
  {
    key: "configuration/agents/kilo",
    section: "configuration",
    label: "Kilo Code",
    path: "/en/configuration/agents/kilo/",
    source: "configuration/agents/kilo.md",
  },
  {
    key: "configuration/agents/opencode",
    section: "configuration",
    label: "OpenCode",
    path: "/en/configuration/agents/opencode/",
    source: "configuration/agents/opencode.md",
  },
  {
    key: "configuration/agents/pi",
    section: "configuration",
    label: "Pi",
    path: "/en/configuration/agents/pi/",
    source: "configuration/agents/pi.md",
  },
  {
    key: "configuration/agents/zcode",
    section: "configuration",
    label: "ZCode",
    path: "/en/configuration/agents/zcode/",
    source: "configuration/agents/zcode.md",
  },
  {
    key: "configuration/agents/workbuddy",
    section: "configuration",
    label: "WorkBuddy",
    path: "/en/configuration/agents/workbuddy/",
    source: "configuration/agents/workbuddy.md",
  },
  {
    key: "configuration/agents/claude-design",
    section: "configuration",
    label: "Claude Design",
    path: "/en/configuration/agents/claude-design/",
    source: "configuration/agents/claude-design.md",
  },
  {
    key: "configuration/api-keys",
    section: "configuration",
    label: "API keys",
    path: "/en/configuration/api-keys/",
    source: "configuration/api-keys.md",
  },
  {
    key: "configuration/observability",
    section: "configuration",
    label: "Logs and observability",
    path: "/en/configuration/observability/",
    source: "configuration/observability.md",
  },
  {
    key: "configuration/server",
    section: "configuration",
    label: "Server",
    path: "/en/configuration/server/",
    source: "configuration/server.md",
  },
  {
    key: "configuration/config-file",
    section: "configuration",
    label: "Config database location",
    path: "/en/configuration/configuration-file/",
    source: "configuration/configuration-file.md",
  },
  {
    key: "configuration/tray",
    section: "configuration",
    label: "Tray configuration",
    path: "/en/configuration/tray/",
    source: "configuration/tray.md",
  },
  {
    key: "fusion",
    section: "fusion",
    label: "Fusion models",
    path: "/en/fusion/",
    source: "configuration/fusion.md",
  },
  {
    key: "fusion/vision",
    section: "fusion",
    label: "Built-in vision",
    path: "/en/fusion/vision/",
    source: "configuration/fusion-vision.md",
  },
  {
    key: "fusion/web-search",
    section: "fusion",
    label: "Built-in web search",
    path: "/en/fusion/web-search/",
    source: "configuration/fusion-web-search.md",
  },
  {
    key: "fusion/image-generation",
    section: "fusion",
    label: "Image generation tool",
    path: "/en/fusion/image-generation/",
    source: "fusion/image-generation.md",
  },
  {
    key: "fusion/video-generation",
    section: "fusion",
    label: "Video generation tool",
    path: "/en/fusion/video-generation/",
    source: "fusion/video-generation.md",
  },
  {
    key: "fusion/mcp-tool",
    section: "fusion",
    label: "Custom MCP tool",
    path: "/en/fusion/mcp-tool/",
    source: "configuration/fusion-mcp-tool.md",
  },
  {
    key: "toolhub",
    section: "toolhub",
    label: "ToolHub",
    path: "/en/toolhub/",
    source: "configuration/toolhub.md",
  },
  {
    key: "routing",
    section: "routing",
    label: "Routing",
    path: "/en/routing/",
    source: "configuration/routing.md",
  },
  {
    key: "providerImport",
    section: "providerImport",
    label: "One-click import",
    path: "/en/provider-import/",
    source: "configuration/provider-deeplink.md",
  },
  {
    key: "extensions",
    section: "extensions",
    label: "Extension mechanism",
    path: "/en/extensions/",
    source: "configuration/extensions.md",
  },
  {
    key: "agentclaw",
    section: "agentclaw",
    label: "Overview",
    path: "/en/agentclaw/",
    source: "agentclaw.md",
  },
  {
    key: "agentclaw/setup",
    section: "agentclaw",
    label: "Usage and configuration",
    path: "/en/agentclaw/setup/",
    source: "agentclaw/setup.md",
  },
  {
    key: "agentclaw/slack",
    section: "agentclaw",
    label: "Slack",
    path: "/en/agentclaw/slack/",
    source: "agentclaw/slack.md",
  },
  {
    key: "agentclaw/discord",
    section: "agentclaw",
    label: "Discord",
    path: "/en/agentclaw/discord/",
    source: "agentclaw/discord.md",
  },
  {
    key: "agentclaw/telegram",
    section: "agentclaw",
    label: "Telegram",
    path: "/en/agentclaw/telegram/",
    source: "agentclaw/telegram.md",
  },
  {
    key: "agentclaw/line",
    section: "agentclaw",
    label: "LINE",
    path: "/en/agentclaw/line/",
    source: "agentclaw/line.md",
  },
  {
    key: "agentclaw/weixin-ilink",
    section: "agentclaw",
    label: "Weixin",
    path: "/en/agentclaw/weixin-ilink/",
    source: "agentclaw/weixin-ilink.md",
  },
  {
    key: "agentclaw/wecom",
    section: "agentclaw",
    label: "WeCom",
    path: "/en/agentclaw/wecom/",
    source: "agentclaw/wecom.md",
  },
  {
    key: "agentclaw/feishu",
    section: "agentclaw",
    label: "Feishu",
    path: "/en/agentclaw/feishu/",
    source: "agentclaw/feishu.md",
  },
  {
    key: "agentclaw/dingtalk",
    section: "agentclaw",
    label: "DingTalk",
    path: "/en/agentclaw/dingtalk/",
    source: "agentclaw/dingtalk.md",
  },
  {
    key: "troubleshooting",
    section: "troubleshooting",
    label: "Q&A",
    path: "/en/troubleshooting/",
    source: "troubleshooting.md",
  },
];

const pageItem = (key: string): SidebarItemDef => ({ page: key });

/** Sections in topbar order; each owns its sidebar groups. */
export const docSections: DocSectionDef[] = [
  {
    key: "documentation",
    navLabel: "Documentation",
    navPath: "/en/",
    inSidebarTree: true,
    groups: [
      {
        key: "documentation",
        icon: "rocket",
        label: "Documentation",
        activeItem: "documentation/capabilities",
        items: [
          {
            key: "documentation/capabilities",
            label: "What LLMR can do",
            anchor: true,
          },
          {
            key: "documentation/structure",
            label: "Documentation structure",
            anchor: true,
          },
          {
            key: "documentation/reading-path",
            label: "Reading path",
            anchor: true,
          },
        ],
      },
    ],
  },
  {
    key: "guides",
    navLabel: "Quick start",
    navPath: "/en/guides/",
    feature: { key: "docs", label: "Guides" },
    inSidebarTree: true,
    groups: [
      {
        key: "guides",
        icon: "book",
        label: "Quick start",
        activeItem: "guides/install",
        items: [
          pageItem("guides/install"),
          pageItem("guides/cli"),
          pageItem("guides/docker"),
          pageItem("guides/provider"),
          pageItem("guides/agent-profile"),
          pageItem("guides/observability"),
        ],
      },
    ],
  },
  {
    key: "configuration",
    navLabel: "Detailed configuration",
    navPath: "/en/configuration/overview/",
    indexSource: "configuration.md",
    inSidebarTree: true,
    groups: [
      {
        key: "main",
        icon: "wand",
        label: "Main pages",
        activeItem: "configuration/overview",
        items: [
          pageItem("configuration/overview"),
          pageItem("configuration/provider"),
          pageItem("configuration/profile"),
          pageItem("configuration/api-keys"),
          pageItem("configuration/observability"),
          pageItem("configuration/server"),
        ],
      },
      {
        key: "agents",
        icon: "book",
        label: "Agents",
        items: [
          pageItem("configuration/agents/claude-code"),
          pageItem("configuration/agents/codex"),
          pageItem("configuration/agents/grok"),
          pageItem("configuration/agents/kimi"),
          pageItem("configuration/agents/kilo"),
          pageItem("configuration/agents/opencode"),
          pageItem("configuration/agents/pi"),
          pageItem("configuration/agents/zcode"),
          pageItem("configuration/agents/workbuddy"),
          pageItem("configuration/agents/claude-design"),
        ],
      },
      {
        key: "settings",
        icon: "book",
        label: "Settings pages",
        items: [pageItem("configuration/config-file"), pageItem("configuration/tray")],
      },
    ],
  },
  {
    key: "fusion",
    navLabel: "Fusion",
    navPath: "/en/fusion/",
    feature: { key: "fusion", label: "Fusion", featured: true },
    standalone: true,
    groups: [
      {
        key: "fusion",
        icon: "wand",
        label: "Fusion",
        activeItem: "fusion",
        items: [
          pageItem("fusion"),
          pageItem("fusion/vision"),
          pageItem("fusion/web-search"),
          pageItem("fusion/image-generation"),
          pageItem("fusion/video-generation"),
          pageItem("fusion/mcp-tool"),
        ],
      },
    ],
  },
  {
    key: "toolhub",
    navLabel: "ToolHub",
    navPath: "/en/toolhub/",
    feature: { key: "toolhub", label: "ToolHub", featured: true },
    standalone: true,
    groups: [
      {
        key: "toolhub",
        icon: "wand",
        label: "ToolHub",
        activeItem: "toolhub",
        items: [pageItem("toolhub")],
      },
    ],
  },
  {
    key: "routing",
    navLabel: "Routing",
    navPath: "/en/routing/",
    feature: { key: "routing", label: "Routing", featured: true },
    standalone: true,
    groups: [
      {
        key: "routing",
        icon: "wand",
        label: "Routing",
        activeItem: "routing",
        items: [pageItem("routing")],
      },
    ],
  },
  {
    key: "providerImport",
    navLabel: "One-click import",
    navPath: "/en/provider-import/",
    feature: { key: "providerImport", label: "One-click import", featured: true },
    standalone: true,
    groups: [
      {
        key: "providerImport",
        icon: "wand",
        label: "One-click import",
        activeItem: "providerImport",
        items: [pageItem("providerImport")],
      },
    ],
  },
  {
    key: "extensions",
    navLabel: "Extensions",
    navPath: "/en/extensions/",
    feature: { key: "extensions", label: "Extensions", featured: true },
    standalone: true,
    groups: [
      {
        key: "extensions",
        icon: "wand",
        label: "Extensions",
        activeItem: "extensions",
        items: [pageItem("extensions")],
      },
    ],
  },
  {
    key: "agentclaw",
    navLabel: "AgentClaw",
    navPath: "/en/agentclaw/",
    feature: { key: "agentclaw", label: "AgentClaw", featured: true },
    standalone: true,
    groups: [
      {
        key: "agentclaw",
        icon: "wand",
        label: "AgentClaw",
        activeItem: "agentclaw",
        items: [pageItem("agentclaw"), pageItem("agentclaw/setup")],
      },
      {
        key: "platforms",
        icon: "book",
        label: "IM platforms",
        items: [
          pageItem("agentclaw/slack"),
          pageItem("agentclaw/discord"),
          pageItem("agentclaw/telegram"),
          pageItem("agentclaw/line"),
          pageItem("agentclaw/weixin-ilink"),
          pageItem("agentclaw/wecom"),
          pageItem("agentclaw/feishu"),
          pageItem("agentclaw/dingtalk"),
        ],
      },
    ],
  },
  {
    key: "troubleshooting",
    navLabel: "Q&A",
    navPath: "/en/troubleshooting/",
    inSidebarTree: true,
    groups: [],
  },
];

const sectionsByKey = new Map(docSections.map((section) => [section.key, section]));
const pagesByKey = new Map(docPages.map((page) => [page.key, page]));

export function getSection(key: DocSectionKey): DocSectionDef {
  const section = sectionsByKey.get(key);
  if (!section) throw new Error(`Unknown doc section: ${key}`);
  return section;
}

export function getPage(key: string): DocPageDef | undefined {
  return pagesByKey.get(key);
}

/** Previous/next pages of a page key, limited to pages in the same section. */
export function getPrevNext(key: string): { prev?: DocPageDef; next?: DocPageDef } {
  const index = docPages.findIndex((page) => page.key === key);
  if (index === -1) return {};

  const section = docPages[index].section;
  const prev = docPages[index - 1];
  const next = docPages[index + 1];

  return {
    prev: prev?.section === section ? prev : undefined,
    next: next?.section === section ? next : undefined,
  };
}

/** Markdown source of a section's index doc, whether or not it is served as a page. */
export function sectionIndexSource(section: DocSectionDef): string {
  const indexPage = pagesByKey.get(section.key);
  const source = indexPage?.source ?? section.indexSource;
  if (!source) throw new Error(`Section ${section.key} has no index doc`);
  return source;
}

const enDocModules = import.meta.glob<SectionDocModule>("./content/docs/en/**/*.md", {
  eager: true,
});

export function docModule(source: string): SectionDocModule {
  const mod = enDocModules[`./content/docs/en/${source}`];
  if (!mod) throw new Error(`Doc module not found: en/${source}`);
  return mod;
}

export function urlSlugFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

/** Find a page key from the last URL segment (e.g. "providers" → "configuration/provider"). */
export function pageKeyFromSlug(sectionKey: DocSectionKey, slug: string): string | undefined {
  return docPages.find(
    (page) => page.section === sectionKey && urlSlugFromPath(page.path) === slug
  )?.key;
}

export interface ResolvedSidebarItem {
  key: string;
  label: string;
  path?: string;
  anchor?: boolean;
}

export interface ResolvedSidebarGroup {
  key: string;
  icon: SidebarGroupDef["icon"];
  label: string;
  activeItem?: string;
  items: ResolvedSidebarItem[];
}

/** Sidebar groups of a section with page references resolved to labels and paths. */
export function resolveSidebarGroups(sectionKey: DocSectionKey): ResolvedSidebarGroup[] {
  return getSection(sectionKey).groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label,
      activeItem: group.activeItem,
      items: group.items.map((item) => {
        if ("page" in item) {
          const page = pagesByKey.get(item.page);
          if (!page) throw new Error(`Unknown sidebar page: ${item.page}`);
          return { key: page.key, label: page.label, path: page.path };
        }

        return { key: item.key, label: item.label, anchor: true };
      }),
    }));
}

export function navItems() {
  return docSections.map((section) => ({
    label: section.navLabel,
    href: section.navPath,
    pageKey: section.key,
  }));
}

export function featureNavItems() {
  return docSections
    .filter((section) => section.feature)
    .map((section) => ({
      label: section.feature!.label,
      href: section.navPath,
      featureKey: section.feature!.key,
      featured: section.feature!.featured,
    }));
}

