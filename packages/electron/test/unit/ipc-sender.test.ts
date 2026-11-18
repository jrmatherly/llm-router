import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { assertAppRendererSender, isAppRendererFrame } from "@llmr/electron/main/ipc-sender.ts";

const root = "file:///app/dist/renderer/";

test("isAppRendererFrame accepts the home, tray and browser pages", () => {
  for (const page of ["pages/home/index.html", "pages/tray/index.html?mode=menu", "pages/browser/index.html#x"]) {
    assert.equal(isAppRendererFrame(`${root}${page}`, root), true, page);
  }
});

test("isAppRendererFrame rejects other frames", () => {
  for (const url of [undefined, "", "not a url", "https://evil.example/app/dist/renderer/pages/home/index.html", "file:///other/index.html", "file:///app/dist/renderer-evil/index.html", "file://host/app/dist/renderer/pages/home/index.html"]) {
    assert.equal(isAppRendererFrame(url, root), false, String(url));
  }
});

test("isAppRendererFrame accepts frames under an encoded install path", () => {
  const spaced = pathToFileURL("/Applications/LLM Router.app/Contents/Resources/app.asar/dist/renderer/").toString();
  assert.equal(isAppRendererFrame("file:///Applications/LLM%20Router.app/Contents/Resources/app.asar/dist/renderer/pages/home/index.html", spaced), true);
  assert.equal(isAppRendererFrame("file:///C:/Users/JASONM~1/app/renderer/pages/home/index.html", "file:///C:/Users/JASONM%7E1/app/renderer/"), true);
});

test("isAppRendererFrame ignores the case of a Windows drive letter", () => {
  assert.equal(isAppRendererFrame("file:///C:/Users/me/app/renderer/pages/home/index.html", "file:///c:/Users/me/app/renderer/"), true);
  assert.equal(isAppRendererFrame("file:///c:/Users/me/app/renderer/pages/home/index.html", "file:///C:/Users/me/app/renderer/"), true);
  assert.equal(isAppRendererFrame("file:///D:/Users/me/app/renderer/pages/home/index.html", "file:///c:/Users/me/app/renderer/"), false);
});

test("isAppRendererFrame treats the root as a directory and rejects traversal", () => {
  assert.equal(isAppRendererFrame("file:///app/dist/renderer-evil/x", "file:///app/dist/renderer"), false);
  assert.equal(isAppRendererFrame("file:///app/dist/renderer/pages/home/index.html", "file:///app/dist/renderer"), true);
  for (const url of ["file:///app/dist/renderer/..%2F..%2Fevil.html", "file:///app/dist/renderer/pages/..%5C..%5Cevil.html"]) {
    assert.equal(isAppRendererFrame(url, root), false, url);
  }
});

test("assertAppRendererSender throws for a missing or foreign frame", () => {
  assert.throws(() => assertAppRendererSender({ senderFrame: null }, root), /only available to LLM Router windows/);
  assert.throws(() => assertAppRendererSender({ senderFrame: { url: "https://evil.example/" } } as any, root), /only available to LLM Router windows/);
  assert.doesNotThrow(() => assertAppRendererSender({ senderFrame: { url: `${root}pages/home/index.html` } } as any, root));
});
