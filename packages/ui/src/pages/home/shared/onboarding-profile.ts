import type { ProfileConfig } from "@llmr/core/contracts/app";

export function onboardingProfileIndex(profiles: ProfileConfig[], agent: ProfileConfig["agent"]): number {
  const enabledIndex = profiles.findIndex((profile) => profile.enabled && profile.agent === agent);
  return enabledIndex >= 0
    ? enabledIndex
    : profiles.findIndex((profile) => profile.agent === agent && profile.scope === "global");
}

export function withOnboardingProfile(profiles: ProfileConfig[], index: number, profile: ProfileConfig): ProfileConfig[] {
  const next = [...profiles];
  next[index >= 0 && index < next.length ? index : next.length] = { ...profile, enabled: true };
  return next;
}
