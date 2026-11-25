import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

// Temporary probe, removed before the PR is ready: does Node tell the writer when a child closed its stdin?
const child = `
const fs = require("node:fs");
const chunk = Buffer.alloc(65536);
fs.readSync(0, chunk);
fs.closeSync(0);
process.stdout.write("closed\\n");
setInterval(() => {}, 1000);
`;

test("probe: a write to a child that closed its stdin", async (t) => {
  const proc = spawn(process.execPath, ["-e", child], { stdio: ["pipe", "pipe", "ignore"] });
  const seen = [];
  proc.stdin.on("error", (error) => seen.push(`error event ${error.code}`));
  proc.stdin.on("close", () => seen.push("close event"));
  proc.stdin.write("first\n");
  await once(proc.stdout, "data");
  for (let index = 0; index < 4; index += 1) {
    proc.stdin.write(`later ${index}\n`, (error) => seen.push(`write ${index} callback ${error?.code ?? "ok"}`));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  proc.kill();
  t.diagnostic(`stdin-close probe on ${process.platform}: ${seen.join("; ") || "nothing"}`);
});
