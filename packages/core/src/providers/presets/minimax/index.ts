import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@llmr/core/contracts/app";
import type { ProviderPreset } from "@llmr/core/providers/presets/types";
import { standardProviderAccountConfig } from "@llmr/core/providers/presets/types";

// `model_remains` also lists a "video" family in no fixed order, so select the "general" row by name.
const minimaxQuotaMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: "$.model_remains[?(@.model_name==\"general\")].current_interval_remaining_percent",
      resetAt: "$.model_remains[?(@.model_name==\"general\")].end_time",
      unit: "%",
      used: "100 - $.model_remains[?(@.model_name==\"general\")].current_interval_remaining_percent",
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: "$.model_remains[?(@.model_name==\"general\")].current_weekly_remaining_percent",
      resetAt: "$.model_remains[?(@.model_name==\"general\")].weekly_end_time",
      unit: "%",
      used: "100 - $.model_remains[?(@.model_name==\"general\")].current_weekly_remaining_percent",
      window: "weekly"
    }
  ]
};

const minimaxGlobalProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key",
      endpoint: "https://www.minimax.io/v1/token_plan/remains",
      mapping: minimaxQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

export const minimaxGlobalProviderPreset: ProviderPreset = {
  account: minimaxGlobalProviderAccountConfig,
  aliases: ["minimax", "minimax global"],
  defaultModels: ["MiniMax-M3"],
  endpoints: [
    {
      baseUrl: "https://api.minimax.io/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimax.io/docs"
    },
    {
      baseUrl: "https://api.minimax.io/anthropic/v1",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimax.io/docs"
    }
  ],
  id: "minimax-global",
  name: "MiniMax (Global)",
  websiteUrl: "https://platform.minimax.io/docs"
};

export const minimaxChinaProviderPreset: ProviderPreset = {
  account: standardProviderAccountConfig,
  aliases: ["minimax", "minimaxi", "minimax china"],
  defaultModels: ["MiniMax-M3"],
  endpoints: [
    {
      baseUrl: "https://api.minimaxi.com/v1",
      protocols: ["openai_chat_completions"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    },
    {
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      protocols: ["anthropic_messages"],
      websiteUrl: "https://platform.minimaxi.com/docs"
    }
  ],
  id: "minimax-cn",
  name: "MiniMax (China)",
  websiteUrl: "https://platform.minimaxi.com/docs"
};
