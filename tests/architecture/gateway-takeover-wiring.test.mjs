import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

// Neither host has a test that starts it and takes a gateway over, so the one line each needs is pinned here.
test("both hosts apply the agent configs again after they take an adopted gateway over", () => {
  for (const file of ["packages/core/src/web/management-server.ts", "packages/electron/src/main/main-app.ts"]) {
    assert.match(read(file), /gatewayService\.setAdoptedGatewayReplacedHandler\(applyTakeoversAfterGatewayReplaced\);/, file);
  }
});

test("an agent app is brought forward with no Apple Event", () => {
  const source = read("packages/core/src/profiles/launch-service.ts");
  assert.doesNotMatch(source, /System Events|tell application/);
  assert.match(source, /const \{ args, command \} = profileAppActivationCommand\(pid\);\s+const child = spawn\(command, args,/);
});
