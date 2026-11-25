// LLMR's own credentials (web auth, core gateway client keys, sync tokens). Third-party keys such as
// TAVILY_API_KEY stay, since MCP servers legitimately read them from the environment.
// A name that ends in _FILE or _HELPER says where a secret lives and is not one.
// Any letter case, because Windows reads a name without regard to letter case.
const llmrSecretEnvName = /^LLMR_\w*(TOKEN|SECRET|PASSWORD|API_KEY)(?!\w*_(FILE|HELPER)$)/i;

export function withoutLlmrSecretEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !llmrSecretEnvName.test(name)));
}
