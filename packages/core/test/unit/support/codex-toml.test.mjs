import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { assertCodexFilesParse } from "../../support/codex-toml.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "llmr-codex-toml-"));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

test("a directory of Codex files that parse passes and names what it read", () => {
  writeFileSync(path.join(dir, "config.toml"), "model = \"m\"\n\n[model_providers.a]\nname = \"A\"\n");
  writeFileSync(path.join(dir, "llm-router.config.toml"), "args = [\n  \"a\",\n  \"b\"\n]\n");
  writeFileSync(path.join(dir, "config.toml.llmr-original"), "model = \"a\"\nmodel = \"b\"\n");
  assert.deepEqual(assertCodexFilesParse(dir), ["config.toml", "llm-router.config.toml"]);
});

test("a key written twice fails and names the file", () => {
  writeFileSync(path.join(dir, "config.toml"), "model = \"a\"\nmodel = \"b\"\n");
  assert.throws(() => assertCodexFilesParse(dir), /config\.toml/);
});

test("a file that ends inside an array fails", () => {
  writeFileSync(path.join(dir, "config.toml"), "args = [\n  \"a\",\n");
  assert.throws(() => assertCodexFilesParse(dir), /config\.toml/);
});

test("a directory with no .toml file fails, unless the caller allows none", () => {
  assert.throws(() => assertCodexFilesParse(dir), /no \.toml file/);
  assert.throws(() => assertCodexFilesParse(path.join(dir, "missing")), /no \.toml file/);
  assert.deepEqual(assertCodexFilesParse(dir, { allowNone: true }), []);
  assert.deepEqual(assertCodexFilesParse(path.join(dir, "missing"), { allowNone: true }), []);
});
