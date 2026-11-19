import { gatewayModelSelectionMatcher, type AppConfig, type ProfileConfig } from "@llmr/core/contracts/app";
import { ModelRegistry, parseProviderModelSelector } from "@llmr/core/routing/model-registry";

export function reconcileProfileModelSelections(config: AppConfig): AppConfig {
  const registry = new ModelRegistry(config);
  const matches = gatewayModelSelectionMatcher(config);
  const isConfigured = (model: string) => registry.isConfigured(model) || matches(model);
  const describe = (model: string) => {
    const parsed = parseProviderModelSelector(model);
    const provider = parsed ? registry.findProvider(parsed.provider) : undefined;
    return provider && parsed
      ? `Provider "${provider.name}" does not list model "${parsed.model}". Its models: ${provider.models.join(", ") || "none"}.`
      : `Model "${model}" is not served by an enabled provider or virtual model.`;
  };
  const profiles = config.profile.profiles.map((profile): ProfileConfig => {
    if (!profile.availableModels?.length) {
      return profile;
    }
    const name = profile.name || profile.id;
    const defaultConfigured = Boolean(profile.model) && isConfigured(profile.model);
    if (profile.enabled && profile.model && !defaultConfigured) {
      throw new Error(`Profile "${name}": ${describe(profile.model)} Choose a configured default model for this profile, or turn the profile off, then save again.`);
    }
    const availableModels = profile.availableModels.filter(isConfigured);
    // The gateway always allows the default model, so it only needs listing when nothing else is left.
    if (defaultConfigured && availableModels.length === 0) {
      availableModels.push(profile.model);
    }
    if (availableModels.length === 0) {
      if (profile.enabled) {
        throw new Error(`Profile "${name}": ${describe(profile.availableModels[0])} Choose at least one configured model for this profile, or turn the profile off, then save again.`);
      }
      // An empty list allows every model, so a disabled profile keeps its stale list until it is repaired.
      return profile;
    }
    const unchanged = availableModels.length === profile.availableModels.length && availableModels.every((model, index) => model === profile.availableModels?.[index]);
    return unchanged ? profile : { ...profile, availableModels };
  });
  return { ...config, profile: { ...config.profile, profiles } };
}
