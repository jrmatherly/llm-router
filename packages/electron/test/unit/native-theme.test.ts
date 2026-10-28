import assert from "node:assert/strict";
import test from "node:test";
import { IPC_CHANNELS } from "@llmr/core/contracts/ipc-channels.ts";
import { nativeThemeSource } from "@llmr/electron/main/native-theme.ts";

test("native theme source maps explicit preferences and system fallback", () => {
  assert.equal(nativeThemeSource("light"), "light");
  assert.equal(nativeThemeSource("dark"), "dark");
  assert.equal(nativeThemeSource("system"), "system");
  assert.equal(nativeThemeSource(undefined), "system");
});

test("theme preference IPC uses separate save and renderer notification channels", () => {
  assert.equal(IPC_CHANNELS.appSetThemePreference, "llmr:app:set-theme-preference");
  assert.equal(IPC_CHANNELS.appThemePreferenceChanged, "llmr:app:theme-preference-changed");
});
