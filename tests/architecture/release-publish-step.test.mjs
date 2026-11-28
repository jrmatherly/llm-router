import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as yaml from "js-yaml";

const jobs = yaml.load(readFileSync(".github/workflows/release.yml", "utf8")).jobs;
const script = jobs.publish.steps.at(-1).run;
const mac = (name) => `LLM-Router_7.2.1-mac-${name}`;
const armZip = mac("Apple-Silicon-arm64.zip");
const x64Zip = mac("Intel-x64.zip");
const extra = mac("extra.zip");
const fixed = [
  "latest.yml", "latest-linux.yml", "latest-mac.yml", "LLM-Router_7.2.1.exe", "LLM-Router_7.2.1.AppImage",
  armZip, x64Zip, mac("Apple-Silicon-arm64.dmg"), mac("Intel-x64.dmg")
];
const update = (...names) => yaml.dump({ files: names.map((url) => ({ url })), path: names[0], version: "7.2.1" });

function publish(t, assets, macMetadata = update(armZip, x64Zip, extra)) {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-publish-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const bin = path.join(dir, "bin");
  const work = path.join(dir, "work");
  mkdirSync(bin);
  mkdirSync(work);
  writeFileSync(path.join(dir, "assets.txt"), `${assets.join("\n")}\n`);
  writeFileSync(path.join(dir, "latest-mac.yml"), macMetadata);
  writeFileSync(path.join(dir, "latest.yml"), update("LLM-Router_7.2.1.exe"));
  writeFileSync(path.join(dir, "calls"), "");
  writeFileSync(path.join(bin, "gh"), `#!/bin/sh
echo "$*" >> "${dir}/calls"
case "$*" in
  "release view "*) cat "${dir}/assets.txt" ;;
  "release download "*) mkdir -p metadata && cp "${dir}"/latest*.yml metadata/ ;;
esac
`);
  chmodSync(path.join(bin, "gh"), 0o755);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: "v7.2.1", PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  return { ...result, published: /^release edit v7\.2\.1 --draft=false --latest$/m.test(readFileSync(path.join(dir, "calls"), "utf8")) };
}

test("the publish step publishes when every asset and every update-metadata file is present", (t) => {
  const result = publish(t, [...fixed, extra]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.published, true);
});

test("the publish step keeps the draft when a fixed asset is missing", (t) => {
  const result = publish(t, [...fixed.filter((name) => !name.endsWith(".AppImage")), extra]);
  assert.notEqual(result.status, 0);
  assert.equal(result.published, false);
  assert.match(result.stdout, /Missing release asset: LLM-Router_7\.2\.1\.AppImage/);
});

test("the publish step keeps the draft when a file named only in update metadata is missing", (t) => {
  const result = publish(t, fixed);
  assert.notEqual(result.status, 0);
  assert.equal(result.published, false);
  assert.match(result.stdout, /Missing release asset: LLM-Router_7\.2\.1-mac-extra\.zip/);
});

test("the publish step keeps the draft when the macOS update metadata lists one architecture", (t) => {
  const result = publish(t, fixed, update(armZip));
  assert.notEqual(result.status, 0);
  assert.equal(result.published, false);
  assert.match(result.stdout, /latest-mac\.yml does not list LLM-Router_7\.2\.1-mac-Intel-x64\.zip/);
});

function createDraft(t, listings, { exists = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-draft-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  listings.forEach((tags, index) => writeFileSync(path.join(dir, `list-${index + 1}`), tags.map((tag) => `${tag}\n`).join("")));
  writeFileSync(path.join(dir, "calls"), "");
  writeFileSync(path.join(bin, "gh"), `#!/bin/sh
echo "$*" >> "${dir}/calls"
case "$*" in
  "release view "*isDraft*) echo true ;;
  "release view "*) exit ${exists ? 0 : 1} ;;
  "api "*) n=$(grep -c '^api ' "${dir}/calls"); cat "${dir}/list-$n" 2>/dev/null || cat "${dir}/list-${listings.length}" ;;
esac
`);
  writeFileSync(path.join(bin, "sleep"), `#!/bin/sh\necho "sleep $*" >> "${dir}/calls"\n`);
  for (const name of ["gh", "sleep"]) chmodSync(path.join(bin, name), 0o755);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", jobs["create-draft"].steps.at(-1).run], {
    encoding: "utf8",
    env: { ...process.env, GH_REPO: "o/r", GITHUB_REF_NAME: "v7.2.2", PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  const calls = readFileSync(path.join(dir, "calls"), "utf8");
  const count = (pattern) => calls.match(pattern)?.length ?? 0;
  return { ...result, calls, lists: count(/^api repos\/o\/r\/releases --paginate /gm), sleeps: count(/^sleep 5$/gm) };
}

test("create-draft creates the draft, then waits for the release list to show it", (t) => {
  const result = createDraft(t, [["v7.2.1"], ["v7.2.1"], ["v7.2.2", "v7.2.20", "v7.2.1"]]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.calls, /^release create v7\.2\.2 --draft --verify-tag /m);
  assert.ok(result.calls.indexOf("release create ") < result.calls.indexOf("api "), "the list is read after the create");
  assert.deepEqual([result.lists, result.sleeps], [3, 2]);
});

test("create-draft reuses a draft that an earlier attempt created", (t) => {
  const result = createDraft(t, [["v7.2.2", "v7.2.1"]], { exists: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.calls, /^release create /m);
  assert.deepEqual([result.lists, result.sleeps], [1, 0]);
});

test("create-draft fails when the draft never shows, or the tag has two releases", (t) => {
  const absent = createDraft(t, [["v7.2.1"]]);
  assert.notEqual(absent.status, 0);
  assert.match(absent.stdout, /Expected one release for v7\.2\.2, found 0/);
  assert.deepEqual([absent.lists, absent.sleeps], [6, 5]);
  const doubled = createDraft(t, [["v7.2.2", "v7.2.2", "v7.2.1"]]);
  assert.notEqual(doubled.status, 0);
  assert.match(doubled.stdout, /Expected one release for v7\.2\.2, found 2/);
  assert.deepEqual([doubled.lists, doubled.sleeps], [1, 0]);
});
