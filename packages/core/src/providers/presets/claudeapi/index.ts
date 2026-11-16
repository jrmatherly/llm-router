import { defaultProviderAccountConfig, type ProviderPreset } from "@llmr/core/providers/presets/types";

export const claudeApiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["claudeapi", "claudeapi.com", "www.claudeapi.com"],
  endpoints: [
    {
      baseUrl: "https://gw.claudeapi.com",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "claudeapi",
  name: "claudeapi",
  websiteUrl: "https://claudeapi.com/"
};
