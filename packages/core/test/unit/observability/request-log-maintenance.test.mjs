import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";

function record(requestId) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 1,
    method: "POST",
    model: "model",
    path: "/v1/messages",
    requestBody: Buffer.from(JSON.stringify({ model: "model", padding: requestId.padEnd(200 * 1024, "x") })),
    requestHeaders: {},
    requestId,
    responseBodyText: "{}",
    responseHeaders: {},
    startedAt: now,
    statusCode: 200,
    url: "/v1/messages"
  };
}

function bodyFile(dir, ref) {
  return path.join(dir, "request-log-bodies", ref.slice(0, 2), ref);
}

async function withStore(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-request-log-maintenance-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const stores = [];
  const open = async () => {
    const store = new RequestLogStore(dbFile);
    stores.push(store);
    await store.initialize();
    return store;
  };
  const database = [];
  try {
    await run({ dbFile, dir, open, openDatabase: () => { database.push(createBetterSqliteDatabase(dbFile)); return database.at(-1); } });
  } finally {
    for (const connection of database) connection.close();
    for (const store of stores) await store.close();
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

test("#1930 expired rows are pruned past one batch and their body files go with them", async () => {
  await withStore(async ({ dir, open, openDatabase }) => {
    const store = await open();
    for (let index = 0; index < 140; index += 1) {
      await store.record(record(`expired-${index}`));
    }
    await store.record(record("kept"));
    const database = openDatabase();
    const expired = database.prepare("SELECT request_body_ref AS ref FROM request_logs WHERE request_id LIKE 'expired-%'").all().map((row) => row.ref);
    const kept = database.prepare("SELECT request_body_ref AS ref FROM request_logs WHERE request_id = 'kept'").get().ref;
    assert.equal(expired.filter(Boolean).length, 140);
    database.prepare("UPDATE request_logs SET created_at = '2000-01-01' WHERE request_id LIKE 'expired-%'").run();
    await store.close();

    await open();

    assert.deepEqual(database.prepare("SELECT request_id FROM request_logs").all(), [{ request_id: "kept" }]);
    assert.deepEqual(expired.filter((ref) => fs.existsSync(bodyFile(dir, ref))), []);
    assert.ok(fs.existsSync(bodyFile(dir, kept)));
  });
});

test("#1930 a read does not wait for the write lock while the orphan sweep is idle", async () => {
  await withStore(async ({ open, openDatabase }) => {
    const store = await open();
    await store.record(record("visible"));
    const writer = openDatabase();
    writer.exec("BEGIN IMMEDIATE");
    try {
      const started = Date.now();
      const page = await store.list();

      assert.equal(page.items.length, 1);
      assert.ok(Date.now() - started < 2000, "the read waited for another connection's write lock");
    } finally {
      writer.exec("ROLLBACK");
    }
  });
});

test("#1930 a body directory the sweep cannot read is reported and does not fail the read", async (t) => {
  await withStore(async ({ dbFile, dir, open }) => {
    fs.writeFileSync(path.join(dir, "request-log-bodies"), "not a directory");
    const warnings = [];
    t.mock.method(console, "warn", (message) => { warnings.push(String(message)); });

    const store = await open();
    const page = await store.list();

    assert.deepEqual(page.items, []);
    assert.ok(warnings.some((message) => message.startsWith("[request-log] Orphan body sweep could not read")), warnings.join("\n"));
    assert.ok(fs.existsSync(dbFile));
  });
});
