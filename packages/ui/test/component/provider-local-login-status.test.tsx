import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AddProviderForm } from "@llmr/ui/pages/home/components/providers.tsx";
import { createProviderDraft, localAgentProviderApiKey } from "@llmr/ui/pages/home/shared/index.tsx";

const draft = {
  ...createProviderDraft([]),
  apiKey: localAgentProviderApiKey,
  baseUrl: "https://codex.example.test/v1",
  modelsText: "gpt-5",
  name: "Codex"
};
const plugins = [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Codex" }];
const probe = (supported: boolean) => ({
  models: [],
  normalizedBaseUrl: draft.baseUrl,
  protocols: [{ endpoint: "/responses", message: supported ? "ok" : "401 Unauthorized", protocol: "openai_responses" as const, status: supported ? 200 : 401, supported }]
});
const render = (connectivityProbe?: ReturnType<typeof probe>, error = "") =>
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
  const passed = render(probe(true));
  const failed = render(probe(false), "401 Unauthorized");
  assert.deepEqual(rows(never).map((row) => row.split("=")[1]), ["grey", "grey"]);
  assert.deepEqual(rows(passed).map((row) => row.split("=")[1]), ["green", "green"]);
  assert.deepEqual(rows(failed).map((row) => row.split("=")[1]), ["grey", "amber"]);
  assert.match(never, /Not checked/);
  assert.match(failed, /Last check failed/);
  assert.notEqual(verifyStep(never), "Done");
  assert.equal(verifyStep(passed), "Done");
  assert.notEqual(verifyStep(failed), "Done");
});
