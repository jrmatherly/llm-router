import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Run order matters only for review: each class is one phase of the rename and ends green on its own.
export const classes = {
  alias: [/@ccr(?=\\?\/)/g],
  wire: [
    /x-ccr-/gi,
    /\\?\/api\\?\/ccr(?![A-Za-z0-9_-])/g,
    /\\?\/__ccr(?![A-Za-z0-9_])/g,
    /window\\?\.ccr/g,
    /exposeInMainWorld\("ccr/g,
    /Window\["ccr"\]/g,
    /\bccr(?:Browser)?\??: \{/g,
    /\{ ccr: Record<string, unknown> \}\)\.ccr/g,
    /(?<=["'`])ccr(?=:(?!\/\/))/g
  ],
  env: [/CCR_/g],
  rest: [/ccr/gi],
  longform: [/claude([ _-]?)code\1router/gi]
};

const skippedPaths = [
  "blog/en/",
  "docs/superpowers/",
  "docs/package-lock.json",
  "package-lock.json",
  "packages/core/models.json",
  "packages/ui/src/generated/",
  "scripts/llmr-rename.mjs",
  "tests/architecture/llmr-rename.test.mjs",
  "tests/architecture/uninstall-macos-script.test.mjs"
];

// Every entry is a deliberate survivor; docs/superpowers/specs/2026-10-27-ccr-to-llmr-rename.md gives the reasons.
// `path` keeps the text in one file. `at` keeps it everywhere and lists every file that holds it, so an over-rename in any of them fails the guard test.
export const kept = [
  {
    at: [
      "packages/core/src/contracts/app.ts",
      "packages/core/test/unit/config/plugin-config-migration.test.mjs",
      "packages/core/test/unit/contracts/app.test.mjs",
      "packages/electron/bundled-plugins/claude-design/README.md",
      "packages/electron/bundled-plugins/claude-design/index.cjs",
      "packages/electron/bundled-plugins/claude-design/plugin.json",
      "packages/electron/src/main/plugin-app-url.ts",
      "packages/electron/test/unit/claude-design-plugin-assets.test.ts",
      "packages/electron/test/unit/plugin-app-url.test.ts"
    ],
    text: "ccrdesk.top"
  },
  {
    at: [
      "packages/core/src/providers/presets/kimi-coding/index.ts",
      "packages/core/src/providers/presets/moonshot/index.ts"
    ],
    text: "aff=ccr"
  },
  {
    at: [
      "packages/core/src/providers/presets/infistar-ai/index.ts",
      "packages/core/test/unit/providers/provider-preset-utils.test.mjs"
    ],
    text: "aff=CCRCCR"
  },
  {
    at: [
      "docs/src/content/docs/en/configuration/provider-deeplink.md"
    ],
    text: "aff%3DCCRCCR"
  },
  {
    at: [
      "packages/core/src/gateway/internal/shared.ts",
      "packages/core/test/unit/gateway/gateway-status.test.mjs"
    ],
    text: "CCR_GATEWAY_RUNTIME_ID"
  },
  {
    at: [
      "packages/core/src/gateway/internal/shared.ts",
      "packages/core/test/integration/gateway/gateway-virtual-models.test.mjs",
      "packages/core/test/unit/gateway/gateway-fetch-preload.test.mjs"
    ],
    text: "CCR_UPSTREAM_PROXY_URL"
  },
  { path: "packages/electron/bundled-plugins/claude-design/index.cjs", text: "/ccr-resource-runtime.js" },
  { path: "packages/electron/bundled-plugins/claude-design/index.cjs", text: "ccr-resource-runtime\\.js" },
  { path: "packages/electron/test/unit/claude-design-plugin-assets.test.ts", text: "/ccr-resource-runtime.js" },
  { path: "tests/architecture/readme-identity.test.mjs", text: "ccrdesk\\.top" },
  {
    at: [
      "README.md",
      "docs/src/content/docs/en/guides/cli.md",
      "packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs",
      "packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs",
      "packages/ui/test/component/layout.test.tsx"
    ],
    text: "musistudio/claude-code-router"
  },
  {
    at: [
      "docs/src/content/docs/en/configuration/provider-deeplink.md",
      "packages/core/src/providers/presets/claudeapi/index.ts",
      "packages/core/src/providers/presets/code0/index.ts",
      "packages/core/src/providers/presets/unity2/index.ts",
      "packages/core/test/unit/providers/provider-preset-utils.test.mjs"
    ],
    text: "claudecoderouter"
  },
  {
    at: [
      "packages/core/src/proxy/certificates.ts",
      "packages/core/test/unit/proxy/proxy-ca-name.test.mjs",
      "scripts/uninstall-macos.mjs"
    ],
    text: "Claude Code Router CA"
  },
  {
    at: [
      "packages/core/src/profiles/launch-service.ts",
      "packages/core/test/unit/profiles/shell-rc-path-block.test.mjs"
    ],
    text: "Claude Code Router CLI"
  },
  { path: "packages/core/test/unit/profiles/shell-rc-path-block.test.mjs", text: "Claude Code Router PATH block" },
  {
    at: [
      "docs/src/content/docs/en/configuration/agents/codex.md",
      "docs/src/content/docs/en/configuration/agents/kilo.md",
      "docs/src/content/docs/en/configuration/agents/opencode.md",
      "docs/src/content/docs/en/configuration/agents/workbuddy.md",
      "docs/src/content/docs/en/configuration/agents/zcode.md",
      "docs/src/content/docs/en/configuration/profiles.md"
    ],
    text: "`claude-code-router` in profiles made before the rename"
  },
  { path: "packages/ui/test/component/profiles.test.tsx", text: "saved claude-code-router profiles" },
  { path: "packages/ui/test/component/profiles.test.tsx", text: "providerId: \"claude-code-router\" }" },
  { path: "packages/ui/test/component/profiles.test.tsx", text: "providerId, \"claude-code-router\")" },
  { path: "tests/architecture/readme-identity.test.mjs", text: "musistudio\\/claude-code-router" },
  { path: "AGENTS.md", text: "Fork of claude-code-router v3.1.3" },
  { path: "README.md", text: "[claude-code-router](" },
  { path: "scripts/uninstall-macos.mjs", text: "Claude Code Router names" },
  { path: "scripts/uninstall-macos.mjs", text: "\"Claude Code Router.app\"" },
  { path: "scripts/uninstall-macos.mjs", text: "\".claude-code-router\"" },
  { path: "scripts/uninstall-macos.mjs", text: "\"Library/Application Support/Claude Code Router\"" },
  { path: "scripts/uninstall-macos.mjs", text: "removes Claude Code Router builds" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "\"CCR_CLI_NODE_PATH='/app/node_modules'\"" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "'if [ -n \"$CCR_NODE_BIN\" ]; then exec \"$CCR_NODE_BIN\" \\'/bin/ccr-cli.js\\' \"$@\"; fi'" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "'/bin/ccr-cli.js' \\\"$@\\\"\"" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "\"const name = process.env.CCR_CLI_COMMAND_NAME;\\nconst prepare = \\\"CCR_CLI_PREPARE_PROFILE_ONLY\\\";\\n\"" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "[\"ccr\", \"ccr.cmd\", \"ccr-app\", \"ccr-app.cmd\", \"ccr-cli.js\"]" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "[\"ccr\", \"ccr.cmd\", \"ccr-app\", \"ccr-app.cmd\"" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "\"ccr-cli.js\"" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_NODE_PATH\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_NODE_BIN\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_COMMAND_NAME\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_PREPARE_PROFILE_ONLY\")" },
  { path: "scripts/uninstall-macos.mjs", text: "schemes: [\"ccr\"]" },
  { path: "scripts/uninstall-macos.mjs", text: "export const agentLeftover = /\\.(?:ccr|llmr)-backup-|\\.(?:ccr|llmr)-original(-missing)?$|^(?:ccr|llmr)-.*model-catalog\\.json$|^(claude-code-router|llm-router)\\.config\\.toml$|^\\.llm-router$/;" },
  { path: "scripts/uninstall-macos.mjs", text: "the ccr:// handler" },
  { path: "packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs", text: "fileName === \"ccr-cli.js\"" },
  { path: "README.md", text: "The `ccr` and `ccr-app` commands are now `llmr`." }
];

function swapCase(match) {
  if (match === match.toUpperCase()) return "LLMR";
  if (match[0] === match[0].toUpperCase()) return "Llmr";
  return "llmr";
}

function longformCase(match, separator) {
  if (separator === " ") return match === match.toLowerCase() ? "llm router" : "LLM Router";
  if (separator === "_") return match === match.toUpperCase() ? "LLM_ROUTER" : "llm_router";
  if (separator === "-") return match === match.toLowerCase() ? "llm-router" : "LLM-Router";
  if (match === match.toLowerCase()) return "llmrouter";
  if (match === match.toUpperCase()) return "LLMROUTER";
  return match[0] === match[0].toUpperCase() ? "LLMRouter" : "llmRouter";
}

function renameMatch(name, match, separator) {
  return name === "longform" ? longformCase(match, separator) : match.replace(/ccr/gi, swapCase);
}

function mask(source, file) {
  const masked = [];
  let out = source;
  for (const entry of kept) {
    if (entry.path && entry.path !== file) continue;
    out = out.split(entry.text).join(`\u0000${masked.push(entry.text) - 1}\u0000`);
  }
  return { out, unmask: (text) => text.replace(/\u0000(\d+)\u0000/g, (_, index) => masked[Number(index)]) };
}

export function renameText(source, classNames, file = "") {
  const { out, unmask } = mask(source, file);
  let renamed = out;
  for (const name of classNames) {
    for (const pattern of classes[name]) {
      renamed = renamed.replace(pattern, (match, separator) => renameMatch(name, match, separator));
    }
  }
  if (classNames.includes("rest")) renamed = renamed.replace(/\b([Aa]) LLMR\b/g, "$1n LLMR");
  return unmask(renamed);
}

export function residue(source, classNames, file = "") {
  const { out } = mask(source, file);
  const patterns = classNames.flatMap((name) => classes[name]);
  const hit = (text) => patterns.some((pattern) => text.search(pattern) !== -1);
  if (!hit(out)) return [];
  return out.split("\n").flatMap((line, index) => (hit(line) ? [`${file}:${index + 1}: ${line.trim().slice(0, 160)}`] : []));
}

function skipped(file) {
  return skippedPaths.some((entry) => file.startsWith(entry));
}

export function candidateFiles(cwd = process.cwd()) {
  let listed = "";
  try {
    listed = execFileSync("git", ["grep", "-lI", "-e", ""], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  return listed.split("\n").filter(Boolean).filter((file) => !skipped(file));
}

function renamePaths(cwd, classNames) {
  const tracked = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" }).split("\n").filter((file) => file && !skipped(file));
  let moved = 0;
  for (const file of tracked) {
    const target = renameText(file, classNames.filter((name) => name === "rest" || name === "longform"), file);
    if (target === file) continue;
    mkdirSync(path.join(cwd, path.dirname(target)), { recursive: true });
    execFileSync("git", ["mv", file, target], { cwd });
    moved += 1;
  }
  return moved;
}

function main(argv) {
  const check = argv.includes("--check");
  const requested = argv.filter((arg) => arg !== "--check");
  const classNames = requested.includes("all") ? Object.keys(classes) : requested;
  if (classNames.length === 0 || classNames.some((name) => !classes[name])) {
    console.error(`usage: node scripts/llmr-rename.mjs [--check] <${Object.keys(classes).join("|")}|all>...`);
    process.exit(2);
  }
  const cwd = process.cwd();
  if (check) {
    const lines = candidateFiles(cwd).flatMap((file) => residue(readFileSync(path.join(cwd, file), "utf8"), classNames, file));
    for (const line of lines) console.log(line);
    console.log(`${lines.length} residual lines for ${classNames.join(", ")}`);
    process.exitCode = lines.length === 0 ? 0 : 1;
    return;
  }
  let changed = 0;
  for (const file of candidateFiles(cwd)) {
    const source = readFileSync(path.join(cwd, file), "utf8");
    const out = renameText(source, classNames, file);
    if (out !== source) {
      writeFileSync(path.join(cwd, file), out);
      changed += 1;
    }
  }
  const moved = renamePaths(cwd, classNames);
  console.log(`changed ${changed} files, moved ${moved} paths for ${classNames.join(", ")}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "llmr-rename.mjs") {
  main(process.argv.slice(2));
}
