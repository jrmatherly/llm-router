import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

test.use({ locale: "en-US" });

const cliWebAuthToken = "playwright-onboarding-agent-token-0123456789";

const provider = {
  api_base_url: "http://127.0.0.1:9/v1",
  api_key: "sk-onboarding",
  models: ["onboarding-model"],
  name: "onboarding-provider",
  type: "openai_chat_completions"
};

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

test("onboarding lets the user skip the agent, then connects only the agent they pick", async ({ page }) => {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  const url = `${runtime.baseUrl}/#llmr_web_token=${encodeURIComponent(runtime.token)}`;

  await page.goto(url);
  await waitForBridge(page);
  await page.evaluate(async (item) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [item];
    await window.llmr!.saveConfig(config);
  }, provider);
  await page.goto(url);
  await page.reload();
  await waitForBridge(page);

  await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
  await expect(page.getByText("LLMR rewrites ~/.claude/settings.json while it runs.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("Skipped. Add one under Agent Profiles.")).toBeVisible();
  expect(await enabledProfileIds(page)).toEqual([]);
  expect(existsSync(path.join(runtime.testHome, ".claude"))).toBe(false);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
  await page.getByRole("button", { name: /^Default model/ }).click();
  await page.getByRole("button", { name: "onboarding-model", exact: true }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Let's start" })).toBeVisible();
  await expect(page.getByText("Skipped. Add one under Agent Profiles.")).toHaveCount(0);

  await expect.poll(() => enabledProfileIds(page)).toEqual(["default-claude-code"]);
  const config = await page.evaluate(() => window.llmr!.getConfig());
  expect(config.profile.profiles.map((profile) => profile.id)).toEqual(["default-claude-code", "default-codex"]);
  const claudeSettingsFile = path.join(runtime.testHome, ".claude", "settings.json");
  await expect.poll(() => existsSync(claudeSettingsFile) ? readFileSync(claudeSettingsFile, "utf8") : "").toMatch(/apiKeyHelper/);
  expect(existsSync(path.join(runtime.testHome, ".codex"))).toBe(false);

  const helper = (JSON.parse(readFileSync(claudeSettingsFile, "utf8")) as { apiKeyHelper: string }).apiKeyHelper;
  const profileKey = execFileSync(helper, { encoding: "utf8" }).trim();
  expect(profileKey).toMatch(/^llmr-profile-/);
  const gateway = await page.evaluate(() => window.llmr!.getGatewayStatus());
  expect(gateway.state).toBe("running");
  expect(await gatewayStatusFor(gateway.endpoint, profileKey)).not.toBe(401);
  expect(await gatewayStatusFor(gateway.endpoint, "llmr-profile-not-a-real-key")).toBe(401);

  const recovery = await page.evaluate(() => window.llmr!.recoverGlobalProfile("default-claude-code"));
  expect(recovery.status.ok).toBe(true);
  expect(recovery.status.message).toContain("Claude Code config was removed because it did not exist before LLMR.");
  expect(readdirSync(path.join(runtime.testHome, ".claude")).filter((name) => name.includes("llmr"))).toEqual([]);
  expect(existsSync(claudeSettingsFile)).toBe(false);
  expect(await enabledProfileIds(page)).toEqual([]);
  expect(await gatewayStatusFor(gateway.endpoint, profileKey)).toBe(401);
});

async function gatewayStatusFor(endpoint: string, apiKey: string): Promise<number> {
  const response = await fetch(`${endpoint}/v1/messages`, {
    body: JSON.stringify({ max_tokens: 1, messages: [{ content: "ping", role: "user" }], model: "onboarding-provider/onboarding-model" }),
    headers: { "anthropic-version": "2023-06-01", "content-type": "application/json", "x-api-key": apiKey },
    method: "POST"
  });
  return response.status;
}

async function enabledProfileIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await window.llmr!.getConfig()).profile.profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.id));
}

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.llmr?.getConfig), undefined, { timeout: 20_000 });
}
