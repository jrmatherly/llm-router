import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { batchFileLaunch, spawnCommandLaunch } from "@llmr/core/platform/command-path.ts";
import { profileLaunchSpawnCommand } from "@llmr/core/profiles/launch-core.ts";
import { testTempRoot } from "../../support/test-temp-dir.mjs";
import { intactArguments } from "../../support/windows-command-cases.mjs";

function stubWindows(t) {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  t.after(() => Object.defineProperty(process, "platform", platform));
}

test("a batch-file launcher gets each argument escaped and the whole line quoted", (t) => {
  stubWindows(t);
  const plan = { args: ["two words", "%PATH%"], command: "C:\\cfg\\bin\\w.cmd" };
  const launch = profileLaunchSpawnCommand(plan);
  assert.deepEqual(launch, batchFileLaunch(plan.command, plan.args));
  assert.equal(launch.args[2], "/s");
  assert.equal(
    profileLaunchSpawnCommand({ args: ["two words"], command: "C:\\cfg\\bin\\w.cmd" }).args[4],
    '"C^:\\cfg\\bin\\w.cmd ^^^"two^^^ words^^^""'
  );
  assert.equal(
    profileLaunchSpawnCommand({ args: ["--workspace-name", "My & Co"], command: "C:\\cfg\\bin\\w.bat" }).args[4],
    '"C^:\\cfg\\bin\\w.bat ^^^"--workspace-name^^^" ^^^"My^^^ ^^^&^^^ Co^^^""'
  );
});

test("a line break in an argument is refused", (t) => {
  stubWindows(t);
  assert.throws(() => profileLaunchSpawnCommand({ args: ["line1\nline2"], command: "C:\\cfg\\bin\\w.cmd" }), /line break/);
});

test("a launcher that is not a batch file is started as it is", () => {
  assert.deepEqual(profileLaunchSpawnCommand({ args: ["two words"], command: "/cfg/bin/w" }), {
    args: ["two words"],
    command: "/cfg/bin/w"
  });
});

test("a generated wrapper receives what was typed", { skip: process.platform !== "win32" }, async () => {
  const root = mkdtempSync(path.join(testTempRoot, "llmr-profile-launch-"));
  try {
    const capture = path.join(root, "capture.js");
    const output = path.join(root, "args.json");
    writeFileSync(capture, 'require("node:fs").writeFileSync(process.env.LLMR_PROFILE_LAUNCH_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));');
    const wrapper = path.join(root, "sp ace (x86) & co", "w.cmd");
    mkdirSync(path.dirname(wrapper), { recursive: true });
    writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${capture}" %*\r\n`);
    for (const args of [[], ...intactArguments.map((row) => [row])]) {
      rmSync(output, { force: true });
      const child = spawnCommandLaunch(profileLaunchSpawnCommand({ args, command: wrapper }), {
        env: { ...process.env, LLMR_PROFILE_LAUNCH_TEST_OUTPUT: output },
        stdio: "ignore"
      });
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      assert.equal(code, 0);
      assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), args);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
