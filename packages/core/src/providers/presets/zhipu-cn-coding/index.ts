import type { ProviderAccountConfig, ProviderAccountMappingConfig } from "@llmr/core/contracts/app";
import type { ProviderPreset } from "@llmr/core/providers/presets/types";

// Windows are selected by `unit` alone (3 = 5h, 6 = weekly) because the limit `type` differs across endpoints (TOKENS_LIMIT, CREDIT_LIMIT).
const zhipuQuotaMapping: ProviderAccountMappingConfig = {
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
  ],
  message: "$.msg"
};

const zhipuCnProviderAccountConfig: ProviderAccountConfig = {
  connectors: [
    {
      auth: "provider-api-key-raw",
      endpoint: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      headers: {
        "Accept-Language": "en-US,en"
      },
      mapping: zhipuQuotaMapping,
      type: "http-json"
    }
  ],
  enabled: true
};

export const zhipuCnCodingProviderPreset: ProviderPreset = {
  account: zhipuCnProviderAccountConfig,
  aliases: ["zhipu", "bigmodel", "glm"],
  defaultModels: ["glm-5.2", "glm-5.1", "glm-4.7", "glm-4.5-air"],
  endpoints: [
    {
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      protocols: ["openai_chat_completions"]
    },
    {
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      protocols: ["anthropic_messages"]
    }
  ],
  id: "zhipu-cn-coding",
  name: "Zhipu AI (China) - Coding Plan",
  websiteUrl: "https://www.bigmodel.cn/"
};
