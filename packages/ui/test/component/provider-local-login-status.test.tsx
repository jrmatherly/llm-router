import assert from "node:assert/strict";
import test from "node:test";
import type { GatewayProviderProbeResult } from "@llmr/core/contracts/app.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { AddProviderForm } from "@llmr/ui/pages/home/components/providers.tsx";
import { createProviderDraft, localAgentProviderApiKey, providerConnectivityProbeAfterCheck } from "@llmr/ui/pages/home/shared/index.tsx";

const draft = {
  ...createProviderDraft([]),
  apiKey: localAgentProviderApiKey,
  baseUrl: "https://codex.example.test/v1",
  modelsText: "gpt-5",
  name: "Codex"
};
const plugins = [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }];
const passedProbe: GatewayProviderProbeResult = {
  models: [],
  normalizedBaseUrl: draft.baseUrl,
  protocols: [{ endpoint: "/responses", message: "ok", protocol: "openai_responses", status: 200, supported: true }]
};
const render = (connectivityProbe?: GatewayProviderProbeResult, error = "") =>
  renderToStaticMarkup(
    <AddProviderForm
      connectivityProbe={connectivityProbe}
      draft={draft}
      error={error}
      mode="edit"
      onChange={() => undefined}
      onCheck={async () => undefined}
      probeLoading={false}
      providerPlugins={plugins}
      providers={[]}
    />
  );
const rows = (html: string) =>
  [...html.matchAll(/<div class="flex min-w-0 items-start gap-2 rounded-md border bg-background px-3 py-2 ([^"]+)">.*?<div class="truncate text-\[12px\] font-semibold text-foreground">([^<]+)<\/div>/g)]
    .map((match) => `${match[2]}=${match[1].includes("emerald") ? "green" : match[1].includes("amber") ? "amber" : "grey"}`);
const verifyStep = (html: string) => html.match(/Verify connection<\/div><div[^>]*>([^<]+)</)?.[1];

test("a saved local login shows grey before a check, green after a pass, amber after a failure", () => {
  const never = render();
  const passed = render(providerConnectivityProbeAfterCheck(passedProbe));
  const failed = render(providerConnectivityProbeAfterCheck(undefined), "401 Unauthorized");
  assert.deepEqual(rows(never).map((row) => row.split("=")[1]), ["grey", "grey"]);
  assert.deepEqual(rows(passed).map((row) => row.split("=")[1]), ["green", "green"]);
  assert.deepEqual(rows(failed).map((row) => row.split("=")[1]), ["grey", "amber"]);
  assert.match(never, /Not checked/);
  assert.match(failed, /Last check failed/);
  assert.match(never, /LLMR has not sent a request through this local login yet\. Check Connection sends one\./);
  assert.match(failed, /The last real model request through this local login failed\. Check Connection tries again\./);
  assert.notEqual(verifyStep(never), "Done");
  assert.equal(verifyStep(passed), "Done");
  assert.notEqual(verifyStep(failed), "Done");
});
