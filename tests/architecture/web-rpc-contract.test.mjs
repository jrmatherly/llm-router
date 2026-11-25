import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
  // One `rpc(` is the function's own definition. Any other the reader did not parse is a call written in a form it cannot read.
  const bridge = readFileSync(bridgeFile, "utf8");
  assert.equal(bridge.match(/\brpc\s*[<(]/g).length - 1, bridge.match(/\brpc\("[A-Za-z0-9_]+"/g).length, `${bridgeFile} calls rpc in a form this test cannot read`);
  assert.deepEqual(called.filter((name) => !handled.has(name)), []);
});

test("the reader sees a handler written as a shorthand property, and misses one that is absent", () => {
  const source = "const rpcHandlers: Record<string, RpcHandler> = {\n  alpha: async () => 1,\n  beta,\n  gamma: () => {\n    return { nested: 1 };\n  }\n};\nconst other = {\n  delta: 1\n};\n";
  assert.deepEqual(serverRpcHandlerNames(source), ["alpha", "beta", "gamma"]);
  assert.deepEqual(bridgeRpcNames('rpc("alpha"); rpc("alpha", [x]); rpc("delta")'), ["alpha", "delta"]);
});

test("every channel the preload script invokes has a handler in the main process", () => {
  const mainDir = "packages/electron/src/main";
  const invoked = [...new Set([...readFileSync(path.join(mainDir, "preload.ts"), "utf8").matchAll(/\binvoke\(IPC_CHANNELS\.([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
  const handled = new Set(readdirSync(mainDir, { recursive: true })
    .filter((file) => String(file).endsWith(".ts"))
    .flatMap((file) => [...readFileSync(path.join(mainDir, String(file)), "utf8").matchAll(/\b(?:handle|ipcMain\.\w+)\(IPC_CHANNELS\.([A-Za-z0-9_]+)/g)].map((match) => match[1])));
  assert.ok(invoked.length > 50, `read only ${invoked.length} channels from preload.ts`);
  assert.deepEqual(invoked.filter((name) => !handled.has(name)), []);
});
