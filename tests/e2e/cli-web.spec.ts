import { expect, test, type APIRequestContext } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-cli-web-auth-token-0123456789";

let runtime: CliWebRuntime | undefined;

test.beforeAll(async () => {
  runtime = await startCliWebServer(cliWebAuthToken);
});

test.afterAll(async () => {
  if (!runtime) {
    return;
  }
  await disposeCliWebRuntime(runtime);
  runtime = undefined;
});

test("the page asks for the token when the URL carries none", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/`);
  await page.getByRole("dialog").locator("input[type=password]").fill(current.token);
  await page.getByRole("dialog").getByRole("button").click();
  await expect(page.locator("body")).toContainText(/Configure provider|Connect agent|Let's start/, { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a wrong token is asked for again", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/#llmr_web_token=wrong-token-0123456789-0123456789`);
  await expect(page.getByRole("dialog")).toContainText("not accepted");
  expect(new URL(page.url()).hash, "the token leaves the address bar").toBe("");
});

test("the prompt signs in when the browser refuses to store the token", async ({ page }) => {
  const current = requireRuntime();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.goto(`${current.baseUrl}/`);
  await page.getByRole("dialog").locator("input[type=password]").fill(current.token);
  await page.getByRole("dialog").getByRole("button").click();
  await expect(page.locator("body")).toContainText(/Configure provider|Connect agent|Let's start/, { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a 401 that is not LLMR's own keeps the token", async ({ page }) => {
  const current = requireRuntime();
  await page.route("**/api/llmr/rpc", (route) => route.fulfill({ body: "<html>sign in</html>", contentType: "text/html", status: 401 }));
  const refused = page.waitForResponse((response) => response.url().endsWith("/api/llmr/rpc") && response.status() === 401);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await refused;
  expect(await page.evaluate(() => window.sessionStorage.getItem("llmr.webAuthToken"))).toBe(current.token);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a fragment that cannot be decoded still leaves the address bar", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/#llmr_web_token=%E0`);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("the prompt comes back when it is closed", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => document.querySelector("dialog")?.close());
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("serves the management UI in a browser", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await expect(page).toHaveTitle("LLM Router");
  await expect(page.locator("#root")).toBeAttached();
  await expect(page.locator("body")).toContainText(/Configure provider|Connect agent|Let's start/, { timeout: 15_000 });
  await expect(page.evaluate(() => Boolean(window.llmr?.getAppInfo))).resolves.toBe(true);
  await expect(page.evaluate(async () => {
    const presets = await window.llmr?.getProviderPresets?.();
    return presets?.map((preset) => preset.id) ?? [];
  })).resolves.toContain("openai");

  await page.getByRole("button", { name: /Select preset provider/ }).first().click();
  await expect(page.getByRole("option", { name: "OpenAI" })).toBeVisible();
});

test("serves static assets used by the web UI", async ({ request }) => {
  const current = requireRuntime();
  await expectStaticAsset(request, current.baseUrl, "/assets/main.js", "text/javascript");
  await expectStaticAsset(request, current.baseUrl, "/assets/main.css", "text/css");
  await expectStaticAsset(request, current.baseUrl, "/assets/web-client-bridge.js", "text/javascript");
});

test("handles authenticated web RPC requests", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/llmr/rpc`, {
    data: { args: [], method: "getAppInfo" },
    headers: {
      "x-llmr-web-auth": current.token
    }
  });
  const payload = await response.json();

  expect(response.status()).toBe(200);
  expect(payload.ok).toBe(true);
  expect(payload.value.name).toBe("LLM Router");
  expect(payload.value.configDir).toContain(current.testHome);
  expect(payload.value.configDbFile).toContain("config.sqlite");
  expect(payload.value.usageDbFile).toContain("usage.sqlite");
});

test("rejects RPC requests without the web auth token", async ({ request }) => {
  const current = requireRuntime();
  const response = await request.post(`${current.baseUrl}/api/llmr/rpc`, {
    data: { args: [], method: "getAppInfo" }
  });
  const payload = await response.json();

  expect(response.status()).toBe(401);
  expect(payload.ok).toBe(false);
});

// A CLI bundle that compiles the Codex runtime script as a module still builds, and then runs the middleware on every start.
test("the built CLI prints its help and starts nothing else", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-cli-help-home-"));
  try {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, "..", "..", "packages", "cli", "dist", "main", "cli.js"), "--help"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, LLMR_INTERNAL_HOME_DIR: home }
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage:\n {2}llmr start /);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

async function expectStaticAsset(
  request: APIRequestContext,
  baseUrl: string,
  pathname: string,
  expectedContentType: string
) {
  const response = await request.head(`${baseUrl}${pathname}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(expectedContentType);
  expect(Number(response.headers()["content-length"] ?? "0")).toBeGreaterThan(0);
}

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
