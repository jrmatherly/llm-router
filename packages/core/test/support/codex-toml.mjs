import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

export function assertCodexFilesParse(codexDir, options = {}) {
  const names = existsSync(codexDir)
    ? readdirSync(codexDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".toml")).map((entry) => entry.name).sort()
    : [];
  if (names.length === 0 && !options.allowNone) {
    assert.fail(`${codexDir} holds no .toml file`);
  }
  for (const name of names) {
    try {
      parse(readFileSync(path.join(codexDir, name), "utf8"));
    } catch (error) {
      assert.fail(`${name} does not parse as TOML: ${error.message}`);
    }
  }
  return names;
}
