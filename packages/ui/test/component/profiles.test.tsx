import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { gatewayModelSelectionMatcher, type AppConfig, type GatewayProviderConfig, type ProfileConfig, type VirtualModelProfileConfig } from "@llmr/core/contracts/app.ts";
import { claudeLoginProviderNames } from "@llmr/core/gateway/features/claude-login-pass-through.ts";
import { ModelMultiSelector } from "@llmr/ui/pages/home/components/model-selector.tsx";
import { AddProfileForm, DeleteProfileDialog, ProfileOpenDialog, ProfileView } from "@llmr/ui/pages/home/components/profiles.tsx";
import { isClaudeLoginProvider } from "@llmr/ui/pages/home/shared/providers.ts";
import { claudeLoginEnabled, claudeLoginModelNotice, type ClaudeLoginModelField, createProfileDraft, createProfileDraftFromProfile, isProfileDraftSubmittable, withClaudeLogin, normalizeUnknownProfileItem, profileAgentLogoUrl, profileConfigFromDraft, profileDraftWithDetectedAppPath, profileHasUsableModels, profileModelProviderOptions, profileModelProviders, profileSummaryItems } from "@llmr/ui/pages/home/shared/profiles.ts";
import type { AddProfileDraft } from "@llmr/ui/pages/home/shared/types.ts";
import { appConfigFixture } from "../fixtures/index.ts";

const profile: ProfileConfig = {
  agent: "claude-code",
  enabled: true,
  id: "claude-code-main",
  model: "openai/gpt-5.2",
  name: "Claude Code Main"
};

test("ProfileOpenDialog offers Open in Terminal only when the host can open one", () => {
  const render = (onOpenTerminal?: () => void) => renderToStaticMarkup(
    <ProfileOpenDialog command="llmr 'Claude Code Main'" mode="cli" onChooseApp={() => undefined} onClose={() => undefined} onOpenTerminal={onOpenTerminal} onStopApp={() => undefined} profile={profile} />
  );
  assert.match(render(() => undefined), /Open in Terminal/);
  assert.doesNotMatch(render(), /Open in Terminal/);
});

test("DeleteProfileDialog identifies the profile and requires an explicit confirmation", () => {
  const html = renderToStaticMarkup(
    <DeleteProfileDialog onClose={() => undefined} onConfirm={() => undefined} profile={profile} />
  );

  assert.match(html, /Delete Profile/);
  assert.match(html, /Delete this agent profile from the configuration\?/);
  assert.match(html, /Claude Code Main/);
  assert.match(html, /Claude Code/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Delete<\/button>/);
});

test("#1951 global Claude Code and Codex cards offer recovery even when already disabled", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    { ...profile, id: "global-claude", scope: "global" },
    { ...profile, agent: "codex", enabled: false, id: "global-codex", scope: "global" },
    { ...profile, id: "isolated-claude", scope: "llmr" },
    { ...profile, agent: "opencode", id: "global-opencode", scope: "global" },
    { ...profile, id: "unscoped-claude" }
  ];
  const html = renderToStaticMarkup(<ProfileView addProfile={() => undefined} applyError="" config={config}
    copyProfileCliCommand={() => undefined} editProfile={() => undefined} openProfileApp={() => undefined}
    profileRuntimeStatus={{ profiles: [] }} recoverGlobalProfile={() => undefined} removeProfile={() => undefined}
    stopProfileApp={() => undefined} updateProfileItem={() => undefined} />);
  assert.equal((html.match(/Restore original settings/g) ?? []).length, 3, "a card with no scope is a system-default card");
});

test("AddProfileForm does not show the profile requirements panel", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Effect scope/);
  assert.doesNotMatch(html, /Profile requirements/);
  assert.doesNotMatch(html, /Profile guidance/);
});

test("AddProfileForm names the file a system-default profile rewrites, and says nothing for an LLMR-only one", () => {
  const config = appConfigFixture();
  const render = (draft: ReturnType<typeof createProfileDraft>) => renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(render({ ...createProfileDraft("claude-code"), scope: "global" }), /LLMR rewrites ~\/\.claude\/settings\.json while it runs\..*Restore original settings\./);
  assert.match(render({ ...createProfileDraft("codex"), scope: "global" }), /LLMR rewrites ~\/\.codex\/config\.toml while it runs\./);
  assert.doesNotMatch(render({ ...createProfileDraft("claude-code"), scope: "llmr" }), /LLMR rewrites/);
  const linkLine = /Restore original settings\. If that file is a link, LLMR writes to the file it links to and keeps the link\./;
  assert.match(render({ ...createProfileDraft("claude-code"), scope: "global" }), linkLine);
  assert.doesNotMatch(render({ ...createProfileDraft("codex"), scope: "global" }), /If that file is a link/);
});

test("AddProfileForm keeps profile routing inside Advanced settings", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Advanced settings/);
  assert.doesNotMatch(html, /Profile routing/);
  assert.doesNotMatch(html, /Routing disabled/);
  assert.doesNotMatch(html, /Enhanced route/);
});

test("AddProfileForm shows enhanced route as a sibling of profile routing", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const advancedSettingsIndex = html.indexOf("Advanced settings");
  const enhancedRouteIndex = html.indexOf("Enhanced route");
  const profileRoutingIndex = html.indexOf("Profile routing");
  const allowedModelListIndex = html.indexOf("Allowed model list");

  assert.ok(advancedSettingsIndex >= 0);
  assert.ok(enhancedRouteIndex > advancedSettingsIndex);
  assert.ok(profileRoutingIndex > advancedSettingsIndex);
  assert.ok(allowedModelListIndex > advancedSettingsIndex);
  assert.ok(allowedModelListIndex > profileRoutingIndex);
  assert.ok(enhancedRouteIndex < profileRoutingIndex);
  assert.doesNotMatch(html, /Routing disabled/);
  assert.match(html, /Enhanced route/);
  assert.match(html, /Allowed model list/);
  assert.match(html, /rounded-b-none/);
  assert.match(html, /rounded-b-md border border-t-0/);
  assert.doesNotMatch(html, /Profile routes/);
  assert.match(html, /LLMR built-in Claude Code routing optimizes requests to third-party models for this profile\./);
});

test("AddProfileForm shows private profile routes when profile routing is enabled", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={{ ...createProfileDraft("claude-code"), routingEnabled: true }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Profile routing/);
  assert.match(html, /Enhanced route/);
  assert.match(html, /Profile routes/);
  assert.ok(html.indexOf("Enhanced route") < html.indexOf("Profile routing"));
  assert.match(html, /LLMR built-in Claude Code routing optimizes requests to third-party models for this profile\./);
  assert.match(html, /data-ui-tooltip-trigger/);
});

test("AddProfileForm uses Codex-specific enhanced route info for Codex profiles", () => {
  const config = appConfigFixture();
  const draft = { ...createProfileDraft("codex"), providerId: "", providerName: "", routingEnabled: true };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Enhanced route/);
  assert.match(html, /LLMR built-in Codex routing optimizes requests to third-party models for this profile\./);
  assert.doesNotMatch(html, /Provider ID/);
  assert.doesNotMatch(html, /Provider name/);
  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.equal(profileConfigFromDraft(draft, []).providerId, "llm-router");
  assert.equal(profileConfigFromDraft(draft, []).providerName, "LLM Router");
});

test("AddProfileForm says which ChatGPT login a Codex app profile opened from LLMR uses", () => {
  const config = appConfigFixture();
  const render = (overrides: Partial<ReturnType<typeof createProfileDraft>>) => renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={{ ...createProfileDraft("codex"), ...overrides }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const hint = /signs in with your personal Codex login/;

  assert.match(render({ scope: "llmr", surface: "app" }), hint);
  assert.match(render({ scope: "llmr", surface: "auto" }), hint);
  assert.doesNotMatch(render({ scope: "llmr", surface: "cli" }), hint);
  assert.doesNotMatch(render({ scope: "global", surface: "app" }), hint);
  assert.doesNotMatch(render({ ...createProfileDraft("claude-code"), scope: "llmr", surface: "app" }), hint);
});

test("new profiles default to the llm-router provider ID and saved claude-code-router profiles keep theirs", () => {
  assert.equal(createProfileDraft("opencode").providerId, "llm-router");

  const saved = normalizeUnknownProfileItem({ agent: "opencode", id: "opencode-old", name: "OpenCode", providerId: "claude-code-router" }, 0);
  assert.ok(saved);
  assert.equal(saved.providerId, "claude-code-router");
  assert.equal(profileConfigFromDraft(createProfileDraftFromProfile(saved), []).providerId, "claude-code-router");
});

test("explicit allowed model lists require a default model", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const draft = {
    ...createProfileDraft("codex"),
    availableModels: ["Provider/alpha"]
  };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(isProfileDraftSubmittable(draft), false);
  assert.match(html, /Advanced settings need attention/);
  assert.match(html, /Default model is required when allowed model list is set\./);
});

test("AddProfileForm renders unrestricted allowed models as selected without a default model", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("codex")}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const alphaIndex = html.indexOf('title="Provider/alpha"');
  const betaIndex = html.indexOf('title="Provider/beta"');
  const alphaLabel = html.slice(alphaIndex, betaIndex);
  const betaLabel = html.slice(betaIndex, html.indexOf("</label>", betaIndex));
  const clearIndex = html.indexOf(">Clear</button>");
  const clearButton = html.slice(html.lastIndexOf("<button", clearIndex), clearIndex);

  assert.ok(alphaIndex >= 0);
  assert.ok(betaIndex > alphaIndex);
  assert.match(alphaLabel, /aria-checked="true"/);
  assert.match(betaLabel, /aria-checked="true"/);
  assert.match(clearButton, /disabled=""/);
});

test("AddProfileForm keeps the default model locked in allowed model lists", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["alpha", "beta"],
    name: "Provider"
  }];
  const draft = {
    ...createProfileDraft("codex"),
    availableModels: ["Provider/alpha"],
    model: "Provider/alpha"
  };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const defaultIndex = html.indexOf('title="Provider/alpha"');
  const otherIndex = html.indexOf('title="Provider/beta"');
  const defaultLabel = html.slice(defaultIndex, otherIndex);
  const otherLabel = html.slice(otherIndex, html.indexOf("</label>", otherIndex));

  assert.ok(defaultIndex >= 0);
  assert.ok(otherIndex > defaultIndex);
  assert.match(defaultLabel, /aria-checked="true"/);
  assert.match(defaultLabel, /disabled=""/);
  assert.match(otherLabel, /aria-checked="false"/);
  assert.doesNotMatch(otherLabel, /disabled=""/);
});

test("AddProfileForm places APP_PATH below Bot settings", () => {
  const config = appConfigFixture();
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs ?? []}
      draft={{ ...createProfileDraft("claude-code"), surface: "app" }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const botIndex = html.indexOf(">Bot</span>");
  const appPathIndex = html.indexOf("APP_PATH");
  const envIndex = html.indexOf("Environment variables");

  assert.ok(botIndex >= 0);
  assert.ok(appPathIndex > botIndex);
  assert.ok(envIndex > appPathIndex);
  assert.doesNotMatch(html, /rounded-md border border-border bg-background p-1 transition-colors/);
});

test("AddProfileForm marks required and optional fields", () => {
  const config = appConfigFixture();
  config.Providers = [{ models: ["first-model"], name: "Fixture" }];
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={createProfileDraft("claude-code")}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(html.match(/>Required<\/span>/g)?.length, 5);
  assert.equal(html.match(/>Optional<\/span>/g)?.length, 4);
  assert.match(html, /Default model/);
  assert.match(html, /Default model is required\./);
  assert.match(html, /Select default model/);
  assert.doesNotMatch(html, /Fixture\/first-model/);
  assert.match(html, /Fable model/);
  assert.match(html, /Opus model/);
  assert.match(html, /Sonnet model/);
  assert.match(html, /Haiku model/);
  assert.doesNotMatch(html, /Allowed model list/);
});

test("Claude Code profiles require a default model before submission", () => {
  const draft = createProfileDraft("claude-code");

  assert.equal(isProfileDraftSubmittable(draft), false);
  assert.equal(isProfileDraftSubmittable({ ...draft, model: "anthropic/claude-sonnet-4-5" }), true);
});

test("AddProfileForm labels Kimi CLI model fields with Kimi-specific copy", () => {
  const config = appConfigFixture();
  config.Providers = [{ models: ["first-model"], name: "Fixture" }];
  const draft = createProfileDraft("kimi");
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Kimi model/);
  assert.match(html, /Select default model/);
  assert.doesNotMatch(html, /Fixture\/first-model/);
  assert.doesNotMatch(html, /Advanced settings need attention/);
  assert.doesNotMatch(html, /Allowed model list/);
  assert.doesNotMatch(html, /Default model/);
  assert.doesNotMatch(html, /Available models/);
  assert.equal(isProfileDraftSubmittable(draft), false);
  const defaultOnlyDraft = { ...draft, model: "kimi/k2", availableModels: [] };
  assert.equal(isProfileDraftSubmittable(defaultOnlyDraft), true);
  assert.equal(profileConfigFromDraft(defaultOnlyDraft, []).availableModels, undefined);
});

test("AddProfileForm shows Kimi allowed models as selected by default", () => {
  const config = appConfigFixture();
  config.Providers = [{
    models: ["k2", "k3"],
    name: "Kimi"
  }];
  const draft = { ...createProfileDraft("kimi"), model: "Kimi/k2" };
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.match(html, /Allowed model list/);
  assert.match(html, /title="Kimi\/k2"[\s\S]*?aria-checked="true"/);
  assert.match(html, /title="Kimi\/k3"[\s\S]*?aria-checked="true"/);
  assert.equal(profileConfigFromDraft(draft, []).availableModels, undefined);
});

test("AddProfileForm treats Pi as an LLMR-only CLI profile", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("pi");
  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs}
      draft={draft}
      error=""
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );

  assert.equal(isProfileDraftSubmittable(draft), true);
  assert.match(html, /Pi model/);
  assert.doesNotMatch(html, /Provider ID/);
  assert.doesNotMatch(html, /Provider name/);
  assert.doesNotMatch(html, /Allowed model list/);
});

test("ProfileView renders agent profiles as compact cards with inline actions", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      ...profile,
      scope: "llmr",
      surface: "auto"
    },
    {
      agent: "zcode",
      enabled: false,
      id: "zcode-main",
      model: "openai/gpt-5.2",
      name: "ZCode Main",
      scope: "global",
      surface: "app"
    }
  ];

  const html = renderToStaticMarkup(
    <ProfileView
      addProfile={() => undefined}
      applyError=""
      config={config}
      copyProfileCliCommand={() => undefined}
      editProfile={() => undefined}
      openProfileApp={() => undefined}
      profileRuntimeStatus={{ profiles: [] }}
      removeProfile={() => undefined}
      stopProfileApp={() => undefined}
      updateProfileItem={() => undefined}
    />
  );

  assert.equal(html.match(/aria-label="(?:Claude Code Main|ZCode Main) Profile actions"/g)?.length, 2);
  assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,420px\),1fr\)\)/);
  assert.match(html, /min-h-\[220px\]/);
  assert.match(html, /class="flex min-w-0 items-center gap-2"/);
  assert.match(html, /Configuration/);
  assert.match(html, /class="mt-3 min-w-0 flex-1 space-y-1\.5 border-t border-border\/60 pt-2"><div class="flex min-w-0 flex-wrap items-center gap-1\.5"/);
  assert.doesNotMatch(html, /class="mt-1 flex min-w-0 flex-wrap items-center gap-1\.5"/);
  assert.match(html, /aria-label="Claude Code Main Profile actions" class="[^"]*border-t border-border\/60/);
  assert.doesNotMatch(html, />Disabled<\/span>/);
  assert.doesNotMatch(html, /aria-label="Claude Code Main Launch actions"/);
  assert.doesNotMatch(html, /aria-label="Claude Code Main Management actions"/);
  assert.match(html, /aria-label="Copy CLI command Claude Code Main"/);
  assert.match(html, /aria-label="Start App Claude Code Main"/);
  assert.match(html, /aria-label="Edit Claude Code Main"/);
  assert.match(html, /aria-label="Remove profile"/);
  assert.doesNotMatch(html, /aria-label="Start App ZCode Main"/);
  assert.doesNotMatch(html, /aria-label="Copy CLI command ZCode Main"/);
});

test("profileSummaryItems uses Kimi-specific model labels", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "kimi",
    availableModels: ["kimi/k2", "kimi/k3"],
    enabled: true,
    id: "kimi-main",
    model: "kimi/k2",
    name: "Kimi Main",
    scope: "llmr",
    surface: "cli"
  }, config);

  assert.equal(items[0]?.label, "Kimi model");
  assert.equal(items[1]?.label, "Allowed model list");
  assert.equal(items[1]?.value, "2");
});

test("profileSummaryItems uses Pi-specific model labels", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "pi",
    enabled: true,
    id: "pi-main",
    model: "openai/gpt-5.2",
    name: "Pi Main",
    scope: "llmr",
    surface: "cli"
  }, config);

  assert.equal(items[0]?.label, "Pi model");
});

test("profileSummaryItems uses a generic App path label", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "workbuddy",
    appPath: "/Applications/WorkBuddy AI.app/Contents/MacOS/Electron",
    enabled: true,
    id: "workbuddy-main",
    model: "openai/gpt-5.2",
    name: "Workbuddy Main",
    scope: "llmr",
    surface: "app"
  }, config);

  assert.equal(items.find((item) => item.value.includes("WorkBuddy AI.app"))?.label, "APP_PATH");
  assert.doesNotMatch(items.map((item) => item.label).join(" "), /CHATGPT_APP_PATH|WORKBUDDY_APP_PATH/);
});

test("profileSummaryItems omits disabled profile properties from cards", () => {
  const config = appConfigFixture();
  const disabledItems = profileSummaryItems({
    agent: "codex",
    botGateway: { enabled: false, platform: "slack" } as NonNullable<ProfileConfig["botGateway"]>,
    enabled: true,
    id: "codex-main",
    managedCompact: false,
    model: "openai/gpt-5.2",
    name: "Codex Main",
    providerId: "llm-router",
    scope: "llmr",
    showAllSessions: false,
    surface: "auto"
  }, config);

  assert.deepEqual(disabledItems.map((item) => item.label), ["Model"]);
  assert.doesNotMatch(disabledItems.map((item) => item.value).join(" "), /Disabled/);

  const enabledItems = profileSummaryItems({
    agent: "codex",
    enabled: true,
    id: "codex-main",
    managedCompact: true,
    model: "openai/gpt-5.2",
    name: "Codex Main",
    providerId: "llm-router",
    scope: "llmr",
    showAllSessions: true,
    surface: "auto"
  }, config);

  assert.match(enabledItems.map((item) => item.label).join(" "), /Show all sessions/);
  assert.match(enabledItems.map((item) => item.label).join(" "), /LLMR managed compact/);
  assert.doesNotMatch(enabledItems.map((item) => item.label).join(" "), /Provider ID/);
});

test("profileSummaryItems shows disabled profile enhanced route without private routing status", () => {
  const config = appConfigFixture();
  const items = profileSummaryItems({
    agent: "claude-code",
    enabled: true,
    id: "claude-main",
    model: "openai/gpt-5.2",
    name: "Claude Main",
    routing: {
      enabled: false,
      enhancedRoute: false,
      rules: []
    },
    scope: "llmr",
    surface: "cli"
  }, config);
  const text = items.map((item) => `${item.label} ${item.value}`).join(" ");

  assert.doesNotMatch(text, /Routing disabled/);
  assert.match(text, /Enhanced route off/);
  assert.match(items.map((item) => item.label).join(" "), /Routing/);
});

test("detected CHATGPT_APP_PATH is used as the Codex profile default", () => {
  const detectedPath = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("codex"), `  ${detectedPath}  `);

  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/chatgpt" }, detectedPath).appPath, "/custom/chatgpt");
  assert.equal(profileDraftWithDetectedAppPath(createProfileDraft("claude-code"), detectedPath).appPath, "");
});

test("detected OPENCODE_APP_PATH is used as the OpenCode profile default", () => {
  const detectedPath = "/Applications/OpenCode.app/Contents/MacOS/OpenCode";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("opencode"), undefined, detectedPath);
  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/opencode" }, undefined, detectedPath).appPath, "/custom/opencode");
});

test("detected WORKBUDDY_APP_PATH is used as the Workbuddy profile default", () => {
  const detectedPath = "/Applications/WorkBuddy AI.app/Contents/MacOS/Electron";
  const draft = profileDraftWithDetectedAppPath(createProfileDraft("workbuddy"), undefined, undefined, detectedPath);
  assert.equal(draft.appPath, detectedPath);
  assert.equal(profileDraftWithDetectedAppPath({ ...draft, appPath: "/custom/workbuddy" }, undefined, undefined, detectedPath).appPath, "/custom/workbuddy");
});

test("Grok CLI profile defaults to an LLMR-scoped CLI entry", () => {
  const draft = createProfileDraft("grok");

  assert.equal(draft.name, "Grok CLI");
  assert.equal(draft.scope, "llmr");
  assert.equal(draft.surface, "cli");
});

test("persisted Grok profiles are normalized to the supported launch scope", () => {
  const profile = normalizeUnknownProfileItem({
    agent: "grok-cli",
    enabled: true,
    id: "grok-work",
    model: "Provider/model",
    name: "Grok Work",
    scope: "global",
    surface: "app"
  }, 0);

  assert.equal(profile?.agent, "grok");
  assert.equal(profile?.scope, "llmr");
  assert.equal(profile?.surface, "cli");
});

test("profile routing survives profile draft round trip", () => {
  const profile = normalizeUnknownProfileItem({
    agent: "claude-code",
    enabled: true,
    id: "claude-work",
    model: "Provider/sonnet",
    name: "Claude Work",
    routing: {
      enabled: true,
      enhancedRoute: false,
      rules: [{
        condition: { left: "request.auth.profileId", operator: "==", right: "claude-work" },
        enabled: true,
        id: "auth-profile",
        name: "Auth profile",
        rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/opus" }],
        type: "condition"
      }]
    },
    scope: "llmr",
    surface: "cli"
  }, 0);

  assert.equal(profile?.routing?.enhancedRoute, false);
  assert.equal(profile?.routing?.rules[0]?.id, "auth-profile");

  const draft = createProfileDraftFromProfile(profile);
  const saved = profileConfigFromDraft(draft, [profile], profile);

  assert.equal(saved.routing?.enabled, true);
  assert.equal(saved.routing?.enhancedRoute, false);
  assert.equal(saved.routing?.rules[0]?.condition?.left, "request.auth.profileId");
});

test("disabled private profile routing persists the profile enhanced route switch", () => {
  const draft = {
    ...createProfileDraft("claude-code"),
    model: "Provider/sonnet",
    routingEnabled: false,
    routingEnhancedRoute: false
  };
  const saved = profileConfigFromDraft(draft, [], undefined);

  assert.equal(saved.routing?.enabled, false);
  assert.equal(saved.routing?.enhancedRoute, false);
  assert.deepEqual(saved.routing?.rules, []);
});

test("disabled profile routing preserves existing private rules without enabling them", () => {
  const draft: AddProfileDraft = {
    ...createProfileDraft("claude-code"),
    model: "Provider/sonnet",
    routingEnabled: false,
    routingRules: [{
      condition: { left: "request.header.x-task", operator: "==", right: "heavy" },
      enabled: true,
      id: "heavy",
      name: "Heavy",
      rewrites: [{ key: "request.body.model", operation: "set", value: "Provider/opus" }],
      type: "condition"
    }]
  };
  const saved = profileConfigFromDraft(draft, [], undefined);

  assert.equal(saved.routing?.enabled, false);
  assert.equal(saved.routing?.rules[0]?.id, "heavy");
});

test("OpenCode profiles support local CLI and App configuration", () => {
  const draft = createProfileDraft("opencode");
  assert.equal(draft.name, "OpenCode");
  assert.equal(draft.configFile, "~/.config/opencode/opencode.jsonc");
  assert.equal(draft.surface, "cli");

  const profile = normalizeUnknownProfileItem({
    agent: "open-code",
    appPath: "/Applications/OpenCode.app",
    enabled: true,
    id: "opencode-work",
    model: "Provider/model",
    name: "OpenCode Work",
    scope: "llmr",
    surface: "auto"
  }, 0);
  assert.equal(profile?.agent, "opencode");
  assert.equal(profile?.appPath, "/Applications/OpenCode.app");
  assert.equal(profile?.surface, "auto");
});

test("Kilo CLI profiles support local CLI configuration", () => {
  const draft = createProfileDraft("kilo");
  assert.equal(draft.name, "Kilo CLI");
  assert.equal(draft.configFile, "~/.config/kilo/kilo.jsonc");
  assert.equal(draft.surface, "cli");

  const profile = normalizeUnknownProfileItem({
    agent: "kilo-code",
    enabled: true,
    id: "kilo-work",
    model: "Provider/model",
    name: "Kilo Work",
    providerId: "llm-router",
    scope: "global",
    showAllSessions: true,
    surface: "app"
  }, 0);
  assert.equal(profile?.agent, "kilo");
  assert.equal(profile?.scope, "global");
  assert.equal(profile?.showAllSessions, false);
  assert.equal(profile?.surface, "cli");
});

test("Workbuddy profiles support local App configuration", () => {
  const config = appConfigFixture();
  const draft = createProfileDraft("workbuddy");
  assert.equal(draft.name, "Workbuddy");
  assert.equal(draft.configFile, "~/.workbuddy/config.toml");
  assert.equal(draft.surface, "app");
  assert.equal(isProfileDraftSubmittable(draft), true);

  const html = renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs ?? []}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  assert.match(html, /App only/);
  assert.doesNotMatch(html, /CLI only/);
  assert.match(html, /APP_PATH/);
  assert.doesNotMatch(html, /WORKBUDDY_APP_PATH/);

  const profile = normalizeUnknownProfileItem({
    agent: "work-buddy",
    enabled: true,
    id: "workbuddy-work",
    model: "Provider/model",
    name: "Workbuddy Work",
    providerId: "llm-router",
    scope: "global",
    showAllSessions: true,
    surface: "app"
  }, 0);
  assert.equal(profile?.agent, "workbuddy");
  assert.equal(profile?.configFile, "~/.workbuddy/config.toml");
  assert.equal(profile?.showAllSessions, false);
  assert.equal(profile?.surface, "app");
  assert.match(profileAgentLogoUrl("workbuddy"), /workbuddy/i);
  assert.notEqual(profileAgentLogoUrl("workbuddy"), profileAgentLogoUrl("codex"));
});

function renderAddProfileForm(draft: AddProfileDraft): string {
  const config = appConfigFixture();
  return renderToStaticMarkup(
    <AddProfileForm
      botConfigs={config.botConfigs ?? []}
      draft={draft}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
}

test("Claude Code App profiles expose the direct-launch takeover toggle next to Entry mode", () => {
  const html = renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "app" });
  assert.match(html, /Route Claude App launched outside LLMR through LLMR/);
  assert.match(html, /Only one profile can have this on/);
  assert.doesNotMatch(html, /Applies to the CLI entry/);
  assert.match(html, />The App entry uses the toggle below\.</);
  assert.match(renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "auto" }), />Applies to the CLI entry\. The App entry uses the toggle below\.</);
  assert.doesNotMatch(renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "cli" }), /The App entry uses the toggle below/);
  assert.ok(html.indexOf("Route Claude App launched outside LLMR") < html.indexOf("Advanced settings"));
  assert.doesNotMatch(renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "cli" }), /Route Claude App launched outside LLMR/);
  assert.doesNotMatch(renderAddProfileForm({ ...createProfileDraft("codex"), surface: "app" }), /Route Claude App launched outside LLMR/);
});

test("the takeover toggle round-trips through the stored profile and survives a surface change", () => {
  const draft: AddProfileDraft = { ...createProfileDraft("claude-code"), claudeAppTakeover: true, surface: "auto" };
  const stored = profileConfigFromDraft(draft, []);
  assert.equal(stored.claudeAppTakeover, true);
  assert.equal("claudeAppTakeover" in profileConfigFromDraft({ ...draft, claudeAppTakeover: false }, []), false);
  assert.equal("claudeAppTakeover" in profileConfigFromDraft({ ...draft, surface: "cli" }, []), false);
  assert.equal(createProfileDraftFromProfile(stored).claudeAppTakeover, true);
  assert.equal(normalizeUnknownProfileItem({ ...stored, claudeAppTakeover: "yes" }, 0)?.claudeAppTakeover, undefined);
});

test("the shared-home toggle shows for generated scopes, round-trips, and is dropped for global scope", () => {
  const draft: AddProfileDraft = { ...createProfileDraft("claude-code"), claudeCodeSharedHome: true, scope: "llmr", surface: "cli" };
  assert.match(renderAddProfileForm(draft), /Use my ~\/\.claude in the terminal/);
  assert.doesNotMatch(renderAddProfileForm({ ...draft, scope: "global" }), /Use my ~\/\.claude in the terminal/);
  const stored = profileConfigFromDraft(draft, []);
  assert.equal(stored.claudeCodeSharedHome, true);
  assert.equal(createProfileDraftFromProfile(stored).claudeCodeSharedHome, true);
  assert.equal("claudeCodeSharedHome" in profileConfigFromDraft({ ...draft, scope: "global" }, []), false);
});

test("#1910 stale selected model names remain visible and removable", () => {
  const html = renderToStaticMarkup(<ModelMultiSelector onChange={() => undefined} providers={[{ models: ["valid"], name: "Local" } as GatewayProviderConfig]}
    value={["Local/valid", "Gone/stale", "Local/removed"]} />);
  assert.match(html, /Unavailable selected models/);
  assert.match(html, /Gone\/stale/);
  assert.match(html, /Local\/removed/);
  assert.equal((html.match(/>Remove<\/button>/g) ?? []).length, 2);
});

test("selections the save keeps are not listed as unavailable", () => {
  const providers = [{ id: "local-engine", models: ["local-model"], name: "Local", provider: "local-preset" } as GatewayProviderConfig];
  const virtualModelProfiles = [{ displayName: "Smart", enabled: true, key: "smart", match: { exactAliases: ["smart"], prefixes: [], suffixes: [] }, materialization: { enabled: true, includeInGatewayModels: true } } as unknown as VirtualModelProfileConfig];
  const html = renderToStaticMarkup(<ModelMultiSelector onChange={() => undefined} providers={providers} virtualModelProfiles={virtualModelProfiles}
    value={["local/LOCAL-MODEL", "fusion/SMART"]} />);
  assert.doesNotMatch(html, /Unavailable selected models/);
});

test("every model the picker offers counts as configured, so a save keeps it", () => {
  const providers = [{ models: ["base"], name: "Local" } as GatewayProviderConfig];
  const visible = { enabled: true, materialization: { enabled: true, includeInGatewayModels: true } };
  const virtualModelProfiles = [
    { ...visible, displayName: "Aliased", key: "aliased", match: { exactAliases: ["smart"], prefixes: [], suffixes: [] } },
    { ...visible, displayName: "Prefixed", key: "prefixed", match: { exactAliases: [], prefixes: ["fast-"], suffixes: ["-long"] } },
    { ...visible, displayName: "Bare", key: "bare", match: { exactAliases: [], prefixes: [], suffixes: [] } }
  ] as unknown as VirtualModelProfileConfig[];
  const offered = profileModelProviderOptions(providers, virtualModelProfiles).flatMap((provider) => provider.models.map((model) => `${provider.name}/${model}`));
  assert.deepEqual(offered, ["Local/base", "Fusion/smart"], "a virtual model with no exact alias has no routable name to offer");
  assert.deepEqual(offered.filter((model) => !gatewayModelSelectionMatcher({ Providers: providers, virtualModelProfiles })(model)), []);
});

test("AddProfileForm offers the Claude login toggle on a Claude Code profile that can open in the terminal", () => {
  const config = appConfigFixture();
  const render = (overrides: Partial<ReturnType<typeof createProfileDraft>>) => renderToStaticMarkup(
    <AddProfileForm
      botConfigs={[]}
      draft={{ ...createProfileDraft("claude-code"), ...overrides }}
      error=""
      mode="edit"
      onChange={() => undefined}
      onCreateBot={() => undefined}
      providers={config.Providers}
      virtualModelProfiles={config.virtualModelProfiles}
    />
  );
  const toggle = /aria-label="Sign in with my Claude login"/;
  const help = "Claude Code sends your claude.ai login and LLMR forwards it to Anthropic without storing it. The model list is Claude Code&#x27;s own. The gateway key is written to the settings file of this profile, or to the file it links to.";

  for (const surface of ["cli", "auto"] as const) {
    const html = render({ surface });
    assert.match(html, toggle, surface);
    assert.ok(html.includes(help), surface);
  }
  assert.match(render({ scope: "global", surface: "cli" }), toggle, "a system-default profile");
  assert.doesNotMatch(render({ surface: "app" }), toggle);
  assert.doesNotMatch(render({ ...createProfileDraft("codex"), surface: "cli" }), toggle);
});

test("the Claude login toggle adds and removes only its env row", () => {
  const rows = createProfileDraft("claude-code").envRows;
  assert.equal(claudeLoginEnabled(rows), false);

  const on = withClaudeLogin(rows, true);
  assert.equal(claudeLoginEnabled(on), true);
  assert.deepEqual(on.filter((row) => row.key === "LLMR_CLAUDE_CODE_AUTH_MODE").map((row) => row.value), ["claude-login"]);
  assert.equal(claudeLoginEnabled(withClaudeLogin(on, true)), true);
  assert.equal(withClaudeLogin(on, true).length, on.length, "switching it on twice adds one row");

  const off = withClaudeLogin(on, false);
  assert.equal(claudeLoginEnabled(off), false);
  assert.deepEqual(off, rows);
  assert.equal(claudeLoginEnabled([{ id: "r", key: "LLMR_CLAUDE_CODE_AUTH_MODE", value: "api-key-helper" }]), false);
});

const loginDraft = () => {
  const draft = createProfileDraft("claude-code");
  return { ...draft, envRows: withClaudeLogin(draft.envRows, true) };
};
const loginProviders: GatewayProviderConfig[] = [
  { models: ["first-model"], name: "Fixture" },
  { api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API" }
];
const loginPlugins = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
const loginForm = (draft: AddProfileDraft, providers = loginProviders, providerPlugins: unknown[] = loginPlugins) => renderToStaticMarkup(
  <AddProfileForm botConfigs={[]} draft={draft} error="" onChange={() => undefined} onCreateBot={() => undefined} providerPlugins={providerPlugins} providers={providers} />
);

test("a Claude login profile can be saved without a default model", () => {
  assert.equal(isProfileDraftSubmittable(createProfileDraft("claude-code")), false);
  assert.equal(isProfileDraftSubmittable(loginDraft()), true);
  assert.equal(isProfileDraftSubmittable({ ...loginDraft(), availableModels: ["Fixture/first-model"] }), false);
});

test("AddProfileForm marks the default model optional while the Claude login toggle is on", () => {
  const off = loginForm(createProfileDraft("claude-code"));
  const on = loginForm(loginDraft());
  const count = (html: string, text: RegExp) => (html.match(text) ?? []).length;
  assert.equal(count(on, />Required<\/span>/g), count(off, />Required<\/span>/g) - 1);
  assert.equal(count(on, />Optional<\/span>/g), count(off, />Optional<\/span>/g) + 1);
  assert.equal(count(on, /Keep Claude Code default/g), count(off, /Keep Claude Code default/g) + 1);
  assert.doesNotMatch(on, /Default model is required\./);
  assert.match(off, /Default model is required\./);
  const listed = loginForm({ ...loginDraft(), availableModels: ["Fixture/first-model"] });
  assert.equal(count(listed, />Required<\/span>/g), count(off, />Required<\/span>/g), "an allowed model list makes the default model required again");
  assert.equal(count(listed, /Keep Claude Code default/g), count(off, /Keep Claude Code default/g));
});

test("a model from another provider gets one line per field while the Claude login toggle is on", () => {
  const notice = (draft: AddProfileDraft, field: ClaudeLoginModelField = "model") => claudeLoginModelNotice(draft, field, loginProviders, loginPlugins);
  const startLine = "New sessions start on this model, which goes to Fixture, not to your Claude subscription.";
  const opusLine = "Claude Code's Opus choice goes to Fixture, not to your Claude subscription.";
  assert.equal(notice({ ...loginDraft(), model: "Fixture/first-model" }), startLine);
  assert.equal(notice({ ...loginDraft(), opusModel: "Fixture/first-model" }, "opusModel"), opusLine);
  assert.equal(notice({ ...loginDraft(), haikuModel: "Fixture/first-model" }, "haikuModel"), "Claude Code's Haiku choice goes to Fixture, not to your Claude subscription.");
  assert.equal(notice({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), undefined);
  assert.equal(notice({ ...loginDraft(), model: "claude-opus-4-8" }), undefined);
  assert.equal(notice(loginDraft(), "opusModel"), undefined);
  assert.equal(notice({ ...createProfileDraft("claude-code"), model: "Fixture/first-model" }), undefined);
  const html = loginForm({ ...loginDraft(), fableModel: "Fixture/first-model", haikuModel: "Fixture/first-model", model: "Fixture/first-model", opusModel: "Fixture/first-model", sonnetModel: "Fixture/first-model" });
  assert.ok(html.includes(startLine));
  for (const alias of ["Fable", "Opus", "Sonnet", "Haiku"]) {
    assert.ok(html.includes(`Claude Code&#x27;s ${alias} choice goes to Fixture`), alias);
  }
  assert.doesNotMatch(loginForm({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), /not to your Claude subscription/);
});

test("the form says when Claude login mode has no provider and when the profile starts signed out", () => {
  const missing = /No Claude Code API provider is on\./;
  const signedOut = /starts signed out\. Run \/login once inside it/;
  assert.match(loginForm(loginDraft(), [loginProviders[0]]), missing);
  assert.match(loginForm(loginDraft(), loginProviders, []), missing);
  assert.match(loginForm(loginDraft(), [loginProviders[0], { ...loginProviders[1], enabled: false }]), /No Claude Code API provider is on\. Add it under Providers, or turn it on\./);
  assert.doesNotMatch(loginForm(loginDraft()), missing);
  assert.doesNotMatch(loginForm(createProfileDraft("claude-code"), [loginProviders[0]]), missing);
  assert.match(loginForm(loginDraft()), signedOut);
  assert.doesNotMatch(loginForm({ ...loginDraft(), claudeCodeSharedHome: true }), signedOut);
  assert.doesNotMatch(loginForm({ ...loginDraft(), scope: "global" }), signedOut);
  assert.doesNotMatch(loginForm(createProfileDraft("claude-code")), signedOut);
});

test("the form warns that an allowed model list applies to every model Claude Code uses", () => {
  const listLine = /it applies to every model Claude Code uses/;
  assert.match(loginForm({ ...loginDraft(), availableModels: ["Claude Code API/claude-sonnet-5"], model: "Claude Code API/claude-sonnet-5" }), listLine);
  assert.doesNotMatch(loginForm(loginDraft()), listLine);
  assert.doesNotMatch(loginForm({ ...createProfileDraft("claude-code"), availableModels: ["Fixture/first-model"], model: "Fixture/first-model" }), listLine);
});

test("the profile card marks Claude login mode", () => {
  const profile = { agent: "claude-code", enabled: true, env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" }, id: "p", model: "", name: "p", scope: "llmr" } as ProfileConfig;
  const signIn = (config: AppConfig, item = profile) => profileSummaryItems(item, config).find((entry) => entry.label === "Sign-in")?.value;
  const config = { ...appConfigFixture(), Providers: loginProviders, providerPlugins: loginPlugins };
  assert.equal(signIn(config), "Claude login");
  assert.equal(signIn({ ...config, providerPlugins: [] }), "Claude login, no Claude Code API provider");
  assert.equal(signIn(config, { ...profile, env: {} }), undefined);
});

test("the pass-through provider is offered only to a Claude Code profile in Claude login mode", () => {
  const names = (draft: AddProfileDraft, plugins: unknown[] = loginPlugins) => profileModelProviders(draft, loginProviders, plugins).map((provider) => provider.name);
  assert.deepEqual(names(loginDraft()), ["Fixture", "Claude Code API"]);
  assert.deepEqual(names(createProfileDraft("claude-code")), ["Fixture"]);
  assert.deepEqual(names(createProfileDraft("codex")), ["Fixture"]);
  assert.deepEqual(names(createProfileDraft("codex"), []), ["Fixture", "Claude Code API"]);
});

test("the form says so when the only provider is the pass-through one", () => {
  const only = [loginProviders[1]];
  const claudeOnly = /Your only provider is Claude Code API\. Turn on Sign in with my Claude login to use it, or add another provider\./;
  const otherOnly = /It works only in a Claude Code profile with Sign in with my Claude login on\. Add another provider for this agent\./;
  assert.match(loginForm(createProfileDraft("claude-code"), only), claudeOnly);
  assert.match(loginForm(createProfileDraft("codex"), only), otherOnly);
  assert.doesNotMatch(loginForm(loginDraft(), only), /Your only provider is Claude Code API/);
  assert.match(loginForm(createProfileDraft("codex"), []), /Configure at least one enabled provider model/);
  assert.match(loginForm({ ...createProfileDraft("claude-code"), model: "Claude Code API/claude-sonnet-5" }), /This profile names a Claude Code API model\./);
  assert.match(loginForm({ ...createProfileDraft("claude-code"), model: "Fixture/first-model", opusModel: "Claude Code API/claude-sonnet-5" }), /This profile names a Claude Code API model\./);
  assert.match(loginForm({ ...createProfileDraft("claude-code"), availableModels: ["Claude Code API/claude-sonnet-5"], model: "Fixture/first-model" }), /This profile names a Claude Code API model\./);
  assert.doesNotMatch(loginForm({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), /This profile names a Claude Code API model\./);
});

test("an empty model on another agent's card does not fall back to the pass-through provider", () => {
  const config = { ...appConfigFixture(), Providers: [loginProviders[1], loginProviders[0]], providerPlugins: loginPlugins };
  const codex = { agent: "codex", enabled: true, id: "c", model: "", name: "c", scope: "llmr" } as ProfileConfig;
  assert.equal(profileSummaryItems(codex, config).find((item) => item.label === "Model")?.value, "Fixture/first-model");
});

test("a profile is saved only when it has a provider it can use", () => {
  const only = { Providers: loginProviders.filter((provider) => provider.name === "Claude Code API"), providerPlugins: loginPlugins, virtualModelProfiles: [] };
  const both = { ...only, Providers: loginProviders };
  assert.equal(profileHasUsableModels(createProfileDraft("codex"), only), false);
  assert.equal(profileHasUsableModels(createProfileDraft("claude-code"), only), false);
  assert.equal(profileHasUsableModels(loginDraft(), only), true);
  assert.equal(profileHasUsableModels(createProfileDraft("codex"), both), true);
  assert.equal(profileHasUsableModels(createProfileDraft("codex"), { ...only, Providers: [] }), false);
});

test("the UI and core name the same provider as the pass-through one", () => {
  const internal = { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" };
  const claude = (extra: Partial<GatewayProviderConfig> = {}): GatewayProviderConfig => ({ ...loginProviders[1], ...extra });
  const cases: Array<[GatewayProviderConfig, unknown[], boolean]> = [
    [claude({ id: "claude-code-api", type: "anthropic_messages" }), [...loginPlugins, internal], true],
    [claude({ api_key: "sk-own-key-0001" }), loginPlugins, true],
    [claude({ id: "claude-code-api", name: "My Claude", type: "anthropic_messages" }), [...loginPlugins, internal], true],
    [claude({ type: "anthropic_messages" }), [internal], false],
    [claude({ id: "claude", name: "My Claude" }), [{ ...internal, providerName: "claude::anthropic_messages" }], false],
    [claude({ enabled: false }), loginPlugins, false],
    [claude(), [], false],
    [claude(), [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Claude Code API" }], false]
  ];
  for (const [provider, providerPlugins, expected] of cases) {
    assert.equal(isClaudeLoginProvider(provider, providerPlugins), expected);
    assert.equal(claudeLoginProviderNames({ Providers: [provider], providerPlugins }).includes(provider.name), expected);
  }
});
