import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const mainDir = "packages/electron/src/main";

function mainSources() {
  return readdirSync(mainDir)
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => [file, readFileSync(`${mainDir}/${file}`, "utf8")]);
}

test("every webPreferences block isolates the renderer", () => {
  let blocks = 0;
  for (const [file, source] of mainSources()) {
    const matches = [...source.matchAll(/webPreferences: \{([^{}]*)\}/g)];
    assert.equal(matches.length, source.split("webPreferences: {").length - 1, `${file} has a webPreferences block this test cannot read`);
    for (const [, body] of matches) {
      blocks += 1;
      for (const flag of ["contextIsolation: true", "sandbox: true", "nodeIntegration: false"]) {
        assert.ok(body.includes(flag), `${file} is missing ${flag}`);
      }
    }
  }
  assert.ok(blocks >= 13);
});

test("ipc.ts registers handlers only through the sender check", () => {
  const ipc = readFileSync(`${mainDir}/ipc.ts`, "utf8");
  assert.equal(ipc.split("ipcMain.handle(").length - 1, 1);
  assert.match(ipc, /assertAppRendererSender\(event, rendererRootUrl\)/);
  const registrars = mainSources().filter(([, source]) => /ipcMain\.(handle|on)\(/.test(source)).map(([file]) => file);
  assert.deepEqual(registrars, ["built-in-browser.ts", "ipc.ts"]);
});

test("the main window and the tray popover guard navigation", () => {
  for (const file of ["windows.ts", "tray-controller.ts"]) {
    assert.match(readFileSync(`${mainDir}/${file}`, "utf8"), /guardRendererNavigation\(/, file);
  }
});

test("the address bar and automation share one URL normaliser", () => {
  for (const file of ["built-in-browser.ts", "browser-automation-mcp.ts"]) {
    const source = readFileSync(`${mainDir}/${file}`, "utf8");
    assert.match(source, /normalizeBrowserInput\(/, file);
    assert.doesNotMatch(source, /`https:\/\/\$\{trimmed\}`/, file);
  }
});
