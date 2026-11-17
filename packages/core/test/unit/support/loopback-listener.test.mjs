import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

test("reserved loopback ports are distinct, below the ephemeral range, and can be bound", async () => {
  const ports = await Promise.all(Array.from({ length: 40 }, () => reserveLoopbackPort()));
  assert.equal(new Set(ports).size, ports.length);
  assert.ok(ports.every(port => port >= 20000 && port < 32000), `ports ${ports}`);

  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(ports[0], "127.0.0.1", resolve); });
  await new Promise(resolve => server.close(resolve));
});
