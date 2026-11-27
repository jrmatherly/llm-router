import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";

const dayMs = 24 * 60 * 60 * 1000;
let sequence = 0;

function rowStartedDaysAgo(days) {
  return rowStartedAt(new Date(Date.now() - days * dayMs));
}

function rowStartedAt(date) {
  const startedAt = date.toISOString();
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

test("a retention of N keeps today and the N local days before it", withDatabase(async (open) => {
  const store = open();
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const ids = async () => (await store.list({})).items.map((item) => item.requestId).sort();
  const now = rowStartedAt(new Date());
  const afterYesterdayMidnight = rowStartedAt(new Date(yesterday.getTime() + 1));
  const beforeYesterdayMidnight = rowStartedAt(new Date(yesterday.getTime() - 1));
  for (const row of [now, afterYesterdayMidnight, beforeYesterdayMidnight]) await store.record(row);
  await setDays(store, 2);
  assert.deepEqual(await ids(), [now, afterYesterdayMidnight, beforeYesterdayMidnight].map((row) => row.requestId).sort());

  await setDays(store, 1);
  assert.deepEqual(await ids(), [now, afterYesterdayMidnight].map((row) => row.requestId).sort());
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

test("a preset date range limits both the page and its count", withDatabase(async (open) => {
  const store = open();
  await setDays(store, 30);
  for (const days of [0, 2, 10]) await store.record(rowStartedDaysAgo(days));

  assert.equal((await store.list({ range: "today" })).total, 1);
  assert.equal((await store.list({ range: "24h" })).total, 1);
  assert.equal((await store.list({ range: "7d" })).total, 2);
  assert.equal((await store.list({ range: "30d" })).total, 3);
  assert.equal((await store.list({})).total, 3);
  const paged = await store.list({ pageSize: 1, range: "7d" });
  assert.equal(paged.total, 2);
  assert.equal(paged.totalPages, 2);
  assert.equal(paged.items.length, 1);
}));

test("a date range that is not one of the presets lists every date", withDatabase(async (open) => {
  const store = open();
  await setDays(store, 90);
  for (const days of [0, 2, 10, 40]) await store.record(rowStartedDaysAgo(days));

  assert.equal((await store.list({ range: "bogus" })).total, 4);
}));

test("a page states the retention the database holds", withDatabase(async (open) => {
  const store = open();
  assert.equal((await store.list({})).retentionDays, undefined);
  await setDays(store, 12);
  assert.equal((await store.list({})).retentionDays, 12);
}));

test("a store with no saved value prunes nothing", withDatabase(async (open) => {
  const first = open();
  await first.record(rowStartedAt(new Date("2000-01-01T00:00:00.000Z")));
  await first.close();
  const second = open();
  assert.equal((await second.list({})).total, 1);
}));
