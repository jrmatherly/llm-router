import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { ApiKeysView, EditApiKeyDialog } from "@llmr/ui/pages/home/components/api-keys.tsx";
import { createApiKeyEditDraft, createApiKeyList } from "@llmr/ui/pages/home/shared/api-keys.ts";

const marked = { createdAt: "2026-01-01T00:00:00.000Z", id: "gw", key: "sk-gateway-key-0001", name: "Gateway", trustedForwarder: true };
const plain = { createdAt: "2026-01-01T00:00:00.000Z", id: "plain", key: "sk-plain-key-0002", name: "Plain" };
const config = { ...createDefaultAppConfig(), APIKEYS: [marked, plain] };
const noop = () => {};

test("the API Keys list tags a trusted forwarder key and no other", () => {
  const markup = renderToStaticMarkup(
    <ApiKeysView addApiKey={noop} apiKeys={createApiKeyList(config)} editApiKey={noop} error="" notify={noop} removeApiKey={noop} />
  );
  assert.equal(markup.split("Trusted forwarder").length - 1, 1);
});

test("the edit dialog shows the trusted forwarder switch on, and hides it for a profile key", () => {
  const render = (showTrustedForwarder: boolean) => renderToStaticMarkup(
    <EditApiKeyDialog
      canSubmit
      draft={createApiKeyEditDraft(marked)}
      error=""
      onChange={noop}
      onClose={noop}
      onSubmit={noop}
      showTrustedForwarder={showTrustedForwarder}
    />
  );
  assert.match(render(true), /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
  assert.doesNotMatch(render(false), /role="switch"/);
});
