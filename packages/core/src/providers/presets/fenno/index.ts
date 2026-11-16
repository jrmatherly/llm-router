import { defaultProviderAccountConfig, type ProviderPreset } from "@llmr/core/providers/presets/types";

export const fennoProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["fenno", "fenno.ai", "fenno ai"],
  endpoints: [
    {
      baseUrl: "https://api.fenno.ai",
      protocols: ["openai_chat_completions", "openai_responses", "anthropic_messages"]
    }
  ],
  id: "fenno",
  name: "Fenno.ai",
  websiteUrl: "https://fenno.ai/"
};
