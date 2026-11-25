import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppInfoPathReader } from "@llmr/core/agents/app-info-paths.ts";
import { findInstalledClaudeAppExecutable } from "@llmr/core/agents/claude-app/launch.ts";
import { findInstalledCodexAppExecutable, findInstalledWorkbuddyAppExecutable } from "@llmr/core/agents/codex/app-launch.ts";
import { findInstalledOpenCodeAppExecutable } from "@llmr/core/agents/opencode/app-launch.ts";
import {
  findAfterAppxLoad,
  prefetchWindowsAppxPackages,
  resetWindowsAppxPackagesForTest,
  windowsDesktopAppCandidates
} from "@llmr/core/platform/windows-app-discovery.ts";

test("#1776 app info caches found and absent paths, expires, and cannot be mutated by callers", () => {
  let time = 0;
  let calls = 0;
  const read = createAppInfoPathReader(() => {
    calls++;
    return calls === 1 ? {} : { chatgptAppPath: "/new/app" };
  }, () => time);
  assert.deepEqual(read(), {});
  time = 29_999;
  assert.deepEqual(read(), {});
  assert.equal(calls, 1);
  time = 30_000;
  const result = read();
  assert.equal(result.chatgptAppPath, "/new/app");
  result.chatgptAppPath = "changed";
  assert.equal(read().chatgptAppPath, "/new/app");
  assert.equal(calls, 2);
});

test("#1776 failed discovery can be retried", () => {
  let calls = 0;
  const read = createAppInfoPathReader(() => {
    if (++calls === 1) throw new Error("discovery failed");
    return {};
  });
  assert.throws(read, /discovery failed/);
  assert.deepEqual(read(), {});
});

test("#1776 Windows apps in standard locations are found without starting PowerShell or where", (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  t.after(() => Object.defineProperty(process, "platform", platform));
  t.mock.method(fs, "statSync", (file) => ({
    isDirectory: () => false,
    isFile: () => /[\\/](ChatGPT|OpenCode)\.exe$/.test(String(file))
  }));
  t.mock.method(fs, "existsSync", () => true);
  const spawn = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  assert.match(findInstalledCodexAppExecutable().executable, /ChatGPT\.exe$/);
  assert.match(findInstalledOpenCodeAppExecutable().executable, /OpenCode\.exe$/);
  assert.equal(spawn.mock.callCount(), 0);
});

const chatgptOptions = { appDirs: ["ChatGPT"], exeNames: ["ChatGPT.exe"], packageKeywords: ["chatgpt"], vendorDirs: ["OpenAI"], whereNames: ["ChatGPT"] };
const appPathNames = ["CLAUDE_APP_PATH", "LLMR_CLAUDE_APP_PATH", "LLMR_OPENCODE_APP_PATH", "OPENCODE_APP_PATH"];

function stubWindows(t) {
  resetWindowsAppxPackagesForTest();
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  const previous = appPathNames.map((name) => process.env[name]);
  for (const name of appPathNames) delete process.env[name];
  t.after(() => {
    Object.defineProperty(process, "platform", platform);
    appPathNames.forEach((name, index) => restoreEnv(name, previous[index]));
    resetWindowsAppxPackagesForTest();
  });
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function mockNothingInstalled(t) {
  t.mock.method(fs, "statSync", () => ({ isDirectory: () => false, isFile: () => false }));
  t.mock.method(fs, "existsSync", () => false);
  t.mock.method(fs, "readdirSync", () => []);
}

function mockPackageList(t, answer) {
  return t.mock.method(childProcess, "execFile", (_file, _args, _options, callback) => answer(callback));
}

test("with no app installed, discovery starts no blocking process", (t) => {
  stubWindows(t);
  mockNothingInstalled(t);
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  const execFile = mockPackageList(t, () => {});

  assert.equal(findInstalledCodexAppExecutable().executable, undefined);
  assert.equal(findInstalledOpenCodeAppExecutable().executable, undefined);
  assert.equal(findInstalledWorkbuddyAppExecutable().executable, undefined);

  assert.equal(spawnSync.mock.callCount(), 0);
  assert.equal(execFile.mock.callCount(), 1);
});

test("an executable on the path is found without where.exe", (t) => {
  stubWindows(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-app-path-"));
  const file = path.join(dir, "OpenCode.exe");
  fs.writeFileSync(file, "");
  const previousPath = process.env.PATH;
  process.env.PATH = dir;
  t.after(() => {
    restoreEnv("PATH", previousPath);
    fs.rmSync(dir, { force: true, recursive: true });
  });
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 1, stdout: "" }));
  const execFile = mockPackageList(t, () => {});

  assert.equal(findInstalledOpenCodeAppExecutable().executable, file);
  assert.equal(spawnSync.mock.callCount(), 0);
  assert.equal(execFile.mock.callCount(), 0, "an app found on the path starts no package load");
});

test("the package list is filtered by name, full name and install location", async (t) => {
  stubWindows(t);
  mockNothingInstalled(t);
  t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  mockPackageList(t, (callback) => callback(null, [
    "OpenAI.ChatGPT-Desktop\tfull-one\tC:\\ByName",
    "Other.Name\tOpenAI.ChatGPT_1.0_x64\tC:\\ByFullName",
    "Third.Name\tfull-three\tC:\\Apps\\chatgpt",
    "Unrelated.Name\tfull-four\tC:\\Unrelated",
    "ChatGPT.NoLocation\tfull-five\t",
    ""
  ].join("\r\n")));

  await prefetchWindowsAppxPackages();
  const candidates = [...windowsDesktopAppCandidates(chatgptOptions)];

  for (const location of ["C:\\ByName", "C:\\ByFullName", "C:\\Apps\\chatgpt"]) {
    assert.equal(candidates.includes(location), true, location);
  }
  assert.equal(candidates.includes("C:\\Unrelated"), false);
  assert.equal(candidates.includes(""), false);
});

test("a failed package load is tried again, and a lookup before any load answers empty", async (t) => {
  stubWindows(t);
  mockNothingInstalled(t);
  t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  let calls = 0;
  const execFile = mockPackageList(t, (callback) => {
    if (++calls === 1) callback(new Error("the package list could not be read"), "");
  });

  const first = [...windowsDesktopAppCandidates(chatgptOptions)];
  await prefetchWindowsAppxPackages();
  const second = [...windowsDesktopAppCandidates(chatgptOptions)];

  assert.deepEqual(second, first);
  assert.equal(execFile.mock.callCount(), 2);
});

test("on Windows, discovery with no app installed makes no synchronous spawn", { skip: process.platform !== "win32" }, async (t) => {
  resetWindowsAppxPackagesForTest();
  t.after(() => resetWindowsAppxPackagesForTest());
  const spawnSync = t.mock.method(childProcess, "spawnSync");

  findInstalledCodexAppExecutable();
  findInstalledOpenCodeAppExecutable();
  findInstalledWorkbuddyAppExecutable();

  assert.equal(spawnSync.mock.callCount(), 0);
  await prefetchWindowsAppxPackages();
});

test("a package list older than 30 seconds is reloaded, and the old list answers meanwhile", async (t) => {
  stubWindows(t);
  mockNothingInstalled(t);
  t.mock.timers.enable({ apis: ["Date"] });
  t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  let calls = 0;
  const execFile = mockPackageList(t, (callback) => {
    if (++calls === 1) callback(null, "OpenAI.ChatGPT\tfull\tC:\\Package\r\n");
  });

  await prefetchWindowsAppxPackages();
  assert.equal([...windowsDesktopAppCandidates(chatgptOptions)].includes("C:\\Package"), true);
  assert.equal(execFile.mock.callCount(), 1);

  t.mock.timers.tick(30_001);

  assert.equal([...windowsDesktopAppCandidates(chatgptOptions)].includes("C:\\Package"), true);
  assert.equal(execFile.mock.callCount(), 2);
});

test("a matching Start Menu shortcut is read with one PowerShell run that has a timeout", (t) => {
  stubWindows(t);
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = path.join(os.tmpdir(), "llmr-appdata");
  t.after(() => restoreEnv("APPDATA", previousAppData));
  const programs = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  t.mock.method(fs, "statSync", () => ({ isDirectory: () => false, isFile: () => false }));
  t.mock.method(fs, "readdirSync", (dir, options) => options?.recursive && dir === programs ? ["Apps/ChatGPT.lnk", "Apps/Other.lnk"] : []);
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "C:\\ChatGPT\\ChatGPT.exe\r\n" }));
  mockPackageList(t, () => {});

  const candidates = [...windowsDesktopAppCandidates(chatgptOptions)];

  assert.equal(candidates.includes("C:\\ChatGPT\\ChatGPT.exe"), true);
  assert.equal(spawnSync.mock.callCount(), 1);
  const [, args, options] = spawnSync.mock.calls[0].arguments;
  assert.doesNotMatch(args.at(-1), /\.lnk/);
  assert.deepEqual(JSON.parse(options.env.LLMR_SHORTCUT_FILES), [path.join(programs, "Apps/ChatGPT.lnk")]);
  assert.equal(options.timeout, 5000);
});

test("on Windows, the targets of two matching shortcuts are both read", { skip: process.platform !== "win32" }, async (t) => {
  resetWindowsAppxPackagesForTest();
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-appdata-"));
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
  const programs = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs");
  fs.mkdirSync(programs, { recursive: true });
  const targets = [process.execPath, path.join(process.env.SystemRoot, "System32", "cmd.exe")];
  const links = [path.join(programs, "ChatGPT.lnk"), path.join(programs, "ChatGPT it's.lnk")];
  childProcess.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", [
    "$shell = New-Object -ComObject WScript.Shell;",
    "$pairs = $env:LLMR_TEST_SHORTCUTS | ConvertFrom-Json;",
    "foreach ($pair in $pairs) { $link = $shell.CreateShortcut($pair[0]); $link.TargetPath = $pair[1]; $link.Save() }"
  ].join(" ")], { env: { ...process.env, LLMR_TEST_SHORTCUTS: JSON.stringify(links.map((link, index) => [link, targets[index]])) } });
  t.after(async () => {
    await prefetchWindowsAppxPackages();
    resetWindowsAppxPackagesForTest();
    fs.rmSync(appData, { force: true, recursive: true });
    restoreEnv("APPDATA", previousAppData);
  });

  const candidates = [...windowsDesktopAppCandidates(chatgptOptions)].map((candidate) => candidate.toLowerCase());

  for (const target of targets) {
    assert.equal(candidates.includes(target.toLowerCase()), true, target);
  }
});

test("a shortcut is still found when a folder beside it cannot be read", { skip: (process.platform === "win32" || process.getuid?.() === 0) && "chmod cannot make a folder unreadable on Windows or for root" }, (t) => {
  stubWindows(t);
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-appdata-"));
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
  const programs = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs");
  const locked = path.join(programs, "Locked");
  fs.mkdirSync(path.join(programs, "Apps"), { recursive: true });
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(programs, "Apps", "ChatGPT.lnk"), "");
  fs.chmodSync(locked, 0o000);
  t.after(() => {
    fs.chmodSync(locked, 0o700);
    fs.rmSync(appData, { force: true, recursive: true });
    restoreEnv("APPDATA", previousAppData);
  });
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  mockPackageList(t, () => {});

  [...windowsDesktopAppCandidates(chatgptOptions)];

  assert.deepEqual(JSON.parse(spawnSync.mock.calls[0].arguments[2].env.LLMR_SHORTCUT_FILES), [path.join(programs, "Apps", "ChatGPT.lnk")]);
});

test("a launch waits for the package list only when the first look finds nothing", async (t) => {
  stubWindows(t);
  const location = fs.mkdtempSync(path.join(os.tmpdir(), "llmr-app-package-"));
  fs.writeFileSync(path.join(location, "Claude Desktop.exe"), "");
  const previousPath = process.env.PATH;
  process.env.PATH = "";
  t.after(() => {
    restoreEnv("PATH", previousPath);
    fs.rmSync(location, { force: true, recursive: true });
  });
  t.mock.method(childProcess, "spawnSync", () => ({ status: 1, stdout: "" }));
  const execFile = mockPackageList(t, (callback) => setImmediate(() => callback(null, `AnthropicPBC.Claude\tfull\t${location}\r\n`)));

  assert.equal(findInstalledClaudeAppExecutable().executable, undefined);
  const found = await findAfterAppxLoad(() => findInstalledClaudeAppExecutable());
  assert.equal(found.executable, path.join(location, "Claude Desktop.exe"));

  resetWindowsAppxPackagesForTest();
  execFile.mock.resetCalls();
  assert.deepEqual(await findAfterAppxLoad(() => ({ executable: "found at once" })), { executable: "found at once" });
  assert.equal(execFile.mock.callCount(), 0);
});
