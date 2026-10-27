import assert from "node:assert/strict";
import test from "node:test";
import { openHttpExternal } from "@ccr/electron/main/external-url.ts";

test("openHttpExternal forwards only http and https", () => {
  const opened: string[] = [];
  const open = async (url: string) => { opened.push(url); };
  assert.equal(openHttpExternal("https://example.com/a", open), true);
  assert.equal(openHttpExternal("http://example.com", open), true);
  for (const url of ["file:///System/Applications/Calculator.app", "smb://host/share", "ms-msdt:/id", "mailto:a@b.c", "javascript:alert(1)", "not a url"]) {
    assert.equal(openHttpExternal(url, open), false, url);
  }
  assert.deepEqual(opened, ["https://example.com/a", "http://example.com"]);
});
