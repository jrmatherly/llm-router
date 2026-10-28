import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { CONFIGDIR } from "@llmr/core/config/constants.ts";
import { replacePersistedApiKeys } from "@llmr/core/config/config-repository.ts";
import { getProfileOpenCommand, openProfileFromLlmr } from "@llmr/core/profiles/launch-service.ts";
import { restoreGlobalProfileConfigsOnExit } from "@llmr/core/profiles/service.ts";
import { isolateTestHome } from "../../../../../build/test-home.mjs";

const homeEnvKeys = ["CODEX_HOME", ...Object.keys(isolateTestHome("", {}))];

for (const [name, open, error] of [
  ["getProfileOpenCommand rejects an unknown profile", (config) => getProfileOpenCommand(config, { profileId: "no-such-profile" }), /not found/i],
  ["openProfileFromLlmr rejects an unknown profile", (config) => openProfileFromLlmr(config, { profileId: "no-such-profile" }), /not found/i],
  ["getProfileOpenCommand rejects an unsupported surface", (config) => getProfileOpenCommand(config, { profileId: "default-claude-code", surface: "app" }), /does not support APP opening/],
  ["openProfileFromLlmr rejects an unsupported surface", (config) => openProfileFromLlmr(config, { profileId: "default-claude-code", surface: "app" }), /does not support APP opening/]
]) {
  test(`${name} before writing any agent config`, async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "llmr-profile-open-lookup-"));
    const previous = Object.fromEntries(homeEnvKeys.map((key) => [key, process.env[key]]));
    try {
      isolateTestHome(home);
      delete process.env.CODEX_HOME;
      const config = globalProfilesConfig();
      await replacePersistedApiKeys(config.APIKEYS);

      await assert.rejects(open(config), error);

      for (const dir of [".claude", ".codex"]) {
        assert.equal(existsSync(path.join(home, dir)), false, dir);
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
      rmSync(path.join(CONFIGDIR, "global-profile-takeover.json"), { force: true });
      rmSync(home, { force: true, recursive: true });
    }
  });
}

function globalProfilesConfig() {
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-open-lookup-test";
  config.APIKEYS = ["default-claude-code", "default-codex"].map((id) => ({
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `profile:${id}`,
    key: "llmr-profile-open-lookup-test",
    name: `Profile: ${id}`
  }));
  config.Providers = [{
    api_base_url: "https://example.test/v1",
    api_key: "provider-key",
    models: ["model"],
    name: "Provider"
  }];
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "default-claude-code",
      model: "Provider/model",
      name: "Claude Code",
      scope: "global",
      smallFastModel: "",
      surface: "cli"
    },
    {
      agent: "codex",
      cliMiddleware: false,
      codexCliPath: "",
      codexHome: "",
      configFile: "",
      configFormat: "legacy",
      enabled: true,
      env: {},
      id: "default-codex",
      model: "Provider/model",
      name: "Codex",
      providerId: "llm-router",
      providerName: "LLM Router",
      scope: "global",
      showAllSessions: false,
      surface: "auto"
    }
  ];
  return config;
}
