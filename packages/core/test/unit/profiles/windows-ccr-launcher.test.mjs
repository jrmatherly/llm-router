import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { windowsCcrLauncher } from "@llmr/core/profiles/launch-service.ts";

test("Windows LLMR launcher prepares CLI profiles before direct TTY dispatch", { skip: process.platform !== "win32" }, () => {
  const config = {
    profile: {
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          id: "claude-main",
          model: "provider/model",
          name: "Claude Main",
          scope: "ccr",
          surface: "cli"
        }
      ]
    }
  };
  const runtimeFile = path.join("C:\\LLMR", "ccr-cli.js");
  const launcher = windowsCcrLauncher(runtimeFile, config);

  assert.match(launcher, /if \/I "%~1"=="Claude Main" goto ccr_profile_0/);
  assert.match(launcher, /set "LLMR_CLI_PREPARE_PROFILE_ONLY=1"/);
  assert.match(launcher, /set "ELECTRON_RUN_AS_NODE=1"/);
  assert.match(launcher, /set "LLMR_CLI_DIRECT_PROFILE_DISPATCH=1"/);
  assert.match(launcher, /call ".*ccr-claude-code-wrapper-claude-main\.cmd" %\*/);

  const prepareIndex = launcher.indexOf('set "LLMR_CLI_PREPARE_PROFILE_ONLY=1"');
  const directDispatchIndex = launcher.indexOf('set "LLMR_CLI_DIRECT_PROFILE_DISPATCH=1"');
  const wrapperIndex = launcher.indexOf("ccr-claude-code-wrapper-claude-main.cmd");
  assert.equal(prepareIndex >= 0, true);
  assert.equal(directDispatchIndex > prepareIndex, true);
  assert.equal(wrapperIndex > directDispatchIndex, true);
});
