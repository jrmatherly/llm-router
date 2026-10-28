// LLMR's own credentials (web auth, core gateway client keys, sync tokens). Third-party keys such as
// TAVILY_API_KEY stay, since MCP servers legitimately read them from the environment.
const llmrSecretEnvName = /^LLMR_\w*(TOKEN|SECRET|PASSWORD|API_KEY)/;

export function withoutLlmrSecretEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !llmrSecretEnvName.test(name)));
}
