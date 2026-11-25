import { expect, test, type Page } from "@playwright/test";
import { disposeCliWebRuntime, startCliWebServer, type CliWebRuntime } from "./cli-web-runtime";

const cliWebAuthToken = "playwright-local-agent-login-token-0123456789";
const localAgentProviderApiKey = "llmr-local-agent-login";
const providerName = "Claude Code API";

const candidate = {
  detail: "Forwards the login Claude Code sends. Usable only from a Claude Code profile in Claude login mode. Nothing is stored.",
  id: "claude-code-api",
  importable: true,
  kind: "claude-code",
  models: ["claude-sonnet-5"],
  name: providerName,
  protocol: "anthropic_messages",
  status: "available"
};

const oauthPlugin = {
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

const standInIcon = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

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
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
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

test("onboarding sends no probe for the imported Claude login", async ({ page }) => {
  const current = requireRuntime();
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  await mockLocalAgentRpc(page, probeRequests);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Next step" }).click();

  await expect(page.getByText("Choose the models that should be available through this provider.")).toBeVisible();
  await expect(page.getByText("claude-sonnet-5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("LLMR does not ask this provider for a model list.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh provider models" })).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(probeRequests.length).toBe(0);
});

test("the add provider dialog goes from the import to Pick models and back", async ({ page }) => {
  const current = requireRuntime();
  await mockLocalAgentRpc(page);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
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

test("the add provider dialog shows the imported Claude login as not checked", async ({ page }) => {
  const current = requireRuntime();
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  await mockLocalAgentRpc(page, probeRequests);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
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
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByText("Not checked", { exact: true })).toBeVisible();
  await expect(dialog.getByText("LLMR does not probe this provider.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Check Connection" })).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(probeRequests.length).toBe(0);
});

test("editing an imported provider shows the local login notice instead of the marker", async ({ page }) => {
  const current = requireRuntime();
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
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
    config.providerPlugins = [{ key: "llmr-local-agent-stand-in-codex-oauth", providerName: name }];
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

test("a provider whose key is the placeholder typed by hand shows its key field", async ({ page }) => {
  const current = requireRuntime();
  await mockLocalAgentRpc(page);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);
  await page.evaluate(async (apiKey) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [{ api_base_url: "http://127.0.0.1:9/v1", api_key: apiKey, models: ["stand-in-model"], name: "Typed by hand", type: "openai_chat_completions" }];
    config.providerPlugins = [];
    await window.llmr!.saveConfig(config);
    await window.llmr!.setOnboardingFinished?.();
  }, localAgentProviderApiKey);
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator('button[aria-label="Edit Typed by hand"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Signed in with your local agent")).toHaveCount(0);
  await expect(dialog.getByText("Local login provider")).toHaveCount(0);
  await expect(dialog.locator(`input[value="${localAgentProviderApiKey}"]`)).toHaveCount(1);
});

test("the edit dialog sends no probe for a saved local login provider", async ({ page }) => {
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  await mockLocalAgentRpc(page, probeRequests);
  await answerIconRpc(page);
  const dialog = await openSavedProviderEditDialog(page, requireRuntime(), "Stand-in login", localAgentProviderApiKey, [{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }]);
  await expect(dialog.getByText("Signed in with your local agent")).toBeVisible();
  await expect(dialog.getByText("LLMR has not asked this provider which protocols it supports.")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(probeRequests.length).toBe(0);
  await dialog.getByLabel(/^API endpoint/).fill("http://127.0.0.1:10/v1");
  await page.waitForTimeout(1000);
  expect(probeRequests.length).toBe(0);
});

test("the edit dialog still probes a saved provider that has its own key", async ({ page }) => {
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  await mockLocalAgentRpc(page, probeRequests);
  await openSavedProviderEditDialog(page, requireRuntime(), "Stand-in key", "sk-stand-in-0001");
  await expect.poll(() => probeRequests.length).toBeGreaterThan(0);
});

test("Refresh and Check send nothing while a saved local login provider's address is unsaved", async ({ page }) => {
  const current = requireRuntime();
  const sent: string[] = [];
  await page.route("**/api/llmr/rpc", async (route) => {
    const method = (route.request().postDataJSON() as { method?: string } | undefined)?.method ?? "";
    if (method === "probeProviderCandidates" || method === "checkProviderConnectivity") {
      sent.push(method);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: method === "probeProviderCandidates" ? probeResult : { failed: [], passed: [], results: [] } }) });
      return;
    }
    if (method === "detectProviderIcon") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: {} }) });
      return;
    }
    await route.continue();
  });
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);
  await page.evaluate(async ({ apiKey, icon }) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [{ api_base_url: "http://127.0.0.1:9/v1", api_key: apiKey, icon, models: ["stand-in-model"], name: "Stand-in login", type: "openai_chat_completions" }];
    config.providerPlugins = [{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }];
    await window.llmr!.saveConfig(config);
    await window.llmr!.setOnboardingFinished?.();
  }, { apiKey: localAgentProviderApiKey, icon: standInIcon });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator('button[aria-label="Edit Stand-in login"]:visible').first().click();
  const dialog = page.getByRole("dialog").first();
  const blocked = dialog.getByText("Save the new address to check it with your local login.");
  await dialog.getByLabel(/^API endpoint/).fill("http://127.0.0.1:10/v1");
  await dialog.getByRole("button", { name: "Refresh provider models" }).click();
  await expect(blocked).toBeVisible();
  await dialog.getByRole("button", { name: "Check Connection" }).click();
  await expect(blocked).toBeVisible();
  await expect(page.getByText("Check results")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start check" })).toHaveCount(0);
  expect(sent.length).toBe(0);
  await dialog.getByLabel(/^API endpoint/).fill("http://127.0.0.1:9/v1");
  await expect(blocked).toHaveCount(0);
  await dialog.getByRole("button", { name: "Refresh provider models" }).click();
  await expect.poll(() => sent.length).toBe(1);
});

test("the add provider dialog still probes an imported login that brings its own plugins", async ({ page }) => {
  const current = requireRuntime();
  const probeRequests: Array<{ apiKey?: string; providerPlugins?: unknown[] }> = [];
  const grokCandidate = { ...candidate, detail: "Uses the Grok CLI login.", id: "grok", kind: "grok", models: ["grok-stand-in"], name: "Grok", protocol: "openai_chat_completions" };
  const grokPlugin = { key: "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-grok-oauth", providerName: "__LLMR_PROVIDER_NAME__" };
  await mockLocalAgentRpc(page, probeRequests, {
    candidate: grokCandidate,
    provider: { apiKey: localAgentProviderApiKey, baseUrl: "https://cli-chat-proxy.grok.com/v1", models: grokCandidate.models, name: "Grok", protocol: grokCandidate.protocol },
    providerPlugins: [grokPlugin]
  });
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);
  await page.evaluate(async () => {
    await window.llmr?.setOnboardingFinished?.();
  });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.getByRole("button", { name: "Add provider", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect.poll(() => probeRequests.length).toBeGreaterThan(0);
  expect(probeRequests[0]?.providerPlugins?.length).toBeGreaterThan(0);
});

async function openSavedProviderEditDialog(page: Page, current: CliWebRuntime, name: string, apiKey: string, providerPlugins: unknown[] = []) {
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);
  await page.evaluate(async ({ provider, plugins }) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [provider];
    config.providerPlugins = plugins;
    await window.llmr!.saveConfig(config);
    await window.llmr!.setOnboardingFinished?.();
  }, { plugins: providerPlugins, provider: { api_base_url: "http://127.0.0.1:9/v1", api_key: apiKey, icon: standInIcon, models: ["stand-in-model"], name, type: "openai_chat_completions" } });
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator(`button[aria-label="Edit ${name}"]:visible`).first().click();
  return page.getByRole("dialog");
}

async function answerIconRpc(page: Page): Promise<void> {
  await page.route("**/api/llmr/rpc", async (route) => {
    const payload = route.request().postDataJSON() as { method?: string } | undefined;
    if (payload?.method === "detectProviderIcon") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: {} }) });
      return;
    }
    await route.fallback();
  });
}

async function mockLocalAgentRpc(page: Page, probeRequests?: Array<{ apiKey?: string; providerPlugins?: unknown[] }>, imported: typeof importResult = importResult): Promise<void> {
  await page.route("**/api/llmr/rpc", async (route) => {
    const payload = route.request().postDataJSON() as { args?: unknown[]; method?: string } | undefined;
    if (payload?.method === "probeProviderCandidates") {
      probeRequests?.push(payload.args?.[0] as { apiKey?: string; providerPlugins?: unknown[] });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: probeResult }) });
      return;
    }
    if (payload?.method === "getLocalAgentProviderCandidates") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: [imported.candidate] }) });
      return;
    }
    if (payload?.method === "importLocalAgentProvider") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: imported }) });
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
