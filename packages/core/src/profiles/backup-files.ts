import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const originalBackupSuffix = ".ccr-original";
export const originalMissingSuffix = ".ccr-original-missing";
const backupMarker = ".ccr-backup-";

export function backupFilePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${file}${backupMarker}${timestamp}`;
}

export function backupFiles(file: string): string[] {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}${backupMarker}`;
  try {
    return readdirSync(dir)
      .filter((entry) => entry.startsWith(prefix))
      .sort()
      .map((entry) => path.join(dir, entry));
  } catch {
    return [];
  }
}

export function pruneBackups(file: string, keep = 5): void {
  const backups = backupFiles(file);
  for (const backup of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(backup, { force: true });
  }
}

export function ensureOriginalSnapshot(file: string, previous: string | undefined, mode: number | undefined): void {
  const originalBackup = `${file}${originalBackupSuffix}`;
  const originalMissing = `${file}${originalMissingSuffix}`;
  if (existsSync(originalBackup) || existsSync(originalMissing)) {
    return;
  }
  if (previous === undefined) {
    writeFileSync(originalMissing, "", mode === undefined ? "utf8" : { encoding: "utf8", mode });
    chmodFileIfRequested(originalMissing, mode);
    return;
  }
  copyFileSync(file, originalBackup);
  chmodFileIfRequested(originalBackup, mode);
}

export function writeFileAtomic(file: string, content: string, options: { mode?: number } = {}): void {
  const target = resolveWriteTarget(file);
  const mode = options.mode ?? (existsSync(target) ? statSync(target).mode & 0o777 : undefined);
  const temporaryFile = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, content, mode === undefined ? "utf8" : { encoding: "utf8", mode });
    chmodFileIfRequested(temporaryFile, mode);
    renameSync(temporaryFile, target);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
}

export function chmodFileIfRequested(file: string, mode: number | undefined): void {
  if (mode === undefined || process.platform === "win32") {
    return;
  }
  try {
    chmodSync(file, mode);
  } catch {
    // Best effort; the write itself should still succeed on filesystems without chmod.
  }
}

// Renaming onto a symlink would replace it with a regular file; users link these configs from dotfiles repos.
function resolveWriteTarget(file: string): string {
  if (!lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return file;
  }
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(path.dirname(file), readlinkSync(file));
  }
}
