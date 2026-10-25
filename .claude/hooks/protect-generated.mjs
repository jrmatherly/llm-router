import { readFileSync } from "node:fs";

const GENERATED = [
  { command: "npm run models:build", path: "/packages/core/models.json" },
  { command: "node scripts/generate-claude-code-config-options.mjs", path: "/packages/ui/src/generated/" },
  { command: "edit package.json and run npm install", path: "/package-lock.json" }
];

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const toolInput = input?.tool_input ?? {};
const rawPath = toolInput.file_path ?? toolInput.relative_path;

if (input?.tool_name === "mcp__serena__replace_in_files") {
  const scope = normalize(rawPath ?? "").replace(/\/\.?$/, "") + "/";
  const covered = GENERATED.find((entry) => entry.path.startsWith(scope));
  if (covered) {
    block(`replace_in_files over ${rawPath || "the whole project"} would touch the generated file ${covered.path}: set relative_path to a specific file or a directory without generated files`);
  }
}

if (rawPath === undefined || rawPath === "") {
  process.exit(0);
}

const filePath = normalize(rawPath);
const generated = GENERATED.find((entry) => entry.path.endsWith("/") ? filePath.includes(entry.path) : filePath.endsWith(entry.path));
if (generated) {
  block(`${rawPath} is generated; regenerate it with: ${generated.command}`);
}

const segments = filePath.split("/");
if (!segments.includes("node_modules") && segments.some((segment) => segment === "dist" || segment === ".test-dist")) {
  block(`${rawPath} is build output; change the source and rebuild instead`);
}

process.exit(0);

function normalize(value) {
  const forward = String(value).replace(/\\/g, "/").replace(/^\.\//, "");
  return forward.startsWith("/") ? forward : `/${forward}`;
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
