import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

for (const file of readdirSync(".github/workflows").map((name) => `.github/workflows/${name}`).concat(".github/actions/prepare-release-gateway/action.yml")) {
  test(`${file} uses read-only defaults and no persisted credentials`, () => {
    const text = readFileSync(file, "utf8");
    const checkouts = text.match(/^\s+(?:- )?uses: actions\/checkout@/gm)?.length ?? 0;
    const persisted = text.match(/^\s+persist-credentials: false$/gm)?.length ?? 0;
    assert.equal(persisted, checkouts, "every checkout sets persist-credentials: false");
    if (file.includes("/workflows/")) assert.match(text, /^permissions:\n  contents: read$/m);
  });
}
