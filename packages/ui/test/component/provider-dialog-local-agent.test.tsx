import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddProviderForm } from "@llmr/ui/pages/home/components/providers.tsx";
import { createProviderDraft, localAgentProviderApiKey } from "@llmr/ui/pages/home/shared/index.tsx";

const render = (draft: ReturnType<typeof createProviderDraft>, props: Partial<React.ComponentProps<typeof AddProviderForm>> = {}) =>
  renderToStaticMarkup(
    <AddProviderForm
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      probeLoading={false}
      providers={[]}
      {...props}
    />
  );

test("edit dialog shows the local login notice and drops the credentials step", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://codex.example.test/v1",
    modelsText: "gpt-5",
    name: "Codex"
  };
  const html = render(draft, { providerPlugins: [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }] });
  assert.match(html, /Signed in with your local agent/);
  assert.match(html, /uses the login from Codex\./);
  assert.doesNotMatch(html, /llmr-local-agent-login/);
  assert.doesNotMatch(html, /Add credentials/);
});

test("edit dialog for the Claude Code login provider says it forwards the login and stores nothing", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "Claude Code API"
  };
  const html = render(draft, {
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }]
  });
  assert.match(html, /This provider forwards the login Claude Code sends\. Nothing is stored\./);
  assert.doesNotMatch(html, /uses the login from/);
  assert.doesNotMatch(html, /No API key is needed/);
});

test("add dialog shows the gateway sign-in form when no local agents were found", () => {
  const html = render(createProviderDraft([]), { mode: "add" });
  assert.match(html, /Sign in to a Claude apps gateway/);
  assert.match(html, /Or sign in to your organization&#x27;s Claude apps gateway/);
});

test("credentials step returns after the import is replaced", () => {
  const draft = { ...createProviderDraft([]), apiKey: "", baseUrl: "https://gateway.example/v1" };
  const html = render(draft, { activeStep: "credentials", mode: "add" });
  assert.match(html, /Add credentials/);
  assert.match(html, /API key/);
  assert.doesNotMatch(html, /Signed in with your local agent/);
});

test("the Claude Code login provider shows true text in every step and no check or refresh", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "Claude Code API"
  };
  const html = render(draft, {
    onCheck: async () => undefined,
    onRefreshModels: async () => undefined,
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }]
  });
  assert.match(html, /Uses the login Claude Code sends/);
  assert.match(html, /LLMR does not probe this provider\./);
  assert.match(html, /Not checked/);
  assert.match(html, /LLMR does not ask this provider for a model list\./);
  assert.match(html, /LLMR does not test this provider\./);
  assert.doesNotMatch(html, /Signed in with your local agent/);
  assert.doesNotMatch(html, /Choose a provider endpoint/);
  assert.doesNotMatch(html, /did not return a model list/);
  assert.doesNotMatch(html, /Check Connection/);
  assert.doesNotMatch(html, /is connected when this provider is saved/);
  assert.doesNotMatch(html, /Refresh provider models/);
});

const statusRowClass = (html: string, title: string) => {
  const end = html.indexOf(`>${title}</div>`);
  assert.ok(end > 0, `${title} row is rendered`);
  const start = html.lastIndexOf("<div class=\"flex min-w-0 items-start gap-2 rounded-md border", end);
  return html.slice(start, html.indexOf("\"", start + 12));
};

test("the not-checked panel shows neither row as passed and the Verify step stays pending", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "Claude Code API"
  };
  const html = render(draft, {
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }]
  });
  for (const title of ["Local login provider", "Not checked"]) {
    const rowClass = statusRowClass(html, title);
    assert.match(rowClass, /border-border/);
    assert.doesNotMatch(rowClass, /emerald/);
  }
  assert.match(html, /Verify connection<\/div><div[^>]*>(Pending|In progress)</);
});

test("a renamed Claude Code login provider keeps its text and offers no check or refresh while edited", () => {
  const saved = {
    api_base_url: "https://api.anthropic.com",
    api_key: localAgentProviderApiKey,
    id: "claude-code-api",
    models: ["claude-sonnet-5"],
    name: "Claude Code API",
    type: "anthropic"
  };
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "My Claude",
    protocol: "anthropic_messages" as const
  };
  const html = render(draft, {
    existingProvider: saved,
    onCheck: async () => undefined,
    onRefreshModels: async () => undefined,
    providerPlugins: [
      { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
      { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
    ]
  });
  assert.match(html, /Uses the login Claude Code sends/);
  assert.doesNotMatch(html, /Signed in with your local agent/);
  assert.doesNotMatch(html, /Check Connection/);
  assert.doesNotMatch(html, /Refresh provider models/);
});

test("a Codex login provider keeps its heading, its connection check and its model refresh", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://codex.example.test/v1",
    modelsText: "gpt-5",
    name: "Codex"
  };
  const html = render(draft, {
    onCheck: async () => undefined,
    onRefreshModels: async () => undefined,
    providerPlugins: [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }]
  });
  assert.match(html, /Signed in with your local agent/);
  assert.match(html, /Check Connection/);
  assert.match(html, /Available after saving/);
  assert.match(html, /Refresh provider models/);
  assert.match(html, /Run a real model request/);
  assert.match(html, /LLMR has not asked this provider for a model list\./);
});

test("a local login provider that was not asked says so", () => {
  const draft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://codex.example.test/v1",
    modelsText: "gpt-5",
    name: "Codex"
  };
  const html = render(draft, {
    onCheck: async () => undefined,
    onRefreshModels: async () => undefined,
    providerPlugins: [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }]
  });
  assert.match(html, /LLMR has not asked this provider which protocols it supports\./);
  assert.match(html, /LLMR has not asked this provider for a model list\. Refresh the list to ask/);
  assert.doesNotMatch(html, /Choose a provider endpoint/);
  assert.doesNotMatch(html, /did not return a model list/);
  const asked = render(draft, {
    onCheck: async () => undefined,
    onRefreshModels: async () => undefined,
    probe: { models: [], normalizedBaseUrl: draft.baseUrl, protocols: [] },
    providerPlugins: [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }]
  });
  assert.match(asked, /did not return a model list/);
  assert.doesNotMatch(asked, /has not asked this provider/);
});
