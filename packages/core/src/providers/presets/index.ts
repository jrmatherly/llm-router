import { anthropicProviderPreset } from "@llmr/core/providers/presets/anthropic/index";
import { bailianProviderPreset } from "@llmr/core/providers/presets/bailian/index";
import { claudeApiProviderPreset } from "@llmr/core/providers/presets/claudeapi/index";
import { code0ProviderPreset } from "@llmr/core/providers/presets/code0/index";
import { deepSeekProviderPreset } from "@llmr/core/providers/presets/deepseek/index";
import { fennoProviderPreset } from "@llmr/core/providers/presets/fenno/index";
import { geminiProviderPreset } from "@llmr/core/providers/presets/gemini/index";
import { infistarAiProviderPreset } from "@llmr/core/providers/presets/infistar-ai/index";
import { kimiCodingProviderPreset } from "@llmr/core/providers/presets/kimi-coding/index";
import { minimaxChinaProviderPreset, minimaxGlobalProviderPreset } from "@llmr/core/providers/presets/minimax/index";
import { mistralProviderPreset } from "@llmr/core/providers/presets/mistral/index";
import { moonshotChinaProviderPreset, moonshotGlobalProviderPreset } from "@llmr/core/providers/presets/moonshot/index";
import { nvidiaProviderPreset } from "@llmr/core/providers/presets/nvidia/index";
import { openCodeGoProviderPreset } from "@llmr/core/providers/presets/opencode-go/index";
import { openaiProviderPreset } from "@llmr/core/providers/presets/openai/index";
import { openRouterProviderPreset } from "@llmr/core/providers/presets/openrouter/index";
import { qiniuAiProviderPreset } from "@llmr/core/providers/presets/qiniu-ai/index";
import { runApiProviderPreset } from "@llmr/core/providers/presets/runapi/index";
import { siliconFlowProviderPreset } from "@llmr/core/providers/presets/siliconflow/index";
import { teamoRouterProviderPreset } from "@llmr/core/providers/presets/teamorouter/index";
import { unity2ProviderPreset } from "@llmr/core/providers/presets/unity2/index";
import {
  xiaomiMimoProviderPreset,
  xiaomiMimoTokenPlanChinaProviderPreset,
  xiaomiMimoTokenPlanEuropeProviderPreset,
  xiaomiMimoTokenPlanSingaporeProviderPreset
} from "@llmr/core/providers/presets/xiaomi/index";
import { yApiProviderPreset } from "@llmr/core/providers/presets/y-api/index";
import { zaiGlobalCodingProviderPreset } from "@llmr/core/providers/presets/zai-global-coding/index";
import { zaiGlobalGeneralProviderPreset } from "@llmr/core/providers/presets/zai-global-general/index";
import { zhipuCnCodingProviderPreset } from "@llmr/core/providers/presets/zhipu-cn-coding/index";
import { zhipuCnGeneralProviderPreset } from "@llmr/core/providers/presets/zhipu-cn-general/index";
import {
  findProviderPresetByBaseUrlInList,
  findProviderPresetInList,
  primaryProviderPresetEndpoint,
  providerApiKeySafetyIssueInList,
  providerEndpointCanReceiveProviderApiKeyInList,
  providerIdentitySafetyIssueInList,
  providerPresetMatchesBaseUrl
} from "@llmr/core/providers/presets/utils";
import type { ProviderIdentitySafetyIssue, ProviderPreset } from "@llmr/core/providers/presets/types";

export const providerPresets: ProviderPreset[] = [
  openaiProviderPreset,
  anthropicProviderPreset,
  geminiProviderPreset,
  openRouterProviderPreset,
  nvidiaProviderPreset,
  openCodeGoProviderPreset,
  deepSeekProviderPreset,
  xiaomiMimoProviderPreset,
  xiaomiMimoTokenPlanChinaProviderPreset,
  xiaomiMimoTokenPlanSingaporeProviderPreset,
  xiaomiMimoTokenPlanEuropeProviderPreset,
  kimiCodingProviderPreset,
  zhipuCnCodingProviderPreset,
  zhipuCnGeneralProviderPreset,
  zaiGlobalCodingProviderPreset,
  zaiGlobalGeneralProviderPreset,
  minimaxGlobalProviderPreset,
  minimaxChinaProviderPreset,
  mistralProviderPreset,
  moonshotChinaProviderPreset,
  moonshotGlobalProviderPreset,
  bailianProviderPreset,
  siliconFlowProviderPreset,
  qiniuAiProviderPreset,
  fennoProviderPreset,
  infistarAiProviderPreset,
  runApiProviderPreset,
  teamoRouterProviderPreset,
  unity2ProviderPreset,
  code0ProviderPreset,
  claudeApiProviderPreset,
  yApiProviderPreset
];

export function getProviderPresets(): ProviderPreset[] {
  return JSON.parse(JSON.stringify(providerPresets)) as ProviderPreset[];
}

export function findProviderPreset(id: string | undefined): ProviderPreset | undefined {
  return findProviderPresetInList(providerPresets, id);
}

export function findProviderPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  return findProviderPresetByBaseUrlInList(providerPresets, baseUrl);
}

export { primaryProviderPresetEndpoint, providerPresetMatchesBaseUrl };

export function providerIdentitySafetyIssue(input: {
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerIdentitySafetyIssueInList(providerPresets, input);
}

export function providerApiKeySafetyIssue(input: {
  apiKey?: string;
  baseUrl: string;
  name?: string;
  presetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerApiKeySafetyIssueInList(providerPresets, input);
}

export function providerEndpointCanReceiveProviderApiKey(input: {
  apiKey?: string;
  endpoint: string;
  providerName?: string;
  providerPresetId?: string;
}): ProviderIdentitySafetyIssue | undefined {
  return providerEndpointCanReceiveProviderApiKeyInList(providerPresets, input);
}
