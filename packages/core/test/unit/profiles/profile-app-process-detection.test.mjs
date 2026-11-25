import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import {
  findProfileAppMainPidForTest,
  getProfileRuntimeStatus,
  isProfileAppMainProcessCommandForTest,
  isProfileAppRunningWithProbeForTest,
  monitorProfileAppForTest,
  profileAppActivationCommand,
  registerExistingProfileAppForTest
} from "@llmr/core/profiles/launch-service.ts";

const userDataDir = "/Users/example/.llm-router/profiles/codex/codex/.llm-router/codex-app-user-data/codex";

test("profile app process detection ignores persistent Chromium helper processes", () => {
  const main = `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --remote-debugging-port=0 --user-data-dir=${userDataDir}`;
  const renderer = `/Applications/ChatGPT.app/Contents/Frameworks/Codex (Renderer) --type=renderer --user-data-dir=${userDataDir}`;
  const crashpad = `/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler --monitor-self --database=${userDataDir}/Crashpad --monitor-self-annotation=ptype=crashpad-handler`;

  assert.equal(isProfileAppMainProcessCommandForTest(main, userDataDir), true);
  assert.equal(isProfileAppMainProcessCommandForTest(renderer, userDataDir), false);
  assert.equal(isProfileAppMainProcessCommandForTest(crashpad, userDataDir), false);
  assert.equal(isProfileAppMainProcessCommandForTest("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT", userDataDir), false);
});

test("profile app liveness prefers a tracked application pid before process discovery", () => {
  let discoveryCalls = 0;
  const running = isProfileAppRunningWithProbeForTest(
    { pid: 1234, pidIsLauncher: false, userDataDir },
    {
      isProcessAlive: () => true,
      profileAppMainPid: () => {
        discoveryCalls += 1;
        return undefined;
      }
    }
  );

  assert.equal(running, true);
  assert.equal(discoveryCalls, 0);
});

test("profile app liveness falls back to process discovery after the tracked pid exits", () => {
  let discoveryCalls = 0;
  const running = isProfileAppRunningWithProbeForTest(
    { pid: 1234, pidIsLauncher: false, userDataDir },
    {
      isProcessAlive: () => false,
      profileAppMainPid: () => {
        discoveryCalls += 1;
        return 5678;
      }
    }
  );

  assert.equal(running, true);
  assert.equal(discoveryCalls, 1);
});

test("profile app liveness uses process discovery for launcher pids", () => {
  let pidChecks = 0;
  let discoveryCalls = 0;
  const running = isProfileAppRunningWithProbeForTest(
    { pid: 1234, pidIsLauncher: true, userDataDir },
    {
      isProcessAlive: () => {
        pidChecks += 1;
        return true;
      },
      profileAppMainPid: () => {
        discoveryCalls += 1;
        return undefined;
      }
    }
  );

  assert.equal(running, false);
  assert.equal(pidChecks, 0);
  assert.equal(discoveryCalls, 1);
});

test("an app is brought forward by process id with no Apple Event", () => {
  const { args, command } = profileAppActivationCommand(4242);
  assert.equal(command, "/usr/bin/osascript");
  assert.deepEqual(args.slice(0, 3), ["-l", "JavaScript", "-e"]);
  assert.equal(args[3], 'ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(4242).activateWithOptions(2)');
  assert.doesNotMatch(args.join(" "), /System Events|tell application/);
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

function monitorWith(t, probe) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let gone = 0;
  const monitor = monitorProfileAppForTest(probe, () => {
    gone += 1;
  });
  t.after(() => clearInterval(monitor));
  return { gone: () => gone, tick: async () => {
    t.mock.timers.tick(2_000);
    await settle();
  } };
}

test("an adopted app that is gone is cleaned up", async (t) => {
  const monitor = monitorWith(t, async () => undefined);
  await monitor.tick();
  assert.equal(monitor.gone(), 1);
});

test("a probe that fails leaves the app registered", async (t) => {
  const monitor = monitorWith(t, async () => {
    throw new Error("the probe timed out");
  });
  await monitor.tick();
  assert.equal(monitor.gone(), 0);
});

test("a probe that fails five times in a row removes the app, and a success between starts the count again", async (t) => {
  const answers = ["fail", "fail", "fail", "fail", 4321, "fail", "fail", "fail", "fail", "fail"];
  const monitor = monitorWith(t, async () => {
    const answer = answers.shift();
    if (answer === "fail") throw new Error("the probe timed out");
    return answer;
  });
  for (let tick = 0; tick < 9; tick += 1) await monitor.tick();
  assert.equal(monitor.gone(), 0);
  await monitor.tick();
  assert.equal(monitor.gone(), 1);
});

test("a slow probe is not started twice", async (t) => {
  let calls = 0;
  const monitor = monitorWith(t, () => {
    calls += 1;
    return new Promise(() => {});
  });
  for (let tick = 0; tick < 3; tick += 1) await monitor.tick();
  assert.equal(calls, 1);
});

test("the monitor's own probe starts no blocking process", async (t) => {
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  const execFile = t.mock.method(childProcess, "execFile", (_file, _args, _options, callback) => callback(null, ""));

  assert.equal(await findProfileAppMainPidForTest({ userDataDir }), undefined);

  assert.equal(spawnSync.mock.callCount(), 0);
  assert.equal(execFile.mock.callCount(), 1);
  assert.equal(execFile.mock.calls[0].arguments[2].timeout, 5000);
});

test("the monitor's own probe rejects when its command fails", async (t) => {
  t.mock.method(childProcess, "execFile", (_file, _args, _options, callback) => callback(new Error("timed out"), ""));
  await assert.rejects(findProfileAppMainPidForTest({ userDataDir }), /timed out/);
});

test("the status poll starts no blocking process for an adopted app", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const spawnSync = t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stdout: "" }));
  const execFile = t.mock.method(childProcess, "execFile", (_file, _args, _options, callback) => callback(null, ""));
  registerExistingProfileAppForTest({ agent: "opencode", id: "adopted-app-test", name: "Adopted" }, "app", { command: "OpenCode App", pid: 4321, userDataDir });
  const listed = () => getProfileRuntimeStatus().profiles.some((entry) => entry.profileId === "adopted-app-test");

  for (let poll = 0; poll < 3; poll += 1) assert.equal(listed(), true);
  assert.equal(spawnSync.mock.callCount(), 0);

  t.mock.timers.tick(2_000);
  assert.equal(spawnSync.mock.callCount(), 0);
  assert.equal(execFile.mock.callCount(), 1);
  await settle();
  assert.equal(listed(), false);
});
