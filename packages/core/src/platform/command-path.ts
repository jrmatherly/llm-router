import childProcess, { type ChildProcess, type SpawnOptions } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export type CommandLaunch = { args: string[]; command: string; windowsVerbatimArguments?: true };

export type CommandPathHost = {
  isFile: (file: string) => boolean;
  platform: NodeJS.Platform;
  readText: (file: string) => string | undefined;
};

// The colon is here because cmd.exe ends a percent reference's name at "%" or ":".
const windowsBatchMetaCharacters = /([()\][%!^"`<>&|;, *?:])/g;

const shimHead = ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0"];
const shimTarget = '"%dp0%\\\u0000"';
const npmNodeShimPattern = shimPattern([
  ...shimHead,
  "",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  "  SET PATHEXT=%PATHEXT:;.JS;=;%",
  ")",
  "",
  `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  ${shimTarget} %*`
]);
const npmExeShimPattern = shimPattern([...shimHead, `${shimTarget}   %*`]);

function shimPattern(lines: string[]): RegExp {
  const body = lines
    .map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", '([^"%\\r\\n]+)'))
    .join("\\r?\\n");
  return new RegExp(`^${body}(?:\\r?\\n)?$`);
}

function hostWithDefaults(host: Partial<CommandPathHost> = {}): CommandPathHost {
  return {
    isFile: (file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    },
    platform: process.platform,
    readText: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
    },
    ...host
  };
}

// With two spellings of a name, Node gives a child the one that sorts first.
function environmentValue(env: NodeJS.ProcessEnv, name: string): string {
  const key = Object.keys(env).filter((candidate) => candidate.toUpperCase() === name).sort()[0];
  return (key === undefined ? undefined : env[key]) ?? "";
}

function listEntries(value: string): string[] {
  return value.split(";").map((entry) => entry.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

// The Windows rule on every platform: entries are separated by ";".
export function commandSearchPath(env: NodeJS.ProcessEnv = process.env): { directories: string[]; extensions: string[] } {
  return {
    directories: listEntries(environmentValue(env, "PATH")),
    extensions: listEntries(environmentValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD")
  };
}

export function resolveCommandFile(command: string, env?: NodeJS.ProcessEnv, host?: Partial<CommandPathHost>): string {
  const { isFile, platform } = hostWithDefaults(host);
  if (platform !== "win32") {
    return command;
  }
  const value = command.trim().replace(/^"|"$/g, "");
  if (!value) {
    return "";
  }
  const searchPath = commandSearchPath(env);
  // A bare name is never tried without an extension: npm puts an extensionless shell script beside each .cmd.
  const extensions = path.win32.extname(value) ? [""] : searchPath.extensions;
  const hasPath = path.win32.isAbsolute(value) || /[\\/]/.test(value);
  for (const directory of hasPath ? [""] : searchPath.directories) {
    for (const extension of extensions) {
      const candidate = directory ? path.win32.join(directory, value + extension) : value + extension;
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return "";
}

export function npmShimTarget(shimText: string): { runsNode: boolean; target: string } | undefined {
  const node = npmNodeShimPattern.exec(shimText);
  if (node) {
    return { runsNode: true, target: node[1] };
  }
  const exe = npmExeShimPattern.exec(shimText);
  return exe ? { runsNode: false, target: exe[1] } : undefined;
}

// Carets twice: a batch file that forwards %* parses the line a second time.
export function windowsBatchArgument(value: string): string {
  const quoted = `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  return quoted.replace(windowsBatchMetaCharacters, "^$1").replace(windowsBatchMetaCharacters, "^$1");
}

export function batchFileLaunch(file: string, args: string[]): CommandLaunch {
  if (args.some((arg) => /[\r\n]/.test(arg))) {
    throw new Error(`A line break cannot be passed to ${file} on Windows.`);
  }
  const line = [file.replace(windowsBatchMetaCharacters, "^$1"), ...args.map(windowsBatchArgument)].join(" ");
  return {
    args: ["/d", "/v:off", "/s", "/c", `"${line}"`],
    command: process.env.ComSpec || "cmd.exe",
    windowsVerbatimArguments: true
  };
}

export function commandLaunch(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  host?: Partial<CommandPathHost>
): CommandLaunch {
  const resolvedHost = hostWithDefaults(host);
  const file = resolveCommandFile(command, env, resolvedHost);
  if (resolvedHost.platform !== "win32" || !file) {
    return { args, command };
  }
  if (/\.(?:com|exe)$/i.test(file)) {
    return { args, command: file };
  }
  const shim = npmShimTarget(resolvedHost.readText(file) ?? "");
  const directory = path.win32.dirname(file);
  const target = shim ? path.win32.join(directory, shim.target) : "";
  if (shim && resolvedHost.isFile(target)) {
    if (!shim.runsNode && /\.(?:com|exe)$/i.test(target)) {
      return { args, command: target };
    }
    if (shim.runsNode) {
      const bundled = path.win32.join(directory, "node.exe");
      const node = resolvedHost.isFile(bundled) ? bundled : resolveCommandFile("node", env, resolvedHost);
      if (/\.exe$/i.test(node)) {
        return { args: [target, ...args], command: node };
      }
    }
  }
  return batchFileLaunch(file, args);
}

export function spawnCommandLaunch(launch: CommandLaunch, options: SpawnOptions): ChildProcess {
  return childProcess.spawn(launch.command, launch.args, {
    ...options,
    windowsVerbatimArguments: launch.windowsVerbatimArguments
  });
}
