import assert from "node:assert/strict";
import test from "node:test";
import { replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { loadAppConfig } from "@llmr/core/config/config.ts";

test("a stored config with the removed bot gateway language still loads", async () => {
  const current = await loadAppConfig();
  await replacePersistedAppConfig({
    ...current,
    botGateway: { ...current.botGateway, language: "zh-CN", messageChunkChars: 1234 }
  });

  const loaded = await loadAppConfig();

  assert.equal(loaded.botGateway.messageChunkChars, 1234);
  assert.equal("language" in loaded.botGateway, false);
});
