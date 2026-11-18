export function startupErrorMessage(detail: string): string {
  if (isBetterSqliteNativeError(detail)) {
    return [
      "The bundled SQLite native module could not be loaded.",
      "",
      "This usually means the installed app is missing the better-sqlite3 binary for this platform, or the file is damaged. Reinstall LLM Router. If the error returns, report it with the detail below.",
      "",
      detail
    ].join("\n");
  }

  return detail;
}

// Every better-sqlite3 error has the package path in its stack, so match only what a failed load of the binary produces.
export function isBetterSqliteNativeError(detail: string): boolean {
  return /better_sqlite3\.node|[\\/]prebuilds[\\/][\w-]+\.node|NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|Cannot find module ['"]better-sqlite3/i.test(detail);
}
