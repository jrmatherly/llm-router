import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isManagedPiModelsContent, writePiGatewayConfig } from "@ccr/core/agents/pi/profile-config.ts";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  findProviderModelCatalogEntry,
  modelCatalogMaxInputTokens
} from "@ccr/core/gateway/model-catalog.ts";

test("Pi profile config writes an LLMR OpenAI Responses provider", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "0.0.0.0";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://api.example.test/v1",
        models: ["alpha", "beta"],
        name: "Example",
        type: "openai_responses"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "Example/alpha",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const provider = payload.providers["ccr-pi"];

    assert.equal(result.changed, true);
    assert.equal(result.model, "Example/alpha");
    assert.equal(result.providerId, "ccr-pi");
    assert.equal(result.file, path.join(root, "profiles", "pi-main", "pi", "models.json"));
    assert.equal(result.profileHome, path.join(root, "profiles", "pi-main", "pi"));
    assert.equal(result.sessionDir, path.join(root, "profiles", "pi-main", "pi", "sessions"));
    assert.equal(provider.baseUrl, "http://127.0.0.1:3459/v1");
    assert.equal(provider.api, "openai-responses");
    assert.equal(provider.apiKey, "ccr-profile-token");
    assert.equal(provider.authHeader, true);
    assert.deepEqual(provider.headers, {
      "x-ccr-client": "pi",
      "x-ccr-profile": "pi-main"
    });
    assert.ok(provider.models.some((model) => model.id === "Example/alpha"));
    assert.ok(provider.models.some((model) => model.id === "Example/beta"));

    const second = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Example/alpha");
    assert.equal(second.changed, false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("isManagedPiModelsContent matches only an LLMR-only provider map", () => {
  assert.equal(isManagedPiModelsContent(JSON.stringify({ providers: { "claude-code-router": {} } }), "claude-code-router"), true);
  assert.equal(isManagedPiModelsContent(JSON.stringify({ providers: { "claude-code-router": {}, "my-ollama": {} } }), "claude-code-router"), false);
  assert.equal(isManagedPiModelsContent(JSON.stringify({ providers: { "my-ollama": {} } }), "claude-code-router"), false);
  assert.equal(isManagedPiModelsContent("not json", "claude-code-router"), false);
});

test("a global Pi profile snapshots and backs up the user's models.json before writing", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-global-"));
  try {
    const agentDir = path.join(root, "pi-agent");
    const file = path.join(agentDir, "models.json");
    const original = `${JSON.stringify({ providers: { "my-ollama": { baseUrl: "http://localhost:11434" } } })}\n`;
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(file, original);
    const profile = { agent: "pi", configFile: agentDir, enabled: true, id: "pi-global", model: "", name: "Pi", scope: "global", surface: "cli" };

    const result = writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token", "default");

    assert.equal(result.file, file);
    assert.equal(readFileSync(`${file}.ccr-original`, "utf8"), original);
    const backups = readdirSync(agentDir).filter((entry) => entry.startsWith("models.json.ccr-backup-"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(path.join(agentDir, backups[0]), "utf8"), original);
    if (process.platform !== "win32") {
      assert.equal(statSync(file).mode & 0o777, 0o600);
      assert.equal(statSync(path.join(agentDir, backups[0])).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("an LLMR-scoped Pi profile writes models.json without backups", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-scoped-"));
  try {
    const profile = { agent: "pi", enabled: true, id: "pi-ccr", model: "", name: "Pi", scope: "ccr", surface: "cli" };
    writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token-a", "default");
    const result = writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token-b", "default");

    assert.deepEqual(readdirSync(path.dirname(result.file)).filter((entry) => entry.startsWith("models.json")), ["models.json"]);
    assert.equal(existsSync(`${result.file}.ccr-original-missing`), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Pi profile config writes catalog token limits for known models", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-limits-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "127.0.0.1";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://api.deepseek.example/v1",
        models: ["deepseek-v4-flash", "unknown-model"],
        name: "DeepSeek",
        type: "openai_chat_completions"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "DeepSeek/deepseek-v4-flash",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "DeepSeek/deepseek-v4-flash");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const models = payload.providers["ccr-pi"].models;
    const deepseek = models.find((model) => model.id === "DeepSeek/deepseek-v4-flash");
    const unknown = models.find((model) => model.id === "DeepSeek/unknown-model");
    const expected = expectedPiCatalogLimits(config.Providers[0], "deepseek-v4-flash", "DeepSeek/deepseek-v4-flash");

    assert.equal(deepseek.contextWindow, expected.contextWindow);
    assert.equal(deepseek.maxTokens, expected.maxTokens);
    assert.deepEqual(unknown, {
      id: "DeepSeek/unknown-model",
      name: "DeepSeek/unknown-model"
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Pi profile config writes 1M catalog limits for GLM 5.3", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ccr-pi-profile-glm-"));
  try {
    const config = createDefaultAppConfig();
    config.gateway.host = "127.0.0.1";
    config.gateway.port = 3459;
    config.Providers = [
      {
        api_key: "sk-test",
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        models: ["glm-5.3"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ];
    const profile = {
      agent: "pi",
      enabled: true,
      id: "pi-main",
      model: "Zhipu AI (China) - Coding Plan/glm-5.3",
      name: "Pi Main",
      providerId: "ccr-pi",
      scope: "ccr",
      surface: "cli"
    };

    const result = writePiGatewayConfig(root, config, profile, "ccr-profile-token", "Zhipu AI (China) - Coding Plan/glm-5.3");
    const payload = JSON.parse(readFileSync(result.file, "utf8"));
    const models = payload.providers["ccr-pi"].models;
    const glm = models.find((model) => model.id === "Zhipu AI (China) - Coding Plan/glm-5.3");
    const expected = expectedPiCatalogLimits(config.Providers[0], "glm-5.3", "Zhipu AI (China) - Coding Plan/glm-5.3");

    assert.equal(glm?.contextWindow, expected.contextWindow);
    assert.equal(glm?.maxTokens, expected.maxTokens);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function expectedPiCatalogLimits(provider, model, selector) {
  const catalogEntry = findProviderModelCatalogEntry(provider, model, [selector]);
  const providerMetadata = provider.modelMetadata?.[model];
  return {
    contextWindow: providerMetadata?.contextWindow ?? providerMetadata?.maxContextWindow ?? modelCatalogMaxInputTokens(catalogEntry),
    maxTokens: providerMetadata?.maxOutputTokens ?? catalogEntry?.limits?.maxTokens ?? catalogEntry?.limits?.outputTokens
  };
}
