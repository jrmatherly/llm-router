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
