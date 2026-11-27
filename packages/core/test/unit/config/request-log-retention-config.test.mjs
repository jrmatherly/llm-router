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

test("a stored retention that is not a whole number from 1 to 90 loads as 90, with a warning", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    for (const value of [500, 0, 2.7, -3, "30", null, Number.NaN]) {
      assert.equal(await loadWithRetention(value), 90, String(value));
    }
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warnings.some((warning) => /request log retention/i.test(warning)), warnings.join("\n"));
  assert.equal(await loadWithRetention(1), 1);
  assert.equal(await loadWithRetention(90), 90);
  assert.equal(await loadWithRetention(30), 30);
});

test("a config without a request log retention loads the default", async () => {
  assert.equal(defaultRequestLogRetentionDays, 7);
  assert.equal(await loadWithRetention(undefined), defaultRequestLogRetentionDays);
});
