import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the extension content script runs only on LLMR confirm pages", () => {
  const manifest = JSON.parse(readFileSync("extension/chrome/manifest.json", "utf8"));
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "http://127.0.0.1/chrome-import/jobs/*/confirm",
    "http://localhost/chrome-import/jobs/*/confirm"
  ]);
  assert.doesNotMatch(readFileSync("extension/chrome/confirm.js", "utf8"), /data-import-url|dataset\.importUrl/);
});

test("the background worker only imports from the sender tab's origin", () => {
  const background = readFileSync("extension/chrome/background.js", "utf8");
  assert.match(background, /sender\.tab\?\.url/);
  assert.match(background, /url\.origin !== senderOrigin/);
});
