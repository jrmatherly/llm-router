import assert from "node:assert/strict";
import test from "node:test";
import { parseElectronAbi } from "../../scripts/electron-abi.mjs";

test("parseElectronAbi reads the ABI printed by a ready Electron", () => {
  assert.equal(parseElectronAbi("146\n"), "146");
});

test("parseElectronAbi skips the download banner a first launch prints before the ABI", () => {
  assert.equal(parseElectronAbi("Downloading Electron binary...\n146\n"), "146");
});

test("parseElectronAbi rejects output with no ABI line", () => {
  assert.equal(parseElectronAbi(""), undefined);
  assert.equal(parseElectronAbi("Electron failed to install correctly\n"), undefined);
});
