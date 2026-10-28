import assert from "node:assert/strict";
import test from "node:test";
import { isDesktopAppRuntime } from "@llmr/core/runtime/desktop-app.ts";
import { withDesktopRuntime } from "../../support/desktop-runtime.mjs";

test("withDesktopRuntime makes isDesktopAppRuntime true under plain node", async () => {
  delete process.env.CCR_DESKTOP_APP;
  assert.equal(isDesktopAppRuntime(), false);
  const seen = await withDesktopRuntime(() => isDesktopAppRuntime());
  assert.equal(seen, true);
  assert.equal(isDesktopAppRuntime(), false);
});

test("withDesktopRuntime restores env and versions after a throw", async () => {
  const before = { env: process.env.CCR_DESKTOP_APP, electron: process.versions.electron };
  await assert.rejects(withDesktopRuntime(() => { throw new Error("boom"); }), /boom/);
  assert.equal(process.env.CCR_DESKTOP_APP, before.env);
  assert.equal(process.versions.electron, before.electron);
});
