import assert from "node:assert/strict";
import test from "node:test";
import {
  createRefusedKeyRequestLog,
  foldChildRefusedKeyRequests,
  mergeChildRefusedKeyRequests,
  recordRefusedKeyRequest,
  refusedKeyRequests,
  resetRefusedKeyRequestsForTest
} from "@llmr/core/gateway/auth/refused-key-requests.ts";

test("the refused key log keeps the newest five entries and counts every refusal", () => {
  resetRefusedKeyRequestsForTest();
  for (let index = 0; index < 6; index += 1) {
    recordRefusedKeyRequest({ at: new Date(Date.UTC(2026, 10, 22, 0, 0, index)).toISOString(), headers: {}, reason: `reason ${index}`, route: "/v1/messages" });
  }

  const snapshot = refusedKeyRequests();
  assert.equal(snapshot.count, 6);
  assert.deepEqual(snapshot.recent.map((entry) => entry.reason), ["reason 5", "reason 4", "reason 3", "reason 2", "reason 1"]);
});

test("the refused key log cuts the client label and the route, and drops the query string", () => {
  resetRefusedKeyRequestsForTest();
  recordRefusedKeyRequest({
    headers: { "user-agent": "c".repeat(300), "x-llmr-client": "Spoof" },
    reason: "Invalid API key.",
    route: `/${"r".repeat(129)}?api_key=SECRET`
  });
  recordRefusedKeyRequest({ headers: {}, reason: "Invalid API key.", route: "/v1/remote?key=SECRET#frag" });

  const [queried, long] = refusedKeyRequests().recent;
  assert.equal(long.client, "c".repeat(120));
  assert.equal(long.route.length, 120);
  assert.equal(queried.route, "/v1/remote");
  assert.doesNotMatch(JSON.stringify(refusedKeyRequests()), /SECRET/);
});

test("a child's counts add to the parent's across a child restart", () => {
  resetRefusedKeyRequestsForTest();
  recordRefusedKeyRequest({ at: "2026-11-22T00:00:00.000Z", headers: {}, reason: "API key is missing.", route: "/v1/messages" });
  mergeChildRefusedKeyRequests({ count: 1, recent: [childEntry("2026-11-22T00:00:01.000Z")] });
  mergeChildRefusedKeyRequests({ count: 2, recent: [childEntry("2026-11-22T00:00:02.000Z"), childEntry("2026-11-22T00:00:01.000Z")] });
  foldChildRefusedKeyRequests();
  mergeChildRefusedKeyRequests({ count: 1, recent: [childEntry("2026-11-22T00:00:03.000Z")] });

  const snapshot = refusedKeyRequests();
  assert.equal(snapshot.count, 4);
  assert.deepEqual(snapshot.recent.map((entry) => entry.at), [
    "2026-11-22T00:00:03.000Z",
    "2026-11-22T00:00:02.000Z",
    "2026-11-22T00:00:01.000Z",
    "2026-11-22T00:00:00.000Z"
  ]);
});

test("a separate refused key log does not share the parent's state", () => {
  resetRefusedKeyRequestsForTest();
  const log = createRefusedKeyRequestLog();
  log.record({ headers: {}, reason: "Invalid API key.", route: "/v1/messages" });
  assert.equal(log.snapshot().count, 1);
  assert.equal(refusedKeyRequests().count, 0);
});

test("a fold with no later child message keeps the folded count", () => {
  resetRefusedKeyRequestsForTest();
  mergeChildRefusedKeyRequests({ count: 2, recent: [childEntry("2026-11-22T00:00:02.000Z")] });
  foldChildRefusedKeyRequests();
  assert.equal(refusedKeyRequests().count, 2);
});

test("a child snapshot is bounded before it is held", () => {
  resetRefusedKeyRequestsForTest();
  const long = "x".repeat(300);
  const recent = Array.from({ length: 7 }, (_, index) => ({
    at: `2026-11-22T00:00:0${index}.000Z`,
    client: long,
    reason: "r".repeat(200),
    route: `/${long}`
  }));
  for (const count of [-3, 2.7]) {
    mergeChildRefusedKeyRequests({ count, recent });
    const snapshot = refusedKeyRequests();
    assert.ok(snapshot.count >= 0);
    assert.ok(Number.isInteger(snapshot.count));
    assert.equal(snapshot.recent.length, 5);
    for (const entry of snapshot.recent) {
      assert.ok(entry.route.length <= 120);
      assert.equal(entry.client.length, 120);
      assert.equal(entry.reason.length, 120);
    }
  }
});

test("a child count that is not finite gives a finite total", () => {
  for (const count of [Number.NaN, Number.POSITIVE_INFINITY]) {
    resetRefusedKeyRequestsForTest();
    mergeChildRefusedKeyRequests({ count, recent: [childEntry("2026-11-22T00:00:01.000Z")] });
    assert.equal(refusedKeyRequests().count, 1);
  }
});

test("a child count below its entries counts every entry", () => {
  resetRefusedKeyRequestsForTest();
  mergeChildRefusedKeyRequests({
    count: 0,
    recent: [childEntry("2026-11-22T00:00:01.000Z"), childEntry("2026-11-22T00:00:02.000Z"), childEntry("2026-11-22T00:00:03.000Z")]
  });
  assert.equal(refusedKeyRequests().count, 3);
});

test("a route's fragment is dropped", () => {
  resetRefusedKeyRequestsForTest();
  recordRefusedKeyRequest({ headers: {}, reason: "Invalid API key.", route: "/a#k=SECRET" });
  assert.equal(refusedKeyRequests().recent[0].route, "/a");
});

function childEntry(at) {
  return { at, client: "Codex", reason: "Invalid API key.", route: "/v1/responses" };
}
