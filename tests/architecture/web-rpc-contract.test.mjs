import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bridgeFile = "packages/ui/src/web-client-bridge.ts";
const serverFile = "packages/core/src/web/management-server.ts";

function bridgeRpcNames(source) {
  return [...new Set([...source.matchAll(/\brpc\("([A-Za-z0-9_]+)"/g)].map((match) => match[1]))].sort();
}

function serverRpcHandlerNames(source) {
  const start = source.indexOf("const rpcHandlers: Record<string, RpcHandler> = {");
  assert.notEqual(start, -1, `${serverFile} no longer declares rpcHandlers the way this test reads it`);
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, "rpcHandlers has no closing line");
  return [...source.slice(start, end).matchAll(/^ {2}([A-Za-z0-9_]+)(?::|,$)/gm)].map((match) => match[1]).sort();
}

test("every method the web bridge calls has a handler on the management server", () => {
  const called = bridgeRpcNames(readFileSync(bridgeFile, "utf8"));
  const handled = new Set(serverRpcHandlerNames(readFileSync(serverFile, "utf8")));
  assert.ok(called.length > 50, `read only ${called.length} method names from ${bridgeFile}`);
  assert.deepEqual(called.filter((name) => !handled.has(name)), []);
});

test("the reader sees a handler written as a shorthand property, and misses one that is absent", () => {
  const source = "const rpcHandlers: Record<string, RpcHandler> = {\n  alpha: async () => 1,\n  beta,\n  gamma: () => {\n    return { nested: 1 };\n  }\n};\nconst other = {\n  delta: 1\n};\n";
  assert.deepEqual(serverRpcHandlerNames(source), ["alpha", "beta", "gamma"]);
  assert.deepEqual(bridgeRpcNames('rpc("alpha"); rpc("alpha", [x]); rpc("delta")'), ["alpha", "delta"]);
});
