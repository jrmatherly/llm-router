import { featureNavItems, navItems, type DocSectionKey } from "../docs-structure";

export type { DocSectionKey };
export type DocPageKey = DocSectionKey;

export const docsContent = {
  pageTitle: "Documentation",
  metaDescription: "LLM Router documentation: installation, configuration, provider setup, and troubleshooting guides.",
  navItems: navItems(),
  featureNavItems: featureNavItems(),
  tocTitle: "On this page",
  ui: {
    searchLabel: "Search docs",
    searchPlaceholder: "Search…",
    searchLoading: "Loading search index…",
    copyPage: "Copy page",
    copied: "Copied",
    copyFailed: "Copy failed",
    downloadLabel: "Download",
    githubLabel: "GitHub repository",
    themeLabel: "Theme",
    starsFallback: "Stars",
    copyCode: "Copy code",
    copiedCode: "Copied code",
    copyCodeFailed: "Copy failed",
    prevPage: "Previous",
    nextPage: "Next",
    pageNavLabel: "Page navigation",
    editPage: "Edit this page on GitHub",
  },
} as const;
