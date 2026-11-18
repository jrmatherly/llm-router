import { expect, test, type APIRequestContext } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-cli-web-auth-token";

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

test("uses LLMR_WEB_AUTH_TOKEN for CLI web authentication", async () => {
  const current = requireRuntime();
  expect(current.token).toBe(cliWebAuthToken);
});

test("serves the management UI in a browser", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
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
