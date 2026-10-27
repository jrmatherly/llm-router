import path from "node:path";

type StaleRuntimeInput = {
  cliVersion?: string;
  electronVersion?: string;
  execPath: string;
  platform: NodeJS.Platform;
  readFile: (file: string) => string;
};

export function staleDesktopRuntimeWarning({ cliVersion, electronVersion, execPath, platform, readFile }: StaleRuntimeInput): string | undefined {
  if (!electronVersion || !cliVersion) return undefined;
  // process.resourcesPath can be undefined under ELECTRON_RUN_AS_NODE, so derive it from the executable.
  const resourcesPath = platform === "darwin"
    ? path.join(execPath, "..", "..", "Resources")
    : path.join(path.dirname(execPath), "resources");
  for (const appDir of ["app.asar", "app"]) {
    try {
      const appVersion = JSON.parse(readFile(path.join(resourcesPath, appDir, "package.json"))).version;
      return appVersion && appVersion !== cliVersion ? "llmr: LLM Router was updated; open it once to refresh this command.\n" : undefined;
    } catch {}
  }
  return undefined;
}
