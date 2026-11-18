import { app, dialog } from "electron";
import { mkdirSync } from "node:fs";
import { installSocketTypeOfServiceCompat } from "@llmr/core/platform/socket-compat";
import { resolveRuntimeDataDir, setRuntimeAppPaths } from "@llmr/core/runtime/app-paths";
import { copyMissingDirectoryContents, sameFilesystemPath } from "@llmr/core/storage/migration";
import { startupErrorMessage } from "@llmr/electron/main/startup-error";

installSocketTypeOfServiceCompat();

const appDataPath = readConfiguredRuntimePath("LLMR_INTERNAL_APP_DATA_DIR") ?? app.getPath("appData");
const homePath = readConfiguredRuntimePath("LLMR_INTERNAL_HOME_DIR") ?? app.getPath("home");
setRuntimeAppPaths({
  appData: appDataPath,
  home: homePath,
  userData: readConfiguredRuntimePath("LLMR_INTERNAL_USER_DATA_DIR")
});
const userDataPath = configureRuntimeUserDataPath(app.getPath("userData"));
setRuntimeAppPaths({
  appData: appDataPath,
  home: homePath,
  userData: userDataPath
});

let fatalStartupErrorReported = false;

process.once("uncaughtException", reportFatalStartupError);
process.once("unhandledRejection", reportFatalStartupError);

void import("./main-app.js")
  .then(() => {
    process.off("uncaughtException", reportFatalStartupError);
    process.off("unhandledRejection", reportFatalStartupError);
  })
  .catch((error) => {
    reportFatalStartupError(error);
  });

function reportFatalStartupError(error: unknown): void {
  if (fatalStartupErrorReported) {
    return;
  }
  fatalStartupErrorReported = true;

  const detail = formatErrorDetail(error);
  console.error(detail);

  try {
    dialog.showErrorBox("LLM Router failed to start", startupErrorMessage(detail));
  } catch {
    // If the platform dialog is unavailable, the console output above still
    // preserves the actionable failure for command-line launches.
  }

  app.exit(1);
}

function readConfiguredRuntimePath(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function configureRuntimeUserDataPath(currentUserDataPath: string): string {
  const sharedUserDataPath = resolveRuntimeDataDir();
  mkdirSync(sharedUserDataPath, { recursive: true });
  if (sameFilesystemPath(currentUserDataPath, sharedUserDataPath)) {
    return currentUserDataPath;
  }

  copyMissingDirectoryContents(currentUserDataPath, sharedUserDataPath, "Electron app data directory");
  app.setPath("userData", sharedUserDataPath);
  return app.getPath("userData");
}

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}
