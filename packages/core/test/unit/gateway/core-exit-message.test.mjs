import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { captureGatewayChildOutput, formatCoreGatewayChildExit } from "@llmr/core/gateway/core-runtime/supervisor.ts";

function childThatPrinted(text) {
  const child = { stderr: new EventEmitter(), stdout: new EventEmitter() };
  captureGatewayChildOutput(child);
  child.stderr.emit("data", text);
  return child;
}

test("an exit from SIGTERM shows no stderr, and every other exit keeps it", () => {
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("a warning"), null, "SIGTERM"), "Core gateway exited with SIGTERM.");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("heap limit"), null, "SIGABRT"), "Core gateway exited with SIGABRT.\nstderr:\nheap limit");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("heap limit"), null, "SIGKILL"), "Core gateway exited with SIGKILL.\nstderr:\nheap limit");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("bad config"), 23, null), "Core gateway exited with 23.\nstderr:\nbad config");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("a warning"), null, "SIGTERM", "before accepting runtime config"), "Core gateway exited with SIGTERM before accepting runtime config.");
});
