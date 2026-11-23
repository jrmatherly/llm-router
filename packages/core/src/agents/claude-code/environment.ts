import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeCodeUsesSharedHome, type ProfileConfig } from "@llmr/core/contracts/app";
import { resolveUserPath } from "@llmr/core/runtime/app-paths";

export const CLAUDE_CODE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
export const CLAUDE_CODE_MCP_CONFIG_ENV = "LLMR_CLAUDE_CODE_MCP_CONFIG";
export const CLAUDE_CODE_SETTINGS_FILE_ENV = "LLMR_CLAUDE_CODE_SETTINGS_FILE";
export const CLAUDE_CODE_MODEL_ENV = "ANTHROPIC_MODEL";
export const LLMR_CLAUDE_CODE_MODEL_ENV = "LLMR_CLAUDE_CODE_MODEL";
export const CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV = "ANTHROPIC_DEFAULT_FABLE_MODEL";
export const CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV = "ANTHROPIC_DEFAULT_OPUS_MODEL";
export const CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV = "ANTHROPIC_DEFAULT_SONNET_MODEL";
export const CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV = "ANTHROPIC_DEFAULT_HAIKU_MODEL";
export const CLAUDE_CODE_LEGACY_SMALL_FAST_MODEL_ENV = "ANTHROPIC_SMALL_FAST_MODEL";
export const CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS = [
  CLAUDE_CODE_MODEL_ENV,
  LLMR_CLAUDE_CODE_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV,
  CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV,
  CLAUDE_CODE_LEGACY_SMALL_FAST_MODEL_ENV
] as const;
// Names an earlier build wrote into Claude settings env. Nothing reads or writes them; apply and release strip them.
export const STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS = ["CODEXL_CLAUDE_CODE_MCP_CONFIG", "CODEXL_CLAUDE_CODE_MODEL"] as const;
export const STALE_BOT_GATEWAY_ENV_PREFIX = "CODEXL_BOT_";

export type ClaudeCodeModelSelection = {
  fableModel?: string;
  haikuModel?: string;
  model?: string;
  opusModel?: string;
  smallFastModel?: string;
  sonnetModel?: string;
};

export function claudeCodeMcpConfigEnv(configFile: string | undefined): Record<string, string> {
  return configFile
    ? {
        [CLAUDE_CODE_MCP_CONFIG_ENV]: configFile
      }
    : {};
}

// Claude Code reads ~/.claude.json and the unsuffixed Keychain item only while CLAUDE_CONFIG_DIR is unset, even when it names ~/.claude.
// Unset it only when the dir is the default of both LLMR's runtime home and the child's HOME, so an isolated run stays pinned.
export function claudeCodeConfigDir(settingsFile: string): string | undefined {
  const dir = path.dirname(settingsFile);
  return dir === resolveUserPath("~/.claude") && dir === path.join(os.homedir(), ".claude") ? undefined : dir;
}

// Unlike claudeCodeConfigDir this resolves symlinks and letter case: a miss there only keeps a run pinned, a miss here writes the user's account file.
export function isClaudeCodeAccountFile(file: string): boolean {
  if (path.basename(file) !== ".claude.json") {
    return false;
  }
  const dir = resolvedDir(path.dirname(file));
  return dir === resolvedDir(resolveUserPath("~")) || dir === resolvedDir(os.homedir());
}

function resolvedDir(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    return path.resolve(dir);
  }
}

export function claudeCodeHomeEnv(profile: Pick<ProfileConfig, "agent" | "claudeCodeSharedHome" | "scope">, settingsFile: string): Record<string, string> {
  if (claudeCodeUsesSharedHome(profile)) {
    return { [CLAUDE_CODE_SETTINGS_FILE_ENV]: settingsFile };
  }
  const configDir = claudeCodeConfigDir(settingsFile);
  return configDir ? { [CLAUDE_CODE_CONFIG_DIR_ENV]: configDir } : {};
}

export function claudeCodeHomeUnsetEnvKeys(profile: Pick<ProfileConfig, "agent" | "claudeCodeSharedHome" | "scope">, settingsFile: string): string[] {
  return claudeCodeUsesSharedHome(profile) || claudeCodeConfigDir(settingsFile) ? [] : [CLAUDE_CODE_CONFIG_DIR_ENV];
}

export function claudeCodeModelEnv(selection: ClaudeCodeModelSelection): Record<string, string> {
  const env: Record<string, string> = {};
  const model = normalizeClaudeCodeClientModel(selection.model);
  if (model) {
    env[CLAUDE_CODE_MODEL_ENV] = model;
    env[LLMR_CLAUDE_CODE_MODEL_ENV] = model;
  }

  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_FABLE_MODEL_ENV, selection.fableModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_OPUS_MODEL_ENV, selection.opusModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_SONNET_MODEL_ENV, selection.sonnetModel);
  assignModelAliasEnv(env, CLAUDE_CODE_DEFAULT_HAIKU_MODEL_ENV, selection.haikuModel || selection.smallFastModel);
  return env;
}

export function clearClaudeCodeManagedModelEnv(env: Record<string, unknown>): void {
  for (const key of CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS) {
    delete env[key];
  }
}

export function isStaleClaudeCodeSettingsEnvKey(key: string): boolean {
  return (STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS as readonly string[]).includes(key);
}

export function isClaudeCodeManagedModelEnvKey(key: string): boolean {
  return (CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS as readonly string[]).includes(key);
}

export function normalizeClaudeCodeClientModel(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : "";
  }
  return trimmed;
}

function assignModelAliasEnv(env: Record<string, string>, key: string, value: string | undefined): void {
  const model = normalizeClaudeCodeClientModel(value);
  if (model) {
    env[key] = model;
  }
}
