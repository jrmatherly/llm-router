import { execFile, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mergeChildEnv, withoutLlmrSecretEnv } from "@llmr/core/mcp/child-env";
import { commandSearchPath } from "@llmr/core/platform/command-path";
import { windowsSystemCommand } from "@llmr/core/platform/windows-system";

export type WindowsDesktopAppDiscoveryOptions = {
  appDirs: string[];
  exeNames: string[];
  packageKeywords: string[];
  vendorDirs: string[];
  whereNames: string[];
};

export type WindowsDesktopAppNormalizeOptions = {
  exeNames: string[];
  packageKeywords: string[];
};

export function* windowsDesktopAppCandidates(options: WindowsDesktopAppDiscoveryOptions): Generator<string> {
  if (process.platform !== "win32") {
    return;
  }

  const candidates: string[] = [];
  for (const root of windowsInstallRoots()) {
    const installRoots = [
      root,
      path.join(root, "Programs"),
      ...options.vendorDirs.flatMap((vendor) => [
        path.join(root, vendor),
        path.join(root, "Programs", vendor)
      ]),
      path.join(root, "Microsoft", "WindowsApps")
    ];

    for (const installRoot of installRoots) {
      for (const exeName of options.exeNames) {
        pushUnique(candidates, path.join(installRoot, exeName));
      }
      for (const dirName of options.appDirs) {
        const appDir = path.join(installRoot, dirName);
        pushUnique(candidates, appDir);
        for (const exeName of options.exeNames) {
          pushUnique(candidates, path.join(appDir, exeName));
        }
      }
    }
  }

  // Let callers stop at an installed app before starting discovery subprocesses.
  yield* candidates;
  yield* windowsAppExecutionAliasCandidates(options);
  yield* windowsShortcutTargetCandidates(options);
  // Before the package step, so an app on the path starts no package load.
  yield* windowsWhereCandidates(options.whereNames);
  yield* windowsMsixPackageCandidates(options);
}

export async function findAfterAppxLoad<T extends { executable?: string }>(lookup: () => T): Promise<T> {
  const found = lookup();
  if (found.executable || process.platform !== "win32") {
    return found;
  }
  await prefetchWindowsAppxPackages();
  return lookup();
}

function windowsShortcutTargetCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const names = unique([
    ...options.packageKeywords,
    ...options.appDirs,
    ...options.exeNames.map((name) => path.basename(name, path.extname(name)))
  ].map((name) => name.trim()).filter(Boolean));
  if (names.length === 0) {
    return [];
  }

  const shortcuts = unique([
    process.env.APPDATA ? path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs") : undefined,
    process.env.ProgramData ? path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Desktop") : undefined,
    process.env.PUBLIC ? path.join(process.env.PUBLIC, "Desktop") : undefined
  ].filter((value): value is string => Boolean(value?.trim())))
    .flatMap((root) => readDirectoryEntries(root, true).map((entry) => path.join(root, entry)))
    .filter((file) => file.toLowerCase().endsWith(".lnk") && nameContainsKeyword(path.basename(file, path.extname(file)), names));
  if (shortcuts.length === 0) {
    return [];
  }

  const script = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    "$shell = New-Object -ComObject WScript.Shell;",
    "$env:LLMR_SHORTCUT_FILES | ConvertFrom-Json |",
    "  ForEach-Object {",
    "    try {",
    "      $target = $shell.CreateShortcut($_).TargetPath;",
    "      if ($target) { $target }",
    "    } catch {}",
    "  }"
  ].join(" ");

  const result = spawnSync(windowsSystemCommand("powershell.exe"), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    // The file names travel outside the script text, so no character in a name can end a quoted literal.
    env: mergeChildEnv(withoutLlmrSecretEnv(), { LLMR_SHORTCUT_FILES: JSON.stringify(shortcuts) }),
    timeout: 5_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeWindowsDesktopAppCandidate(
  candidate: string,
  options: WindowsDesktopAppNormalizeOptions
): string | undefined {
  if (isDirectory(candidate)) {
    return windowsExecutableInDir(candidate, options);
  }
  if (!isFile(candidate)) {
    return undefined;
  }

  const fileName = path.basename(candidate);
  if (matchesKnownExeName(fileName, options.exeNames)) {
    return candidate;
  }
  if (isLikelyWindowsPackagedAppPath(candidate) && windowsExecutableNameLooksLikeApp(fileName, options.packageKeywords)) {
    return candidate;
  }

  const parent = path.basename(path.dirname(candidate)).toLowerCase();
  if (parent === "resources") {
    const appDir = path.dirname(path.dirname(candidate));
    return windowsExecutableInDir(appDir, options);
  }
  return undefined;
}

function windowsInstallRoots(): string[] {
  return unique([
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramFiles,
    process.env.PROGRAMFILES,
    process.env["ProgramFiles(x86)"],
    process.env["PROGRAMFILES(X86)"],
    process.env.ProgramW6432,
    process.env.PROGRAMW6432,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : undefined,
    path.join(os.homedir(), "AppData", "Local"),
    path.join(os.homedir(), "AppData", "Roaming")
  ].filter((value): value is string => Boolean(value?.trim())));
}

function windowsAppExecutionAliasCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const roots = unique([
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Microsoft", "WindowsApps") : undefined,
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WindowsApps")
  ].filter((value): value is string => Boolean(value?.trim())));

  const candidates: string[] = [];
  const aliasNames = windowsAliasNames(options);
  for (const root of roots) {
    for (const aliasName of aliasNames) {
      pushUnique(candidates, path.join(root, aliasName));
    }

    for (const entry of readDirectoryEntries(root)) {
      if (entry.toLowerCase().endsWith(".exe") && windowsExecutableNameLooksLikeApp(entry, options.packageKeywords)) {
        pushUnique(candidates, path.join(root, entry));
      }
    }
  }
  return candidates;
}

function windowsAliasNames(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const names = [...options.exeNames];
  for (const name of options.whereNames) {
    names.push(name);
    if (!name.toLowerCase().endsWith(".exe")) {
      names.push(`${name}.exe`);
    }
  }
  return unique(names.filter((name) => name.trim().length > 0));
}

function windowsMsixPackageCandidates(options: WindowsDesktopAppDiscoveryOptions): string[] {
  const candidates: string[] = [];
  for (const installLocation of windowsMsixInstallLocations(options.packageKeywords)) {
    pushWindowsExecutableCandidates(candidates, installLocation, options);
  }
  return candidates;
}

function windowsMsixInstallLocations(packageKeywords: string[]): string[] {
  const locations: string[] = [];

  for (const root of windowsPackageRoots()) {
    for (const entry of readDirectoryEntries(root)) {
      if (nameContainsKeyword(entry, packageKeywords)) {
        pushUnique(locations, path.join(root, entry));
      }
    }
  }

  for (const installLocation of windowsAppxPackageInstallLocations(packageKeywords)) {
    pushUnique(locations, installLocation);
  }
  return locations;
}

function windowsPackageRoots(): string[] {
  return unique([
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "WindowsApps") : undefined,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "WindowsApps") : undefined,
    process.env.ProgramW6432 ? path.join(process.env.ProgramW6432, "WindowsApps") : undefined,
    process.env.PROGRAMW6432 ? path.join(process.env.PROGRAMW6432, "WindowsApps") : undefined,
    "C:\\Program Files\\WindowsApps"
  ].filter((value): value is string => Boolean(value?.trim())));
}

const appxMaxAgeMs = 30_000;
let appxPackages: { loadedAt: number; packages: string[][] } | undefined;
let appxLoad: Promise<void> | undefined;
let appxGeneration = 0;

// Resolves at once with a list younger than 30 seconds. Never rejects: a failed load keeps the list it had.
export function prefetchWindowsAppxPackages(): Promise<void> {
  if (process.platform !== "win32" || (appxPackages && Date.now() - appxPackages.loadedAt <= appxMaxAgeMs)) {
    return Promise.resolve();
  }
  if (!appxLoad) {
    const generation = appxGeneration;
    appxLoad = new Promise<string[][] | undefined>((resolve) => {
      try {
        execFile(windowsSystemCommand("powershell.exe"), [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "$ErrorActionPreference = 'SilentlyContinue'; Get-AppxPackage | ForEach-Object { $_.Name + \"`t\" + $_.PackageFullName + \"`t\" + $_.InstallLocation }"
        ], { encoding: "utf8", timeout: 15_000, windowsHide: true }, (error, stdout) => {
          resolve(error ? undefined : stdout
            .split(/\r?\n/)
            .map((line) => line.split("\t").map((field) => field.trim()))
            .filter((fields) => fields.length === 3 && fields[2]));
        });
      } catch {
        resolve(undefined);
      }
    }).then((packages) => {
      if (generation !== appxGeneration) {
        return;
      }
      appxLoad = undefined;
      if (packages) {
        appxPackages = { loadedAt: Date.now(), packages };
      }
    });
  }
  return appxLoad;
}

export function resetWindowsAppxPackagesForTest(): void {
  appxGeneration += 1;
  appxPackages = undefined;
  appxLoad = undefined;
}

function windowsAppxPackageInstallLocations(packageKeywords: string[]): string[] {
  void prefetchWindowsAppxPackages();
  return (appxPackages?.packages ?? [])
    .filter((fields) => fields.some((field) => nameContainsKeyword(field, packageKeywords)))
    .map((fields) => fields[2]);
}

function pushWindowsExecutableCandidates(
  candidates: string[],
  installLocation: string,
  options: WindowsDesktopAppDiscoveryOptions
): void {
  pushUnique(candidates, installLocation);
  for (const exeName of options.exeNames) {
    pushUnique(candidates, path.join(installLocation, exeName));
  }
  for (const nested of ["app", "current", "Current", "bin", path.join("app", "bin")]) {
    const nestedDir = path.join(installLocation, nested);
    pushUnique(candidates, nestedDir);
    for (const exeName of options.exeNames) {
      pushUnique(candidates, path.join(nestedDir, exeName));
    }
  }
}

function windowsWhereCandidates(names: string[]): string[] {
  const { directories, extensions } = commandSearchPath();
  const wanted = new Set(names.flatMap((name) => [name, ...extensions.map((extension) => name + extension)]).map((name) => name.toLowerCase()));
  const candidates: string[] = [];
  for (const directory of directories) {
    for (const entry of readDirectoryEntries(directory)) {
      if (wanted.has(entry.toLowerCase())) {
        pushUnique(candidates, path.join(directory, entry));
      }
    }
  }
  return candidates;
}

function windowsExecutableInDir(
  dir: string,
  options: WindowsDesktopAppNormalizeOptions
): string | undefined {
  if (!isDirectory(dir)) {
    return undefined;
  }

  for (const exeName of options.exeNames) {
    const candidate = path.join(dir, exeName);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  const looseExecutable = readDirectoryEntries(dir)
    .filter((entry) => entry.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(dir, entry))
    .find((entry) => isFile(entry) && windowsExecutableNameLooksLikeApp(path.basename(entry), options.packageKeywords));
  if (looseExecutable) {
    return looseExecutable;
  }

  for (const nested of ["app", "current", "Current", "bin", path.join("app", "bin")]) {
    const candidate = windowsExecutableInDir(path.join(dir, nested), options);
    if (candidate) {
      return candidate;
    }
  }

  const versionedDirs = readDirectoryEntries(dir)
    .filter((entry) => entry.toLowerCase().startsWith("app-") || nameContainsKeyword(entry, options.packageKeywords))
    .map((entry) => path.join(dir, entry))
    .filter(isDirectory)
    .sort()
    .reverse();
  for (const versionedDir of versionedDirs) {
    const candidate = windowsExecutableInDir(versionedDir, options);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function readDirectoryEntries(dir: string, recursive = false): string[] {
  try {
    return readdirSync(dir, { recursive }) as string[];
  } catch {
    return [];
  }
}

function matchesKnownExeName(fileName: string, exeNames: string[]): boolean {
  const normalized = fileName.toLowerCase();
  return exeNames.some((name) => name.toLowerCase() === normalized);
}

function windowsExecutableNameLooksLikeApp(fileName: string, packageKeywords: string[]): boolean {
  return fileName.toLowerCase().endsWith(".exe") && nameContainsKeyword(fileName, packageKeywords);
}

function nameContainsKeyword(value: string, packageKeywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return packageKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isLikelyWindowsPackagedAppPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/microsoft/windowsapps/") || normalized.includes("/windowsapps/");
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    pushUnique(result, value);
  }
  return result;
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}
