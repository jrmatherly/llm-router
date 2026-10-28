import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Run order matters only for review: each class is one phase of the rename and ends green on its own.
export const classes = {
  alias: [/@ccr(?=\\?\/)/g],
  wire: [
    /x-ccr-/g,
    /\/api\/ccr(?![A-Za-z0-9_-])/g,
    /\/__ccr(?![A-Za-z0-9_])/g,
    /window\.ccr/g,
    /exposeInMainWorld\("ccr/g,
    /Window\["ccr"\]/g,
    /\bccr(?:Browser)?\?: \{/g,
    /\{ ccr: Record<string, unknown> \}\)\.ccr/g,
    /(?<=["'`])ccr(?=:)/g
  ],
  env: [/CCR_/g],
  rest: [/ccr/gi]
};

const skippedPaths = [
  "docs/superpowers/",
  "docs/package-lock.json",
  "package-lock.json",
  "packages/core/models.json",
  "packages/ui/src/generated/",
  "scripts/llmr-rename.mjs",
  "tests/architecture/llmr-rename.test.mjs"
];

// Every entry is a deliberate survivor; docs/superpowers/specs/2026-10-27-ccr-to-llmr-rename.md gives the reasons.
export const kept = [
  { text: "ccrdesk.top" },
  { text: "aff=ccr" },
  { text: "aff=CCRCCR" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "[\"ccr\", \"ccr.cmd\", \"ccr-app\", \"ccr-app.cmd\"" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "\"ccr-cli.js\"" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_NODE_PATH\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_NODE_BIN\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_COMMAND_NAME\")" },
  { path: "packages/core/src/profiles/launch-service.ts", text: "includes(\"CCR_CLI_PREPARE_PROFILE_ONLY\")" },
  { path: "scripts/uninstall-macos.mjs", text: "schemes: [\"ccr\"]" },
  { path: "README.md", text: "The `ccr` and `ccr-app` commands are now `llmr`." }
];

function swapCase(match) {
  if (match === match.toUpperCase()) return "LLMR";
  if (match[0] === match[0].toUpperCase()) return "Llmr";
  return "llmr";
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
      renamed = renamed.replace(pattern, (match) => match.replace(/ccr/gi, swapCase));
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
    listed = execFileSync("git", ["grep", "-lIi", "ccr"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  return listed.split("\n").filter(Boolean).filter((file) => !skipped(file));
}

function renamePaths(cwd) {
  const tracked = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" }).split("\n").filter((file) => /ccr/i.test(file) && !skipped(file));
  for (const file of tracked) {
    const target = file.replace(/ccr/gi, swapCase);
    mkdirSync(path.join(cwd, path.dirname(target)), { recursive: true });
    execFileSync("git", ["mv", file, target], { cwd });
  }
  return tracked.length;
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
  const moved = classNames.includes("rest") ? renamePaths(cwd) : 0;
  console.log(`changed ${changed} files, moved ${moved} paths for ${classNames.join(", ")}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "llmr-rename.mjs") {
  main(process.argv.slice(2));
}
