import { defaultProviderAccountConfig, type ProviderPreset } from "@ccr/core/providers/presets/types";

export const infistarAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["infistar", "infistar ai"],
  defaultModels: ["gpt-4o"],
  endpoints: [
    {
      baseUrl: "https://infistar.ai/v1",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "infistar-ai",
  name: "Infistar AI",
  websiteUrl: "https://www.infistar.cc/register?aff=CCRCCR&ref_source=link"
};
