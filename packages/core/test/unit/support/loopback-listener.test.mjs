import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

test("a reserved loopback port is below the ephemeral range and can be bound", async () => {
  const port = await reserveLoopbackPort();
  assert.ok(port >= 20000 && port < 32000, `port ${port}`);

  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  await new Promise(resolve => server.close(resolve));
});
