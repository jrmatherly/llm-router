import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { LEGACY_WINDOWS_CONFIGDIR } from "@ccr/core/config/constants.ts";

test("the legacy Windows config dir keeps the pre-4.0 product name", () => {
  assert.equal(path.basename(LEGACY_WINDOWS_CONFIGDIR), "Claude Code Router");
});
