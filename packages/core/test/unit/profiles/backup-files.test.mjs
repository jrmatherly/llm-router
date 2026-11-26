import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  backupContent,
  backupCurrentFile,
  backupFilePath,
  backupFiles,
  ensureOriginalSnapshot,
  pruneBackups,
  saveRemovedConfigCopy,
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

test("ensureOriginalSnapshot keeps the bytes of a file that is not valid UTF-8, and leaves no temp file", (t) => {
  const { dir, file } = setup(t);
  const bytes = Buffer.from([0xff, 0xfe, 0x41, 0x0a]);
  writeFileSync(file, bytes);
  ensureOriginalSnapshot(file, bytes.toString("utf8"), undefined);
  assert.deepEqual(readFileSync(`${file}.llmr-original`), bytes);
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("ensureOriginalSnapshot records a missing file", (t) => {
  const { dir } = setup(t);
  const file = path.join(dir, "absent.json");
  ensureOriginalSnapshot(file, undefined, undefined);
  assert.ok(existsSync(`${file}.llmr-original-missing`));
  assert.ok(!existsSync(`${file}.llmr-original`));
});

test("ensureOriginalSnapshot writes the given text in place of a copy of the file", posixOnly, (t) => {
  const { file } = setup(t);
  writeFileSync(file, "raw\n");
  ensureOriginalSnapshot(file, "raw\n", 0o600, "stripped\n");
  assert.equal(readFileSync(`${file}.llmr-original`, "utf8"), "stripped\n");
  ensureOriginalSnapshot(file, "raw\n", 0o600, "later\n");
  assert.equal(readFileSync(`${file}.llmr-original`, "utf8"), "stripped\n");
  assert.equal(statSync(`${file}.llmr-original`).mode & 0o777, 0o600);
});

test("saveRemovedConfigCopy keeps the newest three copies, private, with no profile token", posixOnly, (t) => {
  const { dir, file } = setup(t);
  const stateDir = path.join(dir, "state", "key");
  mkdirSync(stateDir, { mode: 0o755, recursive: true });
  chmodSync(stateDir, 0o755);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  for (let call = 1; call <= 4; call += 1) {
    saveRemovedConfigCopy(stateDir, file, `call ${call}\ntoken = "llmr-profile-Ab_c-1"\nagain = "llmr-profile-Xy_z-2"\nmine = "sk-user"\n`);
    t.mock.timers.tick(1000);
  }
  const copies = backupFiles(path.join(stateDir, "settings.json"));
  assert.deepEqual(readdirSync(stateDir).sort(), copies.map((copy) => path.basename(copy)));
  assert.deepEqual(copies.map((copy) => readFileSync(copy, "utf8").split("\n")[0]), ["call 2", "call 3", "call 4"]);
  assert.equal(statSync(stateDir).mode & 0o777, 0o700);
  for (const copy of copies) {
    const content = readFileSync(copy, "utf8");
    assert.equal(statSync(copy).mode & 0o777, 0o600);
    assert.equal(content.split("\n").slice(1).join("\n"), 'token = "<removed LLMR profile token>"\nagain = "<removed LLMR profile token>"\nmine = "sk-user"\n');
  }
  assert.deepEqual(backupFiles(file), []);
});

test("two copies of one file in the same millisecond are both kept", posixOnly, (t) => {
  const { dir, file } = setup(t);
  const stateDir = path.join(dir, "state", "key");
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  const first = saveRemovedConfigCopy(stateDir, file, "one\n");
  const second = saveRemovedConfigCopy(stateDir, file, "two\n");
  assert.notEqual(first, second);
  assert.equal(readFileSync(first, "utf8"), "one\n");
  assert.equal(readFileSync(second, "utf8"), "two\n");
  assert.deepEqual(backupFiles(path.join(stateDir, path.basename(file))), [first, second]);
});

test("backupContent writes the given text, not the file, as a private backup and prunes like any other", posixOnly, (t) => {
  const { file } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  for (let call = 1; call <= 7; call += 1) {
    const backup = backupContent(file, `kept ${call}`, { isManagedContent: (content) => content !== "kept 1", mode: 0o600 });
    assert.equal(readFileSync(backup, "utf8"), `kept ${call}`);
    assert.equal(statSync(backup).mode & 0o777, 0o600);
    t.mock.timers.tick(1000);
  }
  assert.deepEqual(backupFiles(file).map((backup) => readFileSync(backup, "utf8")), ["kept 1", "kept 3", "kept 4", "kept 5", "kept 6", "kept 7"]);
  assert.equal(readFileSync(file, "utf8"), "old");
});

test("backupCurrentFile writes the text contentForBackup returns, and a plain copy when the text is unchanged", posixOnly, (t) => {
  const { file } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  const stripped = backupCurrentFile(file, { contentForBackup: () => "kept", mode: 0o600 });
  assert.equal(readFileSync(stripped, "utf8"), "kept");
  assert.equal(statSync(stripped).mode & 0o777, 0o600);
  t.mock.timers.tick(1000);
  assert.equal(readFileSync(backupCurrentFile(file, { contentForBackup: (content) => content }), "utf8"), "old");
  assert.equal(readFileSync(file, "utf8"), "old");
});

test("backupCurrentFile prunes a rewritten backup but keeps the oldest unmanaged one", (t) => {
  const { file } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  const options = { contentForBackup: (content) => (content === "user" ? content : "stripped"), isManagedContent: (content) => content === "stripped" };
  writeFileSync(file, "user", "utf8");
  backupCurrentFile(file, options);
  writeFileSync(file, "managed", "utf8");
  for (let call = 1; call <= 7; call += 1) {
    t.mock.timers.tick(1000);
    backupCurrentFile(file, options);
  }
  assert.deepEqual(backupFiles(file).map((backup) => readFileSync(backup, "utf8")), ["user", "stripped", "stripped", "stripped", "stripped", "stripped"]);
});
