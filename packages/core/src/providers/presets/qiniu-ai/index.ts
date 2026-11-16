import { defaultProviderAccountConfig, type ProviderPreset } from "@llmr/core/providers/presets/types";

export const qiniuAiProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qiniu", "qiniu ai", "qiniu cloud ai", "qiniu yun ai", "qiniu yun", "modelink"],
  endpoints: [
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland OpenAI",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://www.qiniu.com/ai/agent"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/openai/v1",
      label: "China mainland OpenAI Responses",
      protocols: ["openai_responses"],
      websiteUrl: "https://www.qiniu.com/ai/agent"
    },
    {
      baseUrl: "https://api.qnaigc.com",
      label: "China mainland Anthropic",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://www.qiniu.com/ai/agent"
    },
    {
      baseUrl: "https://api.qnaigc.com/bypass/vertex/v1",
      label: "China mainland Gemini Generate",
      protocols: ["gemini_generate_content"],
      websiteUrl: "https://www.qiniu.com/ai/agent"
    }
  ],
  id: "qiniu-ai",
  name: "Qiniu Cloud AI",
  websiteUrl: "https://www.qiniu.com/ai/agent"
};
