import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { guardTestNetwork, refusedConnections } from "../../build/test-home-env.mjs";

const projectRoot = process.cwd();
const defaultGuard = path.join(projectRoot, "build", "test-network-guard.mjs");

function runGuarded(script, guardFile = defaultGuard) {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-guard-test-"));
  try {
    const env = { ...process.env, LLMR_TEST_HOME: home };
    delete env.NODE_OPTIONS;
    delete env.LLMR_TEST_NETWORK_LOG;
    delete env.LLMR_TEST_FILE;
    const log = path.join(home, "network-refused.log");
    guardTestNetwork(env, guardFile, log);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    return { out: JSON.parse(result.stdout.trim()), refused: refusedConnections(log) };
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

const outsideScript = `
  const https = await import("node:https");
  const net = await import("node:net");
  const out = {};
  try { await fetch("https://outside.invalid/"); } catch (error) { out.fetch = error.cause?.message ?? error.message; }
  out.https = await new Promise((resolve) => https.get("https://outside.invalid/").on("error", (error) => resolve(error.message)));
  out.net = await new Promise((resolve) => net.connect(443, "outside.invalid").on("error", (error) => resolve(error.message)));
  console.log(JSON.stringify(out));
`;

const workerFetch = (host) => `import { parentPort } from "node:worker_threads"; try { await fetch("https://${host}/"); } catch (error) { parentPort.postMessage(error.cause?.message ?? error.message); }`;

test("a connection to a host that is not loopback is refused before any lookup", () => {
  const suiteLog = process.env.LLMR_TEST_NETWORK_LOG;
  const outsideLines = () => (suiteLog ? refusedConnections(suiteLog) : []).filter((line) => line.startsWith("outside.invalid:443"));
  const before = outsideLines();
  const { out, refused } = runGuarded(outsideScript);
  for (const message of [out.fetch, out.https, out.net]) {
    assert.match(message, /test network guard: refused outside\.invalid:443/);
  }
  assert.equal(refused.length, 1, refused.join("\n"));
  assert.ok(refused[0].startsWith("outside.invalid:443\t"), refused[0]);
  assert.deepEqual(outsideLines(), before);
});

test("a name that only starts like a loopback address, and the (port, host) form, are refused", () => {
  const { out, refused } = runGuarded(`
    const net = await import("node:net");
    const out = {};
    try { await fetch("http://127.evil.invalid/"); } catch (error) { out.name = error.cause?.message ?? error.message; }
    out.portHost = await new Promise((resolve) => new net.Socket().connect(443, "outside.invalid").on("error", (error) => resolve(error.message)));
    console.log(JSON.stringify(out));
  `);
  assert.match(out.name, /test network guard: refused 127\.evil\.invalid:80/);
  assert.match(out.portHost, /test network guard: refused outside\.invalid:443/);
  assert.deepEqual(refused.map((line) => line.split("\t")[0]), ["127.evil.invalid:80", "outside.invalid:443"]);
});

test("a log the guard cannot write still refuses, and says why on stderr", () => {
  const env = { ...process.env };
  for (const name of ["NODE_OPTIONS", "LLMR_TEST_FILE"]) {
    delete env[name];
  }
  guardTestNetwork(env, defaultGuard, path.join(os.tmpdir(), "llmr-no-such-dir", "network-refused.log"));
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", 'try { await fetch("https://outside.invalid/"); } catch (error) { console.log(error.cause?.message ?? error.message); }'], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /test network guard: refused outside\.invalid:443/);
  assert.match(result.stderr, /outside\.invalid:443/);
  assert.match(result.stderr, /ENOENT/);
});

test("loopback still connects, by address, by name and by socket path", () => {
  const { out, refused } = runGuarded(`
    const http = await import("node:http");
    const net = await import("node:net");
    const path = await import("node:path");
    const server = http.createServer((_, res) => res.end("ok"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const byAddress = (await fetch("http://127.0.0.1:" + port + "/")).status;
    const byName = (await fetch("http://localhost:" + port + "/")).status;
    const byUpperName = (await fetch("http://LOCALHOST:" + port + "/")).status;
    server.close();
    const socketPath = path.join(process.env.LLMR_TEST_HOME, "s.sock");
    const unix = net.createServer((socket) => socket.end());
    await new Promise((resolve) => unix.listen(socketPath, resolve));
    const socket = await new Promise((resolve, reject) => {
      const client = net.connect(socketPath, () => { client.end(); resolve(true); });
      client.on("error", reject);
    });
    unix.close();
    console.log(JSON.stringify({ byAddress, byName, byUpperName, socket }));
  `);
  assert.deepEqual(out, { byAddress: 200, byName: 200, byUpperName: 200, socket: true });
  assert.deepEqual(refused, []);
});

test("a worker thread and a child process are refused too", () => {
  const { out, refused } = runGuarded(`
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { Worker } = await import("node:worker_threads");
    const { spawnSync } = await import("node:child_process");
    const file = path.join(process.env.LLMR_TEST_HOME, "worker.mjs");
    fs.writeFileSync(file, ${JSON.stringify(workerFetch("worker.invalid"))});
    const worker = await new Promise((resolve) => new Worker(file, { execArgv: [] }).once("message", resolve));
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'try { await fetch("https://child.invalid/"); } catch (error) { console.log(error.cause?.message ?? error.message); }'], { encoding: "utf8" }).stdout.trim();
    console.log(JSON.stringify({ child, worker }));
  `);
  assert.match(out.worker, /test network guard: refused worker\.invalid:443/);
  assert.match(out.child, /test network guard: refused child\.invalid:443/);
  assert.deepEqual(refused.map((line) => line.split("\t")[0]), ["child.invalid:443", "worker.invalid:443"]);
});

test("a guard file under a path with a space still loads", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "llmr-guard-space-"));
  try {
    mkdirSync(path.join(temp, "with space"));
    const copy = path.join(temp, "with space", "guard.mjs");
    copyFileSync(defaultGuard, copy);
    const { out, refused } = runGuarded(outsideScript, copy);
    for (const message of [out.fetch, out.https, out.net]) {
      assert.match(message, /test network guard: refused outside\.invalid:443/);
    }
    assert.equal(refused.length, 1, refused.join("\n"));
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
});

test("guardTestNetwork adds the import once, keeps what was there and names the log it is given", () => {
  const env = { LLMR_TEST_NETWORK_LOG: "/old.log", NODE_OPTIONS: "--max-old-space-size=4096" };
  guardTestNetwork(env, defaultGuard, "/h/network-refused.log");
  guardTestNetwork(env, defaultGuard, "/h/network-refused.log");
  assert.ok(env.NODE_OPTIONS.startsWith("--max-old-space-size=4096 --import=file://"), env.NODE_OPTIONS);
  assert.equal(env.NODE_OPTIONS.split("--import=").length, 2, env.NODE_OPTIONS);
  assert.equal(env.LLMR_TEST_NETWORK_LOG, "/h/network-refused.log");
});

test("every test process runs under the guard", () => {
  assert.equal(net.Socket.prototype.connect[Symbol.for("llmr.test-network-guard")], true);
  assert.ok(process.env.NODE_OPTIONS?.includes("test-network-guard.mjs"), process.env.NODE_OPTIONS);
  assert.ok(process.env.LLMR_TEST_NETWORK_LOG);
});

const underRunner = path.basename(path.dirname(process.env.LLMR_TEST_HOME ?? "")).startsWith("llmr-architecture-test-home-");

test("under the runner a worker thread is refused too", { skip: underRunner ? false : "a direct run does not guard worker threads" }, async () => {
  const file = path.join(process.env.LLMR_TEST_HOME, "worker6.mjs");
  writeFileSync(file, workerFetch("worker6.invalid"));
  const suiteLog = process.env.LLMR_TEST_NETWORK_LOG;
  process.env.LLMR_TEST_NETWORK_LOG = path.join(process.env.LLMR_TEST_HOME, "worker6.log");
  let worker;
  try {
    worker = new Worker(file);
  } finally {
    process.env.LLMR_TEST_NETWORK_LOG = suiteLog;
  }
  const message = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  assert.match(message, /test network guard: refused worker6\.invalid:443/);
});

test("the runner prints each suite's refusals with the file that made them, and fails", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-copy-"));
  try {
    mkdirSync(path.join(root, "build"));
    for (const name of ["run-tests.mjs", "test-home-env.mjs", "test-network-guard.mjs"]) {
      copyFileSync(path.join(projectRoot, "build", name), path.join(root, "build", name));
    }
    symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "junction");
    mkdirSync(path.join(root, ".test-dist", "cli", "test"), { recursive: true });
    writeFileSync(path.join(root, ".test-dist", "cli", "test", "reach.test.js"), 'require("node:test")("reach", async () => { try { await fetch("https://outside.invalid/"); } catch {} });\n');
    const env = { ...process.env };
    // NODE_TEST_CONTEXT would make the inner node --test report to this one instead of running its files.
    for (const name of ["LLMR_TEST_HOME", "LLMR_TEST_NETWORK_LOG", "LLMR_TEST_FILE", "NODE_OPTIONS", "NODE_TEST_CONTEXT"]) {
      delete env[name];
    }
    const result = spawnSync(process.execPath, [path.join(root, "build", "run-tests.mjs"), "cli"], { cwd: root, encoding: "utf8", env });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /cli tests tried to reach an outside host/);
    assert.ok(result.stdout.includes(`cli: 1 connection to an outside host was refused\noutside.invalid:443\t${path.join(".test-dist", "cli", "test", "reach.test.js")}\n`), result.stdout);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function runDirect(hosts) {
  const testHome = path.join(projectRoot, "build", "test-home.mjs");
  const env = { ...process.env };
  for (const name of ["LLMR_TEST_HOME", "LLMR_TEST_NETWORK_LOG", "LLMR_TEST_FILE", "NODE_OPTIONS"]) {
    delete env[name];
  }
  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    await import(${JSON.stringify(testHome)});
    for (const host of ${JSON.stringify(hosts)}) {
      try { await fetch("https://" + host + "/"); } catch {}
    }
  `], { encoding: "utf8", env });
}

test("a direct run that was refused a connection fails", () => {
  const one = runDirect(["outside.invalid"]);
  assert.equal(one.status, 1, one.stderr);
  assert.match(one.stderr, /1 connection to an outside host was refused/);
  assert.ok(one.stderr.includes("outside.invalid:443"), one.stderr);
  const two = runDirect(["one.invalid", "two.invalid"]);
  assert.equal(two.status, 1, two.stderr);
  assert.match(two.stderr, /2 connections to an outside host were refused/);
});

test("a direct run that made no outside connection passes", () => {
  const none = runDirect([]);
  assert.equal(none.status, 0, none.stderr);
  assert.doesNotMatch(none.stderr, /outside host/);
});
