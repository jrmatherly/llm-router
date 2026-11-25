import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

test("reserved loopback ports are distinct, below the ephemeral range, and can be bound", async () => {
  const ports = await Promise.all(Array.from({ length: 40 }, () => reserveLoopbackPort()));
  assert.equal(new Set(ports).size, ports.length);
  assert.ok(ports.every(port => port >= 20000 && port < 32000), `ports ${ports}`);

  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(ports[0], "127.0.0.1", resolve); });
  await new Promise(resolve => server.close(resolve));
});

test("two test processes never reserve the same port", async () => {
  // The bundle is CommonJS, so there is no import.meta.url; both runners start in the repo root.
  const helper = pathToFileURL(path.resolve("packages/core/test/support/loopback-listener.mjs")).href;
  const script = `const { reserveLoopbackPort } = await import(${JSON.stringify(helper)});
    const ports = [];
    for (let index = 0; index < 400; index += 1) ports.push(await reserveLoopbackPort());
    console.log(JSON.stringify(ports));`;
  // Under the runner the children use the run's folder, so their probes stay off ports other files hold.
  const ownClaims = process.env.LLMR_TEST_PORT_CLAIMS ? undefined : mkdtempSync(path.join(tmpdir(), "llmr-port-claims-"));
  const claims = ownClaims ?? process.env.LLMR_TEST_PORT_CLAIMS;
  const run = () => new Promise((resolve, reject) => {
    execFile(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, LLMR_TEST_PORT_CLAIMS: claims } },
      (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
  });
  try {
    const [first, second] = await Promise.all([run(), run()]);
    assert.deepEqual(first.filter((port) => second.includes(port)), []);
  } finally {
    if (ownClaims) rmSync(ownClaims, { force: true, recursive: true });
  }
});
