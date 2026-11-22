import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";

const dayMs = 24 * 60 * 60 * 1000;
let sequence = 0;

function rowStartedDaysAgo(days) {
  const startedAt = new Date(Date.now() - days * dayMs).toISOString();
  sequence += 1;
  return {
    completedAt: startedAt,
    durationMs: 1,
    method: "POST",
    model: "model",
    path: "/v1/messages",
    requestBody: Buffer.from("{}"),
    requestHeaders: {},
    requestId: `retention-${sequence}`,
    responseBodyText: "{}",
    responseHeaders: {},
    startedAt,
    statusCode: 200,
    url: "/v1/messages"
  };
}

async function setDays(store, days) {
  await store.setRetentionDays(days);
}

function withDatabase(run) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-retention-"));
    const stores = [];
    const open = () => {
      const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
      stores.push(store);
      return store;
    };
    try {
      await run(open);
    } finally {
      for (const store of stores) await store.close();
      rmSync(dir, { force: true, recursive: true });
    }
  };
}

test("a row two days old survives a three-day retention and is pruned at one day", withDatabase(async (open) => {
  const store = open();
  await setDays(store, 3);
  await store.record(rowStartedDaysAgo(2));
  assert.equal((await store.list({})).total, 1);
  await setDays(store, 1);
  assert.equal((await store.list({})).total, 0);
}));

test("a second open store follows a value the first one changes the same day", withDatabase(async (open) => {
  const first = open();
  const second = open();
  await setDays(first, 7);
  await first.record(rowStartedDaysAgo(3));
  assert.equal((await second.list({})).total, 1);
  await setDays(first, 1);
  assert.equal((await second.list({})).total, 0);
}));

test("a store with no saved value prunes nothing", withDatabase(async (open) => {
  const first = open();
  await first.record(rowStartedDaysAgo(30));
  await first.close();
  const second = open();
  assert.equal((await second.list({})).total, 1);
}));
