import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

test.use({ locale: "en-US" });

const cliWebAuthToken = "playwright-claude-login-profile-token-0123456789";

const provider = { api_base_url: "https://api.anthropic.com", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" };
const other = { api_base_url: "http://127.0.0.1:9/v1", api_key: "sk-onboarding", models: ["onboarding-model"], name: "onboarding-provider", type: "openai_chat_completions" };
const plugins = [
  { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
  { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
];

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

test("onboarding with only the Claude import asks for Claude login mode", async ({ page }) => {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  const url = `${runtime.baseUrl}/#llmr_web_token=${encodeURIComponent(runtime.token)}`;
  await page.goto(url);
  await waitForBridge(page);
  await page.evaluate(async (next) => {
    const config = await window.llmr!.getConfig();
    config.Providers = next.providers;
    config.providerPlugins = next.providerPlugins;
    await window.llmr!.saveConfig(config);
  }, { providerPlugins: plugins, providers: [provider] });
  await page.goto(url);
  await page.reload();
  await waitForBridge(page);
  await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
  await expect(page.getByText("Your only provider is Claude Code API. Turn on Sign in with my Claude login to use it, or add another provider.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await page.getByLabel("Sign in with my Claude login").click();
  await expect(page.getByText("Your only provider is Claude Code API.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next step" })).toBeEnabled();
});

test("onboarding connects a Claude login profile with no default model", async ({ page }) => {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  const url = `${runtime.baseUrl}/#llmr_web_token=${encodeURIComponent(runtime.token)}`;
  await page.goto(url);
  await waitForBridge(page);
  await page.evaluate(async (next) => {
    const config = await window.llmr!.getConfig();
    config.Providers = next.providers;
    config.providerPlugins = next.providerPlugins;
    await window.llmr!.saveConfig(config);
  }, { providerPlugins: plugins, providers: [provider, other] });
  await page.goto(url);
  await page.reload();
  await waitForBridge(page);
  await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
  await page.getByLabel("Sign in with my Claude login").click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Let's start" })).toBeVisible();
  const saved = (await page.evaluate(() => window.llmr!.getConfig())).profile.profiles.find((profile) => profile.id === "default-claude-code");
  expect(saved?.model).toBe("");
  expect(saved?.env?.LLMR_CLAUDE_CODE_AUTH_MODE).toBe("claude-login");
  const settingsFile = path.join(runtime.testHome, ".claude", "settings.json");
  await expect.poll(() => existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : "").toMatch(/ANTHROPIC_CUSTOM_HEADERS/);
  const settings = JSON.parse(readFileSync(settingsFile, "utf8")) as { apiKeyHelper?: string; env: Record<string, string> };
  expect("ANTHROPIC_MODEL" in settings.env).toBe(false);
  expect("apiKeyHelper" in settings).toBe(false);
});

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.llmr?.getConfig), undefined, { timeout: 20_000 });
}
