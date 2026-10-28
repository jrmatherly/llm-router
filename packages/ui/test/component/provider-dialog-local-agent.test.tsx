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
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "Claude Code API"
  };
  const html = render(draft);
  assert.match(html, /Signed in with your local agent/);
  assert.match(html, /uses the login from Claude Code API/);
  assert.doesNotMatch(html, /llmr-local-agent-login/);
  assert.doesNotMatch(html, /Add credentials/);
});

test("credentials step returns after the import is replaced", () => {
  const draft = { ...createProviderDraft([]), apiKey: "", baseUrl: "https://gateway.example/v1" };
  const html = render(draft, { activeStep: "credentials", mode: "add" });
  assert.match(html, /Add credentials/);
  assert.match(html, /API key/);
  assert.doesNotMatch(html, /Signed in with your local agent/);
});
