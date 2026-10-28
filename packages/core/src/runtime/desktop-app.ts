export const LLMR_DESKTOP_APP_ENV = "LLMR_DESKTOP_APP";

export function markDesktopAppRuntime(): void {
  process.env[LLMR_DESKTOP_APP_ENV] = "1";
}

export function isDesktopAppRuntime(): boolean {
  return process.env[LLMR_DESKTOP_APP_ENV] === "1" && Boolean((process.versions as NodeJS.ProcessVersions & { electron?: string }).electron);
}
