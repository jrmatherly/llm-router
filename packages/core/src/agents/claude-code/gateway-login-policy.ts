import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isRecord } from "@ccr/core/agents/local-providers/shared";

export type ClaudeCodeGatewayLoginPolicy = { file: string; key: "allowedProviders" | "forceLoginMethod" };

export function claudeCodeManagedSettingsDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "darwin") {
    return "/Library/Application Support/ClaudeCode";
  }
  if (platform === "win32") {
    return "C:\\Program Files\\ClaudeCode";
  }
  return "/etc/claude-code";
}

export function claudeCodeManagedSettingsFiles(dir: string = claudeCodeManagedSettingsDir()): string[] {
  const dropInDir = path.join(dir, "managed-settings.d");
  const dropIns = readDirSafe(dropInDir).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(dropInDir, name));
  return [path.join(dir, "managed-settings.json"), ...dropIns].filter((file) => existsSync(file));
}

// shortcut: plist and HKLM managed sources are not read; they need platform APIs. Upgrade when a user reports a pinned machine the file check misses.
export function readClaudeCodeGatewayLoginPolicy(files: string[]): ClaudeCodeGatewayLoginPolicy | undefined {
  for (const file of files) {
    const settings = readJsonObject(file);
    if (!settings) {
      continue;
    }
    if (settings.forceLoginMethod === "gateway") {
      return { file, key: "forceLoginMethod" };
    }
    if (Array.isArray(settings.allowedProviders) && settings.allowedProviders.includes("gateway")) {
      return { file, key: "allowedProviders" };
    }
  }
  return undefined;
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
