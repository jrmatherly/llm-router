import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  backupFilePath,
  backupFiles,
  ensureOriginalSnapshot,
  pruneBackups,
  writeFileAtomic
} from "@llmr/core/profiles/backup-files.ts";

function setup(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-backup-files-"));
  t.after(() => {
    chmodSync(dir, 0o700);
    rmSync(dir, { force: true, recursive: true });
  });
  const file = path.join(dir, "settings.json");
  writeFileSync(file, "old", "utf8");
  return { dir, file };
}

const posixOnly = { skip: process.platform === "win32" };

test("writeFileAtomic replaces the file and leaves no temp file", posixOnly, (t) => {
  const { dir, file } = setup(t);
  writeFileAtomic(file, "new", { mode: 0o600 });
  assert.equal(readFileSync(file, "utf8"), "new");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("writeFileAtomic keeps the old content when the write fails", posixOnly, (t) => {
  const { dir, file } = setup(t);
  chmodSync(dir, 0o500);
  assert.throws(() => writeFileAtomic(file, "new"));
  chmodSync(dir, 0o700);
  assert.equal(readFileSync(file, "utf8"), "old");
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("writeFileAtomic keeps the existing permission bits when no mode is given", posixOnly, (t) => {
  const { file } = setup(t);
  chmodSync(file, 0o600);
  writeFileAtomic(file, "new");
  assert.equal(readFileSync(file, "utf8"), "new");
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("writeFileAtomic writes through a symlink and keeps the link", posixOnly, (t) => {
  const { dir } = setup(t);
  const targetDir = path.join(dir, "dotfiles");
  mkdirSync(targetDir);
  const target = path.join(targetDir, "settings.json");
  writeFileSync(target, "old", "utf8");
  const link = path.join(dir, "linked.json");
  symlinkSync(target, link);
  writeFileAtomic(link, "new");
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readFileSync(target, "utf8"), "new");
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("writeFileAtomic removes temp files left by a dead writer and keeps a live writer's", posixOnly, (t) => {
  const { dir, file } = setup(t);
  const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
  const stale = `${file}.${deadPid}.00000000-0000-4000-8000-000000000000.tmp`;
  const live = `${file}.${process.pid}.00000000-0000-4000-8000-000000000001.tmp`;
  writeFileSync(stale, "partial", "utf8");
  writeFileSync(live, "in flight", "utf8");
  writeFileAtomic(file, "new");
  assert.ok(!existsSync(stale));
  assert.ok(existsSync(live));
  assert.equal(readFileSync(file, "utf8"), "new");
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), [path.basename(live)]);
});

test("pruneBackups keeps the newest unmanaged backup beyond the newest five", (t) => {
  const { file } = setup(t);
  const backups = [];
  for (let index = 0; index < 7; index += 1) {
    const backup = `${file}.llmr-backup-2026-10-2${index}T00-00-00-000Z`;
    writeFileSync(backup, index === 0 ? "user" : "managed", "utf8");
    backups.push(backup);
  }
  pruneBackups(file, 5, (content) => content === "managed");
  assert.deepEqual(backupFiles(file), [backups[0], ...backups.slice(2)]);
});

test("pruneBackups drops old backups when a newer one is already unmanaged", (t) => {
  const { file } = setup(t);
  const backups = [];
  for (let index = 0; index < 7; index += 1) {
    const backup = `${file}.llmr-backup-2026-10-2${index}T00-00-00-000Z`;
    writeFileSync(backup, index === 0 || index === 6 ? "user" : "managed", "utf8");
    backups.push(backup);
  }
  pruneBackups(file, 5, (content) => content === "managed");
  assert.deepEqual(backupFiles(file), backups.slice(2));
});

test("pruneBackups keeps the five newest backups and never the originals", (t) => {
  const { file } = setup(t);
  const backups = [];
  for (let index = 0; index < 7; index += 1) {
    const backup = `${file}.llmr-backup-2026-10-2${index}T00-00-00-000Z`;
    writeFileSync(backup, String(index), "utf8");
    backups.push(backup);
  }
  writeFileSync(`${file}.llmr-original`, "original", "utf8");
  writeFileSync(`${file}.llmr-original-missing`, "", "utf8");
  pruneBackups(file);
  assert.deepEqual(backupFiles(file), backups.slice(2));
  assert.ok(existsSync(`${file}.llmr-original`));
  assert.ok(existsSync(`${file}.llmr-original-missing`));
  assert.ok(existsSync(file));
});

test("backupFilePath names a timestamped backup beside the file", (t) => {
  const { file } = setup(t);
  assert.match(backupFilePath(file), new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.llmr-backup-\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z$`));
});

test("ensureOriginalSnapshot writes once and never refreshes", (t) => {
  const { file } = setup(t);
  writeFileSync(file, "first", "utf8");
  ensureOriginalSnapshot(file, "first", undefined);
  writeFileSync(file, "second", "utf8");
  ensureOriginalSnapshot(file, "second", undefined);
  assert.equal(readFileSync(`${file}.llmr-original`, "utf8"), "first");
});

test("ensureOriginalSnapshot records a missing file", (t) => {
  const { dir } = setup(t);
  const file = path.join(dir, "absent.json");
  ensureOriginalSnapshot(file, undefined, undefined);
  assert.ok(existsSync(`${file}.llmr-original-missing`));
  assert.ok(!existsSync(`${file}.llmr-original`));
});
