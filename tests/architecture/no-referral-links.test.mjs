import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
      ["grep", "-nIiE", referral, "--", ":(top)", ...excluded.map((entry) => `:(top,exclude)${entry}`)],
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

test("every source link on the provider deeplink page is a plain https page", () => {
  const page = readFileSync("docs/src/content/docs/en/configuration/provider-deeplink.md", "utf8");
  const links = [...page.matchAll(/source=(https%3A[^"&]*)/g)].map((match) => decodeURIComponent(match[1]));
  assert.ok(links.length > 0);
  for (const link of links) {
    const url = new URL(link);
    assert.equal(url.protocol, "https:", link);
    assert.equal(url.search, "", link);
    assert.equal(url.hash, "", link);
    assert.doesNotMatch(url.pathname, /\/register|\/signup|\/invite|\/agent\//, link);
  }
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
