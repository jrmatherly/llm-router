import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const word = /(?<![A-Za-z0-9_-])CCR(?![A-Za-z0-9_-])/g;
const replacement = "LLMR";

const scriptKinds = {
  js: ts.ScriptKind.JS,
  json: ts.ScriptKind.JSON,
  ts: ts.ScriptKind.TSX
};

const literalKinds = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText
]);

const wholeLiteralKinds = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral]);
const nestedWholeLiteral = /(["'])CCR\1/g;

function rebrandSpan(text) {
  const kept = [];
  const masked = text.replace(nestedWholeLiteral, (match) => `\u0000${kept.push(match) - 1}\u0000`);
  return masked.replace(word, replacement).replace(/\u0000(\d+)\u0000/g, (_, index) => kept[Number(index)]);
}

function rebrandCode(source, kind) {
  const file = ts.createSourceFile("rebrand.tsx", source, ts.ScriptTarget.Latest, true, scriptKinds[kind]);
  const spans = [];
  const visit = (node) => {
    if (literalKinds.has(node.kind) && !(wholeLiteralKinds.has(node.kind) && (node.text === "CCR" || node.text.startsWith("# ")))) {
      spans.push([node.getStart(file), node.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const [start, end] of spans.reverse()) {
    out = out.slice(0, start) + rebrandSpan(out.slice(start, end)) + out.slice(end);
  }
  return out;
}

function rebrandMarkdown(source) {
  const lines = source.split("\n");
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return line.split(/(`[^`]*`)/).map((part) => (part.startsWith("`") ? part : part.replace(word, replacement))).join("");
  }).join("\n");
}

export function rebrandText(source, kind) {
  return kind === "md" ? rebrandMarkdown(source) : rebrandCode(source, kind);
}

const kindByExtension = { ".cjs": "js", ".js": "js", ".json": "json", ".md": "md", ".mjs": "js", ".ts": "ts", ".tsx": "ts" };
const skippedDirs = new Set(["node_modules", ".test-dist", "dist"]);
const skippedFiles = new Set(["package-lock.json", "packages/core/models.json"]);
const skippedPrefixes = ["packages/ui/src/generated"];

function skipped(relative) {
  const base = path.basename(relative);
  return skippedDirs.has(base) || base.startsWith("release") || skippedFiles.has(relative) || skippedPrefixes.some((prefix) => relative.startsWith(prefix));
}

function walk(target, files) {
  const relative = path.relative(process.cwd(), target) || ".";
  if (skipped(relative)) return;
  if (statSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) walk(path.join(target, entry), files);
    return;
  }
  if (kindByExtension[path.extname(target)]) files.push(target);
}

function main(targets) {
  const files = [];
  for (const target of targets) walk(path.resolve(target), files);
  let changed = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const out = rebrandText(source, kindByExtension[path.extname(file)]);
    if (out !== source) {
      writeFileSync(file, out);
      changed += 1;
    }
  }
  console.log(`changed ${changed} files`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "rebrand-ccr.mjs") {
  main(process.argv.slice(2));
}
