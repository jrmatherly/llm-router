import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("home renderer HTML loads the web client bridge before the app bundle", () => {
  const projectRoot = process.cwd();
  const buildConfig = readFileSync(path.join(projectRoot, "build", "esbuild.config.mjs"), "utf8");
  const webBridge = readFileSync(path.join(projectRoot, "packages", "ui", "src", "web-client-bridge.ts"), "utf8");

  assert.match(buildConfig, /beforeModuleScriptTags:\s*\[\s*' {4}<script src="\.\.\/\.\.\/assets\/web-client-bridge\.js"><\/script>'\s*\]/);
  assert.match(webBridge, /if \(!window\.llmr\) \{/);
});

test("every renderer page declares a CSP that blocks remote scripts and plugins", () => {
  const pagesRoot = path.join(process.cwd(), "packages", "ui", "src", "pages");
  const pages = readdirSync(pagesRoot).filter((name) => existsSync(path.join(pagesRoot, name, "index.html"))).sort();
  assert.deepEqual(pages, ["browser", "home", "tray"]);
  for (const page of pages) {
    const html = readFileSync(path.join(pagesRoot, page, "index.html"), "utf8");
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
    assert.match(csp, /script-src 'self';/, page);
    assert.match(csp, /object-src 'none'/, page);
  }
});
