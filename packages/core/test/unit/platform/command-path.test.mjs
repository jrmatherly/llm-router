import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  batchFileLaunch,
  commandLaunch,
  commandSearchPath,
  npmShimTarget,
  resolveCommandFile,
  spawnCommandLaunch,
  windowsBatchArgument
} from "@llmr/core/platform/command-path.ts";
import { testTempRoot } from "../../support/test-temp-dir.mjs";
import { withEnv } from "../../support/with-env.mjs";
import { intactArguments, npmExeShim, npmNodeShim, shimOnlyArguments } from "../../support/windows-command-cases.mjs";

const nodeShimText = npmNodeShim("node_modules\\fake-cli\\bin\\cli.js");
const exeShimText = npmExeShim("node_modules\\fake-cli\\bin\\tool.exe");

function windowsHost(files, texts = {}) {
  const known = new Set(files.map((file) => file.toLowerCase()));
  const text = new Map(Object.entries(texts).map(([file, value]) => [file.toLowerCase(), value]));
  return {
    isFile: (file) => known.has(file.toLowerCase()) || text.has(file.toLowerCase()),
    platform: "win32",
    readText: (file) => text.get(file.toLowerCase())
  };
}

test("a bare name resolves to the file with a PATHEXT extension, not to the script beside it", () => {
  const host = windowsHost(["c:\\bin\\pi", "c:\\bin\\pi.cmd"]);
  assert.equal(resolveCommandFile("pi", { Path: "C:\\bin" }, host), "C:\\bin\\pi.CMD");
  assert.equal(resolveCommandFile('"pi"', { Path: "C:\\bin", PATHEXT: ".cmd" }, host), "C:\\bin\\pi.cmd");
});

test("an earlier directory wins over an earlier extension", () => {
  const host = windowsHost(["c:\\a\\pi.cmd", "c:\\b\\pi.exe"]);
  assert.equal(resolveCommandFile("pi", { Path: "C:\\a;C:\\b" }, host), "C:\\a\\pi.CMD");
});

test("the path variable is read in any letter case, and the first spelling in sort order wins", (t) => {
  const host = windowsHost(["c:\\bin\\pi.cmd"]);
  assert.equal(resolveCommandFile("pi", { path: "C:\\bin" }, host), "C:\\bin\\pi.CMD");
  assert.equal(resolveCommandFile("pi", { Path: "C:\\bin", PATH: "C:\\none" }, host), "");
  assert.deepEqual(commandSearchPath({ pathext: ".X;.Y", Path: '"C:\\a";;C:\\b' }), {
    directories: ["C:\\a", "C:\\b"],
    extensions: [".X", ".Y"]
  });

  withEnv(t, { PATH: "C:\\bin" });
  assert.equal(resolveCommandFile("pi", {}, host), "");
  assert.deepEqual(commandSearchPath({}), { directories: [], extensions: [".COM", ".EXE", ".BAT", ".CMD"] });
});

test("a name with an extension or a separator is not searched for", () => {
  const host = windowsHost(["c:\\bin\\pi.cmd", ".\\pi.cmd"]);
  assert.equal(resolveCommandFile("pi.exe", { Path: "C:\\bin" }, host), "");
  assert.equal(resolveCommandFile(".\\pi.cmd", { Path: "C:\\bin" }, host), ".\\pi.cmd");
  assert.equal(resolveCommandFile("sub\\pi.cmd", { Path: "C:\\bin" }, windowsHost(["c:\\bin\\sub\\pi.cmd"])), "");
});

test("off Windows a command is returned unchanged", () => {
  const host = { ...windowsHost(["c:\\bin\\pi.cmd"]), platform: "linux" };
  assert.equal(resolveCommandFile("pi", { Path: "C:\\bin" }, host), "pi");
  assert.deepEqual(commandLaunch("pi", ["x"], { Path: "C:\\bin" }, host), { args: ["x"], command: "pi" });
});

test("npmShimTarget reads the two shims npm writes and nothing else", () => {
  assert.deepEqual(npmShimTarget(nodeShimText), { runsNode: true, target: "node_modules\\fake-cli\\bin\\cli.js" });
  assert.deepEqual(npmShimTarget(exeShimText), { runsNode: false, target: "node_modules\\fake-cli\\bin\\tool.exe" });

  const lastExeLine = '"%dp0%\\node_modules\\fake-cli\\bin\\tool.exe"   %*';
  for (const text of [
    '@echo off\r\n"node" "x.js" %*\r\n',
    nodeShimText.replace('"%_prog%"  ', '"%_prog%" --inspect '),
    nodeShimText.replace('SET "_prog=node"', 'SET "_prog=bash"'),
    exeShimText.replace(lastExeLine, `SET X=1\r\n${lastExeLine}`)
  ]) {
    assert.notEqual(text, nodeShimText);
    assert.notEqual(text, exeShimText);
    assert.equal(npmShimTarget(text), undefined, text);
  }
});

test("windowsBatchArgument escapes for two parses", () => {
  assert.equal(windowsBatchArgument('quote " and & % !'), '^^^"quote^^^ \\^^^"^^^ and^^^ ^^^&^^^ ^^^%^^^ ^^^!^^^"');
  assert.equal(windowsBatchArgument("x:y"), '^^^"x^^^:y^^^"');
  assert.equal(windowsBatchArgument("100%"), '^^^"100^^^%^^^"');
});

test("commandLaunch starts an executable, the target of an npm shim, or cmd.exe", () => {
  const env = { Path: "C:\\bin" };
  assert.deepEqual(commandLaunch("tool", ["x"], env, windowsHost(["c:\\bin\\tool.exe"])), {
    args: ["x"],
    command: "C:\\bin\\tool.EXE"
  });
  assert.deepEqual(
    commandLaunch("fake-cli", ["x"], env, windowsHost(
      ["c:\\bin\\node.exe", "c:\\bin\\node_modules\\fake-cli\\bin\\cli.js"],
      { "c:\\bin\\fake-cli.cmd": nodeShimText }
    )),
    { args: ["C:\\bin\\node_modules\\fake-cli\\bin\\cli.js", "x"], command: "C:\\bin\\node.exe" }
  );
  assert.deepEqual(
    commandLaunch("fake-cli", ["x"], env, windowsHost(
      ["c:\\bin\\node_modules\\fake-cli\\bin\\tool.exe"],
      { "c:\\bin\\fake-cli.cmd": exeShimText }
    )),
    { args: ["x"], command: "C:\\bin\\node_modules\\fake-cli\\bin\\tool.exe" }
  );
  assert.deepEqual(
    commandLaunch("hand", ["x"], env, windowsHost([], { "c:\\bin\\hand.cmd": '@echo off\r\n"node" "x.js" %*\r\n' })),
    {
      args: ["/d", "/v:off", "/s", "/c", '"C^:\\bin\\hand.CMD ^^^"x^^^""'],
      command: process.env.ComSpec || "cmd.exe",
      windowsVerbatimArguments: true
    }
  );
  assert.deepEqual(commandLaunch("missing", ["x"], env, windowsHost([])), { args: ["x"], command: "missing" });
});

test("a line break is refused for a batch file and carried for an npm shim", () => {
  const env = { Path: "C:\\bin" };
  const hand = windowsHost([], { "c:\\bin\\hand.cmd": '@echo off\r\n"node" "x.js" %*\r\n' });
  assert.throws(() => commandLaunch("hand", ["line1\nline2"], env, hand), /line break/);
  assert.throws(() => batchFileLaunch("C:\\bin\\hand.cmd", ["line1\rline2"]), /line break/);

  const shim = windowsHost(
    ["c:\\bin\\node.exe", "c:\\bin\\node_modules\\fake-cli\\bin\\cli.js"],
    { "c:\\bin\\fake-cli.cmd": nodeShimText }
  );
  assert.deepEqual(commandLaunch("fake-cli", ["line1\nline2"], env, shim), {
    args: ["C:\\bin\\node_modules\\fake-cli\\bin\\cli.js", "line1\nline2"],
    command: "C:\\bin\\node.exe"
  });
});

test("spawnCommandLaunch passes the verbatim flag on", (t) => {
  const spawn = t.mock.method(childProcess, "spawn", () => ({}));
  spawnCommandLaunch({ args: ["/c", "x"], command: "cmd.exe", windowsVerbatimArguments: true }, { stdio: "ignore" });
  assert.deepEqual(spawn.mock.calls[0].arguments, ["cmd.exe", ["/c", "x"], { stdio: "ignore", windowsVerbatimArguments: true }]);
});

const captureSource = 'require("node:fs").writeFileSync(process.env.LLMR_COMMAND_PATH_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));';

function environmentWithPath(value) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "PATH")),
    Path: value
  };
}

async function receivedArguments(launch, env, output) {
  rmSync(output, { force: true });
  const child = spawnCommandLaunch(launch, { env: { ...env, LLMR_COMMAND_PATH_TEST_OUTPUT: output }, stdio: "ignore" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0);
  return JSON.parse(readFileSync(output, "utf8"));
}

test("every argument reaches the target of an npm shim intact", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-command-path-shim-"));
  try {
    const script = path.join(dir, "node_modules", "fake-cli", "bin", "cli.js");
    mkdirSync(path.dirname(script), { recursive: true });
    writeFileSync(script, captureSource);
    writeFileSync(path.join(dir, "fake-cli.cmd"), nodeShimText);
    const env = environmentWithPath(`${dir};${path.dirname(process.execPath)}`);
    const output = path.join(dir, "args.json");
    for (const row of [...intactArguments, ...shimOnlyArguments]) {
      const launch = commandLaunch("fake-cli", ["--flag", row], env);
      assert.deepEqual(await receivedArguments(launch, env, output), ["--flag", row]);
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("every argument reaches a hand-written batch file intact", { skip: process.platform !== "win32" }, async () => {
  const root = mkdtempSync(path.join(testTempRoot, "llmr-command-path-batch-"));
  try {
    const capture = path.join(root, "capture.js");
    writeFileSync(capture, captureSource);
    const output = path.join(root, "args.json");
    for (const name of ["sp ace (x86) & co", "pct%OS%dir"]) {
      const file = path.join(root, name, "hand.cmd");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `@echo off\r\n"${process.execPath}" "${capture}" %*\r\n`);
      assert.deepEqual(await receivedArguments(commandLaunch(file, [], process.env), process.env, output), []);
      for (const row of intactArguments) {
        assert.deepEqual(await receivedArguments(commandLaunch(file, [row], process.env), process.env, output), [row], name);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
