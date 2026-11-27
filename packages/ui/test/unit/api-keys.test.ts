import assert from "node:assert/strict";
import test from "node:test";
import { createApiKeyDraft, createApiKeyEditDraft, maskApiKey, normalizeApiKeys, updateApiKeyEditableConfig } from "@llmr/ui/pages/home/shared/api-keys.ts";

test("maskApiKey never shows most of a short key", () => {
  assert.equal(maskApiKey("abcdefghi"), "****");
  assert.equal(maskApiKey("abcdefghijkl"), "****");
  assert.equal(maskApiKey("abcdefghijklmnop"), "abcd***");
  assert.equal(maskApiKey(`sk-${"x".repeat(32)}`), "sk-xxxxx***");
});

test("the trusted forwarder mark survives the page's own normalizing and editing of a key", () => {
  const marked = { createdAt: "2026-01-01T00:00:00.000Z", id: "gw", key: "sk-gateway-key-0001", name: "Gateway", trustedForwarder: true };
  assert.deepEqual(normalizeApiKeys([marked]), [marked]);
  assert.equal("trustedForwarder" in normalizeApiKeys([{ ...marked, trustedForwarder: "yes" }])[0], false);
  const draft = createApiKeyEditDraft(marked);
  assert.equal(draft.trustedForwarder, true);
  assert.deepEqual(updateApiKeyEditableConfig(marked, draft), marked);
  assert.equal("trustedForwarder" in updateApiKeyEditableConfig(marked, { ...draft, trustedForwarder: false }), false);
  assert.equal(createApiKeyDraft().trustedForwarder, false);
});
