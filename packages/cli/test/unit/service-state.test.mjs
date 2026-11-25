import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readServiceState, serviceAuthToken, writeServiceState } from "@llmr/cli/service-state.ts";

test("service state round-trips the token apart from the URL", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-service-state-")), "service.json");
  const state = { authToken: "test-web-auth-token-0123456789abcdef", pid: process.pid, profileManaged: false, startedAt: "2026-11-19T00:00:00.000Z", startGateway: true, tokenGenerated: true, url: "http://127.0.0.1:3458/" };
  writeServiceState(state, file);
  // Windows has no permission bits; Node reports 0o666 for every writable file there.
  if (process.platform !== "win32") {
    assert.equal(statSync(file).mode & 0o777, 0o600);
  }
  const read = readServiceState(file);
  assert.deepEqual(read, state);
  assert.equal(serviceAuthToken(read), state.authToken);
});

test("a state file without a token is not a usable state", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-service-state-")), "service.json");
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: "", url: "http://127.0.0.1:3458/?llmr_web_token=old" }));
  assert.equal(readServiceState(file), undefined);
});
