import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the runtime image runs as llmr and checks the management server", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /^USER llmr$/m);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/ccr\/rpc/);
});
