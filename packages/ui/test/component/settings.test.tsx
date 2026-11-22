import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ObservabilitySettingsPage } from "@llmr/ui/pages/home/components/settings.tsx";
import { appCopy } from "@llmr/ui/pages/home/shared/i18n.tsx";

test("ObservabilitySettingsPage shows the saved request log retention in a 1 to 90 day field", () => {
  const html = renderToStaticMarkup(
    <ObservabilitySettingsPage
      copy={appCopy}
      observability={{ agentAnalysis: false, requestLogRetentionDays: 30, requestLogs: true }}
      onChange={() => undefined}
    />
  );

  assert.match(html, /Keep request logs for \(days\)/);
  const input = html.match(/<input[^>]*type="number"[^>]*>/)?.[0] ?? "";
  assert.match(input, /value="30"/);
  assert.match(input, /min="1"/);
  assert.match(input, /max="90"/);
});
