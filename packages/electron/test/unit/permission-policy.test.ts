import assert from "node:assert/strict";
import test from "node:test";
import { installPermissionPolicy, isPermissionAllowed } from "@ccr/electron/main/permission-policy.ts";

test("permission policy allows only clipboard write and fullscreen", () => {
  assert.equal(isPermissionAllowed("clipboard-sanitized-write"), true);
  assert.equal(isPermissionAllowed("fullscreen"), true);
  for (const permission of ["media", "geolocation", "notifications", "openExternal", "clipboard-read", "display-capture", "midiSysex", "pointerLock", "hid", "usb", "serial", "fileSystem", "unknown"]) {
    assert.equal(isPermissionAllowed(permission), false, permission);
  }
});

test("installPermissionPolicy wires both handlers to the policy", () => {
  let check: ((webContents: unknown, permission: string) => boolean) | undefined;
  let request: ((webContents: unknown, permission: string, callback: (granted: boolean) => void) => void) | undefined;
  installPermissionPolicy({
    setPermissionCheckHandler: (handler) => { check = handler; },
    setPermissionRequestHandler: (handler) => { request = handler; }
  });
  assert.equal(check?.(null, "clipboard-sanitized-write"), true);
  assert.equal(check?.(null, "media"), false);
  const granted: boolean[] = [];
  request?.(null, "fullscreen", (value) => granted.push(value));
  request?.(null, "notifications", (value) => granted.push(value));
  assert.deepEqual(granted, [true, false]);
});
