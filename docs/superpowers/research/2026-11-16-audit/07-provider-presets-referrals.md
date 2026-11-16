# Research: provider presets and referral codes

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal (restated).** The owner has decided to strip referral codes from provider preset links. Before the plan is written, they want to know exactly what dropping the upstream sponsor presets would do on top of that.

## 1. Answer

**What a preset is.** A preset is a `ProviderPreset` object (`types.ts:16-25`) with an id, a name, aliases, endpoints, an optional `account` and `defaultModels`, and a `websiteUrl`. Endpoints can carry their own `websiteUrl`. Each preset is a static entry in the `providerPresets` array (`presets/index.ts:49-82`). The UI lists them in that same array order in the add-provider combobox (`providers.tsx:2019-2022`), with "Other / custom" first.

The only thing `websiteUrl` does is feed the external-link button: "Open provider website" in the combobox and in the import preview (`providers.tsx:1269, 1309, 1323-1328`, opened via `openExternalUrl`). A deeplink's `source=` parameter overrides it (`providers.tsx:1269`). No preset has a sponsor, recommended or featured flag. The sponsors sit at array positions 24-32, after the mainstream vendors (measured).

**Sponsor entries (measured).** The upstream test is literally named `"sponsor provider presets ..."` (`provider-preset-utils.test.mjs:104`).
- Paid reseller placements: code0, claudeapi, fenno, infistar-ai, runapi, unity2.
- qiniu-ai is also in that sponsor test. It is a real cloud vendor, and its short link hides a CPS referral.
- kimi-coding and moonshot are first-party vendors, but their links carry `aff=ccr` (partner codes, per `docs/superpowers/specs/completed/2026-10-27-ccr-to-llmr-rename.md:111`).
- teamorouter and y-api carry no referral.
- There are no `sponsors/` images and no README sponsor section (`git grep -i sponsor` measured).

**What dropping a preset does to an existing user.** The stored `GatewayProviderConfig` (`contracts/app.ts:161-188`) has no preset id. It keeps baseUrl, apiKey, models and capabilities on its own, and presets are matched by base URL at runtime. So routing, keys and models keep working (inferred from the code paths; not run). Here is what changes after an upgrade:
- **Icon.** The brand icon becomes the generic fallback. The preset flow saves `icon: ""` (`providers.tsx:2194`), and display falls back to `providerPresetIconUrls[preset.id]` (`shared/providers.ts:531-541`, `tray/shared.tsx:169-173`). Inferred.
- **Edit dialog.** It shows "Other / custom" instead of the preset name (`shared/providers.ts:774`), and the website button disappears. Inferred.
- **Usage meters.** No change. All sponsor presets use `defaultProviderAccountConfig` (enabled false). Measured.
- **Model catalog.** Only qiniu has entries in `models.json` (199 `"qiniu-ai"` hits, from models.dev and not tied to the preset). The catalog lookup uses the preset id as a token (`model-catalog.ts:538-549`), so dropping qiniu would weaken its model list. The other six have no catalog data. Measured.

**What a new user loses.** The entry disappears from the add-provider list, along with its aliases in search, its icon, its default models (infistar's `gpt-4o`) and its one-click button on the docs page. They can still add it as a custom endpoint.

**Live state of the six resellers (measured via curl, no sign-up).**
- unity2.ai fails the TLS handshake. It is dead from here, for both the site and the API base.
- console.claudeapi.com and claudeapi.com redirect to apito.ai, so the brand has changed. `gw.claudeapi.com` returns 404.
- fenno, infistar and runapi API bases return 401, so they are alive.

**Recommendation.** Strip every referral in one PR. Then drop the six upstream reseller presets (code0, claudeapi, fenno, infistar-ai, runapi, unity2) in a second PR, or in the same one if the owner prefers.
- They exist only because upstream was paid. Without the code they are unvetted third-party key resellers that the fork appears to endorse.
- One is already dead and one has rebranded.
- Existing users lose only the icon and the link.

Keep qiniu-ai, kimi-coding and moonshot with clean URLs, because they are real vendors and qiniu has catalog data. Keep teamorouter and y-api.

## 2. Evidence

**Referral URLs and the cleaned URL for each.** All cleaned URLs return HTTP 200 unless noted.

| Location | Current | Cleaned |
|---|---|---|
| `presets/code0/index.ts:14` | `code0.ai/agent/register/9n9j…?utm_*` | `https://code0.ai/` |
| `presets/claudeapi/index.ts:14` | `console.claudeapi.com/agent/register/LbmB…?utm_*` | `https://claudeapi.com/` (redirects to apito.ai) |
| `presets/fenno/index.ts:14` | `api.fenno.ai/register?…&aff=9HHHAB5QLAES` | `https://fenno.ai/` |
| `presets/infistar-ai/index.ts:15` | `www.infistar.cc/register?aff=CCRCCR&ref_source=link` | `https://infistar.ai/` |
| `presets/runapi/index.ts:14` | `runapi.co/register?aff=IX1t` | `https://runapi.co/` |
| `presets/unity2/index.ts:14` | `unity2.ai/register?source=claudecoderouter` | `https://unity2.ai/` (TLS fails, unverified) |
| `presets/kimi-coding/index.ts:30,35,40` | `www.kimi.com/code?aff=ccr` | `https://www.kimi.com/code` |
| `presets/moonshot/index.ts:84,89` | `platform.kimi.com/?aff=ccr` | `https://platform.kimi.com/` |
| `presets/moonshot/index.ts:100,105` | `platform.kimi.ai/?aff=ccr` | `https://platform.kimi.ai/` |
| `presets/qiniu-ai/index.ts:11,17,23,29,34` | `s.qiniu.com/AVjMVf`, which 302s to `qiniu.com/ai/agent?cps_key=…&utm_source=aiclient2api…` | `https://www.qiniu.com/ai/agent` |
| `docs/.../provider-deeplink.md:85,89,93,97,101,105` | the same URLs URL-encoded in `source=` | the same cleaned URLs, encoded |

- README, UI source and other docs pages carry no referral. Checked with `git grep -nIE "aff=|utm_|/agent/register|ref_source|source=claudecoderouter|s\.qiniu\.com"` and an encoded-form grep.
- The qiniu target came from `curl -s -o /dev/null -w "%{redirect_url}" https://s.qiniu.com/AVjMVf`.

**Hidden coupling (measured).** `scripts/llmr-rename.mjs:38-58, 85-92` lists `aff=ccr`, `aff=CCRCCR`, `aff%3DCCRCCR` and `claudecoderouter` as `kept` text. The test `tests/architecture/llmr-rename.test.mjs:73-81` fails if a kept text leaves a file named in its `at` list. So stripping the codes breaks `npm run test:architecture`, and with it the commit gate, unless those entries go too.

I ran the helper in scratch with those entries removed. Three fixtures then fail:
- Line 41: `aff=ccr` becomes `aff=llmr`.
- Line 56: `claudecoderouter` becomes `llmrouter`.
- Line 70: residue now reports `aff=ccr`.

## 3. Plan inputs

**PR A: strip (S, docs plus code, one PR).**
- Edit the `websiteUrl` values in the 9 preset files above, and the `source=` values on `provider-deeplink.md` lines 85-105.
- Change `provider-preset-utils.test.mjs:105,112,127,136` to the cleaned URLs, and rename that test to drop "sponsor".
- Remove the four `kept` entries in `scripts/llmr-rename.mjs`.
- In `tests/architecture/llmr-rename.test.mjs`:
  - Delete the line 41 assert.
  - Drop `utm_source=claudecoderouter` from the line 56 fixture.
  - Change the line 70 fixture from `aff=ccr` to `CCR_GATEWAY_RUNTIME_ID`. It is an `at` entry, so it is masked in every file.
- New test in `provider-preset-utils.test.mjs`: `"no provider preset link carries a referral, tracking or short-link"`.
  - Collect `preset.websiteUrl` and every `endpoints[].websiteUrl` across `providerPresets`.
  - For each, assert that `new URL(u).search === ""`.
  - Assert that the pathname does not match `/register|\/agent\//`.
  - Assert that the hostname is not in `["s.qiniu.com"]`.
- New repo-wide guard `tests/architecture/no-referral-links.test.mjs`:
  - Over `git ls-files`, excluding `docs/superpowers/` and `package-lock.json`, assert that no line matches `/[?&](aff|ref_source|cps_key|utm_[a-z]+)(=|%3D)/i` and no line matches `s\.qiniu\.com`.
  - This covers the deeplink docs and README.
- Commands:
  - `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-preset-utils.test.js`
  - `node build/test.mjs architecture && node --test .test-dist/architecture/test/no-referral-links.test.js`
  - `npm run test:architecture`
- All of PR A must land together because of the commit gate.

**PR B: drop the six presets (M).**
- Delete `presets/{code0,claudeapi,fenno,infistar-ai,runapi,unity2}/`.
- Remove their imports and array entries in `presets/index.ts`.
- Remove icon imports and map keys in `packages/ui/src/pages/home/shared/options.ts:48-64, 361-381`, and the files in `packages/ui/src/assets/provider-icons/` and `docs/public/provider-icons/`.
- Remove the button blocks on `provider-deeplink.md` lines 77-80 and 84-107 (runapi, unity2, code0, claudeapi, fenno, infistar).
- Remove the matching CSS in `docs/src/styles/global.css:1494-1523, 1590+`.
- Remove the fenno, unity2 and infistar asserts and imports in `provider-preset-utils.test.mjs:25-52, 104-143`.
- Remove the preset paths in `scripts/llmr-rename.mjs:48, 88-90`. PR A already removes those entries if it lands first.
- Add a test `"dropped reseller presets stay out of the registry"`. It asserts that `findProviderPreset(id)` is undefined for the six ids. It also asserts that `findProviderPresetByBaseUrl("https://runapi.co/v1")` is undefined, so a saved provider resolves to custom.
- Ordering: land A first, or fold B into A. The B-only edits do not touch the gate.
- Leave `docs/superpowers/english-only-parity-docs.md:97` as history.

## 4. Risks and unknowns
- The icon and edit-dialog behavior for existing users is inferred from the code, not seen in the app. To settle it: in a running app, add a runapi provider, swap in a build without the preset, and open Providers.
- The docs `llmr-provider-buttons.js` was not read in full. The grep found no referral in it.
- The unity2 TLS failure may be specific to this network. Check from another network before calling the host dead.
- `api.teamorouter.com` 301s to teamorouter.cn. That is not a referral, but the preset may be stale.
- The new repo-wide guard could hit legitimate `utm_` text in fixtures such as `fixtures-agent-analysis.json`. The scan found none today. Run the regex once before committing.

What I did not check: the full UI flow end to end. Scratch experiment: `<session scratchpad>/referral-presets/exp.mjs`.
