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

test("release builds wait for the test job", () => {
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(release, /^  test:$/m);
  for (const job of ["model-catalog", "gateway"]) {
    assert.match(release, new RegExp(`^  ${job}:\\n(?:(?: {4}.*)?\\n)*? {4}needs: \\[?test\\b`, "m"), job);
  }
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});
