import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const originalBackupSuffix = ".ccr-original";
export const originalMissingSuffix = ".ccr-original-missing";
export const backupMarker = ".ccr-backup-";

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

// The newest unmanaged backup is the one restore prefers, so it survives pruning however old it is.
export function pruneBackups(file: string, keep = 5, isManagedContent?: (content: string) => boolean): void {
  const backups = backupFiles(file);
  if (backups.length <= keep) {
    return;
  }
  const restorable = isManagedContent
    ? [...backups].reverse().find((backup) => {
        const content = readFileIfPresent(backup);
        return content !== undefined && !isManagedContent(content);
      })
    : undefined;
  for (const backup of backups.slice(0, backups.length - keep)) {
    if (backup !== restorable) {
      rmSync(backup, { force: true });
    }
  }
}

export function ensureOriginalSnapshot(file: string, previous: string | undefined, mode?: number): void {
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

type BackupOptions = { isManagedContent?: (content: string) => boolean; mode?: number };

export function backupCurrentFile(file: string, options: BackupOptions = {}): string {
  const backupFile = backupFilePath(file);
  copyFileSync(file, backupFile);
  chmodFileIfRequested(backupFile, options.mode);
  pruneBackups(file, undefined, options.isManagedContent);
  return backupFile;
}

export function backupBeforeWrite(file: string, previous: string | undefined, options: BackupOptions = {}): string | undefined {
  ensureOriginalSnapshot(file, previous, options.mode);
  return previous === undefined ? undefined : backupCurrentFile(file, options);
}

export function writeFileAtomic(file: string, content: string, options: { mode?: number } = {}): void {
  const target = resolveWriteTarget(file);
  removeStaleTemporaryFiles(target);
  const mode = options.mode ?? (existsSync(target) ? statSync(target).mode & 0o777 : undefined);
  const temporaryFile = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, content, mode === undefined ? "utf8" : { encoding: "utf8", mode });
    chmodFileIfRequested(temporaryFile, mode);
    try {
      renameSync(temporaryFile, target);
    } catch (error) {
      if (!isWindowsLockedTargetError(error)) {
        throw error;
      }
      // Windows refuses to rename over a file another process holds open; writing in place still lands the content.
      writeFileSync(target, content, "utf8");
      rmSync(temporaryFile, { force: true });
    }
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
}

function isWindowsLockedTargetError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return process.platform === "win32" && (code === "EPERM" || code === "EBUSY" || code === "EACCES");
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

function readFileIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

// A crash between the temp write and the rename leaves the temp file behind; sweep those whose writer is gone.
function removeStaleTemporaryFiles(target: string): void {
  const dir = path.dirname(target);
  const prefix = `${path.basename(target)}.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const match = entry.startsWith(prefix) ? /^(\d+)\.[0-9a-f-]{36}\.tmp$/.exec(entry.slice(prefix.length)) : null;
    if (match && !isProcessAlive(Number(match[1]))) {
      rmSync(path.join(dir, entry), { force: true });
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
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
