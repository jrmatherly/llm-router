import assert from "node:assert/strict";
import test from "node:test";
import { replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { defaultRequestLogRetentionDays } from "@llmr/core/observability/request-log-limits.ts";

async function loadWithRetention(value) {
  const current = await loadAppConfig();
  const observability = { ...current.observability };
  if (value === undefined) delete observability.requestLogRetentionDays;
  else observability.requestLogRetentionDays = value;
  await replacePersistedAppConfig({ ...current, observability });
  return (await loadAppConfig()).observability.requestLogRetentionDays;
}

test("request log retention is clamped to 1 to 90 whole days when the config loads", async () => {
  assert.equal(await loadWithRetention(500), 90);
  assert.equal(await loadWithRetention(0), 1);
  assert.equal(await loadWithRetention(2.7), 2);
});

test("a config without a request log retention loads the default", async () => {
  assert.equal(defaultRequestLogRetentionDays, 7);
  assert.equal(await loadWithRetention(undefined), defaultRequestLogRetentionDays);
});
