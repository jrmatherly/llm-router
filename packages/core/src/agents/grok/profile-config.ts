import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIGDIR } from "@llmr/core/config/constants";
import type { AppConfig, ProfileClientApplyStatus, ProfileConfig } from "@llmr/core/contracts/app";
import { windowsBatchEscapeValue as cmdValue, windowsBatchSetLine as cmdSetLine } from "@llmr/core/platform/windows-batch";
import { cmdQuote, defaultClientModel, disabledStatus, formatError, gatewayEndpoint, gatewayNoProxyHosts, linkProfileHomeEntry, normalizeClientModel, privateDirMode, privateExecutableMode, privateFileMode, profileEnv, sanitizeProfilePathSegment, shellQuote, writeGeneratedFileIfChanged } from "@llmr/core/profiles/apply-support";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";

export function applyGrokProfile(config: AppConfig, profile: ProfileConfig, token: string, appliedAt: string): ProfileClientApplyStatus {
  const wrapperFile = grokWrapperPath(profile);
  if (!profile.enabled) {
    return disabledStatus("grok", wrapperFile, "Grok CLI profile is disabled.");
  }

  try {
    const model = normalizeClientModel(profile.model) || defaultClientModel(config);
    const wrapperResult = writeGrokWrapper(config, profile, token, model);
    return {
      appliedAt,
      client: "grok",
      enabled: true,
      message: wrapperResult.changed
        ? `Grok CLI is configured to use LLMR (wrapper ${wrapperResult.file}).`
        : "Grok CLI already points to LLMR.",
      ok: true,
      path: wrapperResult.file
    };
  } catch (error) {
    return {
      client: "grok",
      enabled: true,
      message: formatError(error),
      ok: false,
      path: wrapperFile
    };
  }
}

function writeGrokWrapper(config: AppConfig, profile: ProfileConfig, token: string, model: string): { changed: boolean; file: string } {
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { mode: privateDirMode, recursive: true });
  const profileHome = ensureGrokProfileHome(profile);
  const file = grokWrapperPath(profile);
  const content = process.platform === "win32"
    ? grokWrapperCmdScript(config, profile, token, model, profileHome)
    : grokWrapperShellScript(config, profile, token, model, profileHome);
  const writeResult = writeGeneratedFileIfChanged(file, content, { mode: privateExecutableMode });
  return {
    changed: writeResult.changed,
    file
  };
}

export function grokWrapperPath(profile: ProfileConfig): string {
  return path.join(CONFIGDIR, "bin", grokWrapperFilename(profile));
}

function grokWrapperFilename(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "grok";
  return process.platform === "win32"
    ? `llmr-grok-cli-wrapper-${slug}.cmd`
    : `llmr-grok-cli-wrapper-${slug}`;
}

function grokWrapperShellScript(config: AppConfig, profile: ProfileConfig, token: string, model: string, profileHome: string): string {
  const realGrok = profile.env?.LLMR_GROK_BIN?.trim() || "grok";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "LLMR_GROK_BIN" && !isGrokManagedEnvKey(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  const gatewayBaseUrl = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "#!/bin/sh",
    ...envExports,
    `if [ -n "\${NO_PROXY:-}" ]; then NO_PROXY="$NO_PROXY,${noProxyHosts}"; else NO_PROXY=${shellQuote(noProxyHosts)}; fi`,
    `if [ -n "\${no_proxy:-}" ]; then no_proxy="$no_proxy,${noProxyHosts}"; else no_proxy=${shellQuote(noProxyHosts)}; fi`,
    "export NO_PROXY no_proxy",
    `export GROK_MODELS_BASE_URL=${shellQuote(gatewayBaseUrl)}`,
    `export GROK_MODELS_LIST_URL=${shellQuote(`${gatewayBaseUrl}/models`)}`,
    `export XAI_API_KEY=${shellQuote(token)}`,
    `export GROK_DEFAULT_MODEL=${shellQuote(model)}`,
    `export GROK_HOME=${shellQuote(profileHome)}`,
    `export LLMR_PROFILE_SURFACE=cli`,
    `exec ${shellQuote(realGrok)} "$@"`,
    ""
  ].join("\n");
}

function grokWrapperCmdScript(config: AppConfig, profile: ProfileConfig, token: string, model: string, profileHome: string): string {
  const realGrok = profile.env?.LLMR_GROK_BIN?.trim() || "grok";
  const envExports = Object.entries(profileEnv(profile))
    .filter(([key]) => key !== "LLMR_GROK_BIN" && !isGrokManagedEnvKey(key))
    .map(([key, value]) => cmdSetLine(key, value));
  const gatewayBaseUrl = `${gatewayEndpoint(config).replace(/\/+$/g, "")}/v1`;
  const noProxyHosts = gatewayNoProxyHosts(config);
  return [
    "@echo off",
    ...envExports,
    `set "NO_PROXY=%NO_PROXY%,${cmdValue(noProxyHosts)}"`,
    `set "no_proxy=%no_proxy%,${cmdValue(noProxyHosts)}"`,
    cmdSetLine("GROK_MODELS_BASE_URL", gatewayBaseUrl),
    cmdSetLine("GROK_MODELS_LIST_URL", `${gatewayBaseUrl}/models`),
    cmdSetLine("XAI_API_KEY", token),
    cmdSetLine("GROK_DEFAULT_MODEL", model),
    cmdSetLine("GROK_HOME", profileHome),
    cmdSetLine("LLMR_PROFILE_SURFACE", "cli"),
    `${cmdQuote(realGrok)} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function isGrokManagedEnvKey(key: string): boolean {
  return key === "GROK_MODELS_BASE_URL" ||
    key === "GROK_MODELS_LIST_URL" ||
    key === "GROK_DEFAULT_MODEL" ||
    key === "GROK_HOME" ||
    key === "GROK_STORAGE_DIR" ||
    key === "GROK_CONFIG_DIR" ||
    key === "XAI_API_KEY" ||
    key === "LLMR_PROFILE_SURFACE";
}

function ensureGrokProfileHome(profile: ProfileConfig): string {
  const slug = sanitizeProfilePathSegment(profile.id || profile.name || profile.agent).toLowerCase() || "grok";
  const profileHome = path.join(CONFIGDIR, "profiles", slug, "grok");
  const sourceHome = resolveGrokSourceHome(profile);
  mkdirSync(profileHome, { mode: privateDirMode, recursive: true });

  if (path.resolve(sourceHome) === path.resolve(profileHome)) {
    return profileHome;
  }

  ensureGrokProfileConfigCopy(
    path.join(sourceHome, "config.toml"),
    path.join(profileHome, "config.toml")
  );
  for (const entry of [
    "agents",
    "commands",
    "downloads",
    "hooks",
    "marketplace-cache",
    "plugins",
    "sessions",
    "skills",
    "upload_queue",
    "worktrees.db"
  ]) {
    linkProfileHomeEntry(path.join(sourceHome, entry), path.join(profileHome, entry));
  }
  return profileHome;
}

export function resolveGrokSourceHome(profile: Pick<ProfileConfig, "env">): string {
  const explicitRoot = profile.env?.GROK_HOME?.trim() ||
    profile.env?.GROK_STORAGE_DIR?.trim() ||
    profile.env?.GROK_CONFIG_DIR?.trim() ||
    process.env.GROK_HOME?.trim() ||
    process.env.GROK_STORAGE_DIR?.trim() ||
    process.env.GROK_CONFIG_DIR?.trim();
  if (explicitRoot) {
    return resolveUserPath(explicitRoot);
  }
  return resolveUserPath("~/.grok");
}

function ensureGrokProfileConfigCopy(source: string, target: string): void {
  let targetStat: ReturnType<typeof lstatSync> | undefined;
  try {
    targetStat = lstatSync(target);
  } catch {
    targetStat = undefined;
  }

  if (targetStat?.isSymbolicLink()) {
    let content: Buffer | undefined;
    try {
      content = readFileSync(target);
    } catch {
      if (existsSync(source)) {
        content = readFileSync(source);
      }
    }
    rmSync(target, { force: true });
    if (content) {
      writeFileSync(target, content, { mode: privateFileMode });
      chmodSync(target, privateFileMode);
    }
    return;
  }

  if (targetStat || !existsSync(source)) {
    return;
  }
  copyFileSync(source, target);
  chmodSync(target, privateFileMode);
}
