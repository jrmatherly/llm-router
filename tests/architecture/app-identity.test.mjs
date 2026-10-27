import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("electron-builder registers the same scheme the app parses", () => {
  const builder = JSON.parse(readFileSync("electron-builder.json", "utf8"));
  assert.equal(builder.appId, "net.matherly.llmrouter");
  assert.deepEqual(builder.protocols.flatMap((protocol) => protocol.schemes), ["llmr"]);
  assert.match(readFileSync("packages/core/src/contracts/deep-link.ts", "utf8"), /appDeepLinkProtocol = "llmr"/);
});
