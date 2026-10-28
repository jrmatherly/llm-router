import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-opencode-go-token";

const lockedDetail = "OpenCode Go credential was found, but no OpenCode Go models were detected. Connect OpenCode Go in OpenCode to refresh its model cache, then rescan.";
const availableDetail = "OpenCode Go login detected. Click Import to add it as a gateway provider.";
const genericDetail = /Cannot read local login information/;

const candidates = [
  {
    detail: lockedDetail,
    id: "opencode-go-api-anthropic-messages",
    importable: false,
    kind: "opencode",
    models: [],
    name: "OpenCode Go (Anthropic)",
    protocol: "anthropic_messages",
    sourceFile: "env:OPENCODE_GO_API_KEY",
    status: "locked"
  },
  {
    detail: availableDetail,
    id: "opencode-go-api-openai-chat-completions",
    importable: true,
    kind: "opencode",
    models: ["mimo-v2.5"],
    name: "OpenCode Go (Chat Completions)",
    protocol: "openai_chat_completions",
    sourceFile: "env:OPENCODE_GO_API_KEY",
    status: "available"
  }
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

test.use({ locale: "en-US" });

test("locked OpenCode Go candidates render the actionable message instead of the generic login copy", async ({ page }) => {
  const current = requireRuntime();
  await mockCandidates(page);
  await openAddProviderDialog(page, current, "Providers", "Add provider");

  await expect(page.getByText(lockedDetail)).toBeVisible();
  await expect(page.getByText(availableDetail)).toBeVisible();
  await expect(page.getByText(genericDetail)).toHaveCount(0);

  const importButtons = page.getByRole("dialog").getByRole("button", { name: "Import", exact: true });
  await expect(importButtons).toHaveCount(2);
  await expect(importButtons.nth(0)).toBeDisabled();
  await expect(importButtons.nth(1)).toBeEnabled();
});

test.describe("zh-CN browser locale", () => {
  test.use({ locale: "zh-CN" });

  test("the UI stays in English", async ({ page }) => {
    const current = requireRuntime();
    await mockCandidates(page);
    await openAddProviderDialog(page, current, "Providers", "Add provider");

    await expect(page.getByText(lockedDetail)).toBeVisible();
    await expect(page.getByText(availableDetail)).toBeVisible();
    await expect(page.getByText(genericDetail)).toHaveCount(0);
  });
});

async function mockCandidates(page: Page): Promise<void> {
  await page.route("**/api/llmr/rpc", async (route) => {
    const payload = route.request().postDataJSON() as { method?: string } | undefined;
    if (payload?.method === "getLocalAgentProviderCandidates") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, value: candidates })
      });
      return;
    }
    await route.continue();
  });
}

async function openAddProviderDialog(page: Page, current: CliWebRuntime, providersLabel: string, addLabel: string): Promise<void> {
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async () => {
    await window.llmr?.setOnboardingFinished?.();
  });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: providersLabel, exact: true }).click();
  await page.getByRole("button", { name: addLabel, exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.llmr?.getConfig), undefined, { timeout: 20_000 });
}

function requireRuntime(): CliWebRuntime {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  return runtime;
}
