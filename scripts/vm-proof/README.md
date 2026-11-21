# Clean-VM check scripts

These scripts check an LLM Router build on a clean macOS install. Run them inside a disposable UTM virtual machine, never on your own Mac. `install-check.sh` refuses to run unless the hostname contains `Virtual-Machine`.

Each script writes a log to `logs/` beside itself. Git ignores that folder.

## Run a check

1. Build a local dmg on the host. The dmg lands in `release-local/`.

   ```bash
   npm run build:app:mac
   ```

2. Copy the dmg and the scripts into the folder the VM shares with the host.

   ```bash
   cp release-local/*.dmg scripts/vm-proof/*.sh <shared folder>/
   ```

3. Start the VM in UTM in disposable mode, so nothing the check does survives a shutdown.

4. In the guest, from the shared folder, install and launch the build.

   ```bash
   ./install-check.sh <dmg name>
   ```

## Scripts

| Script | What it does |
|---|---|
| `install-check.sh [dmg name]` | Installs the dmg into `/Applications`, checks its signature and Gatekeeper verdict, launches the app and records the state after first launch. `QUARANTINE=1` marks the app as a browser download first, to test the first-launch prompt. |
| `collect.sh [label]` | Read-only. Records the app, the `llmr` command, listeners, the data directory and the agent files LLMR may have written, with key and token values masked. Run it after each step in the app. |
| `gateway-check.sh [base url]` | Sends real requests through the gateway. It asks for an LLMR client key at a hidden prompt and deletes its log if the key appears in it. The default base URL is `http://127.0.0.1:3456`. |
| `app-console.sh [seconds]` | Quits the app, starts it again from the shell so the main-process console output is captured, waits (40 seconds by default), then runs `collect.sh console`. |

## What a local build cannot check

A local build is signed ad hoc. `spctl` rejects it, and the app's updater does not run. The Gatekeeper and notarization checks in `install-check.sh` and any update check apply only to a release build.

`install-check.sh` also compares the dmg's checksum with a `latest-mac.yml` beside the script. That file comes from a GitHub release. Without it the comparison prints an error and the script carries on.

Keep provider keys in the VM. Do not put one in this folder, in a log or in the shared folder.
