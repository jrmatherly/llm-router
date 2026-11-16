import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const referral = "(\\?|&|&amp;|%3F|%26)(aff|ref_source|cps_key|utm_[a-z]+)(=|%3D)|s\\.qiniu\\.com";

// models.json is generated from models.dev, which adds its own utm_source to provider doc links.
const excluded = [
  "docs/superpowers/",
  "docs/package-lock.json",
  "package-lock.json",
  "packages/core/models.json",
  "tests/architecture/no-referral-links.test.mjs"
];

function referralLines() {
  try {
    return execFileSync(
      "git",
      ["grep", "-nIiE", referral, "--", ".", ...excluded.map((entry) => `:(exclude)${entry}`)],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    ).split("\n").filter(Boolean).map((line) => line.slice(0, 200));
  } catch (error) {
    if (error.status !== 1) throw error;
    return [];
  }
}

test("no tracked file carries a referral parameter or the Qiniu short link", () => {
  assert.deepEqual(referralLines(), []);
});

test("the referral pattern matches plain, HTML-escaped and URL-encoded parameters", () => {
  const pattern = new RegExp(referral, "i");
  for (const sample of [
    "https://x.test/?aff=abc",
    "https://x.test/register?a=1&ref_source=link",
    "source=https%3A%2F%2Fx.test%2F%3Faff%3Dabc",
    "source=https%3A%2F%2Fx.test%2F%3Fa%3D1%26utm_medium%3Dpartner",
    "href=\"https://x.test/?a=1&amp;utm_source=y\"",
    "https://x.test/?cps_key=1",
    "https://s.qiniu.com/abc"
  ]) {
    assert.match(sample, pattern);
  }
  for (const sample of [
    "llmr://provider?name=x&amp;base_url=y&amp;source=https%3A%2F%2Fteamorouter.com%2F",
    "https://github.com/a/b?ref=main",
    "https://x.test/?staff=1"
  ]) {
    assert.doesNotMatch(sample, pattern);
  }
});
