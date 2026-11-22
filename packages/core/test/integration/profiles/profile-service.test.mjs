import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeWorkbuddyModelsConfig } from "@llmr/core/agents/codex/app-launch.ts";
import { resolveGrokSourceHome } from "@llmr/core/agents/grok/profile-config.ts";
import { resolveKimiSourceHome } from "@llmr/core/agents/kimi/profile-config.ts";
import { writePiGatewayConfig } from "@llmr/core/agents/pi/profile-config.ts";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { loadPersistedApiKeys, replacePersistedApiKeys, replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { CONFIGDIR } from "@llmr/core/config/constants.ts";
import { applyProfileConfig, applyProfileRuntimeConfig, cleanupGeneratedBinBackups, reconcileProfileApiKeys, recoverGlobalAgentProfile, restoreInactiveGlobalProfileConfigs, restoreGlobalProfileConfigsOnExit, restoreTakeoversWhenNoGatewayServes } from "@llmr/core/profiles/service.ts";

test("Grok profile source home follows profile and process environment overrides", () => {
  const previous = {
    GROK_CONFIG_DIR: process.env.GROK_CONFIG_DIR,
    GROK_HOME: process.env.GROK_HOME,
    GROK_STORAGE_DIR: process.env.GROK_STORAGE_DIR
  };
  try {
    process.env.GROK_HOME = "/tmp/process-grok-home";
    process.env.GROK_STORAGE_DIR = "/tmp/process-grok-storage";
    process.env.GROK_CONFIG_DIR = "/tmp/process-grok-config";
    assert.equal(resolveGrokSourceHome({ env: {} }), path.resolve("/tmp/process-grok-home"));
    assert.equal(resolveGrokSourceHome({ env: { GROK_HOME: "/tmp/profile-grok-home" } }), path.resolve("/tmp/profile-grok-home"));
    assert.equal(resolveGrokSourceHome({ env: { GROK_STORAGE_DIR: "/tmp/profile-grok-storage" } }), path.resolve("/tmp/profile-grok-storage"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("Kimi profile source home follows profile and process environment overrides", () => {
  const previous = process.env.KIMI_CODE_HOME;
  try {
    process.env.KIMI_CODE_HOME = "/tmp/process-kimi-home";
    assert.equal(resolveKimiSourceHome({ env: {} }), path.resolve("/tmp/process-kimi-home"));
    assert.equal(resolveKimiSourceHome({ env: { KIMI_CODE_HOME: "/tmp/profile-kimi-home" } }), path.resolve("/tmp/profile-kimi-home"));
    assert.equal(resolveKimiSourceHome({ env: { LLMR_KIMI_SOURCE_HOME: "/tmp/profile-kimi-source" } }), path.resolve("/tmp/profile-kimi-source"));
  } finally {
    if (previous === undefined) {
      delete process.env.KIMI_CODE_HOME;
    } else {
      process.env.KIMI_CODE_HOME = previous;
    }
  }
});

test("profile service cleans stale generated bin backups only", () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "llmr-generated-bin-cleanup-"));
  try {
    const binDir = path.join(configDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const deletedFiles = [
      "llmr-claude-code-api-key-default.llmr-backup-2026-01-01T00-00-00-000Z",
      "llmr-claude-code-wif-token-default.llmr-backup-2026-01-01T00-00-00-000Z",
      "llmr-claude-code-wrapper-default.llmr-original",
      "llmr-codex-cli-stdio-default.llmr-original-missing",
      "llmr-codex-cli-middleware.js.llmr-backup-2026-01-01T00-00-00-000Z",
      "llmr-pi-wrapper-default.llmr-original",
      "toolhub-mcp.js.llmr-backup-2026-01-01T00-00-00-000Z"
    ];
    const keptFiles = [
      "custom-tool.llmr-backup-2026-01-01T00-00-00-000Z",
      "notes.txt"
    ];
    for (const file of [...deletedFiles, ...keptFiles]) {
      writeFileSync(path.join(binDir, file), "old");
    }

    assert.equal(cleanupGeneratedBinBackups(configDir), deletedFiles.length);
    for (const file of deletedFiles) {
      assert.equal(existsSync(path.join(binDir, file)), false);
    }
    for (const file of keptFiles) {
      assert.equal(existsSync(path.join(binDir, file)), true);
    }
  } finally {
    rmSync(configDir, { force: true, recursive: true });
  }
});

test("profile service preserves user statusLine when the active global Claude takeover marker is unchanged", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-statusline-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(`${settingsFile}.llmr-original`, `${JSON.stringify({
      env: {
        USER_VALUE: "kept"
      },
      theme: "dark"
    }, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/llmr-claude-code-api-key-statusline-test",
      currentOnly: "kept",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456",
        USER_VALUE: "kept"
      },
      statusLine: {
        command: "ccstatusline",
        type: "command"
      }
    }, null, 2)}\n`);

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif"
      },
      id: "default-claude-code",
      model: "Provider/model",
      name: "Claude Code",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    mkdirSync(path.dirname(takeoverFile), { recursive: true });
    writeFileSync(takeoverFile, `${JSON.stringify({
      profiles: [{
        agent: "claude-code",
        id: profile.id,
        name: profile.name,
        settingsFile
      }],
      version: 1
    }, null, 2)}\n`);

    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-statusline-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-statusline-test",
      name: "Profile: Claude Code"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.ok), true);
    const current = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.deepEqual(current.statusLine, {
      command: "ccstatusline",
      type: "command"
    });
    assert.equal(current.apiKeyHelper, undefined);
    assert.equal(current.currentOnly, "kept");
    assert.equal(current.theme, undefined);
    assert.equal(current.env.USER_VALUE, "kept");
    assert.equal(current.env.ANTHROPIC_MODEL, "Provider/model");
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service writes global Claude settings under the runtime home, never the process HOME", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const runtimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const processHome = mkdtempSync(path.join(os.tmpdir(), "llmr-process-home-"));
  const previousEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const processSettingsFile = path.join(processHome, ".claude", "settings.json");
  const runtimeSettingsFile = path.join(runtimeHome, ".claude", "settings.json");
  const untouched = `${JSON.stringify({ theme: "dark" }, null, 2)}\n`;
  try {
    rmSync(takeoverFile, { force: true });
    mkdirSync(path.dirname(processSettingsFile), { recursive: true });
    writeFileSync(processSettingsFile, untouched);
    mkdirSync(path.dirname(runtimeSettingsFile), { recursive: true });
    writeFileSync(runtimeSettingsFile, "{}\n");
    process.env.HOME = processHome;
    process.env.USERPROFILE = processHome;

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "default-claude-code",
      model: "Provider/model",
      name: "Claude Code",
      scope: "global",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-runtime-home-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-runtime-home-test",
      name: "Profile: Claude Code"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.ok), true);
    assert.equal(readFileSync(processSettingsFile, "utf8"), untouched);
    assert.deepEqual(readdirSync(path.dirname(processSettingsFile)), ["settings.json"]);
    const helperFile = path.join(CONFIGDIR, "bin", "llmr-claude-code-api-key-default-claude-code");
    const written = JSON.parse(readFileSync(runtimeSettingsFile, "utf8"));
    assert.equal(written.apiKeyHelper, process.platform === "win32" ? `"${helperFile}"` : helperFile);
  } finally {
    restoreEnv("HOME", previousEnv.HOME);
    restoreEnv("USERPROFILE", previousEnv.USERPROFILE);
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(path.dirname(runtimeSettingsFile), { force: true, recursive: true });
    rmSync(processHome, { force: true, recursive: true });
  }
});

test("profile keys exist before any gateway runs, and a profile switched off loses its key", async () => {
  await replacePersistedApiKeys([{ id: "user-key", key: "llmr-user-key-0123456789", name: "Mine" }]);
  try {
    const config = configWithProviderAndEnabledProfile("default-claude-code");
    await reconcileProfileApiKeys(config);
    const profileKey = config.APIKEYS.find((key) => key.name === "Profile: Claude Code");
    assert.match(profileKey?.key ?? "", /^llmr-profile-/);
    assert.deepEqual(config.APIKEYS.map((key) => key.id), ["user-key", "profile:default-claude-code"]);
    assert.deepEqual((await loadAppConfig()).APIKEYS.map((key) => key.id), ["user-key", "profile:default-claude-code"]);
    assert.equal(existsSync(path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude", "settings.json")), false);

    await reconcileProfileApiKeys(config);
    assert.equal(config.APIKEYS.find((key) => key.name === "Profile: Claude Code")?.key, profileKey.key);

    config.profile.profiles.find((profile) => profile.id === "default-claude-code").enabled = false;
    await reconcileProfileApiKeys(config);
    assert.deepEqual(config.APIKEYS.map((key) => key.id), ["user-key"]);
    assert.deepEqual((await loadAppConfig()).APIKEYS.map((key) => key.id), ["user-key"]);
  } finally {
    await replacePersistedApiKeys([]);
  }
});

test("a profile gets no key while no provider offers a model", async () => {
  await replacePersistedApiKeys([]);
  const config = configWithProviderAndEnabledProfile("default-claude-code");
  config.Providers = [];
  await reconcileProfileApiKeys(config);
  assert.deepEqual(config.APIKEYS.map((key) => key.id), []);
  assert.deepEqual((await loadAppConfig()).APIKEYS.map((key) => key.id).filter((id) => id.startsWith("profile:")), []);
});

test("enabling the default Claude Code profile leaves the user's ~/.codex/config.toml byte for byte unchanged", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const runtimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const claudeDir = path.join(runtimeHome, ".claude");
  const codexDir = path.join(runtimeHome, ".codex");
  const codexConfigFile = path.join(codexDir, "config.toml");
  const userCodexConfig = "model = \"gpt-5\"\nmodel_provider = \"openai\"\n";
  try {
    rmSync(takeoverFile, { force: true });
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(codexConfigFile, userCodexConfig);

    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-chosen-agent-test";
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles.find((profile) => profile.id === "default-claude-code").enabled = true;

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.ok), true);
    assert.match(readFileSync(path.join(claudeDir, "settings.json"), "utf8"), /apiKeyHelper/);
    assert.equal(readFileSync(codexConfigFile, "utf8"), userCodexConfig);
    assert.deepEqual(readdirSync(codexDir), ["config.toml"]);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(claudeDir, { force: true, recursive: true });
    rmSync(codexDir, { force: true, recursive: true });
  }
});

test("profile service does not overwrite invalid global Claude settings JSON", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-invalid-settings-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const invalidContent = "{\n  \"statusLine\": {\n";
    writeFileSync(settingsFile, invalidContent);

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "invalid-claude-settings",
      model: "Provider/model",
      name: "Invalid Claude Settings",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-invalid-settings-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-invalid-settings-test",
      name: "Profile: Invalid Claude Settings"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const result = await applyProfileFixture(config);
    const status = result.clients.find((client) => client.client === "claude-code");
    assert.equal(status?.ok, false);
    assert.match(status?.message ?? "", /not valid JSON/);
    assert.equal(readFileSync(settingsFile, "utf8"), invalidContent);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service refuses to apply a Claude Code profile when the settings file pins Claude Code to a cloud gateway", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-gateway-pinned-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const pinned = { forceLoginGatewayUrl: "http://127.0.0.1:18080", forceLoginMethod: "gateway" };
    writeFileSync(settingsFile, `${JSON.stringify(pinned, null, 2)}\n`);

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "gateway-pinned-claude",
      model: "Provider/model",
      name: "Gateway Pinned Claude",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-gateway-pinned-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-gateway-pinned-test",
      name: "Profile: Gateway Pinned Claude"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const result = await applyProfileFixture(config);
    const status = result.clients.find((client) => client.client === "claude-code");
    assert.equal(status?.ok, false);
    assert.match(status?.message ?? "", /forceLoginMethod/);
    assert.ok((status?.message ?? "").includes(settingsFile));
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), pinned);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service refuses to apply a Claude Code profile when a managed settings file pins Claude Code to a cloud gateway", { skip: !process.env.LLMR_INTERNAL_HOME_DIR || !process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-managed-pinned-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const managedDir = process.env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR;
  const managedFile = path.join(managedDir, "managed-settings.json");
  try {
    rmSync(takeoverFile, { force: true });
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(managedFile, JSON.stringify({ allowedProviders: ["gateway"] }));
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, "{}\n");

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "managed-pinned-claude",
      model: "Provider/model",
      name: "Managed Pinned Claude",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-managed-pinned-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-managed-pinned-test",
      name: "Profile: Managed Pinned Claude"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const result = await applyProfileFixture(config);
    const status = result.clients.find((client) => client.client === "claude-code");
    assert.equal(status?.ok, false);
    assert.match(status?.message ?? "", /allowedProviders/);
    assert.ok((status?.message ?? "").includes(managedFile));
    assert.equal(readFileSync(settingsFile, "utf8"), "{}\n");
  } finally {
    rmSync(managedFile, { force: true });
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("a shared-home Claude Code profile never writes ~/.claude and blanks the user's credential and provider env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const userSettingsFile = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude", "settings.json");
  const userSettings = `${JSON.stringify({ env: { ANTHROPIC_API_KEY: "user-key", ANTHROPIC_DEFAULT_OPUS_MODEL: "user-opus", ANTHROPIC_PROFILE: "work", CLAUDE_CODE_USE_BEDROCK: "1" } })}\n`;
  const profile = {
    agent: "claude-code",
    claudeCodeSharedHome: true,
    enabled: true,
    env: {},
    id: "shared-home-claude",
    model: "Provider/model",
    name: "Shared Home Claude",
    scope: "llmr",
    smallFastModel: "",
    surface: "cli"
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-shared-home-test";
  config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-profile-shared-home-test", name: "Profile: Shared Home Claude" }];
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  try {
    mkdirSync(path.dirname(userSettingsFile), { recursive: true });
    writeFileSync(userSettingsFile, userSettings);

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.find((client) => client.client === "claude-code")?.ok, true);
    assert.equal(readFileSync(userSettingsFile, "utf8"), userSettings);
    const settings = JSON.parse(readFileSync(path.join(CONFIGDIR, "profiles", profile.id, "claude", "settings.json"), "utf8"));
    assert.equal(settings.env.ANTHROPIC_API_KEY, "");
    assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "");
    assert.equal(settings.env.CLAUDE_CODE_USE_BEDROCK, "");
    assert.equal(settings.env.ANTHROPIC_PROFILE, "");
    assert.equal(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "");
    assert.equal(settings.env.ANTHROPIC_MODEL, "Provider/model");
    assert.deepEqual(Object.keys(settings.env).filter((key) => key.startsWith("CODEXL_")), []);
    assert.equal(settings.env.ANTHROPIC_BASE_URL, `http://127.0.0.1:${config.gateway.port}`);
    assert.ok(settings.apiKeyHelper);
    if (process.platform !== "win32") {
      const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}`), "utf8");
      assert.equal(wrapper.includes("CLAUDE_CONFIG_DIR"), false);
      assert.match(wrapper, /LLMR_CLAUDE_CODE_SETTINGS_FILE=/);
    }
    assert.equal(existsSync(path.join(CONFIGDIR, "profiles", profile.id, "claude", ".claude.json")), false);
    assert.equal(existsSync(path.join(CONFIGDIR, "global-profile-takeover.json")), false);
    assert.deepEqual(restoreGlobalProfileConfigsOnExit(config.profile.profiles), []);
    await restoreTakeoversWhenNoGatewayServes();
    assert.equal(readFileSync(userSettingsFile, "utf8"), userSettings);

    writeFileSync(userSettingsFile, JSON.stringify({ forceLoginMethod: "gateway" }));
    const refused = (await applyProfileFixture(config)).clients.find((client) => client.client === "claude-code");
    assert.equal(refused?.ok, false);
    assert.ok((refused?.message ?? "").includes(userSettingsFile));

    writeFileSync(userSettingsFile, userSettings);
    const relocatedDir = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-config-dir-"));
    writeFileSync(path.join(relocatedDir, "settings.json"), JSON.stringify({ forceLoginMethod: "gateway" }));
    process.env.CLAUDE_CONFIG_DIR = relocatedDir;
    try {
      const relocated = (await applyProfileFixture(config)).clients.find((client) => client.client === "claude-code");
      assert.equal(relocated?.ok, false);
      assert.ok((relocated?.message ?? "").includes(path.join(relocatedDir, "settings.json")));
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
      rmSync(relocatedDir, { force: true, recursive: true });
    }
  } finally {
    rmSync(path.dirname(userSettingsFile), { force: true, recursive: true });
    rmSync(path.join(CONFIGDIR, "profiles", profile.id), { force: true, recursive: true });
  }
});

test("a global Claude Code profile on the default ~/.claude unsets CLAUDE_CONFIG_DIR and writes no .claude.json", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = process.env.LLMR_INTERNAL_HOME_DIR;
  assert.equal(os.homedir(), home);
  const claudeDir = path.join(home, ".claude");
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const profile = {
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "default-home-claude",
    model: "Provider/model",
    name: "Default Home Claude",
    scope: "global",
    smallFastModel: "",
    surface: "cli"
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-default-home-test";
  config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-profile-default-home-test", name: "Profile: Default Home Claude" }];
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  try {
    rmSync(takeoverFile, { force: true });
    const result = await applyProfileFixture(config);
    assert.equal(result.clients.find((client) => client.client === "claude-code")?.ok, true);
    assert.ok(existsSync(path.join(claudeDir, "settings.json")));
    assert.equal(existsSync(path.join(claudeDir, ".claude.json")), false);
    assert.equal(existsSync(path.join(home, ".claude.json")), false);
    const extension = process.platform === "win32" ? ".cmd" : "";
    const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}${extension}`), "utf8");
    if (process.platform === "win32") {
      assert.match(wrapper, /^set CLAUDE_CONFIG_DIR=\r?$/m);
    } else {
      assert.match(wrapper, /^unset CLAUDE_CONFIG_DIR$/m);
      assert.doesNotMatch(wrapper, /export CLAUDE_CONFIG_DIR=/);
    }
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(claudeDir, { force: true, recursive: true });
  }
});

test("a default-home Claude Code profile leaves ~/.claude.json and ~/.claude/.claude.json byte-identical through apply and disable", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = process.env.LLMR_INTERNAL_HOME_DIR;
  assert.equal(os.homedir(), home);
  const claudeDir = path.join(home, ".claude");
  const stateFile = path.join(home, ".claude.json");
  const nestedFile = path.join(claudeDir, ".claude.json");
  const state = "{\"keep\":\"home-state\"}\n";
  const nested = "{\"keep\":\"nested-state\"}\n";
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(stateFile, state);
  writeFileSync(nestedFile, nested);
  const { config, profile } = defaultHomeClaudeFixture("default-home-files");
  try {
    const applied = (await applyProfileFixture(config)).clients.find((client) => client.client === "claude-code");
    assert.equal(applied?.ok, true);
    assert.match(applied?.message ?? "", /Claude Code uses its own auto-compact windows for this profile\.$/);
    assert.equal(readFileSync(stateFile, "utf8"), state);
    assert.equal(readFileSync(nestedFile, "utf8"), nested);
    profile.enabled = false;
    await applyProfileFixture(config);
    assert.equal(readFileSync(stateFile, "utf8"), state);
    assert.equal(readFileSync(nestedFile, "utf8"), nested);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(claudeDir, { force: true, recursive: true });
    rmSync(stateFile, { force: true });
  }
});

test("a default-home Claude Code profile writes a cmd wrapper that clears CLAUDE_CONFIG_DIR", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = process.env.LLMR_INTERNAL_HOME_DIR;
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const { config, profile } = defaultHomeClaudeFixture("default-home-cmd");
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    const applied = (await applyProfileFixture(config)).clients.find((client) => client.client === "claude-code");
    Object.defineProperty(process, "platform", platform);
    assert.equal(applied?.ok, true);
    const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}.cmd`), "utf8");
    assert.match(wrapper, /^set CLAUDE_CONFIG_DIR=\r?$/m);
    assert.doesNotMatch(wrapper, /^set CLAUDE_CONFIG_DIR=[^\r\n]/m);
  } finally {
    Object.defineProperty(process, "platform", platform);
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}.cmd`), { force: true });
    rmSync(path.join(home, ".claude"), { force: true, recursive: true });
  }
});

test("a global Claude Code profile with its own settings file keeps CLAUDE_CONFIG_DIR and its auto-compact cache", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = process.env.LLMR_INTERNAL_HOME_DIR;
  const dir = path.join(home, ".claude-work");
  const { config, profile } = defaultHomeClaudeFixture("own-home-claude", { settingsFile: "~/.claude-work/settings.json" });
  try {
    const applied = (await applyProfileFixture(config)).clients.find((client) => client.client === "claude-code");
    assert.equal(applied?.ok, true);
    assert.doesNotMatch(applied?.message ?? "", /own auto-compact windows/);
    assert.ok(JSON.parse(readFileSync(path.join(dir, ".claude.json"), "utf8")).autoCompactWindowsCache);
    const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}`), "utf8");
    assert.ok(wrapper.split("\n").includes(`export CLAUDE_CONFIG_DIR='${dir}'`));
    assert.doesNotMatch(wrapper, /^unset CLAUDE_CONFIG_DIR$/m);
    assert.equal(existsSync(path.join(home, ".claude.json")), false);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a default-home Claude Code profile's sh wrapper unsets CLAUDE_CONFIG_DIR after any profile value", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = process.env.LLMR_INTERNAL_HOME_DIR;
  const { config, profile } = defaultHomeClaudeFixture("default-home-order", { env: { CLAUDE_CONFIG_DIR: "/somewhere/else" } });
  try {
    await applyProfileFixture(config);
    const lines = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-${profile.id}`), "utf8").split("\n");
    const unsetAt = lines.indexOf("unset CLAUDE_CONFIG_DIR");
    assert.ok(unsetAt > 0);
    assert.deepEqual(lines.slice(unsetAt + 1).filter((line) => line.includes("CLAUDE_CONFIG_DIR")), []);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(path.join(home, ".claude"), { force: true, recursive: true });
  }
});

test("a saved config with the top-level profile flag stuck off still applies its enabled profile", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-profile-disabled-"));
  try {
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      env: {
        USER_VALUE: "kept"
      },
      permissions: {
        allow: ["Bash(echo:*)"]
      }
    }, null, 2)}\n`);

    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "top-level-disabled-claude-settings",
      model: "Provider/model",
      name: "Top Level Disabled Claude Settings",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-disabled-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-disabled-test",
      name: "Profile: Top Level Disabled Claude Settings"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = false;
    config.profile.profiles = [profile];

    await replacePersistedAppConfig(config);

    const result = await applyProfileFixture(await loadAppConfig());
    const status = result.clients.find((client) => client.client === "claude-code");
    assert.equal(result.enabled, true);
    assert.equal(status?.enabled, true);
    assert.equal(status?.ok, true);
    const current = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(typeof current.apiKeyHelper, "string");
    assert.equal(current.env.USER_VALUE, "kept");
    assert.deepEqual(current.permissions, {
      allow: ["Bash(echo:*)"]
    });
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service does not rewrite user Claude settings for stale legacy profile flags without profiles", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-stale-legacy-profile-home-"));
  const previousHome = process.env.HOME;
  const previousRuntimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    process.env.HOME = home;
    process.env.LLMR_INTERNAL_HOME_DIR = home;
    assert.equal(os.homedir(), home);
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const originalSettings = `${JSON.stringify({
      env: {
        USER_VALUE: "original"
      },
      theme: "dark"
    }, null, 2)}\n`;
    const backupSettings = `${JSON.stringify({
      env: {
        USER_VALUE: "backup"
      },
      outputStyle: "backup"
    }, null, 2)}\n`;
    const userSettings = `${JSON.stringify({
      apiKeyHelper: "/home/user/.llm-router/bin/llmr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456",
        USER_VALUE: "kept"
      },
      model: "user-model",
      outputStyle: "concise",
      permissions: {
        allow: ["Bash(echo:*)"]
      }
    }, null, 2)}\n`;
    writeFileSync(`${settingsFile}.llmr-original`, originalSettings);
    writeFileSync(`${settingsFile}.llmr-backup-2026-07-28T16-26-39-119Z`, backupSettings);
    writeFileSync(settingsFile, userSettings);
    mkdirSync(path.dirname(takeoverFile), { recursive: true });
    writeFileSync(takeoverFile, `${JSON.stringify({
      profiles: [{
        agent: "claude-code",
        id: "default-claude-code",
        name: "Claude Code",
        settingsFile: "~/.claude/settings.json"
      }],
      version: 1
    }, null, 2)}\n`);
    const backupNames = readdirSync(path.dirname(settingsFile)).filter((name) => name.startsWith("settings.json.llmr-backup-")).sort();

    const staleLegacyConfig = createDefaultAppConfig();
    staleLegacyConfig.profile.enabled = true;
    staleLegacyConfig.profile.claudeCode.enabled = true;
    staleLegacyConfig.profile.claudeCode.settingsFile = "~/.claude/settings.json";
    staleLegacyConfig.profile.codex.enabled = true;
    staleLegacyConfig.profile.profiles = [];
    await replacePersistedAppConfig(staleLegacyConfig);

    const loadedConfig = await loadAppConfig();
    assert.equal(loadedConfig.profile.enabled, false);
    assert.equal(loadedConfig.profile.claudeCode.enabled, false);
    assert.equal(loadedConfig.profile.codex.enabled, false);
    assert.deepEqual(loadedConfig.profile.profiles, []);

    const result = await applyProfileFixture(loadedConfig);
    assert.equal(result.enabled, false);
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), {
      env: { USER_VALUE: "kept" },
      model: "user-model",
      outputStyle: "concise",
      permissions: { allow: ["Bash(echo:*)"] }
    });
    assert.equal(
      readdirSync(path.dirname(settingsFile)).filter((name) => name.startsWith("settings.json.llmr-backup-")).length,
      backupNames.length + 1
    );
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(home, { force: true, recursive: true });
    restoreEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeHome);
    restoreEnv("HOME", previousHome);
  }
});

test("profile service does not rewrite Claude settings when only user-managed fields change", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-user-fields-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(root, ".claude", "settings.json");
    const profile = {
      agent: "claude-code",
      enabled: true,
      env: {
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif"
      },
      id: "user-fields-claude-settings",
      model: "Provider/model",
      name: "User Fields Claude Settings",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-user-fields-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-user-fields-test",
      name: "Profile: User Fields Claude Settings"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const initialResult = await applyProfileFixture(config);
    assert.equal(initialResult.clients.some((client) => client.client === "claude-code" && client.ok), true);
    const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
    settings.apiKeyHelper = "/usr/local/bin/custom-claude-helper";
    settings.disableAllHooks = true;
    settings.statusLine = {
      command: "ccstatusline",
      type: "command"
    };
    const userEditedContent = JSON.stringify(settings);
    writeFileSync(settingsFile, userEditedContent);

    const secondResult = await applyProfileFixture(config);
    assert.equal(secondResult.clients.some((client) => client.client === "claude-code" && client.ok), true);
    assert.equal(readFileSync(settingsFile, "utf8"), userEditedContent);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service restores between-session user edits after many takeover rewrites prune old backups", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-opencode-prune-restore-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const configFile = path.join(root, "opencode.json");
    writeFileSync(configFile, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`);
    const models = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
    const profile = {
      agent: "opencode",
      configFile,
      enabled: true,
      id: "prune-restore-opencode",
      model: "Provider/m1",
      name: "Prune Restore OpenCode",
      scope: "global"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-prune-restore-test";
    config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-prune-restore-test", name: "Profile: Prune Restore OpenCode" }];
    config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models, name: "Provider" }];

    config.profile.enabled = true;
    config.profile.profiles = [profile];
    await applyProfileFixture(config);
    config.profile.enabled = true;
    config.profile.profiles = [{ ...profile, enabled: false }];
    await applyProfileFixture(config);
    const userEdit = { theme: "light" };
    writeFileSync(configFile, `${JSON.stringify(userEdit, null, 2)}\n`);

    for (const model of models) {
      config.profile.enabled = true;
      config.profile.profiles = [{ ...profile, model: `Provider/${model}` }];
      await applyProfileFixture(config);
    }
    const backups = readdirSync(root).filter((name) => name.startsWith("opencode.json.llmr-backup-"));
    assert.equal(backups.length, 6);

    config.profile.enabled = true;
    config.profile.profiles = [{ ...profile, enabled: false }];
    await applyProfileFixture(config);
    assert.deepEqual(JSON.parse(readFileSync(configFile, "utf8")), userEdit);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service restores between-session ZCode edits after many takeover rewrites prune old backups", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-zcode-prune-restore-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const configFile = path.join(root, ".zcode", "cli", "config.json");
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, `${JSON.stringify({ model: { main: "builtin:zai/glm-5" } }, null, 2)}\n`);
    const models = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
    const profile = {
      agent: "zcode",
      configFile,
      enabled: true,
      env: {},
      id: "prune-restore-zcode",
      model: "Provider/m1",
      name: "Prune Restore ZCode",
      providerId: "llm-router",
      scope: "global",
      surface: "cli"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-prune-restore-test";
    config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-prune-restore-test", name: "Profile: Prune Restore ZCode" }];
    config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models, name: "Provider" }];

    config.profile.enabled = true;
    config.profile.profiles = [profile];
    await applyProfileFixture(config);
    config.profile.enabled = true;
    config.profile.profiles = [{ ...profile, enabled: false }];
    await applyProfileFixture(config);
    const userEdit = { model: { main: "builtin:zai/glm-6" } };
    writeFileSync(configFile, `${JSON.stringify(userEdit, null, 2)}\n`);

    for (const model of models) {
      config.profile.enabled = true;
      config.profile.profiles = [{ ...profile, model: `Provider/${model}` }];
      await applyProfileFixture(config);
    }
    const backups = readdirSync(path.dirname(configFile)).filter((name) => name.startsWith("config.json.llmr-backup-"));
    assert.equal(backups.length, 6);

    config.profile.enabled = true;
    config.profile.profiles = [{ ...profile, enabled: false }];
    await applyProfileFixture(config);
    assert.deepEqual(JSON.parse(readFileSync(configFile, "utf8")), userEdit);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("ZCode wrapper exports the workspace name under its LLMR_ name", { skip: process.platform === "win32" || !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-zcode-workspace-name-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const configFile = path.join(root, ".zcode", "cli", "config.json");
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, `${JSON.stringify({ model: { main: "builtin:zai/glm-5" } }, null, 2)}\n`);
    const profile = {
      agent: "zcode",
      cliMiddleware: true,
      configFile,
      enabled: true,
      env: {},
      id: "workspace-name-zcode",
      model: "Provider/m1",
      name: "Workspace Name ZCode",
      providerId: "llm-router",
      scope: "global",
      surface: "cli"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-workspace-name-test";
    config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-workspace-name-test", name: "Profile: Workspace Name ZCode" }];
    config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["m1"], name: "Provider" }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];
    await applyProfileFixture(config);
    const content = readFileSync(path.join(CONFIGDIR, "bin", "llmr-codex-cli-stdio-workspace-name-zcode"), "utf8");
    assert.match(content, /^export LLMR_ZCODE_WORKSPACE_NAME='Workspace Name ZCode'$/m);
    assert.doesNotMatch(content, /CODEXL_/);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service applies and removes profile Claude settings", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-profile-settings-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const profileId = "custom-claude-settings";
  try {
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      env: {
        USER_VALUE: "kept"
      },
      permissions: {
        allow: ["Bash(echo:*)"],
        defaultMode: "ask"
      },
      theme: "dark"
    }, null, 2)}\n`);

    const profile = {
      agent: "claude-code",
      claudeSettings: {
        includeCoAuthoredBy: false,
        permissions: {
          defaultMode: "acceptEdits"
        }
      },
      enabled: true,
      env: {
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif",
        CLAUDE_CODE_MAX_RETRIES: "3"
      },
      id: profileId,
      model: "Provider/model",
      name: "Custom Claude Settings",
      scope: "global",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    };
    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-profile-claude-settings-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profile.id}`,
      key: "llmr-profile-claude-settings-test",
      name: "Profile: Custom Claude Settings"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [profile];

    const firstResult = await applyProfileFixture(config);
    assert.equal(firstResult.clients.some((client) => client.client === "claude-code" && client.ok), true);
    const firstSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(firstSettings.includeCoAuthoredBy, false);
    assert.equal(firstSettings.permissions.defaultMode, "acceptEdits");
    assert.deepEqual(firstSettings.permissions.allow, ["Bash(echo:*)"]);
    assert.equal(firstSettings.theme, "dark");
    assert.equal(firstSettings.env.USER_VALUE, "kept");
    assert.equal(firstSettings.env.CLAUDE_CODE_MAX_RETRIES, "3");

    config.profile.enabled = true;
    config.profile.profiles = [{
      ...profile,
      claudeSettings: {},
      env: {
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif"
      }
    }];
    const secondResult = await applyProfileFixture(config);
    assert.equal(secondResult.clients.some((client) => client.client === "claude-code" && client.ok), true);
    const secondSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(secondSettings.includeCoAuthoredBy, undefined);
    assert.equal(secondSettings.permissions.defaultMode, undefined);
    assert.deepEqual(secondSettings.permissions.allow, ["Bash(echo:*)"]);
    assert.equal(secondSettings.env.CLAUDE_CODE_MAX_RETRIES, undefined);
    assert.equal(secondSettings.env.USER_VALUE, "kept");

    config.profile.enabled = true;
    config.profile.profiles = [profile];
    await applyProfileFixture(config);
    assert.equal(JSON.parse(readFileSync(settingsFile, "utf8")).permissions.defaultMode, "acceptEdits");

    config.profile.enabled = true;
    config.profile.profiles = [{ ...profile, enabled: false }];
    const disabledResult = await applyProfileFixture(config);
    assert.equal(disabledResult.clients.some((client) => client.client === "claude-code" && client.ok), true);
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), {
      env: { USER_VALUE: "kept" },
      permissions: { allow: ["Bash(echo:*)"] },
      theme: "dark"
    });
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service can exclude ZCode from automatic synchronization", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-zcode-auto-sync-"));
  try {
    const configFile = path.join(root, ".zcode", "cli", "config.json");
    const original = `${JSON.stringify({
      model: { main: "builtin:zai/glm-5" },
      provider: { "builtin:zai": { name: "Z.AI" } }
    }, null, 2)}\n`;
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, original);

    const config = createDefaultAppConfig();
    config.profile.enabled = true;
    config.profile.profiles = [
      {
        agent: "zcode",
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFile,
        configFormat: "separate_profile_files",
        enabled: true,
        env: {},
        id: "zcode",
        model: "Provider/model",
        name: "ZCode",
        providerId: "llm-router",
        providerName: "LLM Router",
        scope: "global",
        showAllSessions: false,
        surface: "app"
      }
    ];

    const result = await applyProfileFixture(config, { excludeAgents: ["zcode"] });

    assert.equal(result.enabled, false);
    assert.deepEqual(result.clients, []);
    assert.equal(readFileSync(configFile, "utf8"), original);
    assert.equal(existsSync(path.join(root, ".zcode", "v2", "config.json")), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service overwrites generated bin files without creating backups", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "generated-bin-test";
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wifTokenExtension = process.platform === "win32" ? ".txt" : "";
  const binDir = path.join(CONFIGDIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const legacyApiKeyHelperFile = path.join(binDir, `llmr-claude-code-api-key-${profileId}${commandExtension}`);
  const generatedFiles = [
    path.join(binDir, `llmr-claude-code-wif-token-${profileId}${wifTokenExtension}`),
    path.join(binDir, `llmr-claude-code-wrapper-${profileId}${commandExtension}`),
    path.join(binDir, "llmr-codex-cli-middleware.js"),
    path.join(binDir, "toolhub-mcp.js")
  ];
  const staleClaudeCodeGeneratedFiles = [
    path.join(binDir, `llmr-claude-code-wif-token-stale-claude-code${wifTokenExtension}`),
    path.join(binDir, `llmr-claude-code-wrapper-stale-claude-code${commandExtension}`)
  ];
  writeFileSync(legacyApiKeyHelperFile, "old generated content\n");
  writeFileSync(`${legacyApiKeyHelperFile}.llmr-backup-2026-01-01T00-00-00-000Z`, "old backup\n");
  writeFileSync(`${legacyApiKeyHelperFile}.llmr-original`, "old original\n");
  for (const file of generatedFiles) {
    writeFileSync(file, "old generated content\n");
    writeFileSync(`${file}.llmr-backup-2026-01-01T00-00-00-000Z`, "old backup\n");
    writeFileSync(`${file}.llmr-original`, "old original\n");
  }
  for (const file of staleClaudeCodeGeneratedFiles) {
    writeFileSync(file, "stale generated content\n");
  }

  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      modelMetadata: {
        model: {
          contextWindow: 258400
        },
        long: {
          contextWindow: 1_000_000
        }
      },
      models: ["model", "long"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.toolHub = {
    ...config.toolHub,
    enabled: true,
    llm: {
      ...config.toolHub.llm,
      apiKey: "resolver-key",
      baseUrl: "https://example.test/v1",
      model: "model"
    },
    mcpServers: [
      {
        command: "node",
        name: "backend",
        transport: "stdio"
      }
    ]
  };
  config.contextArchive = {
    ...config.contextArchive,
    enabled: true
  };
  config.APIKEY = "llmr-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-profile-test",
      name: "Profile: Generated Bin Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {
        ANTHROPIC_API_KEY: "profile-api-key",
        ANTHROPIC_AUTH_TOKEN: "profile-auth-token",
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif",
        CLAUDE_CODE_USE_GATEWAY: "1"
      },
      fableModel: "Provider/fable",
      haikuModel: "Provider/haiku",
      id: profileId,
      model: "Provider/long",
      name: "Generated Bin Test",
      opusModel: "Provider/opus",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      sonnetModel: "Provider/sonnet",
      smallFastModel: "",
      surface: "auto"
    }
  ];
  const claudeProfileDir = path.join(CONFIGDIR, "profiles", profileId, "claude");
  mkdirSync(claudeProfileDir, { recursive: true });
  writeFileSync(path.join(claudeProfileDir, ".claude.json"), `${JSON.stringify({ firstStartTime: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`);

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  assert.equal(existsSync(legacyApiKeyHelperFile), false);
  for (const file of generatedFiles) {
    assert.notEqual(readFileSync(file, "utf8"), "old generated content\n");
  }
  for (const file of staleClaudeCodeGeneratedFiles) {
    assert.equal(existsSync(file), false);
  }
  const wifTokenFile = path.join(binDir, `llmr-claude-code-wif-token-${profileId}${wifTokenExtension}`);
  assert.equal(readFileSync(wifTokenFile, "utf8"), "llmr-profile-test\n");
  const wrapperContent = readFileSync(path.join(binDir, `llmr-claude-code-wrapper-${profileId}${commandExtension}`), "utf8");
  assert.equal(wrapperContent.includes("profile-api-key"), false);
  assert.equal(wrapperContent.includes("profile-auth-token"), false);
  assert.equal(wrapperContent.includes("LLMR_REMOTE_SYNC_API_KEY_HELPER"), false);
  assert.equal(wrapperContent.includes("LLMR_REMOTE_SYNC_API_KEY_FILE"), true);
  assert.equal(wrapperContent.includes("ANTHROPIC_FEDERATION_RULE_ID"), true);
  assert.equal(wrapperContent.includes("ANTHROPIC_IDENTITY_TOKEN_FILE"), true);
  assert.equal(wrapperContent.includes("CLAUDE_CODE_USE_GATEWAY=1"), false);
  if (process.platform === "win32") {
    assert.match(wrapperContent, /CLAUDE_CODE_USE_GATEWAY="?/);
  } else {
    assert.match(wrapperContent, /unset CLAUDE_CODE_USE_GATEWAY/);
  }
  const toolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const toolHubMcpConfig = JSON.parse(readFileSync(toolHubMcpConfigFile, "utf8"));
  const toolHubMcpServerEnv = toolHubMcpConfig.mcpServers["llmr-toolhub"].env;
  const contextArchiveMcpServer = toolHubMcpConfig.mcpServers["llmr-context-archive"];
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_API_KEY, "llmr-profile-test");
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_BASE_URL, `http://127.0.0.1:${config.gateway.port}/v1`);
  assert.equal(toolHubMcpServerEnv.TOOLHUB_OPENAI_MODEL, "Provider/model");
  assert.equal(contextArchiveMcpServer, undefined);
  const settingsFile = path.join(claudeProfileDir, "settings.json");
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(settings.apiKeyHelper, undefined);
  assert.equal(settings.env.ANTHROPIC_FEDERATION_RULE_ID, "llmr-local");
  assert.equal(settings.env.ANTHROPIC_ORGANIZATION_ID, "llmr-local");
  assert.equal(settings.env.ANTHROPIC_IDENTITY_TOKEN_FILE, wifTokenFile);
  assert.equal(settings.env.NO_PROXY, "127.0.0.1,localhost,::1");
  assert.equal(settings.env.no_proxy, "127.0.0.1,localhost,::1");
  assert.equal(settings.env.CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT, "1");
  assert.equal(settings.env.ANTHROPIC_MODEL, "Provider/long[1m]");
  assert.equal(settings.env.LLMR_CLAUDE_CODE_MODEL, "Provider/long[1m]");
  assert.equal(settings.env.CODEXL_CLAUDE_CODE_MODEL, undefined);
  assert.equal(settings.env.ANTHROPIC_DEFAULT_FABLE_MODEL, "Provider/fable");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "Provider/opus");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL, "Provider/sonnet");
  assert.equal(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "Provider/haiku");
  assert.equal(settings.env.ANTHROPIC_SMALL_FAST_MODEL, undefined);
  assert.equal(settings.env.CLAUDE_CODE_USE_GATEWAY, undefined);
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(settings.env.ANTHROPIC_API_KEY, undefined);
  assert.match(wrapperContent, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(wrapperContent, /CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT.*1/);
  assert.equal(settings.modelOverrides, undefined);
  const claudeGlobalConfig = JSON.parse(readFileSync(path.join(claudeProfileDir, ".claude.json"), "utf8"));
  assert.equal(claudeGlobalConfig.firstStartTime, "2026-01-01T00:00:00.000Z");
  assert.equal(claudeGlobalConfig.autoCompactWindowsCache["Provider/model"], 258400);
  assert.equal(claudeGlobalConfig.autoCompactWindowsCache["provider/model"], 258400);
  assert.equal(claudeGlobalConfig.autoCompactWindowsCache["Provider/long"], 1_000_000);
  assert.equal(claudeGlobalConfig.autoCompactWindowsCache["Provider/long[1m]"], 1_000_000);
  assert.equal(claudeGlobalConfig.modelOverrides, undefined);
  const backupEntries = readdirSync(binDir).filter((entry) =>
    (
      entry.startsWith(`llmr-claude-code-api-key-${profileId}`) ||
      entry.startsWith(`llmr-claude-code-wif-token-${profileId}`) ||
      entry.startsWith(`llmr-claude-code-wrapper-${profileId}`) ||
      entry.startsWith("llmr-codex-cli-middleware.js") ||
      entry.startsWith("toolhub-mcp.js")
    ) && entry.includes(".llmr-")
  );
  assert.deepEqual(backupEntries, []);
});

test("profile service refreshes LLMR-managed global Claude gateway env for generated profiles", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-generated-claude-global-env-"));
  const previousHome = process.env.HOME;
  const previousRuntimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    process.env.HOME = home;
    process.env.LLMR_INTERNAL_HOME_DIR = home;
    rmSync(takeoverFile, { force: true });
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      alwaysThinkingEnabled: true,
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_FEDERATION_RULE_ID: "llmr-local",
        ANTHROPIC_ORGANIZATION_ID: "llmr-local",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456",
        USER_VALUE: "kept"
      }
    }, null, 2)}\n`);

    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-generated-global-env-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "profile:generated-global-env-test",
      key: "llmr-generated-global-env-test",
      name: "Profile: Generated Global Env Test"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [{
      agent: "claude-code",
      enabled: true,
      env: {
        LLMR_CLAUDE_CODE_AUTH_MODE: "wif"
      },
      id: "generated-global-env-test",
      model: "Provider/model",
      name: "Generated Global Env Test",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }];

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.ok), true);
    const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(settings.alwaysThinkingEnabled, true);
    assert.equal(settings.env.USER_VALUE, "kept");
    assert.equal(settings.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:3456");
    assert.equal(settings.env.ANTHROPIC_API_BASE_URL, "http://127.0.0.1:3456");
    assert.equal(settings.env.CLAUDE_AGENT_API_BASE_URL, "http://127.0.0.1:3456");
    assert.equal(settings.env.NO_PROXY, "127.0.0.1,localhost,::1");
    assert.equal(settings.env.no_proxy, "127.0.0.1,localhost,::1");
    assert.equal(settings.env.CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT, "1");
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(home, { force: true, recursive: true });
    restoreEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeHome);
    restoreEnv("HOME", previousHome);
  }
});

test("#1779 profile service defaults to apiKeyHelper even on Claude Code 2.1.235", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-auth-mode-"));
  const profileId = "old-claude-code";
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wifTokenExtension = process.platform === "win32" ? ".txt" : "";
  try {
    const binDir = path.join(CONFIGDIR, "bin");
    const fakeClaude = path.join(root, process.platform === "win32" ? "claude.cmd" : "claude");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(fakeClaude, process.platform === "win32"
      ? "@echo off\r\necho 2.1.235\r\n"
      : "#!/bin/sh\nprintf '%s\\n' '2.1.235'\n");
    chmodSync(fakeClaude, 0o700);

    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-old-auto-token";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-old-auto-token",
      name: "Profile: Old Claude Code"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [{
      agent: "claude-code",
      enabled: true,
      env: {
        LLMR_CLAUDE_CODE_BIN: fakeClaude
      },
      id: profileId,
      model: "Provider/model",
      name: "Old Claude Code",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }];

    const result = await applyProfileFixture(config);
    assert.equal(result.clients.length, 1);
    assert.equal(result.clients[0].ok, true);

    const helperFile = path.join(binDir, `llmr-claude-code-api-key-${profileId}${commandExtension}`);
    const tokenFile = path.join(binDir, `llmr-claude-code-wif-token-${profileId}${wifTokenExtension}`);
    const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(settings.apiKeyHelper, process.platform === "win32" ? `"${helperFile}"` : helperFile);
    assert.equal(settings.env.ANTHROPIC_IDENTITY_TOKEN_FILE, undefined);
    assert.equal(settings.env.ANTHROPIC_FEDERATION_RULE_ID, undefined);
    assert.equal(settings.env.LLMR_CLAUDE_CODE_AUTH_MODE, undefined);
    assert.equal(readFileSync(tokenFile, "utf8"), "llmr-old-auto-token\n");
    assert.match(readFileSync(helperFile, "utf8"), /llmr-old-auto-token/);
    if (process.platform !== "win32") {
      const helper = spawnSync(helperFile, [], { encoding: "utf8" });
      assert.equal(helper.status, 0);
      assert.equal(helper.stdout.trim(), "llmr-old-auto-token");
    }

    const wrapperContent = readFileSync(path.join(binDir, `llmr-claude-code-wrapper-${profileId}${commandExtension}`), "utf8");
    assert.equal(wrapperContent.includes("ANTHROPIC_IDENTITY_TOKEN_FILE"), false);
    assert.equal(wrapperContent.includes("LLMR_REMOTE_SYNC_API_KEY_FILE"), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("#1798 profile service removes boolean autoMode when apiKeyHelper manages authentication", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "claude-auto-mode-api-key-helper";
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-auto-mode-api-key-helper-test";
  config.APIKEYS = [{
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `profile:${profileId}`,
    key: "llmr-auto-mode-api-key-helper-test",
    name: "Profile: Claude Auto Mode API Key Helper Test"
  }];
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    api_key: "provider-key",
    models: ["model"],
    name: "Provider"
  }];
  config.profile.enabled = true;
  config.profile.profiles = [{
    agent: "claude-code",
    claudeSettings: {
      autoCompactEnabled: true,
      autoMemoryEnabled: true,
      autoMode: true
    },
    enabled: true,
    env: {},
    id: profileId,
    model: "Provider/model",
    name: "Claude Auto Mode API Key Helper",
    scope: "llmr",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    surface: "auto"
  }];

  await applyProfileFixture(config);
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const firstSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(firstSettings.autoMode, undefined, "persisted boolean autoMode must not override helper auth");
  assert.equal(firstSettings.autoMemoryEnabled, true);
  assert.equal(firstSettings.autoCompactEnabled, true);
  assert.match(firstSettings.apiKeyHelper, /llmr-claude-code-api-key-/);

  writeFileSync(settingsFile, `${JSON.stringify({ ...firstSettings, autoMode: true }, null, 2)}\n`);
  await applyProfileFixture(config);
  const secondSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(secondSettings.autoMode, undefined, "a session-written boolean autoMode must be removed on the next apply");
  assert.match(secondSettings.apiKeyHelper, /llmr-claude-code-api-key-/);

  config.profile.profiles[0].claudeSettings.autoMode = { classifyAllShell: true };
  await applyProfileFixture(config);
  const structuredSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.deepEqual(structuredSettings.autoMode, { classifyAllShell: true });
});

test("Codex profile launcher bypasses middleware for Browser and Computer Use helpers", { skip: process.platform === "win32" || !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-browser-helper-bypass-"));
  const profileId = "browser-helper-bypass-test";
  try {
    const fakeCodex = path.join(root, "real-codex");
    writeFileSync(fakeCodex, [
      "#!/bin/sh",
      "printf '%s|%s|%s|cli_path=%s\\n' \"$1\" \"$2\" \"$3\" \"${CODEX_CLI_PATH:-}\"",
      ""
    ].join("\n"));
    chmodSync(fakeCodex, 0o700);

    const config = createDefaultAppConfig();
    config.APIKEY = "llmr-browser-helper-test";
    config.APIKEYS = [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: config.APIKEY,
      name: "Profile: Browser Helper Bypass"
    }];
    config.Providers = [{
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }];
    config.profile.enabled = true;
    config.profile.profiles = [{
      agent: "codex",
      cliMiddleware: true,
      codexCliPath: fakeCodex,
      codexHome: "",
      configFile: "",
      configFormat: "separate_profile_files",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Browser Helper Bypass",
      providerId: "llm-router",
      providerName: "LLM Router",
      scope: "llmr",
      showAllSessions: false,
      surface: "app"
    }];

    const applied = await applyProfileFixture(config);
    assert.equal(applied.clients[0].ok, true);
    const launcher = path.join(CONFIGDIR, "bin", `llmr-codex-cli-stdio-${profileId}`);
    const content = readFileSync(launcher, "utf8");
    assert.match(content, /^export LLMR_CODEX_WORKSPACE_NAME='Browser Helper Bypass'$/m);
    assert.ok(content.includes("LLMR_BUNDLED_CODEX_CLI_PATH"));
    assert.ok(content.includes("app-server' ] && [ \"${2:-}\" = '--listen'"));

    const result = spawnSync(launcher, ["app-server", "--listen", "stdio://"], {
      encoding: "utf8",
      env: {
        ...process.env,
        LLMR_BUNDLED_CODEX_CLI_PATH: "",
        LLMR_REAL_CODEX_CLI_PATH: "",
        CODEX_CLI_PATH: launcher
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "app-server|--listen|stdio://|cli_path=\n");

    const sandboxResult = spawnSync(launcher, ["sandbox"], {
      encoding: "utf8",
      env: {
        ...process.env,
        LLMR_BUNDLED_CODEX_CLI_PATH: "",
        LLMR_REAL_CODEX_CLI_PATH: "",
        CODEX_CLI_PATH: launcher
      }
    });
    assert.equal(sandboxResult.status, 0, sandboxResult.stderr);
    assert.equal(sandboxResult.stdout, "sandbox|||cli_path=\n");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service injects ToolHub MCP into Codex config", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "codex-toolhub-test";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.toolHub = {
    ...config.toolHub,
    enabled: true,
    llm: {
      ...config.toolHub.llm,
      apiKey: "resolver-key",
      baseUrl: "https://example.test/v1",
      model: "model"
    },
    mcpServers: [
      {
        command: "node",
        name: "backend",
        transport: "stdio"
      }
    ]
  };
  config.APIKEY = "llmr-codex-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-codex-profile-test",
      name: "Profile: Codex ToolHub Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "codex",
      cliMiddleware: false,
      codexCliPath: "",
      codexHome: "",
      configFile: "",
      configFormat: "legacy",
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/model",
      name: "Codex ToolHub Test",
      providerId: "llm-router",
      providerName: "LLM Router",
      scope: "llmr",
      showAllSessions: false,
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);

  const configFile = path.join(CONFIGDIR, "profiles", profileId, "codex", "config.toml");
  const content = readFileSync(configFile, "utf8");
  assert.match(content, /# BEGIN LLMR managed ToolHub MCP/);
  assert.match(content, /# LLMR configured model = "Provider\/model"/);
  assert.match(content, /\[mcp_servers\.llmr-toolhub\]/);
  assert.equal(content.includes(`command = ${JSON.stringify(process.execPath)}`), true);
  assert.equal(content.includes(`args = [${JSON.stringify(path.join(CONFIGDIR, "bin", "toolhub-mcp.js"))}]`), true);
  assert.match(content, /\[mcp_servers\.llmr-toolhub\.env\]/);
  assert.match(content, /TOOLHUB_OPENAI_API_KEY = "llmr-codex-profile-test"/);
  assert.match(content, new RegExp(`TOOLHUB_OPENAI_BASE_URL = "http://127\\.0\\.0\\.1:${config.gateway.port}/v1"`));
  assert.match(content, /TOOLHUB_OPENAI_MODEL = "Provider\/model"/);

  const separateProfileFile = path.join(path.dirname(configFile), "llm-router.config.toml");
  const initialSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.equal(initialSeparateProfile.includes("model_reasoning_effort"), false);

  const codexEditedConfig = content
    .replace(
      'model = "Provider/model"',
      'model = "User/selected-in-codex"\nmodel_reasoning_effort = "max"'
    )
    .replace(
      "# END LLMR managed ToolHub MCP",
      [
        "[desktop]",
        'followUpQueueMode = "steer"',
        "",
        '[plugins."browser@openai-bundled"]',
        "enabled = false",
        "",
        "[features]",
        "js_repl = true",
        "# END LLMR managed ToolHub MCP"
      ].join("\n")
    );
  writeFileSync(configFile, codexEditedConfig);
  writeFileSync(
    separateProfileFile,
    initialSeparateProfile
      .replace('model = "Provider/model"', 'model = "User/selected-in-cli"')
      .replace(/\s*$/, [
        "",
        'model_reasoning_effort = "ultra"',
        "",
        '[mcp_servers.llmr-toolhub.tools."tool_hub.resolve"]',
        'approval_mode = "approve"',
        ""
      ].join("\n"))
  );

  await applyProfileFixture(config);

  const preservedConfig = readFileSync(configFile, "utf8");
  assert.match(preservedConfig, /model = "User\/selected-in-codex"/);
  assert.match(preservedConfig, /model_reasoning_effort = "max"/);
  assert.match(preservedConfig, /\[desktop\]\nfollowUpQueueMode = "steer"/);
  assert.match(preservedConfig, /\[plugins\."browser@openai-bundled"\]\nenabled = false/);
  assert.match(preservedConfig, /\[features\]\njs_repl = true/);
  assert.equal((preservedConfig.match(/\[mcp_servers\.llmr-toolhub\]/g) ?? []).length, 1);
  assert.equal((preservedConfig.match(/# BEGIN LLMR managed ToolHub MCP/g) ?? []).length, 1);

  const preservedSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.match(preservedSeparateProfile, /model = "User\/selected-in-cli"/);
  assert.match(preservedSeparateProfile, /model_reasoning_effort = "ultra"/);
  assert.equal(preservedSeparateProfile.includes("[mcp_servers.llmr-toolhub"), false);

  config.Providers[0].models.push("model-2");
  config.profile.profiles[0].model = "Provider/model-2";
  await applyProfileFixture(config);

  const explicitlyUpdatedConfig = readFileSync(configFile, "utf8");
  assert.match(explicitlyUpdatedConfig, /model = "Provider\/model-2"/);
  assert.match(explicitlyUpdatedConfig, /model_reasoning_effort = "max"/);
  assert.match(explicitlyUpdatedConfig, /\[desktop\]\nfollowUpQueueMode = "steer"/);
  const explicitlyUpdatedSeparateProfile = readFileSync(separateProfileFile, "utf8");
  assert.match(explicitlyUpdatedSeparateProfile, /model = "Provider\/model-2"/);
  assert.match(explicitlyUpdatedSeparateProfile, /model_reasoning_effort = "ultra"/);
});

test("profile service injects Context Archive MCP for managed Claude Code profile", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "managed-compact-claude";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.contextArchive = {
    ...config.contextArchive,
    enabled: false
  };
  config.APIKEY = "llmr-managed-claude-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-managed-claude-profile-test",
      name: "Profile: Managed Compact Claude"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      managedCompact: true,
      model: "Provider/model",
      name: "Managed Compact Claude",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  const mcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const mcpConfig = JSON.parse(readFileSync(mcpConfigFile, "utf8"));
  assert.deepEqual(Object.keys(mcpConfig.mcpServers), ["llmr-context-archive"]);
  assert.equal(mcpConfig.mcpServers["llmr-context-archive"].type, "http");
  assert.equal(mcpConfig.mcpServers["llmr-context-archive"].url, `http://127.0.0.1:${config.gateway.port}/__llmr/context-archive/mcp`);
  assert.equal(mcpConfig.mcpServers["llmr-context-archive"].headers.Authorization, "Bearer llmr-managed-claude-profile-test");
});

test("profile service injects Context Archive MCP for managed Codex profile", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "managed-compact-codex";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.contextArchive = {
    ...config.contextArchive,
    enabled: false
  };
  config.APIKEY = "llmr-managed-codex-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-managed-codex-profile-test",
      name: "Profile: Managed Compact Codex"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "codex",
      cliMiddleware: false,
      codexCliPath: "",
      codexHome: "",
      configFile: "",
      configFormat: "legacy",
      enabled: true,
      env: {},
      id: profileId,
      managedCompact: true,
      model: "Provider/model",
      name: "Managed Compact Codex",
      providerId: "llm-router",
      providerName: "LLM Router",
      scope: "llmr",
      showAllSessions: false,
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);

  const configFile = path.join(CONFIGDIR, "profiles", profileId, "codex", "config.toml");
  const content = readFileSync(configFile, "utf8");
  assert.doesNotMatch(content, /# BEGIN LLMR managed ToolHub MCP/);
  assert.match(content, /# BEGIN LLMR managed Context Archive MCP/);
  assert.match(content, /\[mcp_servers\.llmr-context-archive\]/);
  assert.match(content, new RegExp(`url = "http://127\\.0\\.0\\.1:${config.gateway.port}/__llmr/context-archive/mcp"`));
  assert.match(content, /http_headers = \{ Authorization = "Bearer llmr-managed-codex-profile-test" \}/);
  assert.match(content, /startup_timeout_sec = 10/);
  assert.match(content, /tool_timeout_sec = 60/);
});

test("profile service injects Context Archive MCP for managed Claude Code without ToolHub", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "context-archive-mcp-only";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.contextArchive = {
    ...config.contextArchive,
    enabled: true
  };
  config.APIKEY = "llmr-context-archive-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-context-archive-profile-test",
      name: "Profile: Context Archive MCP Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      managedCompact: true,
      model: "Provider/model",
      name: "Context Archive MCP Test",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, true);
  const mcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const mcpConfig = JSON.parse(readFileSync(mcpConfigFile, "utf8"));
  assert.deepEqual(Object.keys(mcpConfig.mcpServers), ["llmr-context-archive"]);
  assert.equal(mcpConfig.mcpServers["llmr-context-archive"].type, "http");
  assert.equal(mcpConfig.mcpServers["llmr-context-archive"].headers.Authorization, "Bearer llmr-context-archive-profile-test");
});

test("profile service writes a Grok CLI wrapper that points model discovery and inference to LLMR", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "grok-gateway-test";
  const sourceGrokHome = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".grok");
  mkdirSync(path.join(sourceGrokHome, "sessions"), { recursive: true });
  mkdirSync(path.join(sourceGrokHome, "skills"), { recursive: true });
  writeFileSync(path.join(sourceGrokHome, "auth.json"), "oauth credentials must not be shared");
  writeFileSync(path.join(sourceGrokHome, "config.toml"), "[ui]\ncompact_mode = false\n");
  const profileGrokHome = path.join(CONFIGDIR, "profiles", profileId, "grok");
  const profileGrokConfig = path.join(profileGrokHome, "config.toml");
  if (process.platform !== "win32") {
    mkdirSync(profileGrokHome, { recursive: true });
    symlinkSync(path.join(sourceGrokHome, "config.toml"), profileGrokConfig);
  }
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "llmr-grok-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-grok-profile-test",
      name: "Profile: Grok Gateway Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "grok",
      enabled: true,
      env: {
        LLMR_GROK_BIN: "/custom/bin/grok",
        GROK_HOME: sourceGrokHome,
        GROK_MODELS_BASE_URL: "https://ignored.example/v1",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "Grok Gateway Test",
      scope: "llmr",
      surface: "cli"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "grok");
  assert.equal(result.clients[0].ok, true);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `llmr-grok-cli-wrapper-${profileId}${commandExtension}`);
  const content = readFileSync(wrapperFile, "utf8");
  assert.match(content, new RegExp(`GROK_MODELS_BASE_URL.*http://127\\.0\\.0\\.1:${config.gateway.port}/v1`));
  assert.match(content, new RegExp(`GROK_MODELS_LIST_URL.*http://127\\.0\\.0\\.1:${config.gateway.port}/v1/models`));
  assert.match(content, /XAI_API_KEY.*llmr-grok-profile-test/);
  assert.match(content, /GROK_DEFAULT_MODEL.*Provider\/model/);
  assert.match(content, new RegExp(`GROK_HOME.*profiles.*${profileId}.*grok`));
  assert.match(content, /USER_VALUE.*kept/);
  assert.match(content, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(content, /\/custom\/bin\/grok/);
  assert.equal(content.includes("https://ignored.example/v1"), false);

  assert.equal(readFileSync(profileGrokConfig, "utf8"), "[ui]\ncompact_mode = false\n");
  assert.equal(lstatSync(profileGrokConfig).isSymbolicLink(), false);
  writeFileSync(profileGrokConfig, "[ui]\ncompact_mode = true\n");
  assert.equal(readFileSync(path.join(sourceGrokHome, "config.toml"), "utf8"), "[ui]\ncompact_mode = false\n");
  assert.equal(existsSync(path.join(profileGrokHome, "sessions")), true);
  assert.equal(existsSync(path.join(profileGrokHome, "skills")), true);
  assert.equal(existsSync(path.join(profileGrokHome, "auth.json")), false);
});

test("profile service writes a multi-model Kimi CLI home that points inference to LLMR", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "kimi-gateway-test";
  const sourceKimiHome = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".kimi-code");
  const sourceKimiConfig = path.join(sourceKimiHome, "config.toml");
  mkdirSync(path.join(sourceKimiHome, "sessions"), { recursive: true });
  mkdirSync(path.join(sourceKimiHome, "skills"), { recursive: true });
  writeFileSync(sourceKimiConfig, [
    'default_model = "original/model"',
    "telemetry = false",
    "",
    '[providers."original"]',
    'type = "openai"',
    'api_key = "original-key"',
    "",
    '[models."original/model"]',
    'provider = "original"',
    'model = "model"',
    "max_context_size = 8192",
    "",
    "[thinking]",
    "enabled = false",
    ""
  ].join("\n"));
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      modelDisplayNames: { fast: "Fast Model" },
      modelMetadata: {
        fast: {
          capabilities: { imageInput: true },
          defaultReasoningLevel: "high",
          supportedReasoningLevels: [
            { description: "Fast", effort: "low" },
            { description: "Thorough", effort: "high" }
          ]
        },
        model: { maxContextWindow: 200000 }
      },
      models: ["model", "fast", "gpt-5.6-sol", "gpt-5.5-pro", "legacy-extra"],
      name: "Provider"
    },
    {
      api_base_url: "https://generativelanguage.googleapis.com",
      api_key: "gemini-key",
      models: ["gemini-2.5-pro"],
      name: "Custom Gemini"
    },
    {
      api_base_url: "https://api.deepseek.com",
      api_key: "deepseek-key",
      modelMetadata: { "deepseek-v4-flash": { capabilities: { imageInput: false } } },
      models: ["deepseek-v4-flash"],
      name: "DeepSeek"
    },
    {
      api_base_url: "https://open.bigmodel.cn/api/coding/paas/v4",
      api_key: "zhipu-key",
      modelMetadata: { "glm-5.2": {
        capabilities: { imageInput: true },
        contextWindow: 1049000,
        supportsReasoningSummaries: true
      } },
      models: ["glm-5.2"],
      name: "Zhipu Coding"
    }
  ];
  config.preferredProvider = "Provider";
  config.virtualModelProfiles = [{
    baseModel: { fixedModel: "Provider/gpt-5.6-sol", mode: "fixed" },
    enabled: true,
    match: { exactAliases: ["catalog-context"], prefixes: [], suffixes: [] },
    materialization: { enabled: true, includeInGatewayModels: true }
  }];
  config.APIKEY = "llmr-kimi-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-kimi-profile-test",
      name: "Profile: Kimi Gateway Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "kimi",
      availableModels: ["Provider/model", "Provider/fast"],
      enabled: true,
      env: {
        LLMR_KIMI_BIN: "/custom/bin/kimi",
        KIMI_MODEL_BASE_URL: "https://ignored.example/v1",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "Kimi Gateway Test",
      scope: "llmr",
      surface: "cli"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "kimi");
  assert.equal(result.clients[0].ok, true);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `llmr-kimi-cli-wrapper-${profileId}${commandExtension}`);
  const content = readFileSync(wrapperFile, "utf8");
  const profileKimiHome = path.join(CONFIGDIR, "profiles", profileId, "kimi");
  const profileConfigContent = readFileSync(path.join(profileKimiHome, "config.toml"), "utf8");
  assert.match(content, new RegExp(`KIMI_CODE_HOME.*profiles.*${profileId}.*kimi`));
  assert.match(content, /KIMI_MODEL_NAME/);
  assert.match(content, /USER_VALUE.*kept/);
  assert.match(content, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(content, /\/custom\/bin\/kimi/);
  assert.equal(content.includes("https://ignored.example/v1"), false);
  assert.match(profileConfigContent, /default_model = "Provider\/model"/);
  assert.match(profileConfigContent, /\[providers\."llm-router"\]/);
  assert.match(profileConfigContent, new RegExp(`base_url = "http://127\\.0\\.0\\.1:${config.gateway.port}/v1"`));
  assert.match(profileConfigContent, /api_key = "llmr-kimi-profile-test"/);
  assert.match(profileConfigContent, /\[models\."Provider\/model"\]/);
  assert.match(profileConfigContent, /\[models\."Provider\/fast"\]/);
  assert.equal(profileConfigContent.includes('[models."Provider/legacy-extra"]'), false);
  assert.match(profileConfigContent, /max_context_size = 200000/);
  assert.match(profileConfigContent, /\[models\."Provider\/model"\][\s\S]*?capabilities = \["tool_use"\]/);
  assert.match(profileConfigContent, /\[models\."Provider\/fast"\][\s\S]*?capabilities = \["tool_use", "image_in", "thinking"\]\nsupport_efforts = \["low", "high"\]\ndefault_effort = "high"/);
  assert.match(profileConfigContent, /display_name = "Provider \/ Fast Model"/);
  assert.match(profileConfigContent, /telemetry = false/);
  assert.match(profileConfigContent, /\[thinking\]/);
  assert.equal(profileConfigContent.includes("original-key"), false);
  assert.equal(readFileSync(sourceKimiConfig, "utf8").includes("original-key"), true);
  assert.equal(existsSync(path.join(profileKimiHome, "sessions")), true);
  assert.equal(existsSync(path.join(profileKimiHome, "skills")), true);

  delete config.profile.profiles[0].availableModels;
  config.profile.profiles[0].model = "";
  const legacyResult = await applyProfileFixture(config);
  assert.equal(legacyResult.clients[0].ok, true);
  const legacyProfileConfigContent = readFileSync(path.join(profileKimiHome, "config.toml"), "utf8");
  assert.match(legacyProfileConfigContent, /default_model = "Provider\/model"/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/model"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/fast"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/gpt-5\.6-sol"\]\nprovider = "llm-router"\nmodel = "Provider\/gpt-5\.6-sol"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "image_in", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/gpt-5\.5-pro"\][\s\S]*?capabilities = \["tool_use", "image_in", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Provider\/legacy-extra"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Custom Gemini\/gemini-2\.5-pro"\]\nprovider = "llm-router"\nmodel = "Custom Gemini\/gemini-2\.5-pro"\nmax_context_size = 1065535/);
  assert.match(legacyProfileConfigContent, /\[models\."DeepSeek\/deepseek-v4-flash"\]\nprovider = "llm-router"\nmodel = "DeepSeek\/deepseek-v4-flash"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Zhipu Coding\/glm-5\.2"\]\nprovider = "llm-router"\nmodel = "Zhipu Coding\/glm-5\.2"\nmax_context_size = 1049000\ncapabilities = \["tool_use", "image_in", "thinking"\]/);
  assert.match(legacyProfileConfigContent, /\[models\."Fusion\/catalog-context"\]\nprovider = "llm-router"\nmodel = "Fusion\/catalog-context"\nmax_context_size = 1050000\ncapabilities = \["tool_use", "image_in", "thinking"\]/);
});

test("profile service writes a Pi config and wrapper that points inference to LLMR", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "pi-gateway-test";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model", "fast"],
      name: "Provider",
      type: "openai_responses"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "llmr-pi-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-pi-profile-test",
      name: "Profile: Pi Gateway Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "pi",
      enabled: true,
      env: {
        LLMR_PI_BIN: "/custom/bin/pi",
        PI_CODING_AGENT_DIR: "/ignored/pi",
        PI_CODING_AGENT_SESSION_DIR: "/ignored/pi/sessions",
        PI_SKIP_VERSION_CHECK: "0",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "Pi Gateway Test",
      providerId: "llmr-pi",
      scope: "llmr",
      surface: "cli"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "pi");
  assert.equal(result.clients[0].ok, true);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `llmr-pi-wrapper-${profileId}${commandExtension}`);
  const content = readFileSync(wrapperFile, "utf8");
  const profilePiHome = path.join(CONFIGDIR, "profiles", profileId, "pi");
  const profileConfigFile = path.join(profilePiHome, "models.json");
  const piConfig = JSON.parse(readFileSync(profileConfigFile, "utf8"));
  const provider = piConfig.providers["llmr-pi"];

  assert.match(content, new RegExp(`PI_CODING_AGENT_DIR.*profiles.*${profileId}.*pi`));
  assert.match(content, new RegExp(`PI_CODING_AGENT_SESSION_DIR.*profiles.*${profileId}.*pi.*sessions`));
  assert.match(content, /PI_SKIP_VERSION_CHECK.*0/);
  assert.match(content, /USER_VALUE.*kept/);
  assert.match(content, /NO_PROXY.*127\.0\.0\.1,localhost,::1/);
  assert.match(content, /\/custom\/bin\/pi/);
  assert.match(content, /--provider .*llmr-pi/);
  assert.match(content, /--model .*Provider\/model/);
  assert.equal(content.includes("/ignored/pi"), false);
  assert.equal(provider.api, "openai-responses");
  assert.equal(provider.baseUrl, `http://127.0.0.1:${config.gateway.port}/v1`);
  assert.equal(provider.apiKey, "llmr-pi-profile-test");
  assert.equal(provider.authHeader, true);
  assert.deepEqual(provider.headers, {
    "x-llmr-client": "pi",
    "x-llmr-profile": profileId
  });
  assert.ok(provider.models.some((model) => model.id === "Provider/model"));
  assert.ok(provider.models.some((model) => model.id === "Provider/fast"));
  assert.equal(existsSync(path.join(profilePiHome, "sessions")), true);
});

test("#1851 Windows Pi wrapper uses the argument-aware CLI runtime", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const config = createDefaultAppConfig();
  config.Providers = [{ name: "Provider", models: ["model"], type: "openai_chat_completions", api_base_url: "https://example.test/v1" }];
  config.APIKEYS = [{ id: "profile:pi-dispatch", key: "test", name: "Pi" }];
  config.profile.enabled = true;
  config.profile.profiles = [{ agent: "pi", enabled: true, env: {}, id: "pi-dispatch", model: "Provider/model", name: "Pi", scope: "llmr", surface: "cli" }];
  try {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const result = await applyProfileFixture(config);
    assert.equal(result.clients[0].ok, true);
    const content = readFileSync(path.join(CONFIGDIR, "bin", "llmr-pi-wrapper-pi-dispatch.cmd"), "utf8");
    assert.match(content, /LLMR_PI_WRAPPER=1/);
    assert.match(content, /llmr-codex-cli-middleware\.js/);
    assert.doesNotMatch(content, /"pi" --provider .*%\*/);
  } finally { Object.defineProperty(process, "platform", originalPlatform); }
});

test("profile service writes an OpenCode CLI wrapper and shared CLI/App config", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "opencode-gateway-test";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "llmr-opencode-profile-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-opencode-profile-test",
      name: "Profile: OpenCode Gateway Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "opencode",
      enabled: true,
      env: {
        LLMR_OPENCODE_BIN: "/custom/bin/opencode",
        OPENCODE_CONFIG: "/ignored/opencode.json",
        USER_VALUE: "kept"
      },
      id: profileId,
      model: "Provider/model",
      name: "OpenCode Gateway Test",
      providerId: "llm-router",
      providerName: "LLM Router",
      scope: "llmr",
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].client, "opencode");
  assert.equal(result.clients[0].ok, true);

  const configFile = path.join(CONFIGDIR, "profiles", profileId, "opencode", "opencode.jsonc");
  const openCodeConfig = JSON.parse(readFileSync(configFile, "utf8"));
  assert.equal(openCodeConfig.model, "llm-router/Provider/model");
  assert.equal(openCodeConfig.small_model, openCodeConfig.model);
  assert.equal(openCodeConfig.provider["llm-router"].options.apiKey, "llmr-opencode-profile-test");
  assert.equal(openCodeConfig.provider["llm-router"].options.baseURL, `http://127.0.0.1:${config.gateway.port}/v1`);

  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `llmr-opencode-wrapper-${profileId}${commandExtension}`);
  const wrapper = readFileSync(wrapperFile, "utf8");
  assert.match(wrapper, /OPENCODE_CONFIG/);
  assert.match(wrapper, /OPENCODE_CONFIG_CONTENT/);
  assert.match(wrapper, /USER_VALUE.*kept/);
  assert.match(wrapper, /custom[\\/]bin[\\/]opencode/);
  assert.equal(wrapper.includes("/ignored/opencode.json"), false);
});

test("profile service removes disabled and deleted OpenCode wrappers and API keys", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "opencode-cleanup-test";
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["model"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "general-key";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "general-key",
      key: "general-key",
      name: "General key"
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "opencode-profile-key",
      name: "Profile: OpenCode Cleanup Test"
    }
  ];
  const profile = {
    agent: "opencode",
    enabled: true,
    env: {},
    id: profileId,
    model: "Provider/model",
    name: "OpenCode Cleanup Test",
    providerId: "llm-router",
    providerName: "LLM Router",
    scope: "llmr",
    surface: "auto"
  };
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  const commandExtension = process.platform === "win32" ? ".cmd" : "";
  const wrapperFile = path.join(CONFIGDIR, "bin", `llmr-opencode-wrapper-${profileId}${commandExtension}`);

  await applyProfileFixture(config);
  assert.equal(existsSync(wrapperFile), true);

  profile.enabled = false;
  await applyProfileFixture(config);
  assert.equal(existsSync(wrapperFile), false);
  assert.deepEqual(config.APIKEYS.map((apiKey) => apiKey.id), ["general-key"]);

  profile.enabled = true;
  await applyProfileFixture(config);
  assert.equal(existsSync(wrapperFile), true);
  assert.ok(config.APIKEYS.some((apiKey) => apiKey.id === `profile:${profileId}`));

  config.profile.enabled = true;
  config.profile.profiles = [];
  await applyProfileFixture(config);
  assert.equal(existsSync(wrapperFile), false);
  assert.deepEqual(config.APIKEYS.map((apiKey) => apiKey.id), ["general-key"]);
});

test("profile service clears stale Claude Code ToolHub artifacts when no gateway models are available", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "stale-toolhub-no-models";
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const toolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "toolhub-mcp.json");
  const staleSettingsFile = path.join(CONFIGDIR, "profiles", "old-claude-code", "claude", "settings.json");
  const staleToolHubMcpConfigFile = path.join(CONFIGDIR, "profiles", "old-claude-code", "claude", "toolhub-mcp.json");
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  mkdirSync(path.dirname(toolHubMcpConfigFile), { recursive: true });
  mkdirSync(path.dirname(staleSettingsFile), { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify({
    env: {
      LLMR_CLAUDE_CODE_MCP_CONFIG: toolHubMcpConfigFile,
      CODEXL_CLAUDE_CODE_MCP_CONFIG: toolHubMcpConfigFile,
      ENABLE_TOOL_SEARCH: "true",
      USER_VALUE: "kept"
    },
    theme: "dark"
  }, null, 2)}\n`);
  writeFileSync(toolHubMcpConfigFile, `${JSON.stringify({
    mcpServers: {
      "llmr-toolhub": {
        args: [path.join(CONFIGDIR, "bin", "toolhub-mcp.js")],
        command: "node",
        env: {
          TOOLHUB_OPENAI_BASE_URL: "https://api.deepseek.com",
          TOOLHUB_OPENAI_MODEL: "deepseek-v4-flash"
        }
      }
    }
  }, null, 2)}\n`);
  writeFileSync(staleSettingsFile, `${JSON.stringify({
    env: {
      LLMR_CLAUDE_CODE_MCP_CONFIG: staleToolHubMcpConfigFile,
      ENABLE_TOOL_SEARCH: "true",
      USER_VALUE: "old-kept"
    }
  }, null, 2)}\n`);
  writeFileSync(staleToolHubMcpConfigFile, "{}\n");

  const config = createDefaultAppConfig();
  config.Providers = [];
  config.virtualModelProfiles = [];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: profileId,
      model: "",
      name: "Claude Code",
      scope: "llmr",
      settingsFile,
      smallFastModel: "",
      surface: "auto"
    }
  ];

  const result = await applyProfileFixture(config);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].ok, false);
  assert.equal(existsSync(toolHubMcpConfigFile), false);
  assert.equal(existsSync(staleToolHubMcpConfigFile), false);
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.deepEqual(settings.env, {
    ENABLE_TOOL_SEARCH: "true",
    USER_VALUE: "kept"
  });
  const staleSettings = JSON.parse(readFileSync(staleSettingsFile, "utf8"));
  assert.deepEqual(staleSettings.env, {
    ENABLE_TOOL_SEARCH: "true",
    USER_VALUE: "old-kept"
  });
});

test("profile service restores managed global Claude settings when only LLMR-scoped Claude profiles are active", () => {
  const previousHome = process.env.HOME;
  const previousRuntimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-profile-home-"));
  process.env.HOME = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const originalSettings = {
      env: {
        USER_VALUE: "kept"
      },
      theme: "dark"
    };
    writeFileSync(`${settingsFile}.llmr-backup-2026-01-01T00-00-00-000Z`, `${JSON.stringify(originalSettings, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/llmr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
        id: "claude-code-2",
        model: "Fusion/kimisearch",
        name: "Claude Code",
        scope: "llmr",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const restored = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].client, "claude-code");
    assert.equal(statuses[0].ok, true);
    assert.equal(restored.env.USER_VALUE, "kept");
    assert.equal(restored.env.ANTHROPIC_MODEL, undefined);
    assert.equal(restored.env.LLMR_CLAUDE_CODE_MODEL, undefined);
    assert.equal(restored.env.CODEXL_CLAUDE_CODE_MODEL, undefined);
  } finally {
    restoreEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeHome);
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
});

function userOwnedClaudeSettingsWithGatewayTakeover() {
  return {
    apiKeyHelper: "/home/user/.llm-router/bin/llmr-claude-code-api-key-default-claude-code",
    enabledPlugins: { "example@marketplace": true },
    env: {
      ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
      ANTHROPIC_API_KEY: "user-key",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
      CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456",
      CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      HINDSIGHT_API_LLM_PROVIDER: "claude-code",
      NO_PROXY: "corp.internal,127.0.0.1,localhost,::1",
      no_proxy: "127.0.0.1,localhost,::1"
    },
    hooks: { PreToolUse: [] },
    permissions: { allow: ["Bash(ls)"] }
  };
}

function assertUserOwnedClaudeSettingsStripped(settingsFile) {
  const restored = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(restored.apiKeyHelper, undefined);
  assert.deepEqual(restored.env, {
    ANTHROPIC_API_KEY: "user-key",
    HINDSIGHT_API_LLM_PROVIDER: "claude-code",
    NO_PROXY: "corp.internal"
  });
  assert.deepEqual(restored.permissions, { allow: ["Bash(ls)"] });
  assert.deepEqual(restored.hooks, { PreToolUse: [] });
  assert.deepEqual(restored.enabledPlugins, { "example@marketplace": true });
}

function withScratchRuntimeHome(run, { originalSnapshot = false, takeoverBackup = true } = {}) {
  const previousHome = process.env.HOME;
  const previousRuntimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-profile-home-"));
  process.env.HOME = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    if (takeoverBackup) {
      writeFileSync(`${settingsFile}.llmr-backup-2026-01-01T00-00-00-000Z`, `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    }
    if (originalSnapshot) {
      writeFileSync(`${settingsFile}.llmr-original`, `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    }
    writeFileSync(settingsFile, `${JSON.stringify(userOwnedClaudeSettingsWithGatewayTakeover(), null, 2)}\n`);
    run(settingsFile);
  } finally {
    restoreEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeHome);
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
}

test("profile service strips LLMR-managed Claude settings from a user-owned settings file when no global profile is active", () => {
  withScratchRuntimeHome((settingsFile) => {
    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: false,
        env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
        id: "default-claude-code",
        model: "",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].client, "claude-code");
    assert.equal(statuses[0].ok, true);
    assert.ok(existsSync(statuses[0].backupFile));
    assertUserOwnedClaudeSettingsStripped(settingsFile);
  });
});

test("profile service leaves a user-owned settings file alone when LLMR never took it over", () => {
  withScratchRuntimeHome((settingsFile) => {
    const before = readFileSync(settingsFile, "utf8");
    const statuses = restoreInactiveGlobalProfileConfigs([]);
    assert.equal(statuses.length, 0);
    assert.equal(readFileSync(settingsFile, "utf8"), before);
  }, { takeoverBackup: false });
});

test("profile service treats a .llmr-original snapshot as takeover evidence", () => {
  withScratchRuntimeHome((settingsFile) => {
    const statuses = restoreInactiveGlobalProfileConfigs([]);
    assert.equal(statuses.length, 1);
    assertUserOwnedClaudeSettingsStripped(settingsFile);
  }, { originalSnapshot: true, takeoverBackup: false });
});

test("profile service does not strip the global settings file while a router-scoped Claude profile is enabled", () => {
  withScratchRuntimeHome((settingsFile) => {
    const before = readFileSync(settingsFile, "utf8");
    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "claude-code-2",
        model: "Provider/model",
        name: "Claude Code",
        scope: "llmr",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);
    assert.equal(statuses.length, 0);
    assert.equal(readFileSync(settingsFile, "utf8"), before);
  });
});

test("profile service writes no backup when a user-owned settings file holds nothing LLMR-managed", () => {
  withScratchRuntimeHome((settingsFile) => {
    const userOnly = `${JSON.stringify({ env: { USER_VALUE: "kept" }, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`;
    writeFileSync(settingsFile, userOnly);
    const backupsBefore = readdirSync(path.dirname(settingsFile)).filter((name) => name.includes(".llmr-backup-")).length;
    const statuses = restoreInactiveGlobalProfileConfigs([]);
    assert.equal(statuses.length, 0);
    assert.equal(readFileSync(settingsFile, "utf8"), userOnly);
    assert.equal(readdirSync(path.dirname(settingsFile)).filter((name) => name.includes(".llmr-backup-")).length, backupsBefore);
  });
});

test("profile service strips LLMR-managed Claude settings from a user-owned settings file on exit", () => {
  withScratchRuntimeHome((settingsFile) => {
    const statuses = restoreGlobalProfileConfigsOnExit([
      {
        agent: "claude-code",
        enabled: true,
        env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
        id: "default-claude-code",
        model: "",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ], { manageMarker: false });

    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].ok, true);
    assert.equal(statuses[0].message, "LLMR's settings were removed from Claude Code config and your own settings were kept.");
    assertUserOwnedClaudeSettingsStripped(settingsFile);
  });
});

const userProviderClaudeSettings = {
  env: {
    ANTHROPIC_API_KEY: "sk-user-own",
    ANTHROPIC_AUTH_TOKEN: "user-auth-token",
    ANTHROPIC_BASE_URL: "https://corp-proxy.example",
    ANTHROPIC_MODEL: "user-model",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_USE_VERTEX: "1",
    USER_VALUE: "kept"
  },
  permissions: { allow: ["Bash(ls)"] }
};

async function withGlobalClaudeProfileRelease(original, run) {
  const settingsFile = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude", "settings.json");
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const profile = {
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "displaced-env-claude-code",
    model: "Provider/model",
    name: "Claude Code",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    surface: "auto"
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-displaced-env-test";
  config.APIKEYS = [{
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `profile:${profile.id}`,
    key: "llmr-profile-displaced-env-test",
    name: "Profile: Claude Code"
  }];
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    api_key: "provider-key",
    models: ["model"],
    name: "Provider"
  }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  const apply = async () => {
    const result = await applyProfileFixture(config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.ok), true);
  };
  const release = () => restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
  try {
    rmSync(takeoverFile, { force: true });
    rmSync(path.dirname(settingsFile), { force: true, recursive: true });
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify(original, null, 2)}\n`);
    await run({ apply, config, readSettings: () => JSON.parse(readFileSync(settingsFile, "utf8")), release, settingsFile });
  } finally {
    release();
    rmSync(takeoverFile, { force: true });
    rmSync(path.dirname(settingsFile), { force: true, recursive: true });
    rmSync(path.join(CONFIGDIR, "profiles", profile.id), { force: true, recursive: true });
  }
}

test("release restores the user's own provider env that apply displaced", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, readSettings, release }) => {
    await apply();
    assert.notEqual(readSettings().env.ANTHROPIC_API_KEY, "sk-user-own");
    release();
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
  });
});

test("apply in a China time zone leaves TZ in Claude settings to the user", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    for (const [original, expected] of [
      [{ env: { USER_VALUE: "kept" } }, undefined],
      [{ env: { TZ: "Europe/Berlin" } }, "Europe/Berlin"],
      [{ env: { TZ: "UTC" } }, "UTC"]
    ]) {
      await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings, release }) => {
        await apply();
        assert.equal(readSettings().env.TZ, expected);
        const suffix = process.platform === "win32" ? ".cmd" : "";
        const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-displaced-env-claude-code${suffix}`), "utf8");
        assert.doesNotMatch(wrapper, /\bTZ=/);
        release();
        assert.equal(readSettings().env.TZ, expected);
      });
    }
  } finally {
    restoreEnv("TZ", previousTz);
  }
});

test("stale CODEXL keys are stripped from settings env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = {
    env: {
      CODEXL_BOT_GATEWAY_ENABLED: "true",
      CODEXL_CLAUDE_CODE_MCP_CONFIG: "/tmp/stale-toolhub-mcp.json",
      CODEXL_CLAUDE_CODE_MODEL: "Provider/stale",
      USER_VALUE: "kept"
    }
  };
  const staleKeys = (settings) => Object.keys(settings.env ?? {}).filter((key) => key.startsWith("CODEXL_"));
  await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings }) => {
    await apply();
    assert.deepEqual(staleKeys(readSettings()), []);
    assert.equal(readSettings().env.USER_VALUE, "kept");
    assert.equal(readSettings().env.LLMR_CLAUDE_CODE_MODEL, "Provider/model");
  });
});

test("release strips stale CODEXL keys written after apply", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease({ env: { USER_VALUE: "kept" } }, async ({ apply, readSettings, release, settingsFile }) => {
    await apply();
    const applied = readSettings();
    applied.env.CODEXL_CLAUDE_CODE_MCP_CONFIG = "/tmp/stale-toolhub-mcp.json";
    applied.env.CODEXL_CLAUDE_CODE_MODEL = "Provider/stale";
    writeFileSync(settingsFile, `${JSON.stringify(applied, null, 2)}\n`);
    release();
    assert.deepEqual(Object.keys(readSettings().env).filter((key) => key.startsWith("CODEXL_")), []);
    assert.equal(readSettings().env.USER_VALUE, "kept");
  });
});

test("a second apply does not record LLMR values as displaced", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, readSettings, release }) => {
    await apply();
    await apply();
    release();
    assert.equal(readSettings().env.ANTHROPIC_BASE_URL, "https://corp-proxy.example");
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
  });
});

test("a second apply on a new gateway port does not record the old LLMR endpoint as displaced", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, config, readSettings, release, settingsFile }) => {
    config.gateway.port = 4101;
    await apply();
    config.gateway.port = 4202;
    await apply();
    release();
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
    assert.doesNotMatch(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1:4101/);
  });
});

test("disabling the global profile restores the user's own provider env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, config, readSettings }) => {
    await apply();
    config.profile.profiles[0].enabled = false;
    await applyProfileFixture(config);
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
  });
});

for (const [name, editGatewayEnv, reapply] of [
  ["points one gateway URL back at its proxy", (env) => { env.ANTHROPIC_BASE_URL = "https://user-edit.example"; }, false],
  ["points one gateway URL back at its proxy and LLMR re-applies on a new port", (env) => { env.ANTHROPIC_BASE_URL = "https://user-edit.example"; }, true],
  ["deletes one gateway URL", (env) => { delete env.CLAUDE_AGENT_API_BASE_URL; }, false]
]) {
  test(`release strips LLMR's gateway and model env after the user ${name} while the profile was on`, { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
    await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, config, readSettings, release, settingsFile }) => {
      config.gateway.port = 4303;
      await apply();
      const live = readSettings();
      editGatewayEnv(live.env);
      writeFileSync(settingsFile, `${JSON.stringify(live, null, 2)}\n`);
      if (reapply) {
        config.gateway.port = 4404;
        await apply();
      }
      release();
      assert.doesNotMatch(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1:(4303|4404)/);
      const restored = readSettings();
      assert.equal(restored.env.ANTHROPIC_BASE_URL, reapply || name.startsWith("deletes") ? "https://corp-proxy.example" : "https://user-edit.example");
      assert.deepEqual(restored.env, { ...userProviderClaudeSettings.env, ANTHROPIC_BASE_URL: restored.env.ANTHROPIC_BASE_URL });
    });
  });
}

test("release keeps a user edit made while the profile was on", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, readSettings, release, settingsFile }) => {
    await apply();
    const live = readSettings();
    live.permissions.allow.push("Bash(pwd)");
    writeFileSync(settingsFile, `${JSON.stringify(live, null, 2)}\n`);
    release();
    assert.deepEqual(readSettings().permissions.allow, ["Bash(ls)", "Bash(pwd)"]);
    assert.equal(readSettings().env.ANTHROPIC_API_KEY, "sk-user-own");
  });
});

test("release does not invent a base URL the user never had", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease({ env: { USER_VALUE: "kept" } }, async ({ apply, readSettings, release }) => {
    await apply();
    release();
    assert.deepEqual(readSettings().env, { USER_VALUE: "kept" });
  });
});

test("release after a re-takeover never restores a backup that still points at LLMR", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = { env: { USER_VALUE: "kept" }, permissions: { allow: ["Bash(ls)"] } };
  await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings, release, settingsFile }) => {
    await apply();
    release();
    rmSync(settingsFile);
    await apply();
    release();
    const after = readFileSync(settingsFile, "utf8");
    assert.doesNotMatch(after, /127\.0\.0\.1:3456/);
    assert.doesNotMatch(after, /llmr-claude-code-api-key-/);
    assert.equal(readSettings().env.USER_VALUE, "kept");
    assert.deepEqual(readSettings(), original);
  });
});

test("deleting the global Claude profile restores the user's own provider env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, config, readSettings, settingsFile }) => {
    await apply();
    config.profile.enabled = true;
    config.profile.profiles = [];
    await applyProfileFixture(config);
    assert.doesNotMatch(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1/);
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
  });
});

test("the sweep restores the user's own provider env from a deleted profile's takeover state", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ config, readSettings, settingsFile }) => {
    const profile = config.profile.profiles[0];
    const stateFile = path.join(CONFIGDIR, "profiles", profile.id, "claude", "settings-state.json");
    assert.equal(applyProfileRuntimeConfig(config, profile, "llmr-profile-displaced-env-test").ok, true);
    config.profile.enabled = true;
    config.profile.profiles = [];
    await applyProfileFixture(config);
    assert.doesNotMatch(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1/);
    assert.deepEqual(readSettings(), userProviderClaudeSettings);
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.deepEqual(state.displacedEnv, {});
    assert.deepEqual(state.endpoints, []);
  });
});

test("a fresh takeover records the user's current env, not a stale stored value", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = { env: { ANTHROPIC_API_KEY: "new", USER_VALUE: "kept" }, permissions: { allow: ["Bash(ls)"] } };
  await withGlobalClaudeProfileRelease(original, async ({ apply, config, readSettings, release }) => {
    const stateFile = path.join(CONFIGDIR, "profiles", config.profile.profiles[0].id, "claude", "settings-state.json");
    mkdirSync(path.dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, `${JSON.stringify({ displacedEnv: { ANTHROPIC_API_KEY: "old" }, endpoints: [], envKeys: [], paths: [], version: 1 }, null, 2)}\n`);
    await apply();
    release();
    assert.deepEqual(readSettings(), original);
  });
});

const userDisplacedEnv = Object.fromEntries(Object.entries(userProviderClaudeSettings.env).filter(([key]) => key !== "USER_VALUE"));

for (const [name, removeEnv] of [
  ["settings.json is deleted", (settingsFile) => rmSync(settingsFile)],
  ["its env block is removed", (settingsFile, live) => {
    delete live.env;
    writeFileSync(settingsFile, `${JSON.stringify(live, null, 2)}\n`);
  }]
]) {
  test(`release restores the user's displaced env after ${name} while the profile was on`, { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
    await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, readSettings, release, settingsFile }) => {
      await apply();
      removeEnv(settingsFile, readSettings());
      await apply();
      release();
      const restored = readSettings().env ?? {};
      assert.deepEqual(Object.fromEntries(Object.keys(userDisplacedEnv).map((key) => [key, restored[key]])), userDisplacedEnv);
    });
  });
}

test("a corrupt takeover state file is reported and kept aside, not overwritten", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async (t) => {
  await withGlobalClaudeProfileRelease(userProviderClaudeSettings, async ({ apply, config }) => {
    const stateFile = path.join(CONFIGDIR, "profiles", config.profile.profiles[0].id, "claude", "settings-state.json");
    await apply();
    writeFileSync(stateFile, "{\"displacedEnv\": {\"ANTHROPIC_MODEL\": \"user-mo");
    const warn = t.mock.method(console, "warn", () => undefined);
    await apply();
    const kept = readdirSync(path.dirname(stateFile)).filter((entry) => entry.startsWith("settings-state.json.corrupt-"));
    assert.equal(kept.length, 1);
    assert.equal(readFileSync(path.join(path.dirname(stateFile), kept[0]), "utf8"), "{\"displacedEnv\": {\"ANTHROPIC_MODEL\": \"user-mo");
    assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes(stateFile)));
  });
});

test("release restores the user's own workload identity federation env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = {
    env: {
      ANTHROPIC_FEDERATION_RULE_ID: "user-rule",
      ANTHROPIC_IDENTITY_TOKEN_FILE: "/home/user/.config/token",
      ANTHROPIC_ORGANIZATION_ID: "user-org",
      USER_VALUE: "kept"
    },
    permissions: { allow: ["Bash(ls)"] }
  };
  await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings, release }) => {
    await apply();
    assert.notEqual(readSettings().env.ANTHROPIC_FEDERATION_RULE_ID, "user-rule");
    release();
    assert.deepEqual(readSettings(), original);
  });
});

test("the sweep strips a mixed backup while a router-scoped Claude profile is enabled", () => {
  withScratchRuntimeHome((settingsFile) => {
    writeFileSync(`${settingsFile}.llmr-backup-2026-01-01T00-00-00-000Z`, `${JSON.stringify({
      apiKeyHelper: "/home/user/.llm-router/bin/llmr-claude-code-api-key-default-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456",
        USER_VALUE: "kept"
      },
      permissions: { allow: ["Bash(ls)"] }
    }, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/home/user/.llm-router/bin/llmr-claude-code-api-key-default-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);
    restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "claude-code-2",
        model: "Provider/model",
        name: "Claude Code",
        scope: "llmr",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);
    const restored = readFileSync(settingsFile, "utf8");
    assert.doesNotMatch(restored, /127\.0\.0\.1:3456/);
    assert.doesNotMatch(restored, /apiKeyHelper/);
    assert.deepEqual(JSON.parse(restored), { env: { USER_VALUE: "kept" }, permissions: { allow: ["Bash(ls)"] } });
  }, { takeoverBackup: false });
});

test("profile service keeps managed global Claude settings when a global Claude profile is active", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-profile-home-"));
  process.env.HOME = home;
  try {
    const settingsFile = path.join(home, ".claude", "settings.json");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify({
      apiKeyHelper: "/tmp/llmr-claude-code-api-key-claude-code",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_MODEL: "Fusion/GLM-5.2V",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    }, null, 2)}\n`);

    const statuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "claude-code",
        enabled: true,
        env: {},
        id: "claude-code",
        model: "Fusion/GLM-5.2V",
        name: "Claude Code",
        scope: "global",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: "",
        surface: "auto"
      }
    ]);

    const current = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(statuses.length, 0);
    assert.equal(current.env.ANTHROPIC_MODEL, "Fusion/GLM-5.2V");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("profile service restores global agent configs on exit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-global-profile-exit-"));
  try {
    const claudeFile = path.join(root, "claude", "settings.json");
    const codexFile = path.join(root, "codex", "config.toml");
    const openCodeFile = path.join(root, "opencode", "opencode.jsonc");
    const zcodeFile = path.join(root, "zcode", "cli", "config.json");
    const zcodeRoot = path.dirname(path.dirname(zcodeFile));
    const zcodeV2File = path.join(zcodeRoot, "v2", "config.json");
    const zcodeCacheFile = path.join(zcodeRoot, "v2", "bots-model-cache.v2.json");
    const files = [claudeFile, codexFile, openCodeFile, zcodeFile, zcodeV2File, zcodeCacheFile];
    const originals = new Map(files.map((file, index) => [file, `${JSON.stringify({ original: index })}\n`]));
    const latestSnapshots = new Map(files.map((file, index) => [file, `${JSON.stringify({ latest: index })}\n`]));

    for (const [file, original] of originals) {
      mkdirSync(path.dirname(file), { recursive: true });
      if (file === zcodeCacheFile) {
        writeFileSync(`${file}.llmr-original-missing`, "");
      } else {
        writeFileSync(`${file}.llmr-original`, original);
      }
      writeFileSync(`${file}.llmr-backup-2026-07-11T00-00-00-000Z`, latestSnapshots.get(file));
    }
    writeFileSync(claudeFile, `${JSON.stringify({
      apiKeyHelper: "llmr-claude-code-api-key-test",
      env: {
        ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
        CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456"
      }
    })}\n`);
    // Without a record that says the file is as LLMR wrote it, a Codex restore strips the file in place.
    const writeManagedCodex = () => {
      const managed = "# BEGIN LLMR managed profile\nmodel = \"test\"\n# END LLMR managed profile\n";
      writeFileSync(codexFile, managed);
      mkdirSync(path.dirname(codexWrittenRecordFile(codexFile)), { recursive: true });
      writeFileSync(codexWrittenRecordFile(codexFile), JSON.stringify({ edited: false, file: path.resolve(codexFile), sha256: createHash("sha256").update(managed).digest("hex") }));
    };
    writeManagedCodex();
    writeFileSync(openCodeFile, `${JSON.stringify({
      model: "llm-router/test",
      provider: {
        "llm-router": {
          options: { headers: { "x-llmr-client": "opencode" } }
        }
      }
    })}\n`);
    for (const file of [zcodeFile, zcodeV2File]) {
      writeFileSync(file, `${JSON.stringify({ provider: { "llm-router": {} } })}\n`);
    }
    writeFileSync(zcodeCacheFile, `${JSON.stringify({ providers: [{ id: "llm-router" }] })}\n`);

    const statuses = restoreGlobalProfileConfigsOnExit([
      {
        agent: "claude-code", enabled: true, env: {}, id: "claude", model: "test", name: "Claude",
        scope: "global", settingsFile: claudeFile, smallFastModel: "", surface: "cli"
      },
      {
        agent: "codex", configFile: codexFile, enabled: true, env: {}, id: "codex", model: "test", name: "Codex",
        providerId: "llm-router", scope: "global", surface: "cli"
      },
      {
        agent: "opencode", configFile: openCodeFile, enabled: true, env: {}, id: "opencode", model: "test", name: "OpenCode",
        providerId: "llm-router", scope: "global", surface: "auto"
      },
      {
        agent: "zcode", configFile: zcodeFile, enabled: true, env: {}, id: "zcode", model: "test", name: "ZCode",
        providerId: "llm-router", scope: "global", surface: "app"
      }
    ], { manageMarker: false });

    assert.equal(statuses.length, 4);
    assert.equal(statuses.every((status) => status.ok), true);
    for (const [file, latest] of latestSnapshots) {
      assert.equal(readFileSync(file, "utf8"), latest);
    }

    writeManagedCodex();
    writeFileSync(openCodeFile, `${JSON.stringify({
      provider: { "llm-router": { options: { headers: { "x-llmr-client": "opencode" } } } }
    })}\n`);
    for (const file of [zcodeFile, zcodeV2File]) {
      writeFileSync(file, `${JSON.stringify({ provider: { "llm-router": {} } })}\n`);
    }
    writeFileSync(zcodeCacheFile, `${JSON.stringify({ providers: [{ id: "llm-router" }] })}\n`);
    const inactiveStatuses = restoreInactiveGlobalProfileConfigs([
      {
        agent: "codex", configFile: codexFile, enabled: false, env: {}, id: "codex", model: "test", name: "Codex",
        providerId: "llm-router", scope: "llmr", surface: "cli"
      },
      {
        agent: "opencode", configFile: openCodeFile, enabled: false, env: {}, id: "opencode", model: "test", name: "OpenCode",
        providerId: "llm-router", scope: "global", surface: "auto"
      },
      {
        agent: "zcode", configFile: zcodeFile, enabled: false, env: {}, id: "zcode", model: "test", name: "ZCode",
        providerId: "llm-router", scope: "llmr", surface: "app"
      }
    ]);
    assert.equal(inactiveStatuses.filter((status) => status.client === "codex").length, 1);
    assert.equal(inactiveStatuses.filter((status) => status.client === "opencode").length, 1);
    assert.equal(inactiveStatuses.filter((status) => status.client === "zcode").length, 3);
    for (const [file, latest] of latestSnapshots) {
      if (file !== claudeFile) {
        assert.equal(readFileSync(file, "utf8"), latest);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("profile service invalidates Claude gateway model discovery cache only when the discovery payload changes", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "claude-model-discovery-cache";
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const gatewayCacheFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "cache", "gateway-models.json");
  const fingerprintFile = path.join(CONFIGDIR, "claude-model-discovery-fingerprint.json");
  rmSync(fingerprintFile, { force: true });

  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["alpha", "beta"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "llmr-claude-model-discovery-cache-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-claude-model-discovery-cache-test",
      name: "Profile: Claude Model Discovery Cache Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      availableModels: ["Provider/alpha"],
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/alpha",
      name: "Claude Code",
      scope: "llmr",
      settingsFile,
      smallFastModel: "",
      surface: "cli"
    }
  ];

  mkdirSync(path.dirname(gatewayCacheFile), { recursive: true });
  writeFileSync(gatewayCacheFile, `{"baseUrl":"http://127.0.0.1:${config.gateway.port}","fetchedAt":1,"models":[]}`);

  await applyProfileFixture(config);
  assert.equal(existsSync(gatewayCacheFile), false);

  writeFileSync(gatewayCacheFile, "{}");
  await applyProfileFixture(config);
  assert.equal(existsSync(gatewayCacheFile), true, "unchanged allowlist must not invalidate the cache");

  config.Providers[0].modelMetadata = { alpha: { contextWindow: 400000 } };
  await applyProfileFixture(config);
  assert.equal(existsSync(gatewayCacheFile), false, "model metadata change must invalidate the cache even with an unchanged allowlist");

  writeFileSync(gatewayCacheFile, "{}");
  config.profile.profiles[0].availableModels = ["Provider/alpha", "Provider/beta"];
  await applyProfileFixture(config);
  assert.equal(existsSync(gatewayCacheFile), false, "allowlist change must invalidate the cache");

  rmSync(fingerprintFile, { force: true });
});

test("profile service reports a failed model discovery cache invalidation without aborting the remaining profiles", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "claude-model-discovery-cache-failure";
  const followingProfileId = "codex-after-claude-failure";
  const settingsFile = path.join(CONFIGDIR, "profiles", profileId, "claude", "settings.json");
  const codexConfigFile = path.join(CONFIGDIR, "profiles", followingProfileId, "codex", "config.toml");
  const fingerprintFile = path.join(CONFIGDIR, "claude-model-discovery-fingerprint.json");
  rmSync(fingerprintFile, { force: true, recursive: true });
  mkdirSync(fingerprintFile, { recursive: true });

  const config = createDefaultAppConfig();
  config.Providers = [
    {
      api_base_url: "https://example.test/v1",
      api_key: "provider-key",
      models: ["alpha"],
      name: "Provider"
    }
  ];
  config.preferredProvider = "Provider";
  config.APIKEY = "llmr-claude-model-discovery-cache-failure-test";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `profile:${profileId}`,
      key: "llmr-claude-model-discovery-cache-failure-test",
      name: "Profile: Claude Model Discovery Cache Failure Test"
    }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [
    {
      agent: "claude-code",
      availableModels: ["Provider/alpha"],
      enabled: true,
      env: {},
      id: profileId,
      model: "Provider/alpha",
      name: "Claude Code",
      scope: "llmr",
      settingsFile,
      smallFastModel: "",
      surface: "cli"
    },
    {
      agent: "codex",
      availableModels: ["Provider/alpha"],
      configFile: codexConfigFile,
      enabled: true,
      env: {},
      id: followingProfileId,
      model: "Provider/alpha",
      name: "Codex",
      scope: "llmr",
      smallFastModel: "",
      surface: "cli"
    }
  ];

  try {
    const result = await applyProfileFixture(config);
    const claudeStatus = result.clients.find((client) => client.client === "claude-code");
    assert.equal(claudeStatus?.ok, false, "a failed cache invalidation must be reported as a contained Claude Code error");
    assert.ok(result.clients.some((client) => client.client === "codex"), "profiles after the failing one must still be applied");
  } finally {
    rmSync(fingerprintFile, { force: true, recursive: true });
  }
});

// Profile application reads credentials from their authoritative store. Persist
// each fixture explicitly; config snapshots are no longer credential updates.
function defaultHomeClaudeFixture(id, extra = {}) {
  const profile = { agent: "claude-code", enabled: true, env: {}, id, model: "Provider/model", name: id, scope: "global", smallFastModel: "", surface: "cli", ...extra };
  const config = createDefaultAppConfig();
  config.APIKEY = `llmr-${id}`;
  config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${id}`, key: `llmr-${id}`, name: id }];
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  return { config, profile };
}

function configWithProviderAndEnabledProfile(profileId) {
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.enabled = true;
  config.profile.profiles.find((profile) => profile.id === profileId).enabled = true;
  return config;
}

async function applyProfileFixture(config, options) {
  await replacePersistedApiKeys(config.APIKEYS ?? []);
  return applyProfileConfig(config, options);
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function globalPiProfile(agentDir) {
  return { agent: "pi", configFile: agentDir, enabled: true, env: {}, id: "pi-global", model: "", name: "Pi", scope: "global", surface: "cli" };
}

test("a global Pi profile restores the user's models.json on release", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-pi-release-"));
  try {
    const agentDir = path.join(root, "pi-agent");
    const piModels = path.join(agentDir, "models.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(piModels, `${JSON.stringify({ providers: { "my-ollama": { baseUrl: "http://localhost:11434" } } })}\n`);
    const profile = globalPiProfile(agentDir);

    writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token", "default");
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(piModels, "utf8")).providers), ["llm-router"]);
    restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(piModels, "utf8")).providers), ["my-ollama"]);

    writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token", "default");
    const statuses = restoreGlobalProfileConfigsOnExit([profile], { manageMarker: false });
    assert.equal(statuses.every((status) => status.ok), true);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(piModels, "utf8")).providers), ["my-ollama"]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a global Pi profile deletes the models.json it created", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-pi-release-missing-"));
  try {
    const agentDir = path.join(root, "pi-agent");
    const piModels = path.join(agentDir, "models.json");
    const profile = globalPiProfile(agentDir);

    writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token", "default");
    assert.equal(existsSync(piModels), true);
    restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]);
    assert.equal(existsSync(piModels), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("the Pi sweep leaves a models.json alone when LLMR never took it over", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-pi-sweep-untouched-"));
  try {
    const agentDir = path.join(root, "pi-agent");
    const piModels = path.join(agentDir, "models.json");
    mkdirSync(agentDir, { recursive: true });
    const userModels = `${JSON.stringify({ providers: { "llm-router": { baseUrl: "http://localhost:9999" } } })}\n`;
    writeFileSync(piModels, userModels);
    const statuses = restoreInactiveGlobalProfileConfigs([{ ...globalPiProfile(agentDir), scope: "llmr" }]);
    assert.deepEqual(statuses.filter((status) => status.client === "pi"), []);
    assert.equal(readFileSync(piModels, "utf8"), userModels);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function globalWorkbuddyProfile(workbuddyHome) {
  return { agent: "workbuddy", codexHome: workbuddyHome, enabled: true, env: {}, id: "workbuddy-global", model: "gpt-5-codex", name: "WorkBuddy", scope: "global", surface: "app" };
}

test("a global Workbuddy profile restores the user's models.json on release", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-workbuddy-release-"));
  try {
    const workbuddyHome = path.join(root, ".workbuddy");
    const workbuddyModels = path.join(workbuddyHome, "models.json");
    const userModels = { models: [{ apiKey: "sk-user", id: "my-model" }] };
    mkdirSync(workbuddyHome, { recursive: true });
    writeFileSync(workbuddyModels, `${JSON.stringify(userModels)}\n`);
    const profile = globalWorkbuddyProfile(workbuddyHome);

    writeWorkbuddyModelsConfig(workbuddyHome, profile);
    assert.notDeepEqual(JSON.parse(readFileSync(workbuddyModels, "utf8")), userModels);
    restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]);
    assert.deepEqual(JSON.parse(readFileSync(workbuddyModels, "utf8")), userModels);

    writeWorkbuddyModelsConfig(workbuddyHome, profile);
    const statuses = restoreGlobalProfileConfigsOnExit([profile], { manageMarker: false });
    assert.equal(statuses.every((status) => status.ok), true);
    assert.deepEqual(JSON.parse(readFileSync(workbuddyModels, "utf8")), userModels);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a global Workbuddy profile deletes the models.json it created", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-workbuddy-release-missing-"));
  try {
    const workbuddyHome = path.join(root, ".workbuddy");
    const workbuddyModels = path.join(workbuddyHome, "models.json");
    const profile = globalWorkbuddyProfile(workbuddyHome);

    writeWorkbuddyModelsConfig(workbuddyHome, profile);
    assert.equal(existsSync(workbuddyModels), true);
    restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]);
    assert.equal(existsSync(workbuddyModels), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

for (const [label, makeProfile, relativeFile, managedContent, sweepWarns] of [
  ["Pi", (dir) => globalPiProfile(dir), "models.json", `${JSON.stringify({ providers: { "llm-router": { models: [] } } })}\n`, false],
  ["Workbuddy", (dir) => globalWorkbuddyProfile(dir), "models.json", `${JSON.stringify({ models: [{ apiKey: "${LLMR_PROFILE_API_KEY}", id: "gpt-5-codex" }] })}\n`, true]
]) {
  test(`a global ${label} release warns but succeeds when an upgraded models.json has no backup`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "llmr-models-no-backup-"));
    try {
      const dir = path.join(root, "home");
      const file = path.join(dir, relativeFile);
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, managedContent);
      const profile = makeProfile(dir);

      const exitStatuses = restoreGlobalProfileConfigsOnExit([profile], { manageMarker: false });
      assert.equal(exitStatuses.length, 1);
      assert.equal(exitStatuses[0].ok, true);
      assert.match(exitStatuses[0].message, /backup was found/);

      const inactiveStatuses = restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }])
        .filter((status) => status.path === file);
      assert.equal(inactiveStatuses.length, sweepWarns ? 1 : 0);
      assert.equal(inactiveStatuses.every((status) => status.ok && /backup was found/.test(status.message)), true);

      assert.equal(readFileSync(file, "utf8"), managedContent);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
}

function serializedApplyFixture(root, model) {
  const settingsFile = path.join(root, ".claude", "settings.json");
  const profile = {
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "default-claude-code",
    model,
    name: "Claude Code",
    scope: "global",
    settingsFile,
    smallFastModel: "",
    surface: "auto"
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-serialize-test";
  config.APIKEYS = [{
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `profile:${profile.id}`,
    key: "llmr-profile-serialize-test",
    name: "Profile: Claude Code"
  }];
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    api_key: "provider-key",
    models: ["one", "two"],
    name: "Provider"
  }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  return { config, settingsFile };
}

test("concurrent applies land in call order", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-apply-serialize-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const { config: first, settingsFile } = serializedApplyFixture(root, "Provider/one");
    const { config: second } = serializedApplyFixture(root, "Provider/two");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, "{}\n");
    await Promise.all([applyProfileFixture(first), applyProfileFixture(second)]);
    assert.equal(JSON.parse(readFileSync(settingsFile, "utf8")).env.ANTHROPIC_MODEL, "Provider/two");
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

test("a rejected apply does not block the next one", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-apply-serialize-"));
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  try {
    rmSync(takeoverFile, { force: true });
    const { config, settingsFile } = serializedApplyFixture(root, "Provider/two");
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, "{}\n");
    await assert.rejects(applyProfileConfig(null));
    await applyProfileFixture(config);
    assert.equal(JSON.parse(readFileSync(settingsFile, "utf8")).env.ANTHROPIC_MODEL, "Provider/two");
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(root, { force: true, recursive: true });
  }
});

const userCodexAdditions = "\n[mcp_servers.mine]\ncommand = \"my-server\"\n\n[projects.\"/tmp/x\"]\ntrust_level = \"trusted\"\n";
const llmrCodexContent = /llm-router|LLMR|llmr/;

function filesUnder(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function filesHolding(dir, value) {
  return filesUnder(dir).filter((file) => readFileSync(file, "utf8").includes(value));
}

async function withAppliedDefaultProfiles(profileIds, run, beforeApply) {
  const runtimeHome = process.env.LLMR_INTERNAL_HOME_DIR;
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const claudeDir = path.join(runtimeHome, ".claude");
  const codexDir = path.join(runtimeHome, ".codex");
  const cleanUp = async () => {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(claudeDir, { force: true, recursive: true });
    rmSync(codexDir, { force: true, recursive: true });
    rmSync(path.join(CONFIGDIR, "agent-config-state"), { force: true, recursive: true });
    await replacePersistedApiKeys([]);
    await replacePersistedAppConfig(createDefaultAppConfig());
  };
  await cleanUp();
  try {
    const config = configWithProviderAndEnabledProfile(profileIds[0]);
    for (const profileId of profileIds.slice(1)) {
      config.profile.profiles.find((profile) => profile.id === profileId).enabled = true;
    }
    beforeApply?.({ claudeDir, codexDir });
    await applyProfileConfig(config);
    await replacePersistedAppConfig(config);
    const tokens = Object.fromEntries((await loadPersistedApiKeys()).map((apiKey) => [apiKey.id, apiKey.key]));
    const codexConfigFile = path.join(codexDir, "config.toml");
    const codexToken = tokens["profile:default-codex"];
    if (profileIds.includes("default-codex")) {
      assert.match(codexToken ?? "", /^llmr-profile-/);
      assert.ok(readFileSync(codexConfigFile, "utf8").includes(codexToken), "the applied config.toml holds the profile's token");
    }
    await run({ claudeDir, codexConfigFile, codexDir, codexToken, config });
  } finally {
    await cleanUp();
  }
}

function assertCodexKeepsOnlyUserContent({ codexConfigFile, codexDir, codexToken }) {
  const restored = readFileSync(codexConfigFile, "utf8");
  assert.match(restored, /\[mcp_servers\.mine\]/);
  assert.match(restored, /trust_level/);
  assert.doesNotMatch(restored, llmrCodexContent);
  assert.deepEqual(filesHolding(codexDir, codexToken), []);
  assert.equal(existsSync(`${codexConfigFile}.llmr-original-missing`), false);
  assert.deepEqual(codexBackups(codexDir), []);
}

function codexBackups(codexDir) {
  return existsSync(codexDir) ? readdirSync(codexDir).filter((name) => name.startsWith("config.toml.llmr-backup-")) : [];
}

// A copy of the live file as an apply wrote one before LLMR stopped keeping its token in backups.
function plantTokenBackup({ codexConfigFile }, stamp = "2026-01-01T00-00-00-000Z", content = readFileSync(codexConfigFile, "utf8")) {
  writeFileSync(`${codexConfigFile}.llmr-backup-${stamp}`, content);
}

function appendUserCodexTables({ codexConfigFile }) {
  writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}${userCodexAdditions}`);
}

test("restoring a Codex config LLMR created removes it, its marker and every copy of the token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, codexToken }) => {
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(codexConfigFile), false);
    assert.equal(existsSync(`${codexConfigFile}.llmr-original-missing`), false);
    assert.deepEqual(filesHolding(codexDir, codexToken), []);
  });
});

test("restoring a Codex config LLMR created keeps the tables the user or Codex added", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${userCodexAdditions}`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("restoring a Codex config keeps a model line the user changed", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    assert.match(applied, /^model = /m);
    writeFileSync(codexConfigFile, applied.replace(/^model = .*$/m, "model = \"my-own-model\""));
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(codexConfigFile, "utf8");
    assert.match(restored, /^model = "my-own-model"$/m);
    assert.doesNotMatch(restored, llmrCodexContent);
  });
});

test("restoring a Codex config whose LLMR markers were deleted by hand still removes LLMR's provider", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    const withoutMarkers = applied.replace(/^# (?:BEGIN|END) LLMR managed.*\n/gm, "");
    assert.notEqual(withoutMarkers, applied);
    writeFileSync(codexConfigFile, `${withoutMarkers}${userCodexAdditions}`);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(codexConfigFile, "utf8");
    assert.match(restored, /\[mcp_servers\.mine\]/);
    assert.doesNotMatch(restored, /model_providers\.llm-router|model_provider = "llm-router"|llmr-model-catalog/);
  });
});

function codexWrittenRecordFile(codexConfigFile) {
  const key = createHash("sha256").update(path.resolve(codexConfigFile)).digest("hex").slice(0, 16);
  return path.join(CONFIGDIR, "agent-config-state", key, "written.json");
}

function readCodexWrittenRecord(codexConfigFile) {
  return JSON.parse(readFileSync(codexWrittenRecordFile(codexConfigFile), "utf8"));
}

function applySecondCodexModel(config) {
  config.Providers[0].models.push("model-2");
  config.profile.profiles.find((profile) => profile.id === "default-codex").model = "Provider/model-2";
  return applyProfileConfig(config);
}

test("an apply records which Codex lines LLMR wrote, and every restore outcome clears the record", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const sha256 = (content) => createHash("sha256").update(content).digest("hex");
  const outcomes = {
    "the file is removed": { edit: () => undefined },
    "the file is stripped": { edit: appendUserCodexTables },
    "the original is written back": { edit: () => undefined, original: "model_provider = \"openai\"\n" }
  };
  for (const [name, { edit, original }] of Object.entries(outcomes)) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      const record = readCodexWrittenRecord(fixture.codexConfigFile);
      assert.equal(record.sha256, sha256(readFileSync(fixture.codexConfigFile, "utf8")), name);
      assert.equal(record.file, path.resolve(fixture.codexConfigFile), name);
      assert.equal(record.edited, false, name);
      assert.match(record.modelLine, /^model = /, name);
      edit(fixture);
      await recoverGlobalAgentProfile("default-codex");
      assert.equal(existsSync(codexWrittenRecordFile(fixture.codexConfigFile)), false, name);
    }, original === undefined ? undefined : ({ codexDir }) => {
      mkdirSync(codexDir, { recursive: true });
      writeFileSync(path.join(codexDir, "config.toml"), original);
    });
  }
});

function safetyCopies(file) {
  const stateDir = path.dirname(codexWrittenRecordFile(file));
  return filesUnder(stateDir).filter((copy) => path.basename(copy) !== "written.json");
}

test("restoring a Codex config someone else edited keeps a copy of it without the profile's token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const edits = {
    "edited after the last apply": appendUserCodexTables,
    "edited, then applied again": async (fixture) => {
      appendUserCodexTables(fixture);
      await applySecondCodexModel(fixture.config);
    }
  };
  for (const [name, edit] of Object.entries(edits)) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      await edit(fixture);
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      assertCodexKeepsOnlyUserContent(fixture);
      const copies = safetyCopies(fixture.codexConfigFile);
      assert.equal(copies.length, 1, name);
      const copy = readFileSync(copies[0], "utf8");
      assert.match(copy, /\[mcp_servers\.mine\]/, name);
      assert.match(copy, /\[model_providers\.llm-router\]/, name);
      assert.equal(copy.includes(fixture.codexToken), false, name);
      assert.equal(statSync(copies[0]).mode & 0o777, 0o600, name);
    });
  }
});

test("restoring an agent config nobody edited keeps no copy of it", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async ({ claudeDir, codexConfigFile }) => {
    await recoverGlobalAgentProfile("default-codex");
    await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(existsSync(codexConfigFile), false);
    assert.equal(existsSync(path.join(claudeDir, "settings.json")), false);
    assert.deepEqual(filesUnder(path.join(CONFIGDIR, "agent-config-state")), []);
  });
});

test("restoring a Claude Code settings file the user edited keeps a copy of it", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const applied = JSON.parse(readFileSync(settingsFile, "utf8"));
    writeFileSync(settingsFile, `${JSON.stringify({ ...applied, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.deepEqual(restored.permissions, { allow: ["Bash(ls)"] });
    assert.equal(restored.apiKeyHelper, undefined);
    const copies = safetyCopies(settingsFile);
    assert.equal(copies.length, 1);
    const copy = JSON.parse(readFileSync(copies[0], "utf8"));
    assert.deepEqual(copy.permissions, { allow: ["Bash(ls)"] });
    assert.equal(copy.apiKeyHelper, applied.apiKeyHelper);
  });
});

test("a restore after the user deleted their Claude Code settings keeps a copy of what the backups held", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir, config }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const applied = JSON.parse(readFileSync(settingsFile, "utf8"));
    writeFileSync(settingsFile, `${JSON.stringify({ ...applied, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    config.Providers[0].models.push("model-2");
    config.profile.profiles.find((profile) => profile.id === "default-claude-code").model = "Provider/model-2";
    await applyProfileConfig(config);
    await replacePersistedAppConfig(config);
    assert.equal(readdirSync(claudeDir).filter((name) => name.startsWith("settings.json.llmr-backup-")).length, 1);
    writeFileSync(`${settingsFile}.llmr-backup-9999-01-01T00-00-00-000Z`, "{ \"permissions\": ");
    rmSync(settingsFile);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(settingsFile), false);
    assert.deepEqual(readdirSync(claudeDir).filter((name) => name.includes("llmr")), []);
    const copies = safetyCopies(settingsFile);
    assert.equal(copies.length, 1);
    const copy = JSON.parse(readFileSync(copies[0], "utf8"));
    assert.deepEqual(copy.permissions, { allow: ["Bash(ls)"] });
    assert.equal(copy.apiKeyHelper, applied.apiKeyHelper);
  });
});

test("a restore after the user deleted their Codex config copies the newest backup that holds something of theirs", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, codexToken }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    plantTokenBackup({ codexConfigFile }, "2026-01-01T00-00-00-000Z", `${applied}\n[mcp_servers.older]\ncommand = "older"\n`);
    plantTokenBackup({ codexConfigFile }, "2026-01-02T00-00-00-000Z", `${applied}\n[mcp_servers.newer]\ncommand = "newer"\n`);
    plantTokenBackup({ codexConfigFile }, "2026-01-03T00-00-00-000Z", applied);
    const backups = codexBackups(codexDir).sort().map((name) => readFileSync(path.join(codexDir, name), "utf8"));
    assert.deepEqual(backups.map((backup) => /mcp_servers\.(\w+)/.exec(backup)?.[1]), ["older", "newer", undefined]);
    rmSync(codexConfigFile);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(codexConfigFile), false);
    assert.deepEqual(codexBackups(codexDir), []);
    const copies = safetyCopies(codexConfigFile);
    assert.equal(copies.length, 1);
    const copy = readFileSync(copies[0], "utf8");
    assert.match(copy, /\[mcp_servers\.newer\]/);
    assert.match(copy, /\[model_providers\.llm-router\]/);
    assert.equal(copy.includes(codexToken), false);
  });
});

test("restoring a Claude Code settings file the user replaced with their own leaves it alone and keeps no copy", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const own = `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`;
    writeFileSync(settingsFile, own);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(settingsFile, "utf8"), own);
    assert.deepEqual(readdirSync(claudeDir).filter((name) => name.includes("llmr")), []);
    assert.deepEqual(safetyCopies(settingsFile), []);
  });
});

test("a restore that cannot save its copy leaves the edited config as it was", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async (t) => {
  await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async (fixture) => {
    const settingsFile = path.join(fixture.claudeDir, "settings.json");
    appendUserCodexTables(fixture);
    writeFileSync(settingsFile, `${JSON.stringify({ ...JSON.parse(readFileSync(settingsFile, "utf8")), permissions: {} }, null, 2)}\n`);
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
    for (const [profileId, file] of [["default-codex", fixture.codexConfigFile], ["default-claude-code", settingsFile]]) {
      const before = readFileSync(file, "utf8");
      const copyInTheWay = path.join(path.dirname(codexWrittenRecordFile(file)), `${path.basename(file)}.llmr-backup-2026-11-21T00-00-00-000Z`);
      mkdirSync(copyInTheWay, { recursive: true });
      const result = await recoverGlobalAgentProfile(profileId).catch((error) => ({ status: { message: String(error), ok: false } }));
      assert.equal(result.status.ok, false, profileId);
      assert.match(result.status.message, /EISDIR/, profileId);
      assert.equal(readFileSync(file, "utf8"), before, profileId);
      assert.equal(existsSync(`${file}.llmr-original-missing`), true, profileId);
      rmSync(copyInTheWay, { recursive: true });
    }
    t.mock.timers.reset();
  });
});

test("a restore that cannot save its copy does not stop another agent being applied or restored", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async (t) => {
  const agents = { "claude-code": "default-claude-code", codex: "default-codex" };
  for (const [blocked, other] of [["codex", "claude-code"], ["claude-code", "codex"]]) {
    await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async (fixture) => {
      const settingsFile = path.join(fixture.claudeDir, "settings.json");
      const files = { "claude-code": settingsFile, codex: fixture.codexConfigFile };
      appendUserCodexTables(fixture);
      writeFileSync(settingsFile, `${JSON.stringify({ ...JSON.parse(readFileSync(settingsFile, "utf8")), permissions: {} }, null, 2)}\n`);
      const before = readFileSync(files[blocked], "utf8");
      t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
      const copyInTheWay = path.join(path.dirname(codexWrittenRecordFile(files[blocked])), `${path.basename(files[blocked])}.llmr-backup-2026-11-21T00-00-00-000Z`);
      mkdirSync(copyInTheWay, { recursive: true });
      fixture.config.profile.profiles.find((profile) => profile.id === agents[blocked]).enabled = false;
      const applied = await applyProfileConfig(fixture.config);
      assert.equal(applied.clients.some((status) => status.client === blocked && !status.ok && /EISDIR/.test(status.message)), true, JSON.stringify(applied.clients));
      assert.equal(applied.clients.some((status) => status.client === other && status.ok), true, JSON.stringify(applied.clients));
      assert.equal(readFileSync(files[blocked], "utf8"), before, blocked);
      assert.match(readFileSync(files[other], "utf8"), /llmr|llm-router/i, blocked);
      const statuses = restoreGlobalProfileConfigsOnExit(fixture.config.profile.profiles, { manageMarker: true });
      assert.equal(statuses.some((status) => !status.ok), true, JSON.stringify(statuses));
      assert.doesNotMatch(readFileSync(files[other], "utf8"), /apiKeyHelper|llm-router/, blocked);
      assert.equal(readFileSync(files[blocked], "utf8"), before, blocked);
      rmSync(copyInTheWay, { recursive: true });
      t.mock.timers.reset();
      restoreGlobalProfileConfigsOnExit(fixture.config.profile.profiles, { manageMarker: true });
      assert.doesNotMatch(readFileSync(files[blocked], "utf8"), /apiKeyHelper|llm-router/, blocked);
    });
  }
});

test("a re-apply marks the record edited once someone else has changed the Codex config", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    await applyProfileConfig(fixture.config);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).edited, false);
    appendUserCodexTables(fixture);
    await applyProfileConfig(fixture.config);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).edited, true);
    await applyProfileConfig(fixture.config);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).edited, true);
  });
});

test("a changed profile model reaches a Codex config after Codex dropped LLMR's comment", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    const withoutComment = applied.replace(/^# LLMR configured model = .*\n/m, "").replace(/^# END LLMR managed profile\n/m, "");
    assert.notEqual(withoutComment, applied);
    writeFileSync(fixture.codexConfigFile, withoutComment);
    await applySecondCodexModel(fixture.config);
    assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /^model = "Provider\/model-2"$/m);
  });
});

test("restoring a Codex config after Codex dropped LLMR's comment leaves no model line of LLMR's", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    writeFileSync(fixture.codexConfigFile, applied.replace(/^# LLMR configured model = .*\n/m, "").replace(/^# END LLMR managed profile\n/m, userCodexAdditions.trimStart()));
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assert.doesNotMatch(restored, /^model = /m);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("the user's own Codex model line comes back after the profile's model went away and back", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model = \"Provider/model\"\n\n[mcp_servers.mine]\ncommand = \"my-server\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).modelLine, undefined);
    await applySecondCodexModel(fixture.config);
    assert.match(readCodexWrittenRecord(fixture.codexConfigFile).modelLine, /model-2/);
    fixture.config.profile.profiles.find((profile) => profile.id === "default-codex").model = "Provider/model";
    await applyProfileConfig(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), original);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), original);
  });
});

test("a record left over from an earlier takeover does not cost the user a Codex model line", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model = \"my-own\"\n\n[mcp_servers.mine]\ncommand = \"my-server\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /^model = "my-own"$/m);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).modelLine, undefined);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), original);
  }, ({ codexDir }) => {
    const codexConfigFile = path.join(codexDir, "config.toml");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(codexConfigFile, original);
    mkdirSync(path.dirname(codexWrittenRecordFile(codexConfigFile)), { recursive: true });
    writeFileSync(codexWrittenRecordFile(codexConfigFile), JSON.stringify({ edited: false, file: path.resolve(codexConfigFile), modelLine: "model = \"my-own\"", sha256: "stale" }));
  });
});

test("a Codex config from before LLMR kept a record still loses LLMR's model line on restore", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    writeFileSync(fixture.codexConfigFile, applied.replace(/^# LLMR configured model = .*\n/m, "").replace(/^# END LLMR managed profile\n/m, userCodexAdditions.trimStart()));
    rmSync(codexWrittenRecordFile(fixture.codexConfigFile));
    await applyProfileConfig(fixture.config);
    assert.match(readCodexWrittenRecord(fixture.codexConfigFile).modelLine, /^model = /);
    await recoverGlobalAgentProfile("default-codex");
    assert.doesNotMatch(readFileSync(fixture.codexConfigFile, "utf8"), /^model = /m);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("a record that cannot be removed does not turn a finished restore into a failure", { skip: !process.env.LLMR_INTERNAL_HOME_DIR || process.platform === "win32" }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const recordDir = path.dirname(codexWrittenRecordFile(fixture.codexConfigFile));
    chmodSync(recordDir, 0o500);
    try {
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      assert.equal(existsSync(fixture.codexConfigFile), false);
    } finally {
      chmodSync(recordDir, 0o700);
    }
  });
});

test("a show_all_sessions line LLMR wrote before it kept a record is still removed on restore", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    fixture.config.profile.profiles.find((profile) => profile.id === "default-codex").showAllSessions = true;
    await applyProfileConfig(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    rmSync(codexWrittenRecordFile(fixture.codexConfigFile));
    appendUserCodexTables(fixture);
    await applyProfileConfig(fixture.config);
    assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /^show_all_sessions = true$/m);
    await recoverGlobalAgentProfile("default-codex");
    assert.doesNotMatch(readFileSync(fixture.codexConfigFile, "utf8"), /show_all_sessions/);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("a restore that finds no backup keeps the record of what LLMR wrote", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    rmSync(`${fixture.codexConfigFile}.llmr-original-missing`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, false);
    assert.match(readCodexWrittenRecord(fixture.codexConfigFile).modelLine, /^model = /);
  });
});

test("when the record cannot be written the Codex config is left as it was", { skip: !process.env.LLMR_INTERNAL_HOME_DIR || process.platform === "win32" }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const before = readFileSync(fixture.codexConfigFile, "utf8");
    const recordDir = path.dirname(codexWrittenRecordFile(fixture.codexConfigFile));
    chmodSync(recordDir, 0o500);
    try {
      const result = await applySecondCodexModel(fixture.config);
      assert.equal(result.clients.find((client) => client.client === "codex").ok, false);
      assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), before);
    } finally {
      chmodSync(recordDir, 0o700);
    }
  });
});

test("a record with a field of the wrong type is no record", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    const recordFile = codexWrittenRecordFile(fixture.codexConfigFile);
    const record = readCodexWrittenRecord(fixture.codexConfigFile);
    writeFileSync(recordFile, JSON.stringify({ ...record, edited: "no" }));
    await applyProfileConfig(fixture.config);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).edited, true);
    writeFileSync(recordFile, JSON.stringify({ ...record, modelLine: 5 }));
    await recoverGlobalAgentProfile("default-codex");
    assert.doesNotMatch(readFileSync(fixture.codexConfigFile, "utf8"), /^model = /m);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("with no record a show_all_sessions line the user added below LLMR's block stays theirs", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    const edited = applied.replace(/^# END LLMR managed profile\n/m, "# END LLMR managed profile\nshow_all_sessions = false\n");
    assert.notEqual(edited, applied);
    writeFileSync(fixture.codexConfigFile, edited);
    rmSync(codexWrittenRecordFile(fixture.codexConfigFile));
    await applyProfileConfig(fixture.config);
    assert.equal(readCodexWrittenRecord(fixture.codexConfigFile).showAllSessionsLine, undefined);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), "show_all_sessions = false\n");
  });
});

test("a record that cannot be read is no record", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    writeFileSync(codexWrittenRecordFile(fixture.codexConfigFile), "{ not json");
    await recoverGlobalAgentProfile("default-codex");
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("restoring a Codex config with a value the user left open still removes LLMR's provider and token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, codexToken }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    const broken = "[mcp_servers.mine]\ncommand = \"my-server\"\ndescription = \"\"\"oops\n";
    const edited = applied.replace("# BEGIN LLMR managed Codex provider", `${broken}# BEGIN LLMR managed Codex provider`);
    assert.notEqual(edited, applied);
    writeFileSync(codexConfigFile, edited);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(codexConfigFile, "utf8"), broken);
    assert.deepEqual(filesHolding(codexDir, codexToken), []);
  });
});

test("restoring a Codex config twice changes nothing the second time", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir }) => {
    writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}${userCodexAdditions}`);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(codexConfigFile, "utf8");
    assert.match(restored, /\[mcp_servers\.mine\]/);
    const files = filesUnder(codexDir);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(codexConfigFile, "utf8"), restored);
    assert.deepEqual(filesUnder(codexDir), files);
  });
});

test("switching the Codex profile off while Claude Code stays on keeps the user's Codex tables", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${userCodexAdditions}`);
    fixture.config.profile.profiles.find((profile) => profile.id === "default-codex").enabled = false;
    const result = await applyProfileConfig(fixture.config);
    assert.equal(result.clients.some((client) => client.client === "claude-code" && client.enabled && client.ok), true);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("deleting the Codex profile keeps the user's Codex tables", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${userCodexAdditions}`);
    fixture.config.profile.profiles = fixture.config.profile.profiles.filter((profile) => profile.id !== "default-codex");
    await applyProfileConfig(fixture.config);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("the sweep for a Codex profile that is no longer global keeps the user's Codex tables", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${userCodexAdditions}`);
    const profile = fixture.config.profile.profiles.find((item) => item.id === "default-codex");
    restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]);
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("restoring a Claude Code settings file LLMR created leaves nothing named llmr beside it", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    assert.match(readFileSync(settingsFile, "utf8"), /apiKeyHelper/);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(settingsFile), false);
    assert.deepEqual(readdirSync(claudeDir).filter((name) => name.includes("llmr")), []);
  });
});

test("restoring a Claude Code settings file LLMR created does not bring back a key the user deleted", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir, config }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const applied = JSON.parse(readFileSync(settingsFile, "utf8"));
    writeFileSync(settingsFile, `${JSON.stringify({ ...applied, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    config.Providers[0].models.push("model-2");
    config.profile.profiles.find((profile) => profile.id === "default-claude-code").model = "Provider/model-2";
    await applyProfileConfig(config);
    await replacePersistedAppConfig(config);
    const backups = readdirSync(claudeDir).filter((name) => name.startsWith("settings.json.llmr-backup-"));
    assert.equal(backups.length, 1);
    assert.match(readFileSync(path.join(claudeDir, backups[0]), "utf8"), /permissions/);
    const { permissions, ...withoutPermissions } = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.deepEqual(permissions, { allow: ["Bash(ls)"] });
    writeFileSync(settingsFile, `${JSON.stringify(withoutPermissions, null, 2)}\n`);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(settingsFile), false);
    assert.deepEqual(readdirSync(claudeDir).filter((name) => name.includes("llmr")), []);
  });
});

test("a stale original-missing marker does not cost the user their own Codex config", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model_provider = \"openai\"\n\n[mcp_servers.mine]\ncommand = \"my-server\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    assert.match(readFileSync(codexConfigFile, "utf8"), /\[model_providers\.llm-router\]/);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(codexConfigFile, "utf8"), original);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), original);
    writeFileSync(path.join(codexDir, "config.toml.llmr-original-missing"), "");
  });
});

function truncatedClaudeSettings(settingsFile) {
  const applied = readFileSync(settingsFile, "utf8");
  const truncated = applied.slice(0, Math.floor(applied.length * 0.7));
  assert.throws(() => JSON.parse(truncated));
  assert.match(truncated, /llmr-claude-code-api-key-/);
  return truncated;
}

test("a stale marker beside an old clean backup still restores the user's newest Claude Code settings", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    assert.match(readFileSync(settingsFile, "utf8"), /apiKeyHelper/);
    await recoverGlobalAgentProfile("default-claude-code");
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), { env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "my-opus", NO_PROXY: "corp.internal" } });
  }, ({ claudeDir }) => {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(path.join(claudeDir, "settings.json.llmr-original-missing"), "");
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2000-01-01T00-00-00-000Z"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }));
    writeFileSync(path.join(claudeDir, "settings.json"), `${JSON.stringify({ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "my-opus", NO_PROXY: "localhost,corp.internal" } })}\n`);
  });
});

test("a truncated copy of LLMR's settings among the backups is not restored", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), truncatedClaudeSettings(settingsFile));
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(settingsFile), false);
  });
});

test("a truncated copy of LLMR's settings does not displace the user's original", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } })}\n`;
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const truncated = truncatedClaudeSettings(settingsFile);
    const { apiKeyHelper, env } = JSON.parse(readFileSync(settingsFile, "utf8"));
    writeFileSync(settingsFile, `${JSON.stringify({ apiKeyHelper, env }, null, 2)}\n`);
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), truncated);
    await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(readFileSync(settingsFile, "utf8"), original);
  }, ({ claudeDir }) => {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(path.join(claudeDir, "settings.json"), original);
  });
});

test("a backup that does not parse is not restored whatever it holds", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } })}\n`;
  for (const damaged of ["{\n  \"apiKeyH", "{ \"permissions\": "]) {
    await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
      const settingsFile = path.join(claudeDir, "settings.json");
      const { apiKeyHelper, env } = JSON.parse(readFileSync(settingsFile, "utf8"));
      writeFileSync(settingsFile, `${JSON.stringify({ apiKeyHelper, env }, null, 2)}\n`);
      writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), damaged);
      await recoverGlobalAgentProfile("default-claude-code");
      assert.equal(readFileSync(settingsFile, "utf8"), original);
    }, ({ claudeDir }) => {
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(path.join(claudeDir, "settings.json"), original);
    });
  }
});

test("a backup that carries one mark of a takeover is not restored when no original existed", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const marks = {
    "LLMR's helper": (applied) => ({ apiKeyHelper: applied.apiKeyHelper }),
    "one gateway key on the recorded endpoint": (applied) => ({ env: { ANTHROPIC_BASE_URL: applied.env.ANTHROPIC_BASE_URL } }),
    "LLMR's federation rule": () => ({ env: { ANTHROPIC_FEDERATION_RULE_ID: "llmr-local" } })
  };
  for (const [name, mark] of Object.entries(marks)) {
    await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
      const settingsFile = path.join(claudeDir, "settings.json");
      const applied = JSON.parse(readFileSync(settingsFile, "utf8"));
      writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, ...mark(applied) }));
      await recoverGlobalAgentProfile("default-claude-code");
      assert.equal(existsSync(settingsFile), false, name);
    });
  }
});

test("the sweep for a Claude Code profile that is gone does not restore a backup that does not parse", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = `${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } })}\n`;
  const plantOriginal = ({ claudeDir }) => {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(path.join(claudeDir, "settings.json"), original);
  };
  const managed = `${JSON.stringify({ apiKeyHelper: "/tmp/llmr-claude-code-api-key-test", env: { ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456", ANTHROPIC_BASE_URL: "http://127.0.0.1:3456", CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456" } })}\n`;
  // With the profile's takeover state on disk the sweep takes the orphaned matcher.
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const { apiKeyHelper, env } = JSON.parse(readFileSync(settingsFile, "utf8"));
    writeFileSync(settingsFile, `${JSON.stringify({ apiKeyHelper, env }, null, 2)}\n`);
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), "{\n  \"apiKeyH");
    restoreInactiveGlobalProfileConfigs([]);
    assert.equal(readFileSync(settingsFile, "utf8"), original);
  }, plantOriginal);
  // With no Claude Code state at all it takes the bare matcher.
  await withAppliedDefaultProfiles(["default-codex"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(`${settingsFile}.llmr-original`, original);
    writeFileSync(`${settingsFile}.llmr-backup-2099-01-01T00-00-00-000Z`, "{\n  \"apiKeyH");
    writeFileSync(settingsFile, managed);
    restoreInactiveGlobalProfileConfigs([]);
    assert.equal(readFileSync(settingsFile, "utf8"), original);
  });
});

test("with no endpoint on record a backup that points at LLMR's address is not restored", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const endpoint = "http://127.0.0.1:3456";
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(`${settingsFile}.llmr-original-missing`, "");
    writeFileSync(`${settingsFile}.llmr-backup-2099-01-01T00-00-00-000Z`, JSON.stringify({ env: { ANTHROPIC_BASE_URL: endpoint, NO_PROXY: "127.0.0.1" }, permissions: { allow: ["Bash(ls)"] } }));
    writeFileSync(settingsFile, `${JSON.stringify({ apiKeyHelper: "/tmp/llmr-claude-code-api-key-test", env: { ANTHROPIC_API_BASE_URL: endpoint, ANTHROPIC_BASE_URL: endpoint, CLAUDE_AGENT_API_BASE_URL: endpoint } })}\n`);
    restoreInactiveGlobalProfileConfigs([]);
    assert.equal(existsSync(settingsFile), false);
  });
});

test("a backup that holds LLMR's leftover env keys does not bring them back", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const { ANTHROPIC_API_BASE_URL, ANTHROPIC_BASE_URL, CLAUDE_AGENT_API_BASE_URL, ...leftover } = JSON.parse(readFileSync(settingsFile, "utf8")).env;
    const backup = JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, env: leftover });
    assert.match(backup, /CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY/);
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), backup);
    await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(existsSync(settingsFile) && readFileSync(settingsFile, "utf8").includes("CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY"), false);
  });
});

test("a takeover copy from before a port change is not restored", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const oldEndpoint = "http://127.0.0.1:9999";
    writeFileSync(path.join(claudeDir, "settings.json.llmr-backup-2099-01-01T00-00-00-000Z"), JSON.stringify({
      env: { ANTHROPIC_API_BASE_URL: oldEndpoint, ANTHROPIC_BASE_URL: oldEndpoint, CLAUDE_AGENT_API_BASE_URL: oldEndpoint },
      permissions: { allow: ["Bash(ls)"] }
    }));
    await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(existsSync(settingsFile), false);
  });
});

test("restoring original settings revokes the profile's key", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async () => {
    await recoverGlobalAgentProfile("default-codex");
    assert.deepEqual((await loadPersistedApiKeys()).filter((apiKey) => apiKey.id === "profile:default-codex"), []);
  });
});

test("restoring an OpenCode config LLMR created still keeps a backup of it", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-opencode-no-original-"));
  try {
    const openCodeFile = path.join(root, "opencode.jsonc");
    writeFileSync(openCodeFile, `${JSON.stringify({ model: "llm-router/test", provider: { "llm-router": { options: { headers: { "x-llmr-client": "opencode" } } } } })}\n`);
    writeFileSync(`${openCodeFile}.llmr-original-missing`, "");
    const statuses = restoreGlobalProfileConfigsOnExit([{
      agent: "opencode", configFile: openCodeFile, enabled: true, env: {}, id: "opencode", model: "test", name: "OpenCode",
      providerId: "llm-router", scope: "global", surface: "auto"
    }], { manageMarker: false });
    assert.equal(statuses.every((status) => status.ok), true);
    assert.equal(existsSync(openCodeFile), false);
    assert.equal(readdirSync(root).filter((name) => name.includes(".llmr-backup-")).length, 1);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("restoring a Codex config keeps a table Codex wrote inside LLMR's provider block", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    // codex-cli 0.171.0 `codex mcp add` puts the new table above the file's last comment line.
    const edited = applied.replace(/^# END LLMR managed Codex provider$/m, "\n[mcp_servers.mine]\ncommand = \"my-server\"\n# END LLMR managed Codex provider");
    assert.notEqual(edited, applied);
    writeFileSync(codexConfigFile, edited);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(codexConfigFile, "utf8"), "[mcp_servers.mine]\ncommand = \"my-server\"\n");
  });
});

test("restoring a Codex config LLMR created leaves no backup from an earlier apply", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${userCodexAdditions}`);
    plantTokenBackup(fixture);
    assert.ok(filesHolding(fixture.codexDir, fixture.codexToken).some((file) => file.includes(".llmr-backup-")), "the apply-time backup holds the token");
    await recoverGlobalAgentProfile("default-codex");
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("a config.toml the user deletes after a restore is not written back by the next sweep", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    plantTokenBackup(fixture);
    await recoverGlobalAgentProfile("default-codex");
    rmSync(fixture.codexConfigFile);
    const profile = fixture.config.profile.profiles.find((item) => item.id === "default-codex");
    assert.deepEqual(restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]), []);
    assert.equal(existsSync(fixture.codexConfigFile), false);
  });
});

test("restoring a Codex config twice does not bring back a table the user deleted", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    appendUserCodexTables(fixture);
    plantTokenBackup(fixture);
    writeFileSync(fixture.codexConfigFile, applied);
    await recoverGlobalAgentProfile("default-codex");
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(existsSync(fixture.codexConfigFile), false);
    assert.deepEqual(codexBackups(fixture.codexDir), []);
  });
});

test("restoring a Codex config removes LLMR's ToolHub and Context Archive servers", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    fixture.config.toolHub = { ...fixture.config.toolHub, enabled: true, llm: { ...fixture.config.toolHub.llm, apiKey: "resolver-key", baseUrl: "https://example.test/v1", model: "model" }, mcpServers: [{ command: "node", name: "backend", transport: "stdio" }] };
    fixture.config.contextArchive = { ...fixture.config.contextArchive, enabled: true };
    fixture.config.profile.profiles.find((profile) => profile.id === "default-codex").managedCompact = true;
    await applyProfileConfig(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(applied, /LLMR managed ToolHub MCP/);
    assert.match(applied, /LLMR managed Context Archive MCP/);
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    assertCodexKeepsOnlyUserContent(fixture);
  });
});

test("restoring a Codex config keeps a profiles table whose model matches LLMR's", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    const applied = readFileSync(codexConfigFile, "utf8");
    const configured = /# LLMR configured model = (.+)$/m.exec(applied)[1];
    writeFileSync(codexConfigFile, `${applied}\n[profiles.mine]\nmodel = ${configured}\n`);
    await recoverGlobalAgentProfile("default-codex");
    assert.match(readFileSync(codexConfigFile, "utf8"), /\[profiles\.mine\]\nmodel = /);
  });
});

test("a restored Codex config with nothing of LLMR's left is not rewritten by the next sweep", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    const kept = readFileSync(fixture.codexConfigFile, "utf8");
    const profile = fixture.config.profile.profiles.find((item) => item.id === "default-codex");
    assert.deepEqual(restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }]), []);
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), kept);
  });
});

test("restoring a Codex config removes a show_all_sessions line LLMR wrote", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    fixture.config.profile.profiles.find((profile) => profile.id === "default-codex").showAllSessions = true;
    await applyProfileConfig(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /show_all_sessions = true/);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(existsSync(fixture.codexConfigFile), false);
  });
});

test("restoring a Codex config the user already deleted removes the leftover marker", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    rmSync(codexConfigFile);
    assert.equal(existsSync(`${codexConfigFile}.llmr-original-missing`), true);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(existsSync(`${codexConfigFile}.llmr-original-missing`), false);
  });
});

test("restoring a Codex config removes a model_provider line the user requoted or commented", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const line of ["model_provider = 'llm-router'", "model_provider = \"llm-router\" # mine"]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      writeFileSync(fixture.codexConfigFile, readFileSync(fixture.codexConfigFile, "utf8").replace("model_provider = \"llm-router\"", line));
      appendUserCodexTables(fixture);
      await recoverGlobalAgentProfile("default-codex");
      assertCodexKeepsOnlyUserContent(fixture);
    });
  }
});

test("a disabled Codex profile listed after the enabled one that shares its file leaves that file alone", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const owner = fixture.config.profile.profiles.find((profile) => profile.id === "default-codex");
    fixture.config.profile.profiles = [owner, { ...owner, enabled: false, id: "second-codex", name: "Second Codex" }];
    await applyProfileConfig(fixture.config);
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(applied, /\[model_providers\.llm-router\]/);
    assert.match(applied, /LLMR managed Codex provider/);
    assert.equal(existsSync(`${fixture.codexConfigFile}.llmr-original-missing`), true);
  });
});

const userCodexOriginal = [
  "# my codex settings",
  "model = \"gpt-mine\"",
  "model_provider = \"openai\"",
  "model_catalog_json = \"/tmp/my-catalog.json\"",
  "show_all_sessions = true",
  "",
  "[profiles.llm-router]",
  "model = \"profile-model\"",
  "",
  "[projects.\"/tmp/own\"]",
  "trust_level = \"untrusted\"",
  ""
].join("\n");
const llmrCodexWrites = /LLMR|llmr-model-catalog|model_providers\.llm-router|model_provider = "llm-router"|Provider\/model/;

function plantCodexOriginal(content = userCodexOriginal) {
  return ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), content);
  };
}

function filesBesideCodexConfigHolding({ codexConfigFile, codexDir, codexToken }) {
  return filesHolding(codexDir, codexToken).filter((file) => file !== codexConfigFile);
}

function assertHoldsEveryLine(content, expected) {
  const lines = content.split("\n");
  for (const line of expected.split("\n").filter(Boolean)) {
    assert.equal(lines.filter((item) => item === line).length, 1, `${line}\n---\n${content}`);
  }
}

test("a Codex config edited while LLMR had it keeps the edit and gets back the user's own root lines and profile table", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}\n[mcp_servers.x]\ncommand = "x"\n`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assertHoldsEveryLine(restored, `${userCodexOriginal}[mcp_servers.x]\ncommand = "x"\n`);
    assert.match(restored, /\[profiles\.llm-router\]\nmodel = "profile-model"\n/);
    assert.doesNotMatch(restored, llmrCodexWrites);
    assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
    const copies = safetyCopies(fixture.codexConfigFile);
    assert.equal(copies.length, 1);
    assert.match(readFileSync(copies[0], "utf8"), /\[mcp_servers\.x\]/);
    assert.equal(existsSync(codexWrittenRecordFile(fixture.codexConfigFile)), false);
  }, plantCodexOriginal());
});

test("a Codex config nobody touched while LLMR had it comes back byte for byte, also after a second apply", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const reapply of [false, true]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      if (reapply) {
        await applySecondCodexModel(fixture.config);
        await replacePersistedAppConfig(fixture.config);
      }
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), userCodexOriginal, String(reapply));
      assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), [], String(reapply));
      assert.deepEqual(safetyCopies(fixture.codexConfigFile), [], String(reapply));
    }, plantCodexOriginal());
  }
});

test("the user's own Codex model line is back after the profile's model changed and the user added a table", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    await applySecondCodexModel(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /^model = "Provider\/model-2"$/m);
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assertHoldsEveryLine(restored, userCodexOriginal);
    assert.match(restored, /\[mcp_servers\.mine\]/);
    assert.doesNotMatch(restored, llmrCodexWrites);
  }, plantCodexOriginal());
});

test("no file beside a Codex config holds the profile's token after a second apply", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const original of [userCodexOriginal, undefined]) {
    for (const edit of [() => undefined, appendUserCodexTables]) {
      await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
        edit(fixture);
        await applySecondCodexModel(fixture.config);
        assert.ok(readFileSync(fixture.codexConfigFile, "utf8").includes(fixture.codexToken));
        assert.deepEqual(filesBesideCodexConfigHolding(fixture), []);
      }, original === undefined ? undefined : plantCodexOriginal(original));
    }
  }
});

test("a Codex config with Windows line endings holds no stray carriage return after an apply or a restore", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "# mine\r\nmodel = \"gpt-mine\"\r\nmodel_provider = \"openai\"\r\nshow_all_sessions = true\r\n\r\n[mcp_servers.mine]\r\ncommand = \"my-server\"\r\n";
  const bareCarriageReturn = /\r(?!\n)/;
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    assert.doesNotMatch(readFileSync(codexConfigFile, "utf8"), bareCarriageReturn);
    writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\r\n[mcp_servers.later]\r\ncommand = "later"\r\n`);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(codexConfigFile, "utf8");
    assert.doesNotMatch(restored, bareCarriageReturn);
    assert.match(restored, /\[mcp_servers\.later\]/);
    assert.match(restored, /^model_provider = "openai"\r?$/m);
    assert.doesNotMatch(restored, llmrCodexContent);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), original);
  });
});

test("a second Codex apply reports no change and repairs the file's mode, and an apply after an edit reports one", { skip: !process.env.LLMR_INTERNAL_HOME_DIR || process.platform === "win32" }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const codexStatus = async () => (await applyProfileConfig(fixture.config)).clients.find((status) => status.client === "codex");
    chmodSync(fixture.codexConfigFile, 0o644);
    assert.match((await codexStatus()).message, /already matches LLMR/);
    assert.equal(statSync(fixture.codexConfigFile).mode & 0o777, 0o600);
    appendUserCodexTables(fixture);
    assert.match((await codexStatus()).message, /is managed by LLMR/);
  });
});

test("an original with a child table under the profile table comes back with each header once", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model_provider = \"openai\"\n\n[profiles.llm-router]\nmodel = \"p\"\n\n[profiles.llm-router.features]\nx = true\n";
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assert.deepEqual(restored.match(/^\[profiles\.llm-router[^\n]*$/gm).sort(), ["[profiles.llm-router.features]", "[profiles.llm-router]"]);
    assert.equal(restored.match(/^model_provider = /gm).length, 1);
    assert.match(restored, /\[mcp_servers\.mine\]/);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), original);
  });
});

test("a restore after the user deleted their Codex config brings back the backup an apply wrote, with their edit and no token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    await applySecondCodexModel(fixture.config);
    assert.equal(codexBackups(fixture.codexDir).length, 1);
    rmSync(fixture.codexConfigFile);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(restored, /\[mcp_servers\.mine\]/);
    assert.match(restored, /^model_provider = "openai"$/m);
    assert.doesNotMatch(restored, llmrCodexContent);
    assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), "model_provider = \"openai\"\n");
  });
});

test("an apply over an edited Codex config goes ahead when the saved original cannot be read, and keeps a copy of the edit", { skip: !process.env.LLMR_INTERNAL_HOME_DIR || process.platform === "win32" }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const original = `${fixture.codexConfigFile}.llmr-original`;
    appendUserCodexTables(fixture);
    writeFileSync(fixture.codexConfigFile, readFileSync(fixture.codexConfigFile, "utf8").replace(/^model = .*$/m, "model = \"my-own-model\""));
    chmodSync(original, 0o000);
    try {
      const applied = await applySecondCodexModel(fixture.config);
      assert.deepEqual(applied.clients.filter((status) => !status.ok), []);
      assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /^model = "Provider\/model-2"$/m);
      assert.match(readFileSync(fixture.codexConfigFile, "utf8"), /\[mcp_servers\.mine\]/);
      assert.deepEqual(codexBackups(fixture.codexDir), []);
      const copies = safetyCopies(fixture.codexConfigFile);
      assert.equal(copies.length, 1);
      assert.match(readFileSync(copies[0], "utf8"), /^model = "my-own-model"$/m);
      assert.equal(readFileSync(copies[0], "utf8").includes(fixture.codexToken), false);
    } finally {
      chmodSync(original, 0o600);
    }
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), "model_provider = \"openai\"\n");
  });
});

test("an apply over an edited Codex config keeps a backup of the user's content with nothing of LLMR's, and a restore keeps the edit", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    await applySecondCodexModel(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    assert.deepEqual(codexBackups(fixture.codexDir), []);
    // Codex drops LLMR's comment when it rewrites the file, so only the record names LLMR's model line.
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8").replace(/^# LLMR configured model = .*\n/m, "")}${userCodexAdditions}`);
    await applyProfileConfig(fixture.config);
    const backups = codexBackups(fixture.codexDir);
    assert.equal(backups.length, 1);
    const backup = readFileSync(path.join(fixture.codexDir, backups[0]), "utf8");
    assertHoldsEveryLine(backup, `${userCodexOriginal}${userCodexAdditions}`);
    assert.doesNotMatch(backup, llmrCodexWrites);
    assert.equal(statSync(path.join(fixture.codexDir, backups[0])).mode & 0o777, 0o600);
    await applyProfileConfig(fixture.config);
    assert.equal(codexBackups(fixture.codexDir).length, 1);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assertHoldsEveryLine(restored, `${userCodexOriginal}${userCodexAdditions}`);
    assert.doesNotMatch(restored, llmrCodexWrites);
  }, plantCodexOriginal());
});

test("an apply over a managed Codex config with neither an original nor its marker copies no token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    rmSync(`${fixture.codexConfigFile}.llmr-original-missing`);
    appendUserCodexTables(fixture);
    await applySecondCodexModel(fixture.config);
    assert.deepEqual(filesBesideCodexConfigHolding(fixture), []);
    assert.equal(existsSync(`${fixture.codexConfigFile}.llmr-original`), false);
  });
});

test("an apply over a Codex config the user emptied of their own tables writes no empty backup", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(applied, /\[mcp_servers\.only\]\ncommand = "only"\n/);
    writeFileSync(fixture.codexConfigFile, applied.replace(/\[mcp_servers\.only\]\ncommand = "only"\n/, ""));
    await applySecondCodexModel(fixture.config);
    assert.deepEqual(codexBackups(fixture.codexDir), []);
  }, plantCodexOriginal("[mcp_servers.only]\ncommand = \"only\"\n"));
});

test("an apply over the user's own Codex config that still held a line of LLMR's backs it up without that line", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, "model_provider = \"llm-router\"\n\n[mcp_servers.x]\ncommand = \"x\"\n");
    await applySecondCodexModel(fixture.config);
    const backups = codexBackups(fixture.codexDir);
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(path.join(fixture.codexDir, backups[0]), "utf8"), "[mcp_servers.x]\ncommand = \"x\"\n");
  }, plantCodexOriginal());
});

test("a table the user added to a Codex config LLMR created and then deleted does not come back", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const added = "\n[mcp_servers.mine]\ncommand = \"my-server\"\n";
    writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${added}`);
    await applySecondCodexModel(fixture.config);
    await replacePersistedAppConfig(fixture.config);
    assert.deepEqual(codexBackups(fixture.codexDir), []);
    const reapplied = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(reapplied, /\[mcp_servers\.mine\]\ncommand = "my-server"\n/);
    writeFileSync(fixture.codexConfigFile, reapplied.replace(/\[mcp_servers\.mine\]\ncommand = "my-server"\n/, ""));
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(existsSync(fixture.codexConfigFile), false);
    assert.deepEqual(readdirSync(fixture.codexDir).filter((name) => name.startsWith("config.toml.")), []);
  });
});

test("seven launches and quits leave the user's Codex config as it was, with no token and no repeated backup beside it", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    let expected = userCodexOriginal;
    for (let cycle = 1; cycle <= 7; cycle += 1) {
      if (cycle === 4) {
        expected = `${expected}\n[mcp_servers.between]\ncommand = "between"\n`;
        writeFileSync(fixture.codexConfigFile, expected);
      }
      if (cycle > 1) {
        await applyProfileConfig(fixture.config);
      }
      assert.ok(readFileSync(fixture.codexConfigFile, "utf8").includes(fixture.codexToken), String(cycle));
      const statuses = restoreGlobalProfileConfigsOnExit(fixture.config.profile.profiles, { manageMarker: true });
      assert.deepEqual(statuses.filter((status) => !status.ok), [], String(cycle));
      assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), expected, String(cycle));
      assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), [], String(cycle));
    }
    assert.equal(readFileSync(`${fixture.codexConfigFile}.llmr-original`, "utf8"), userCodexOriginal);
    const backups = codexBackups(fixture.codexDir).sort().map((name) => readFileSync(path.join(fixture.codexDir, name), "utf8"));
    assert.deepEqual(backups, [expected]);
  }, plantCodexOriginal());
});

test("a Codex config the user replaced with their own and went on editing keeps both, and no file beside it holds the token", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const own = "model_provider = \"mine\"\n\n[model_providers.mine]\nbase_url = \"https://mine.invalid/v1\"\n";
  for (const original of [userCodexOriginal, undefined]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      writeFileSync(fixture.codexConfigFile, own);
      await applySecondCodexModel(fixture.config);
      await replacePersistedAppConfig(fixture.config);
      appendUserCodexTables(fixture);
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      const restored = readFileSync(fixture.codexConfigFile, "utf8");
      assertHoldsEveryLine(restored, `${own}${userCodexAdditions}`);
      assert.doesNotMatch(restored, llmrCodexWrites);
      assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
    }, original === undefined ? undefined : plantCodexOriginal(original));
  }
});

test("a Codex config with an original and no record of what LLMR wrote is stripped, not replaced", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    rmSync(codexWrittenRecordFile(fixture.codexConfigFile));
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assertHoldsEveryLine(restored, `${userCodexOriginal}${userCodexAdditions}`);
    assert.doesNotMatch(restored, llmrCodexWrites);
    assert.equal(safetyCopies(fixture.codexConfigFile).length, 1);
  }, plantCodexOriginal());
});

test("a Codex config left with only LLMR's root lines gets the user's own back, and a copy is kept", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const applied = readFileSync(fixture.codexConfigFile, "utf8");
    const leftover = applied.slice(0, applied.indexOf("# BEGIN LLMR managed Codex provider")).replace(/^# (?:BEGIN|END) LLMR managed.*\n/gm, "");
    assert.match(leftover, /^model_provider = "llm-router"$/m);
    writeFileSync(fixture.codexConfigFile, `${leftover}\n[mcp_servers.x]\ncommand = "x"\n`);
    const backupsBefore = codexBackups(fixture.codexDir);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assert.match(restored, /^model_provider = "openai"$/m);
    assert.match(restored, /^model_catalog_json = "\/tmp\/my-catalog.json"$/m);
    assert.match(restored, /\[mcp_servers\.x\]/);
    assert.doesNotMatch(restored, llmrCodexWrites);
    assert.deepEqual(codexBackups(fixture.codexDir), backupsBefore);
    assert.equal(safetyCopies(fixture.codexConfigFile).length, 1);
  }, plantCodexOriginal());
});

test("the user's Codex config is backed up even when an old backup beside a stale marker strips down to the same text", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const own = "model_provider = \"openai\"\n\n[mcp_servers.mine]\ncommand = \"my-server\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(codexConfigFile, "utf8"), own);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), own);
    writeFileSync(path.join(codexDir, "config.toml.llmr-original-missing"), "");
    writeFileSync(path.join(codexDir, "config.toml.llmr-backup-2000-01-01T00-00-00-000Z"), `model_catalog_json = "/old/llmr-model-catalog.json"\n${own}`);
  });
});

const codexAppCatalog = (codexDir) => path.join(codexDir, ".llm-router", "codex-app-user-data", "default-codex", "llmr-codex-model-catalog.json");
const disabledCodexSentence = " Profile is disabled. Switch it on to undo this. Codex may ask you to log in.";

test("every way of releasing a Codex config LLMR created leaves nothing of LLMR's under ~/.codex", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const releases = {
    "restore original settings": () => recoverGlobalAgentProfile("default-codex"),
    "a quit": ({ config }) => restoreGlobalProfileConfigsOnExit(config.profile.profiles, { manageMarker: true }),
    "the profile switched off while another stays on": ({ config }) => {
      config.profile.profiles.find((profile) => profile.id === "default-codex").enabled = false;
      return applyProfileConfig(config);
    }
  };
  for (const [name, release] of Object.entries(releases)) {
    await withAppliedDefaultProfiles(["default-codex", "default-claude-code"], async (fixture) => {
      assert.deepEqual(
        readdirSync(fixture.codexDir).filter((entry) => !entry.endsWith(".llmr-original-missing")).sort(),
        [".llm-router", "config.toml", "llm-router.config.toml", "llmr-model-catalog.json"],
        name
      );
      assert.equal(existsSync(codexAppCatalog(fixture.codexDir)), true, name);
      await applySecondCodexModel(fixture.config);
      await replacePersistedAppConfig(fixture.config);
      assert.notDeepEqual(readdirSync(fixture.codexDir).filter((entry) => entry.includes(".llmr-backup-")), [], name);
      await release(fixture);
      assert.deepEqual(readdirSync(fixture.codexDir), [], name);
    });
  }
});

test("a restore keeps what the Codex app wrote beside LLMR's catalog", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir }) => {
    const appFile = path.join(path.dirname(codexAppCatalog(codexDir)), "Preferences");
    writeFileSync(appFile, "{}");
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.deepEqual(filesUnder(codexDir), [appFile]);
  });
});

test("a restore gives back the user's own Codex profile file and catalog byte for byte", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const own = { "llm-router.config.toml": "model = \"mine\"\napproval_policy = \"never\"\n", "llmr-model-catalog.json": "{ \"mine\": true }\n" };
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir }) => {
    for (const [name, content] of Object.entries(own)) {
      assert.notEqual(readFileSync(path.join(codexDir, name), "utf8"), content, name);
    }
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.deepEqual(Object.fromEntries(readdirSync(codexDir).map((name) => [name, readFileSync(path.join(codexDir, name), "utf8")])), own);
    assert.deepEqual(filesUnder(path.join(CONFIGDIR, "agent-config-state")), []);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    for (const [name, content] of Object.entries(own)) {
      writeFileSync(path.join(codexDir, name), content);
    }
  });
});

test("a restore that replaces the user's own Codex profile file keeps a copy of what they added to it since", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const own = "approval_policy = \"never\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}sandbox_mode = "read-only"\n`);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(profileFile, "utf8"), own);
    const copies = safetyCopies(profileFile);
    assert.equal(copies.length, 1);
    assert.match(readFileSync(copies[0], "utf8"), /sandbox_mode = "read-only"/);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "llm-router.config.toml"), own);
  });
});

test("restoring a Codex profile leaves the side files another enabled Codex profile in the same directory uses", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const cases = {
    "enabled, same directory": { configFile: "~/.codex/second.toml", enabled: true, recover: "second-codex", kept: true },
    "disabled, same directory": { configFile: "~/.codex/second.toml", enabled: false, recover: "default-codex", kept: false },
    "enabled, another directory": { configFile: "~/.codex-second/config.toml", enabled: true, recover: "default-codex", kept: false }
  };
  for (const [name, { configFile, enabled, recover, kept }] of Object.entries(cases)) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir, config }) => {
      const first = config.profile.profiles.find((profile) => profile.id === "default-codex");
      config.profile.profiles.push({ ...first, configFile, enabled, id: "second-codex", name: "Second" });
      await replacePersistedAppConfig(config);
      const result = await recoverGlobalAgentProfile(recover);
      assert.equal(result.status.ok, true, result.status.message);
      assert.equal(existsSync(path.join(codexDir, "llmr-model-catalog.json")), kept, name);
      assert.equal(existsSync(path.join(codexDir, "llm-router.config.toml")), kept, name);
    });
  }
});

test("a save cleans up the Codex side files an earlier LLMR left beside a disabled profile", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ codexDir, config }) => {
    mkdirSync(codexDir, { recursive: true });
    for (const name of ["llm-router.config.toml", "llmr-model-catalog.json"]) {
      writeFileSync(path.join(codexDir, name), "");
      writeFileSync(path.join(codexDir, `${name}.llmr-original-missing`), "");
    }
    await applyProfileConfig(config);
    assert.deepEqual(readdirSync(codexDir), []);
  });
});

test("a restore leaves the side files of a Workbuddy profile and of a router-scoped Codex profile alone", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-workbuddy-side-files-"));
  const profileDir = path.join(CONFIGDIR, "profiles", "router-scoped-codex");
  try {
    const workbuddyHome = path.join(root, ".workbuddy");
    const catalog = path.join(workbuddyHome, "llmr-model-catalog.json");
    mkdirSync(workbuddyHome, { recursive: true });
    writeFileSync(catalog, "{}");
    writeFileSync(`${catalog}.llmr-original-missing`, "");
    const statuses = restoreGlobalProfileConfigsOnExit([globalWorkbuddyProfile(workbuddyHome)], { manageMarker: false });
    assert.match(statuses[0].message, /^Workbuddy profile is disabled\. LLMR found nothing to restore/);
    assert.equal(existsSync(catalog), true);

    await withAppliedDefaultProfiles(["default-claude-code"], async ({ config }) => {
      const routerScoped = { ...config.profile.profiles.find((profile) => profile.id === "default-codex"), enabled: true, id: "router-scoped-codex", scope: "llmr" };
      config.profile.profiles.push(routerScoped);
      await applyProfileConfig(config);
      const catalogs = () => filesUnder(profileDir).filter((file) => path.basename(file) === "llmr-model-catalog.json");
      assert.equal(catalogs().length, 1);
      routerScoped.enabled = false;
      await applyProfileConfig(config);
      assert.equal(catalogs().length, 1);
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
    rmSync(profileDir, { force: true, recursive: true });
  }
});

test("a profile table the user added to a Codex config LLMR created comes back once at the restore", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const { codexConfigFile, codexDir, config } = fixture;
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    for (const policy of ["never", "on-request"]) {
      writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\napproval_policy = "${policy}"\nsandbox_mode = "read-only"\n`);
      config.profile.profiles.find((profile) => profile.id === "default-codex").showAllSessions = policy === "never";
      await applyProfileConfig(config);
      assert.doesNotMatch(readFileSync(codexConfigFile, "utf8"), /approval_policy/, policy);
      assert.deepEqual(readFileSync(profileFile, "utf8").match(/^(?:approval_policy|sandbox_mode) = .*$/gm).sort(), [`approval_policy = "${policy}"`, "sandbox_mode = \"read-only\""], policy);
    }
    await replacePersistedAppConfig(config);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(result.status.message, `Codex config now holds only your own profile settings, which LLMR had moved to llm-router.config.toml.${disabledCodexSentence}`);
    assert.equal(readFileSync(codexConfigFile, "utf8"), "[profiles.llm-router]\napproval_policy = \"on-request\"\nsandbox_mode = \"read-only\"\n");
    assert.deepEqual(readdirSync(codexDir), ["config.toml"]);
  });
});

test("a profile table from the user's original Codex config is not doubled by the copy in the profile file", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const edit of [() => undefined, appendUserCodexTables]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      assert.match(readFileSync(path.join(fixture.codexDir, "llm-router.config.toml"), "utf8"), /^model = "profile-model"$/m);
      edit(fixture);
      await recoverGlobalAgentProfile("default-codex");
      assert.equal(readFileSync(fixture.codexConfigFile, "utf8").match(/^\[profiles\.llm-router\]$/gm).length, 1);
      assert.equal(existsSync(path.join(fixture.codexDir, "llm-router.config.toml")), false);
    }, plantCodexOriginal());
  }
});

test("a restore says what it did to the agent's config", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const recover = async () => (await recoverGlobalAgentProfile("default-codex")).status.message;
  await withAppliedDefaultProfiles(["default-codex"], async () => {
    assert.equal(await recover(), `Codex config was removed because it did not exist before LLMR.${disabledCodexSentence}`);
    assert.equal(await recover(), `Codex config is absent, so LLMR had nothing to restore.${disabledCodexSentence}`);
  });
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    assert.equal(await recover(), `LLMR's settings were removed from Codex config and your own settings were kept.${disabledCodexSentence}`);
  });
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile }) => {
    rmSync(codexConfigFile);
    assert.equal(await recover(), `Codex config is already absent, as before LLMR.${disabledCodexSentence}`);
  });
  await withAppliedDefaultProfiles(["default-codex"], async () => {
    assert.equal(await recover(), `Codex config was restored to what it was before LLMR.${disabledCodexSentence}`);
    assert.match(await recover(), /^Codex profile is disabled\. LLMR found nothing to restore in .*config\.toml and left it unchanged\.$/);
  }, plantCodexOriginal());
  await withAppliedDefaultProfiles(["default-claude-code"], async () => {
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.message, "Claude Code config was removed because it did not exist before LLMR. Profile is disabled. Switch it on to undo this. Claude Code may ask you to log in.");
  });
});

test("a quit, and a sweep with no active profile, say what happened without telling anyone to switch the profile on", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ config }) => {
    const statuses = restoreGlobalProfileConfigsOnExit(config.profile.profiles, { manageMarker: true });
    assert.deepEqual(statuses.map((status) => status.message), ["Codex config was removed because it did not exist before LLMR."]);
  });
  const sweep = ({ config }) => restoreInactiveGlobalProfileConfigs(config.profile.profiles.map((profile) => ({ ...profile, enabled: false })))
    .map((status) => status.message);
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.deepEqual(sweep(fixture), ["Codex config was removed because it did not exist before LLMR."]);
  });
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    assert.deepEqual(sweep(fixture), ["LLMR's settings were removed from Codex config and your own settings were kept."]);
  });
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.deepEqual(sweep(fixture), ["Codex config was restored to what it was before LLMR."]);
  }, plantCodexOriginal());
});

test("a profile switched off in a save is told how to undo the restore", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const others of [["default-claude-code"], []]) {
    await withAppliedDefaultProfiles(["default-codex", ...others], async ({ config }) => {
      config.profile.profiles.find((profile) => profile.id === "default-codex").enabled = false;
      const applied = await applyProfileConfig(config);
      // The takeover sync releases the file first, so the profile's own restore finds it gone.
      assert.deepEqual(
        applied.clients.filter((status) => status.client === "codex").map((status) => status.message),
        [`Codex config is absent, so LLMR had nothing to restore.${disabledCodexSentence}`, "Codex config was removed because it did not exist before LLMR."],
        String(others)
      );
    });
  }
});

test("a restore that fails leaves the profile's key working, because the agent's file still holds it", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async (t) => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
    const copyInTheWay = path.join(path.dirname(codexWrittenRecordFile(fixture.codexConfigFile)), "config.toml.llmr-backup-2026-11-21T00-00-00-000Z");
    mkdirSync(copyInTheWay, { recursive: true });
    const failed = await recoverGlobalAgentProfile("default-codex");
    assert.equal(failed.status.ok, false);
    assert.doesNotMatch(failed.status.message, /still hold this profile's LLMR key/);
    assert.ok(readFileSync(fixture.codexConfigFile, "utf8").includes(fixture.codexToken));
    assert.deepEqual((await loadPersistedApiKeys()).map((apiKey) => apiKey.key), [fixture.codexToken]);
    assert.equal(existsSync(path.join(fixture.codexDir, "llmr-model-catalog.json")), true);
    rmSync(copyInTheWay, { recursive: true });
    t.mock.timers.reset();
    const restored = await recoverGlobalAgentProfile("default-codex");
    assert.equal(restored.status.ok, true, restored.status.message);
    assert.deepEqual(await loadPersistedApiKeys(), []);
  });
});

test("a restore says so when the user's own settings still hold the profile's key", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const stillHolds = /still hold this profile's LLMR key, which no longer works\.$/;
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexToken }) => {
    writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[model_providers.mine]\nexperimental_bearer_token = "${codexToken}"\n`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.ok(readFileSync(codexConfigFile, "utf8").includes(codexToken));
    assert.match(result.status.message, stillHolds);
    assert.ok(result.status.message.includes(codexConfigFile), result.status.message);
  });
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    assert.doesNotMatch((await recoverGlobalAgentProfile("default-codex")).status.message, stillHolds);
  });
});

test("a Codex profile file the user wrote after a restore is theirs at the next one", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir }) => {
    await recoverGlobalAgentProfile("default-codex");
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, "approval_policy = \"never\"\n");
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(profileFile, "utf8"), "approval_policy = \"never\"\n");
    assert.equal(existsSync(codexConfigFile), false);
  });
});

test("a line the user added to LLMR's Codex profile file is kept as a copy when their own config already has that table", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const restore of [() => recoverGlobalAgentProfile("default-codex"), (config) => restoreGlobalProfileConfigsOnExit(config.profile.profiles, { manageMarker: true })]) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
      const profileFile = path.join(codexDir, "llm-router.config.toml");
      assert.deepEqual(safetyCopies(profileFile), []);
      writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}approval_policy = "never"\n`);
      const result = await restore(config);
      assert.equal(readFileSync(codexConfigFile, "utf8"), userCodexOriginal);
      assert.equal(existsSync(profileFile), false);
      const copies = safetyCopies(profileFile);
      assert.equal(copies.length, 1);
      assert.match(readFileSync(copies[0], "utf8"), /^approval_policy = "never"$/m);
      const message = (result.status ?? result.find((status) => status.client === "codex")).message;
      assert.ok(message.includes(copies[0]), message);
    }, plantCodexOriginal());
  }
});

test("a line from LLMR's Codex profile file is not written as a second table when the user's config has the quoted header", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}approval_policy = "never"\n`);
    writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles."llm-router"]\nsandbox_mode = "read-only"\n`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(codexConfigFile, "utf8"), "[profiles.\"llm-router\"]\nsandbox_mode = \"read-only\"\n");
    assert.equal(safetyCopies(profileFile).length, 1);
  });
});

test("a Claude Code restore that fails keeps the profile's key, which the helper script still hands out", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-claude-code"], async ({ claudeDir }) => {
    const settingsFile = path.join(claudeDir, "settings.json");
    const keysBefore = (await loadPersistedApiKeys()).map((apiKey) => apiKey.id);
    assert.deepEqual(keysBefore, ["profile:default-claude-code"]);
    writeFileSync(settingsFile, `${readFileSync(settingsFile, "utf8")}oops`);
    const result = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(result.status.ok, false);
    assert.deepEqual((await loadPersistedApiKeys()).map((apiKey) => apiKey.id), keysBefore);
    rmSync(settingsFile);
  });
});

test("a restore keeps no copy of LLMR's Codex profile file when the user's own table only reads differently", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model_provider = \"openai\"\n\n[profiles.llm-router]\n# mine\napproval_policy = \"never\"\nshow_all_sessions = true\nmodel_provider = \"openai\"\nmodel = \"profile-model\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
    await applySecondCodexModel(config);
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}# a note to myself\n`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(codexConfigFile, "utf8"), original);
    assert.deepEqual(safetyCopies(path.join(codexDir, "llm-router.config.toml")), []);
    assert.doesNotMatch(result.status.message, /kept a copy/);
  }, plantCodexOriginal(original));
});

test("a line added to LLMR's Codex profile file is copied even when the user's own table holds the same text inside a string", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = "model_provider = \"openai\"\n\n[profiles.llm-router]\nnotes = \"\"\"\nx = 1\n\"\"\"\n";
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}x = 1\n`);
    await recoverGlobalAgentProfile("default-codex");
    const copies = safetyCopies(profileFile);
    assert.equal(copies.length, 1);
    assert.match(readFileSync(copies[0], "utf8"), /^x = 1$/m);
  }, plantCodexOriginal(original));
});

const tripleDouble = "\"".repeat(3);
const tripleSingle = "'".repeat(3);
const awkwardProfileTables = {
  "plain keys": { existing: "sandbox_mode = \"read-only\"\n", moved: "sandbox_mode = \"workspace-write\"\n" },
  "a nested array": { existing: "sandbox_mode = \"read-only\"\n", moved: "x = [\n  [1, 2],\n]\ny = 3\n" },
  "a bracket line in a literal string": { existing: "k = 0\n", moved: `notes = ${tripleSingle}\n[not]\n${tripleSingle}\nk = 1\n` },
  "a value that spans lines on both sides": { existing: `notes = ${tripleDouble}\nsandbox_mode = "inside"\n${tripleDouble}\n`, moved: `notes = ${tripleDouble}\nmodel = "inside too"\n${tripleDouble}\n` },
  "a quoted key": { existing: "\"sandbox_mode\" = \"read-only\"\n", moved: "sandbox_mode = \"workspace-write\"\n" },
  "a dotted key against an inline table": { existing: "a.b = 1\n", moved: "a = { c = 2 }\n" },
  "a key that names a table in the profile file": { existing: "sandbox_mode = \"read-only\"\n\n[sandbox_workspace_write]\nnetwork_access = false\n", moved: "sandbox_workspace_write = { network_access = true }\n" }
};

function countOf(text, part) {
  return text.split(part).length - 1;
}

test("a profile table the user adds to a Codex config replaces their settings in LLMR's profile file whole, and the earlier ones are kept as a copy", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const [name, { existing, moved }] of Object.entries(awkwardProfileTables)) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
      const profileFile = path.join(codexDir, "llm-router.config.toml");
      const llmrOnly = readFileSync(profileFile, "utf8");
      writeFileSync(profileFile, `${llmrOnly}${existing}`);
      writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\n${moved}\n[mcp_servers.after]\ncommand = "after"\n`);
      const status = (await applyProfileConfig(config)).clients.find((item) => item.client === "codex");
      assert.equal(status.ok, true, name);
      const config1 = readFileSync(codexConfigFile, "utf8");
      assert.doesNotMatch(config1, /^\[profiles\.llm-router\]/m, name);
      assert.equal(config1.includes(moved), false, name);
      assert.match(config1, /\[mcp_servers\.after\]\ncommand = "after"/, name);
      const profile1 = readFileSync(profileFile, "utf8");
      assert.equal(countOf(profile1, moved), 1, `${name}: ${profile1}`);
      assert.equal(profile1.includes(existing), false, name);
      assert.equal(countOf(profile1, "model_provider ="), 1, `${name}: ${profile1}`);
      assert.equal(countOf(profile1, "# LLMR configured model"), countOf(llmrOnly, "# LLMR configured model"), name);
      const copies = safetyCopies(profileFile);
      assert.equal(copies.length, 1, name);
      assert.ok(readFileSync(copies[0], "utf8").includes(existing), name);
      assert.ok(status.message.includes(copies[0]), status.message);

      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      const restored = readFileSync(codexConfigFile, "utf8");
      assert.equal(countOf(restored, `[profiles.llm-router]\n${moved}`), 1, `${name}: ${restored}`);
      assert.match(restored, /\[mcp_servers\.after\]\ncommand = "after"/, name);
      assert.doesNotMatch(restored, /model_providers|LLMR|llmr-/, name);
      assert.equal(existsSync(profileFile), false, name);
    });
  }
});

test("a profile table the user adds to a Codex config LLMR created moves to the profile file whole and comes back whole", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  for (const [name, { moved }] of Object.entries(awkwardProfileTables)) {
    for (const profileFileExists of [true, false]) {
      await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
        const profileFile = path.join(codexDir, "llm-router.config.toml");
        if (!profileFileExists) {
          rmSync(profileFile);
        }
        writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\n${moved}`);
        await applyProfileConfig(config);
        const profile1 = readFileSync(profileFile, "utf8");
        assert.equal(countOf(profile1, moved), 1, `${name}: ${profile1}`);
        assert.equal(countOf(profile1, "model_provider ="), 1, `${name}: ${profile1}`);
        assert.equal(readFileSync(codexConfigFile, "utf8").includes(moved), false, name);
        assert.deepEqual(safetyCopies(profileFile), [], name);
        await recoverGlobalAgentProfile("default-codex");
        assert.equal(readFileSync(codexConfigFile, "utf8"), `[profiles.llm-router]\n${moved}`, name);
        assert.deepEqual(safetyCopies(profileFile), [], name);
      });
    }
  }
});

test("a moved profile table's own model setting goes whole when its value spans lines", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    rmSync(profileFile);
    writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\nmodel = [\n  "not-a-model",\n]\nkeep = 1\n`);
    await applyProfileConfig(config);
    const lines = readFileSync(profileFile, "utf8").split("\n");
    assert.equal(lines.filter((line) => /^model\s*=/.test(line)).length, 1);
    assert.equal(lines.includes("  \"not-a-model\","), false);
    assert.equal(lines.includes("]"), false);
    assert.equal(lines.includes("keep = 1"), true);
  });
});

test("a restore that writes the original Codex config back says so, and that the user's profile settings are in it again", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}approval_policy = "never"\n`);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.message, `Codex config was restored to what it was before LLMR. Your own profile settings, which LLMR had moved to llm-router.config.toml, are in it again.${disabledCodexSentence}`);
    assert.equal(readFileSync(codexConfigFile, "utf8"), "model = \"gpt-mine\"\n\n[profiles.llm-router]\napproval_policy = \"never\"\n");
  }, plantCodexOriginal("model = \"gpt-mine\"\n"));
});

test("a restore of a Codex config nobody added to keeps no copy of LLMR's profile file", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexDir }) => {
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.message, `Codex config was restored to what it was before LLMR.${disabledCodexSentence}`);
    assert.deepEqual(safetyCopies(path.join(codexDir, "llm-router.config.toml")), []);
  }, plantCodexOriginal());
});

test("a Codex restore that cannot remove one of LLMR's side files says which, and still revokes a key no file holds", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    const catalog = path.join(fixture.codexDir, "llmr-model-catalog.json");
    rmSync(catalog);
    mkdirSync(path.join(catalog, "in-the-way"), { recursive: true });
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, false);
    assert.match(result.status.message, /^LLMR's settings were removed from Codex config and your own settings were kept\./);
    assert.match(result.status.message, /llmr-model-catalog\.json/);
    assert.doesNotMatch(result.status.message, /could not restore/);
    assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
    assert.deepEqual((await loadPersistedApiKeys()).filter((apiKey) => apiKey.id === "profile:default-codex"), []);
    rmSync(catalog, { recursive: true });
  });
});

