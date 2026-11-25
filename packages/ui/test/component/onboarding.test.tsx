import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingLayout } from "@llmr/ui/pages/home/components/layout.tsx";
import { OnboardingView } from "@llmr/ui/pages/home/components/onboarding.tsx";
import {
  createProfileDraft,
  createProviderDraft,
  fallbackGatewayStatus,
  localAgentProviderApiKey
} from "@llmr/ui/pages/home/shared/index.tsx";
import { profileAgentOptions } from "@llmr/ui/pages/home/shared/options.ts";
import { appConfigFixture } from "../fixtures/index.ts";

test("Onboarding provider step renders only the active provider setup section", () => {
  const config = appConfigFixture();
  const providerDraft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example/v1",
    modelsText: "example-model",
    name: "Example Provider"
  };
  const html = renderToStaticMarkup(
    <OnboardingView
      activeStep="provider"
      agentOptions={profileAgentOptions}
      canSubmitProfile={false}
      canSubmitProvider={false}
      config={config}
      endpoint="http://127.0.0.1:3456"
      gatewayStatus={fallbackGatewayStatus}
      onCheckProvider={async () => ({ failed: [], passed: [], results: [] })}
      onChangeProfile={() => undefined}
      onChangeProvider={() => undefined}
      onComplete={() => undefined}
      onSelectStep={() => undefined}
      onSubmitProfile={async () => false}
      onSubmitProvider={async () => false}
      profileDraft={createProfileDraft()}
      profileError=""
      providerConnectivityLoading={false}
      providerDraft={providerDraft}
      providerError=""
      providerProbeLoading={false}
    />
  );

  assert.match(html, /Choose provider/);
  assert.match(html, /Add credentials/);
  assert.match(html, /Pick models/);
  assert.match(html, /Verify connection/);
  assert.match(html, /Connect agent/);
  assert.match(html, /Let&#x27;s start/);
  assert.match(html, /aria-label="Step 1 \/ 6"/);
  assert.doesNotMatch(html, /1 \/ 4/);
  assert.doesNotMatch(html, /Setup readiness/);
  assert.doesNotMatch(html, /Choose a provider preset or endpoint, enter an API key, and add at least one model/);
  assert.doesNotMatch(html, /Choose how this provider authenticates model requests/);
  assert.doesNotMatch(html, /Choose the models that should be available through this provider/);
  assert.doesNotMatch(html, /Run a real model request before relying on this provider/);
});

test("Onboarding profile step does not prompt to save before continuing", () => {
  const config = appConfigFixture();
  config.Providers = [{
    api_base_url: "https://gateway.example/v1",
    api_key: "sk-test",
    models: ["example-model"],
    name: "Example Provider",
    type: "openai_chat_completions"
  }];
  const providerDraft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example/v1",
    modelsText: "example-model",
    name: "Example Provider"
  };
  const html = renderToStaticMarkup(
    <OnboardingView
      activeStep="profile"
      agentOptions={profileAgentOptions}
      canSubmitProfile
      canSubmitProvider={false}
      config={config}
      endpoint="http://127.0.0.1:3456"
      gatewayStatus={fallbackGatewayStatus}
      onCheckProvider={async () => ({ failed: [], passed: [], results: [] })}
      onChangeProfile={() => undefined}
      onChangeProvider={() => undefined}
      onComplete={() => undefined}
      onSelectStep={() => undefined}
      onSubmitProfile={async () => false}
      onSubmitProvider={async () => false}
      profileDraft={createProfileDraft()}
      profileError=""
      providerConnectivityLoading={false}
      providerDraft={providerDraft}
      providerError=""
      providerProbeLoading={false}
    />
  );

  assert.doesNotMatch(html, /Save this agent profile to continue/);
  assert.doesNotMatch(html, /Choose an agent, model, and required profile settings/);
  assert.doesNotMatch(html, /provider identity/);
  assert.match(html, /Models, paths, routing, bot, compact, Claude settings, and env/);
});

test("Onboarding skips credentials for a local agent import", () => {
  const config = appConfigFixture();
  const providerDraft = {
    ...createProviderDraft([]),
    apiKey: localAgentProviderApiKey,
    baseUrl: "https://api.anthropic.com",
    modelsText: "claude-sonnet-5",
    name: "Claude Code API",
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }]
  };
  const html = renderToStaticMarkup(
    <OnboardingView
      activeStep="provider"
      agentOptions={profileAgentOptions}
      canSubmitProfile={false}
      canSubmitProvider={false}
      config={config}
      endpoint="http://127.0.0.1:3456"
      gatewayStatus={fallbackGatewayStatus}
      onCheckProvider={async () => ({ failed: [], passed: [], results: [] })}
      onChangeProfile={() => undefined}
      onChangeProvider={() => undefined}
      onComplete={() => undefined}
      onSelectStep={() => undefined}
      onSubmitProfile={async () => false}
      onSubmitProvider={async () => false}
      profileDraft={createProfileDraft()}
      profileError=""
      providerConnectivityLoading={false}
      providerDraft={providerDraft}
      providerError=""
      providerProbeLoading={false}
    />
  );

  assert.doesNotMatch(html, /Add credentials/);
  assert.match(html, /Pick models/);
  assert.match(html, /aria-label="Step 1 \/ 5"/);
});

function onboardingProps(activeStep: "provider" | "profile" | "enter", readiness?: { profileSkipped?: boolean }): ComponentProps<typeof OnboardingView> {
  const config = appConfigFixture();
  config.Providers = [{
    api_base_url: "https://gateway.example/v1",
    api_key: "sk-test",
    models: ["example-model"],
    name: "Example Provider",
    type: "openai_chat_completions"
  }];
  config.profile.profiles = config.profile.profiles.map((profile) => ({ ...profile, enabled: false }));
  return {
    activeStep,
    agentOptions: profileAgentOptions,
    canSubmitProfile: true,
    canSubmitProvider: false,
    config,
    endpoint: "http://127.0.0.1:3456",
    gatewayStatus: fallbackGatewayStatus,
    onCheckProvider: async () => ({ failed: [], passed: [], results: [] }),
    onChangeProfile: () => undefined,
    onChangeProvider: () => undefined,
    onComplete: () => undefined,
    onSelectStep: () => undefined,
    onSkipProfile: () => undefined,
    onSubmitProfile: async () => false,
    onSubmitProvider: async () => false,
    profileDraft: createProfileDraft(),
    profileError: "",
    providerConnectivityLoading: false,
    providerDraft: createProviderDraft([]),
    providerError: "",
    providerProbeLoading: false,
    readiness
  };
}

function renderOnboarding(activeStep: "provider" | "profile" | "enter", readiness?: { profileSkipped?: boolean }) {
  return renderToStaticMarkup(<OnboardingView {...onboardingProps(activeStep, readiness)} />);
}

test("Onboarding offers Skip for now on the Connect agent step only", () => {
  assert.match(renderOnboarding("profile"), /Skip for now/);
  assert.doesNotMatch(renderOnboarding("provider"), /Skip for now/);
  assert.doesNotMatch(renderOnboarding("enter"), /Skip for now/);
});

test("Onboarding shows a skipped agent step as skipped and lets the user start", () => {
  const skipped = renderOnboarding("enter", { profileSkipped: true });
  assert.match(skipped, /Skipped\. Add one under Agent Profiles\./);
  assert.doesNotMatch(skipped, /<button[^>]* disabled=""[^>]*>(?:<svg.*?<\/svg>)?Let&#x27;s start/);

  const notSkipped = renderOnboarding("enter");
  assert.doesNotMatch(notSkipped, /Skipped\. Add one under Agent Profiles\./);
  assert.match(notSkipped, /<button[^>]* disabled=""[^>]*>(?:<svg.*?<\/svg>)?Let&#x27;s start/);
});

test("Onboarding shows a gateway startup error below the progress bar, in flow", () => {
  const html = renderToStaticMarkup(<OnboardingView {...onboardingProps("provider")} gatewayStartupError="boom" />);
  const bannerIndex = html.indexOf("Service failed to start");
  assert.ok(bannerIndex > html.indexOf('role="progressbar"'), "banner renders after the progress bar");
  assert.match(html, /boom/);
});

test("Onboarding layout does not float the gateway startup error over the heading", () => {
  const html = renderToStaticMarkup(
    <OnboardingLayout gatewayStartupError="boom" loaded onboarding={onboardingProps("provider")} />
  );
  assert.match(html, /Service failed to start/);
  assert.doesNotMatch(html, /absolute inset-x-0 top-12/);
});
