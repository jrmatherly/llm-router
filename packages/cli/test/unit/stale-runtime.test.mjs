import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { staleDesktopRuntimeWarning } from "@llmr/cli/stale-runtime.ts";

const warning = "llmr: LLM Router was updated; open it once to refresh this command.\n";

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stale-runtime-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function writePackage(file, version) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version }));
}

function macLayout(dir, version) {
  const contents = path.join(dir, "LLM Router.app", "Contents");
  if (version) writePackage(path.join(contents, "Resources", "app", "package.json"), version);
  return path.join(contents, "MacOS", "LLM Router");
}

function check(overrides) {
  return staleDesktopRuntimeWarning({
    cliVersion: "4.3.2",
    electronVersion: "39.0.0",
    platform: "darwin",
    readFile: (file) => readFileSync(file, "utf8"),
    ...overrides
  });
}

test("a desktop CLI copy older than the installed app warns once on stderr", () => {
  withTempDir((dir) => {
    assert.equal(check({ execPath: macLayout(dir, "9.9.9") }), warning);
  });
});

test("the warning reads app.asar/package.json before app/package.json", () => {
  withTempDir((dir) => {
    const execPath = macLayout(dir, "4.3.2");
    writePackage(path.join(dir, "LLM Router.app", "Contents", "Resources", "app.asar", "package.json"), "9.9.9");
    assert.equal(check({ execPath }), warning);
  });
});

test("matching versions do not warn", () => {
  withTempDir((dir) => {
    assert.equal(check({ execPath: macLayout(dir, "4.3.2") }), undefined);
  });
});

test("outside Electron the check is skipped", () => {
  withTempDir((dir) => {
    assert.equal(check({ electronVersion: undefined, execPath: macLayout(dir, "9.9.9") }), undefined);
  });
});

test("a missing app package.json or CLI version stays silent", () => {
  withTempDir((dir) => {
    assert.equal(check({ execPath: macLayout(dir) }), undefined);
    assert.equal(check({ cliVersion: undefined, execPath: macLayout(dir, "9.9.9") }), undefined);
  });
});

test("an unreadable or versionless app package.json stays silent", () => {
  withTempDir((dir) => {
    const execPath = macLayout(dir, "9.9.9");
    assert.equal(check({ execPath, readFile: () => { throw new Error("EACCES"); } }), undefined);
    assert.equal(check({ execPath, readFile: () => "not json" }), undefined);
    assert.equal(check({ execPath, readFile: () => "{}" }), undefined);
  });
});

test("Windows and Linux read resources beside the executable", () => {
  withTempDir((dir) => {
    writePackage(path.join(dir, "resources", "app", "package.json"), "9.9.9");
    const execPath = path.join(dir, "LLM Router.exe");
    assert.equal(check({ execPath, platform: "win32" }), warning);
    assert.equal(check({ execPath, platform: "linux" }), warning);
  });
});
