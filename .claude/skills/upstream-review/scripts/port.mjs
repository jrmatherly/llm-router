// Rewrites upstream names to this fork's with the repo's rename table.
//   node port.mjs patch   stdin: a git diff            stdout: the diff in the fork's names and paths
//   node port.mjs paths   stdin: NUL-separated paths   stdout: the fork's path for each, NUL-separated
import { pathToFileURL } from "node:url";

const { classes, renameText, skippedPaths } = await import(pathToFileURL(process.env.UPSTREAM_REVIEW_RENAME).href);
const everyClass = Object.keys(classes);
// The rename moved files with these two classes only (renamePaths in llmr-rename.mjs).
const pathClasses = ["rest", "longform"];

const skipped = (file) => skippedPaths.some((entry) => file.startsWith(entry));
const forkPath = (file) => (skipped(file) ? file : renameText(file, pathClasses, file));

function portSection(section) {
  const match = /^diff --git a\/(.+) b\/\1\n/.exec(section);
  if (!match || skipped(match[1])) return section;
  const upstream = match[1];
  const here = forkPath(upstream);
  const cut = section.search(/^@@ /m);
  const header = cut < 0 ? section : section.slice(0, cut);
  const body = cut < 0 ? "" : section.slice(cut);
  // Passing the fork path keeps the survivors the rename table scopes to one file.
  return header.split(`a/${upstream}`).join(`a/${here}`).split(`b/${upstream}`).join(`b/${here}`) + renameText(body, everyClass, here);
}

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

if (process.argv[2] === "paths") {
  process.stdout.write(input.split("\0").filter(Boolean).map((file) => `${forkPath(file)}\0`).join(""));
} else if (process.argv[2] === "patch") {
  process.stdout.write(input.split(/^(?=diff --git )/m).map(portSection).join(""));
} else {
  console.error("usage: node port.mjs <patch|paths>");
  process.exit(2);
}
