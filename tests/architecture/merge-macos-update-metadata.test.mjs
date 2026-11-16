import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import yaml from "js-yaml";

const file = (name, sha512) => ({ sha512, size: 1, url: `LLM-Router_7.2.1-mac-${name}` });
const armZip = file("Apple-Silicon-arm64.zip", "arm-zip");
const armDmg = file("Apple-Silicon-arm64.dmg", "arm-dmg");
const x64Zip = file("Intel-x64.zip", "x64-zip");
const x64Dmg = file("Intel-x64.dmg", "x64-dmg");

const metadata = (version, releaseDate, files) => ({ files, path: files[0].url, releaseDate, sha512: files[0].sha512, version });

function run(t, ...inputs) {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-mac-metadata-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const out = path.join(dir, "latest-mac.yml");
  const files = inputs.map((input, index) => {
    const name = path.join(dir, `input-${index}.yml`);
    writeFileSync(name, yaml.dump(input));
    return name;
  });
  const result = spawnSync(process.execPath, ["build/merge-macos-update-metadata.mjs", out, ...files], { encoding: "utf8" });
  return { ...result, merged: existsSync(out) ? yaml.load(readFileSync(out, "utf8")) : undefined };
}

test("merges arm64 and x64 metadata with the arm64 zip as the update path", (t) => {
  const { merged } = run(
    t,
    metadata("7.2.1", "2026-11-16T05:18:00.000Z", [x64Zip, x64Dmg]),
    metadata("7.2.1", "2026-11-16T05:15:00.000Z", [armZip, armDmg])
  );
  assert.deepEqual(merged.files.map((entry) => entry.url), [armZip.url, x64Zip.url, armDmg.url, x64Dmg.url]);
  assert.equal(merged.path, armZip.url);
  assert.equal(merged.sha512, "arm-zip");
  assert.equal(merged.version, "7.2.1");
  assert.equal(merged.releaseDate, "2026-11-16T05:18:00.000Z");
});

test("drops duplicate file urls", (t) => {
  const { merged } = run(t, metadata("7.2.1", "d", [armZip, armDmg]), metadata("7.2.1", "d", [armZip, x64Zip]));
  assert.equal(merged.files.filter((entry) => entry.url === armZip.url).length, 1);
});

test("falls back to the x64 zip when there is no arm64 zip", (t) => {
  const { merged } = run(t, metadata("7.2.1", "d", [x64Zip, x64Dmg]), metadata("7.2.1", "d", [x64Zip, armDmg]));
  assert.equal(merged.path, x64Zip.url);
  assert.equal(merged.sha512, "x64-zip");
});

test("refuses metadata files with different versions", (t) => {
  const result = run(t, metadata("7.2.1", "d", [armZip]), metadata("7.2.0", "d", [x64Zip]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /same version/);
  assert.equal(result.merged, undefined);
});

test("refuses metadata without a zip sha512", (t) => {
  const result = run(t, metadata("7.2.1", "d", [armDmg]), metadata("7.2.1", "d", [x64Dmg]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /at least one ZIP/);
});

test("refuses fewer than two inputs", (t) => {
  const result = run(t, metadata("7.2.1", "d", [armZip]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
});
