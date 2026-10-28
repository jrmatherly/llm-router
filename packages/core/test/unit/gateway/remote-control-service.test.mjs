import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  ccrRemoteControlPathPrefix,
  CcrRemoteControlService,
  remoteControlOwnerId
} from "@llmr/core/gateway/remote-control-service.ts";

const maxSessions = 100;

function createClient(service) {
  return async function call(ownerId, method, path, body) {
    const request = Object.assign(new EventEmitter(), { headers: {}, method, url: `${ccrRemoteControlPathPrefix}${path}` });
    const result = { payload: undefined, status: 0 };
    await service.handleRequest({
      endpoint: "http://127.0.0.1:3456",
      ownerId,
      path: `${ccrRemoteControlPathPrefix}${path}`,
      readBody: async () => Buffer.from(body === undefined ? "" : JSON.stringify(body)),
      request,
      response: {},
      sendJson: (_response, status, payload) => {
        result.status = status;
        result.payload = payload;
      }
    });
    return result;
  };
}

test("a key sees only its own sessions", async () => {
  const call = createClient(new CcrRemoteControlService());
  assert.equal((await call("key-a", "POST", "/sessions", { id: "s1" })).status, 201);

  const listed = await call("key-b", "GET", "/sessions");
  assert.deepEqual(listed.payload.sessions.map((session) => session.id), []);
  const own = await call("key-a", "GET", "/sessions");
  assert.deepEqual(own.payload.sessions.map((session) => session.id), ["s1"]);
});

test("another key cannot read or inject into a session", async () => {
  const call = createClient(new CcrRemoteControlService());
  await call("key-a", "POST", "/sessions", { id: "s1" });

  assert.equal((await call("key-b", "GET", "/sessions/s1")).status, 404);
  assert.equal((await call("key-b", "PATCH", "/sessions/s1", { title: "x" })).status, 404);
  assert.equal((await call("key-b", "DELETE", "/sessions/s1")).status, 404);
  assert.equal((await call("key-b", "GET", "/sessions/s1/events")).status, 404);
  assert.equal((await call("key-b", "POST", "/sessions/s1/events", { text: "x" })).status, 404);
  assert.equal((await call("key-b", "GET", "/sessions/s1/inbound")).status, 404);
  assert.equal((await call("key-b", "POST", "/sessions/s1/inbound", { text: "x" })).status, 404);
  assert.equal((await call("key-b", "POST", "/sessions/s1/presence", { name: "x" })).status, 404);

  const own = await call("key-a", "GET", "/sessions/s1");
  assert.equal(own.status, 200);
  assert.equal(own.payload.session.inboundCount, 0);
  assert.equal(own.payload.session.archivedAt, undefined);
});

test("creating a session id another key already uses does not hand over that session", async () => {
  const call = createClient(new CcrRemoteControlService());
  await call("key-a", "POST", "/sessions", { id: "s1", metadata: { owner: "a" }, title: "A" });

  const created = await call("key-b", "POST", "/sessions", { id: "s1", metadata: { owner: "b" }, title: "B" });
  assert.equal(created.status, 201);
  assert.equal(created.payload.session.title, "B");
  assert.equal(created.payload.session.events.length, 1);

  const own = await call("key-a", "GET", "/sessions/s1");
  assert.equal(own.payload.session.title, "A");
  assert.deepEqual(own.payload.session.metadata, { owner: "a" });
  assert.equal(own.payload.session.events.length, 1);
});

test("one key filling its quota does not evict another key's sessions", async () => {
  const call = createClient(new CcrRemoteControlService());
  await call("key-a", "POST", "/sessions", { id: "s1" });
  for (let index = 0; index <= maxSessions; index += 1) {
    await call("key-b", "POST", "/sessions", { id: `b-${index}` });
  }

  assert.equal((await call("key-a", "GET", "/sessions/s1")).status, 200);
  assert.equal((await call("key-b", "GET", "/sessions")).payload.sessions.length, maxSessions);
});

test("sessions made without an API key belong to the shared anonymous owner", async () => {
  assert.equal(remoteControlOwnerId(undefined), "anonymous");
  assert.notEqual(remoteControlOwnerId({ id: "anonymous" }), remoteControlOwnerId(undefined));
  assert.notEqual(remoteControlOwnerId({ id: "key-a" }), remoteControlOwnerId({ id: "key-b" }));

  const call = createClient(new CcrRemoteControlService());
  await call(remoteControlOwnerId(undefined), "POST", "/sessions", { id: "s1" });

  assert.equal((await call("key-a", "GET", "/sessions/s1")).status, 404);
  assert.deepEqual((await call("key-a", "GET", "/sessions")).payload.sessions, []);
  assert.equal((await call("anonymous", "GET", "/sessions/s1")).status, 200);
});
