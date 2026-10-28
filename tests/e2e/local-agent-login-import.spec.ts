import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-local-agent-login-token";
const localAgentProviderApiKey = "llmr-local-agent-login";
const providerName = "Claude Code API";

const candidate = {
  detail: "Claude Code login detected. Click Import to add it as a gateway provider.",
  id: "claude-code-api",
  importable: true,
  kind: "claude-code",
  models: ["claude-sonnet-5"],
  name: providerName,
  protocol: "anthropic_messages",
  sourceFile: "~/.claude/.credentials.json",
  status: "available"
};

const oauthPlugin = {
  auth: { headers: { authorization: "Bearer playwright-oauth-token" }, removeHeaders: ["x-api-key"], strict: true },
  key: "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-code-oauth",
  providerName: "__LLMR_PROVIDER_NAME__"
};

const importResult = {
  candidate,
  provider: {
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    models: candidate.models,
    name: providerName,
    protocol: candidate.protocol
  },
  providerPlugins: [oauthPlugin]
};

const discoveredModels = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-5-5"];

const probeResult = {
  candidate: { baseUrl: "https://api.anthropic.com", protocols: ["anthropic_messages"] },
  probe: {
    detectedProtocol: "anthropic_messages",
    modelSource: "anthropic",
    models: discoveredModels,
    normalizedBaseUrl: "https://api.anthropic.com",
    protocols: [{ endpoint: "https://api.anthropic.com/v1/messages", protocol: "anthropic_messages", status: 400, supported: true }]
  }
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

test.use({ locale: "en-US" });

test("onboarding drops the credentials step after a local agent import", async ({ page }) => {
  const current = requireRuntime();
  await mockLocalAgentRpc(page);
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
  await waitForBridge(page);

  await expect(page.getByText("Add credentials")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Add credentials")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText("Choose the models that should be available through this provider.")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByLabel("API key")).toHaveCount(0);
});

test("onboarding discovers the imported login's models through its plugins", async ({ page }) => {
  const current = requireRuntime();
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  await mockLocalAgentRpc(page, probeRequests);
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
  await waitForBridge(page);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Next step" }).click();

  await expect(page.getByText("Choose the models that should be available through this provider.")).toBeVisible();
  for (const model of discoveredModels) {
    await expect(page.getByText(model, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("No provider models")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh provider models" })).toBeVisible();
  expect(probeRequests.length).toBeGreaterThan(0);
  expect(probeRequests[0]).toMatchObject({ apiKey: localAgentProviderApiKey, providerPlugins: [oauthPlugin] });
});

test("the add provider dialog goes from the import to Pick models and back", async ({ page }) => {
  const current = requireRuntime();
  await mockLocalAgentRpc(page);
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async () => {
    await window.llmr?.setOnboardingFinished?.();
  });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.getByRole("button", { name: "Add provider", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog.getByText("Pick models")).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-label", "Step 2 / 3");
  await expect(dialog.getByText("Add credentials")).toHaveCount(0);
  await expect(dialog.getByLabel("API key")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(dialog.getByText("Choose provider").first()).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-label", "Step 1 / 3");
});

test("editing an imported provider shows the local login notice instead of the marker", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/?llmr_web_token=${current.token}`);
  await waitForBridge(page);
  await page.evaluate(async ({ apiKey, name }) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [{
      api_base_url: "https://api.anthropic.com",
      api_key: apiKey,
      models: ["claude-sonnet-5"],
      name,
      type: "anthropic_messages"
    }];
    await window.llmr!.saveConfig(config);
    await window.llmr!.setOnboardingFinished?.();
  }, { apiKey: localAgentProviderApiKey, name: providerName });
  await page.reload();
  await waitForBridge(page);

  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator(`button[aria-label="Edit ${providerName}"]:visible`).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Signed in with your local agent")).toBeVisible();
  await expect(dialog.getByText(`This provider uses the login from ${providerName}. No API key is needed.`)).toBeVisible();
  await expect(dialog.getByText("Add credentials")).toHaveCount(0);
  await expect(dialog.locator(`input[value="${localAgentProviderApiKey}"]`)).toHaveCount(0);
});

async function mockLocalAgentRpc(page: Page, probeRequests?: Array<{ apiKey?: string; providerPlugins?: unknown[] }>): Promise<void> {
  await page.route("**/api/llmr/rpc", async (route) => {
    const payload = route.request().postDataJSON() as { args?: unknown[]; method?: string } | undefined;
    if (payload?.method === "probeProviderCandidates") {
      probeRequests?.push(payload.args?.[0] as { apiKey?: string; providerPlugins?: unknown[] });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: probeResult }) });
      return;
    }
    if (payload?.method === "getLocalAgentProviderCandidates") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: [candidate] }) });
      return;
    }
    if (payload?.method === "importLocalAgentProvider") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: importResult }) });
      return;
    }
    await route.continue();
  });
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
