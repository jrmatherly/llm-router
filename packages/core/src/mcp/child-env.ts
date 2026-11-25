// LLMR's own credentials (web auth, core gateway client keys, sync tokens). Third-party keys such as
// TAVILY_API_KEY stay, since MCP servers legitimately read them from the environment.
// A name that ends in _FILE or _HELPER says where a secret lives and is not one.
// Any letter case, because Windows reads a name without regard to letter case.
const llmrSecretEnvName = /^LLMR_\w*(TOKEN|SECRET|PASSWORD|API_KEY)(?!\w*_(FILE|HELPER)$)/i;

export function withoutLlmrSecretEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !llmrSecretEnvName.test(name)));
}

// Later layers win. On Windows a name replaces any earlier spelling of it, because a child given two
// spellings of one name receives only the one that sorts first, whichever layer set it.
export function mergeChildEnv(...layers: Array<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const foldCase = process.platform === "win32";
  const merged: NodeJS.ProcessEnv = {};
  const spelling = new Map<string, string>();
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer)) {
      const folded = foldCase ? name.toUpperCase() : name;
      const previous = spelling.get(folded);
      if (previous !== undefined && previous !== name) {
        delete merged[previous];
      }
      spelling.set(folded, name);
      merged[name] = value;
    }
  }
  return merged;
}
