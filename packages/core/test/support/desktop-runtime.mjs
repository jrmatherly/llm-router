const DESKTOP_APP_ENV = "CCR_DESKTOP_APP";

export async function withDesktopRuntime(run) {
  const previousDesktopApp = process.env[DESKTOP_APP_ENV];
  const previousElectron = process.versions.electron;
  process.env[DESKTOP_APP_ENV] = "1";
  if (previousElectron === undefined) {
    process.versions.electron = "test";
  }
  try {
    return await run();
  } finally {
    restore(process.env, DESKTOP_APP_ENV, previousDesktopApp);
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
