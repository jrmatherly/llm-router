import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";

// Claude Code Router names cover this fork's pre-5.0 builds, and also upstream's app, which 5.0 can sit beside; hence opt-in.
const current = { appBundles: ["LLM Router.app"], dataDirs: [".llm-router", "Library/Application Support/LLM Router"], schemes: ["llmr"] };
const legacy = { appBundles: ["Claude Code Router.app"], dataDirs: [".claude-code-router", "Library/Application Support/Claude Code Router"], schemes: ["ccr"] };
const agentDirs = [".claude", ".codex"];
export const agentLeftover = /\.ccr-backup-|\.ccr-original(-missing)?$|^ccr-.*model-catalog\.json$|^claude-code-router\.config\.toml$/;
const managedConfigs = [".claude/settings.json", ".codex/config.toml"];
const gatewayMarker = /127\.0\.0\.1:3456|\.llm-router\/bin\//;
export const schemes = [...legacy.schemes, ...current.schemes];
const caName = "Claude Code Router CA";
const launchServicesPlist = "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist";
const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

export function parseUninstallArgs(argv) {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      help: { default: false, type: "boolean" },
      "include-legacy": { default: false, type: "boolean" },
      "keep-data": { default: false, type: "boolean" },
      yes: { default: false, type: "boolean" }
    },
    strict: true
  });
  return { help: values.help, includeLegacy: values["include-legacy"], keepData: values["keep-data"], yes: values.yes };
}

function run(command, args) {
  // The LaunchServices dump runs to tens of megabytes, far past the 1 MiB default.
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function succeeds(command, args) {
  try {
    run(command, args);
    return true;
  } catch {
    return false;
  }
}

export const macSystem = {
  appRunning: () => succeeds("pgrep", ["-f", "Router\\.app/Contents/MacOS/"]),
  caInstalled: () => succeeds("security", ["find-certificate", "-c", caName, "/Library/Keychains/System.keychain"]),
  handlerIndexes(plist, wanted) {
    if (!existsSync(plist)) return [];
    const handlers = JSON.parse(run("plutil", ["-convert", "json", "-o", "-", plist])).LSHandlers ?? [];
    return handlers.flatMap((handler, index) => wanted.includes(handler.LSHandlerURLScheme) ? [index] : []);
  },
  localProxyActive: () => proxyPointsAtLoopback(run("scutil", ["--proxy"])),
  registeredBundles: (wanted) => bundlesClaimingSchemes(run(lsregister, ["-dump"]), wanted),
  removeHandler: (plist, index) => run("plutil", ["-remove", `LSHandlers.${index}`, plist]),
  tar: (archive, cwd, entries, excludes) => run("tar", ["czf", archive, "-C", cwd, ...excludes.flatMap((entry) => ["--exclude", entry]), ...entries]),
  unregister: (bundle) => succeeds(lsregister, ["-u", bundle])
};

export function proxyPointsAtLoopback(scutilProxy) {
  return ["HTTP", "HTTPS"].some((kind) =>
    new RegExp(`^\\s*${kind}Enable : 1$`, "m").test(scutilProxy) && new RegExp(`^\\s*${kind}Proxy : 127\\.0\\.0\\.1$`, "m").test(scutilProxy));
}

export function bundlesClaimingSchemes(dump, wanted = schemes) {
  return dump.split(/^-{20,}$/m).flatMap((block) => {
    const bundle = /^path:\s+(.+?) \(0x[0-9a-f]+\)$/m.exec(block)?.[1];
    const claimed = /^claimed schemes:\s+(.*)$/m.exec(block)?.[1] ?? "";
    return bundle && wanted.some((scheme) => claimed.split(/,\s*/).includes(`${scheme}:`)) ? [bundle] : [];
  });
}

export function planUninstall({ applications = "/Applications", home, includeLegacy = false, keepData = false, now = new Date(), system }) {
  const scope = includeLegacy ? [current, legacy] : [current];
  const wanted = scope.flatMap((names) => names.schemes);
  const blockers = [];
  if (system.appRunning()) blockers.push("LLM Router is running. Quit it from its menu (not force quit) so it hands your agent configs back, then rerun.");
  for (const config of managedConfigs) {
    const file = path.join(home, config);
    if (existsSync(file) && gatewayMarker.test(readFileSync(file, "utf8"))) {
      blockers.push(`~/${config} still points at LLM Router. Open the app, turn off its global profiles, quit it, then rerun.`);
    }
  }

  const notes = [];
  if (system.caInstalled()) notes.push(`The proxy CA is still trusted. Remove it with: sudo security delete-certificate -c '${caName}' /Library/Keychains/System.keychain`);
  if (system.localProxyActive()) notes.push("A system proxy still points at 127.0.0.1. Turn it off in System Settings > Network > Details > Proxies.");

  const leftovers = agentDirs.flatMap((dir) => {
    const full = path.join(home, dir);
    return existsSync(full) ? readdirSync(full).filter((name) => agentLeftover.test(name)).map((name) => path.join(dir, name)) : [];
  });
  const data = keepData ? [] : scope.flatMap((names) => names.dataDirs).filter((dir) => existsSync(path.join(home, dir)));
  const apps = scope.flatMap((names) => names.appBundles).map((bundle) => path.join(applications, bundle)).filter(existsSync);
  const plist = path.join(home, launchServicesPlist);
  const handlerIndexes = system.handlerIndexes(plist, wanted);
  // Registrations for unmounted DMGs or deleted copies cannot open links, and lsregister -u rejects them.
  const bundles = [...new Set([...apps, ...system.registeredBundles(wanted).filter(existsSync)])];
  const backupDir = path.join(home, `llmr-uninstall-backup-${now.toISOString().replace(/[:.]/g, "-")}`);

  // Backups carry config.sqlite and its provider API keys, so only the owner may read them.
  const backUp = (file, write) => {
    mkdirSync(backupDir, { mode: 0o700, recursive: true });
    write(path.join(backupDir, file));
    chmodSync(path.join(backupDir, file), 0o600);
  };
  const homeItems = [...leftovers, ...data];
  const steps = [];
  if (homeItems.length) {
    steps.push({
      describe: `Back up ${homeItems.length} item(s) to ${backupDir}/data.tgz (skipping ~/.llm-router/bin and the model catalog cache)`,
      run: () => backUp("data.tgz", (archive) => system.tar(archive, home, homeItems, [".llm-router/bin", ".llm-router/models.json"]))
    });
  }
  if (handlerIndexes.length) {
    steps.push({
      describe: `Remove the ${wanted.join("/")} link handler preferences (${handlerIndexes.length}), keeping a copy at ${backupDir}/launchservices.plist`,
      run: () => {
        backUp("launchservices.plist", (copy) => copyFileSync(plist, copy));
        // Re-read after the copy: LaunchServices can rewrite this file at any time, so stale indexes would hit another app's entry.
        for (const index of system.handlerIndexes(plist, wanted).reverse()) system.removeHandler(plist, index);
        if (system.handlerIndexes(plist, wanted).length) notes.push("LaunchServices wrote the link handlers back. Log out and back in, then rerun this script.");
      }
    });
  }
  for (const bundle of bundles) steps.push({ describe: `Unregister ${bundle} from LaunchServices`, run: () => system.unregister(bundle) });
  for (const target of [...apps, ...homeItems.map((item) => path.join(home, item))]) {
    steps.push({ describe: `Delete ${target.replace(home, "~")}`, run: () => rmSync(target, { force: true, recursive: true }) });
  }
  if (handlerIndexes.length || bundles.length) notes.push(`LaunchServices caches link handlers. If an old app still opens ${wanted.map((scheme) => `${scheme}://`).join(" or ")} links, log out and back in.`);
  if (keepData) notes.push("Kept ~/.llm-router (--keep-data).");

  return { blockers, notes, steps };
}

function main(argv) {
  const args = parseUninstallArgs(argv);
  if (args.help) {
    console.log("usage: npm run uninstall:mac -- [--yes] [--keep-data] [--include-legacy]\nRemoves LLM Router from this Mac. --include-legacy also removes Claude Code Router builds, their data and the ccr:// handler. Prints the plan only unless --yes is passed.");
    return 0;
  }
  if (process.platform !== "darwin") throw new Error("This script only supports macOS.");
  const plan = planUninstall({ home: os.homedir(), includeLegacy: args.includeLegacy, keepData: args.keepData, system: macSystem });
  for (const blocker of plan.blockers) console.error(`blocked: ${blocker}`);
  if (plan.blockers.length) return 1;
  if (!plan.steps.length) console.log("Nothing of LLM Router is left to remove.");
  for (const step of plan.steps) {
    console.log(`${args.yes ? "-" : "would"} ${step.describe}`);
    if (args.yes) step.run();
  }
  for (const note of plan.notes) console.log(`note: ${note}`);
  if (!args.yes && plan.steps.length) console.log("Dry run. Rerun with --yes to do this.");
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === "uninstall-macos.mjs") {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
