import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@llmr/core/contracts/app";
import type { ProviderPreset } from "@llmr/core/providers/presets/types";

// Windows are selected by `unit` alone (3 = 5h, 6 = weekly) because the limit `type` was renamed from TOKENS_LIMIT to CREDIT_LIMIT.
const zaiQuotaMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "five_hour_quota",
      kind: "quota",
      label: "5h quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.unit==3)].percentage",
      resetAt: "$.data.limits[?(@.unit==3)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.unit==3)].percentage",
      window: "5h"
    },
    {
      id: "weekly_quota",
      kind: "quota",
      label: "Weekly quota",
      limit: 100,
      remaining: "100 - $.data.limits[?(@.unit==6)].percentage",
      resetAt: "$.data.limits[?(@.unit==6)].nextResetTime",
      unit: "%",
      used: "$.data.limits[?(@.unit==6)].percentage",
      window: "weekly"
    }
  ]
};

const zaiGlobalProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zaiQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

export const zaiGlobalGeneralProviderPreset: ProviderPreset = {
  account: zaiGlobalProviderAccountConfig,
  aliases: ["z.ai", "zai", "z ai", "z-ai", "glm global"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://api.z.ai/api/paas/v4",
      protocols: ["openai_chat_completions"]
    }
  ],
  id: "zai-global-general",
  name: "Z.ai (Global) - General Endpoint",
  websiteUrl: "https://z.ai/"
};
