import assert from "node:assert/strict";
import test from "node:test";
import { guardRendererNavigation } from "@llmr/electron/main/navigation-guard.ts";

const trayUrl = "file:///app/dist/renderer/pages/tray/index.html";

function fakeWebContents() {
  const listeners = new Map<string, (...args: any[]) => void>();
  let openHandler: (details: { url: string }) => unknown = () => undefined;
  return {
    navigate(url: string): boolean {
      let prevented = false;
      listeners.get("will-navigate")?.({ preventDefault: () => { prevented = true; } }, url);
      return prevented;
    },
    open: (url: string) => openHandler({ url }),
    webContents: {
      on(event: string, listener: (...args: any[]) => void) { listeners.set(event, listener); },
      setWindowOpenHandler(handler: (details: { url: string }) => unknown) { openHandler = handler; }
    } as any
  };
}

test("guardRendererNavigation denies window.open and forwards only http(s)", () => {
  const opened: string[] = [];
  const fake = fakeWebContents();
  guardRendererNavigation(fake.webContents, trayUrl, async (url) => { opened.push(url); });
  assert.deepEqual(fake.open("https://example.com/a"), { action: "deny" });
  assert.deepEqual(fake.open("file:///etc/passwd"), { action: "deny" });
  assert.deepEqual(opened, ["https://example.com/a"]);
});

test("guardRendererNavigation allows the renderer page and blocks the rest", () => {
  const opened: string[] = [];
  const fake = fakeWebContents();
  guardRendererNavigation(fake.webContents, trayUrl, async (url) => { opened.push(url); });
  assert.equal(fake.navigate(`${trayUrl}?mode=detail`), false);
  assert.equal(fake.navigate("https://example.com"), true);
  assert.equal(fake.navigate("file:///etc/passwd"), true);
  assert.deepEqual(opened, ["https://example.com"]);
});
