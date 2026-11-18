import { codexBaseInstructions } from "@llmr/core/agents/codex/base-instructions";
import runtimeSource from "@llmr/core/agents/codex/cli-middleware-runtime-source.runtime.cjs";

export function codexCliMiddlewareRuntimeScript(): string {
  return runtimeSource.replace("\"__LLMR_CODEX_BASE_INSTRUCTIONS_JSON__\"", () => JSON.stringify(codexBaseInstructions));
}
