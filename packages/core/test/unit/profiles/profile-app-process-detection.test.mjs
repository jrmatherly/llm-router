import assert from "node:assert/strict";
import test from "node:test";
import {
  isProfileAppMainProcessCommandForTest,
  isProfileAppRunningWithProbeForTest,
  profileAppActivationCommand
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
