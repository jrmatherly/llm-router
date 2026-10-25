import { spawnSync } from "node:child_process";
import path from "node:path";

export function parseElectronAbi(stdout) {
  const lastLine = String(stdout ?? "").trim().split("\n").at(-1) ?? "";
  return /^\d+$/.test(lastLine) ? lastLine : undefined;
}

export function readElectronAbi(root) {
  const electronBin = path.join(root, "node_modules", ".bin", "electron");
  const result = spawnSync(electronBin, ["-p", "process.versions.modules"], {
    encoding: "utf8",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  const abi = parseElectronAbi(result.stdout);
  if (!abi) {
    throw new Error(`could not read the Electron ABI from ${electronBin}: ${result.stderr || result.error?.message || "no ABI line in output"}`);
  }
  return abi;
}
