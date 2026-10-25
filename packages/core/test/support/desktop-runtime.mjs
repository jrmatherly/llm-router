import { CCR_DESKTOP_APP_ENV } from "@ccr/core/runtime/desktop-app.ts";

export async function withDesktopRuntime(run) {
  const previousDesktopApp = process.env[CCR_DESKTOP_APP_ENV];
  const previousElectron = process.versions.electron;
  process.env[CCR_DESKTOP_APP_ENV] = "1";
  if (previousElectron === undefined) {
    process.versions.electron = "test";
  }
  try {
    return await run();
  } finally {
    restore(process.env, CCR_DESKTOP_APP_ENV, previousDesktopApp);
    restore(process.versions, "electron", previousElectron);
  }
}

function restore(target, key, value) {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}
