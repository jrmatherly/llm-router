---
title: Provider config
pageTitle: Provider config
eyebrow: Detailed configuration
lead: "Add and manage upstream model providers in LLMR: import local agent sign-ins, configure the protocol, API endpoint, model list, and credential pool, and set up account usage fetching. Use this page when adding or adjusting a provider."
---

## Import local agent login

When you add a provider, LLMR scans for reusable local agent login state. If usable credentials are found, the add dialog shows the matching import entry. Importing creates a normal provider plus provider plugins, so LLMR can reuse the local agent authorization without requiring a pasted API key.

### Claude Code

The Claude Code entry is always available. It adds a `Claude Code API` provider that forwards the claude.ai login Claude Code sends with each request. LLMR does not read, refresh or store that login, and adding the provider needs no login on the machine at that moment.

After import:

1. The protocol is `anthropic_messages` and the API endpoint is `https://api.anthropic.com`.
2. The default model list includes `claude-sonnet-5`; you can later add or remove models in the provider model list.
3. LLMR creates two provider plugins that tie the provider to its forwarding step. They hold no token.

Only a Claude Code profile in Claude login mode can use the provider, because only such a profile sends a login for LLMR to forward. Turn on **Sign in with my Claude login** in the profile. A request that reaches the provider without a login fails with a message that says so. The provider has no account usage meters. Claude Code's own `/usage` still works.

The provider is a gateway you run on your own machine for your own, unmodified Claude Code, and it stores nothing. Anthropic's terms allow an end user to sign in to the unmodified Claude Code binary with their own Claude subscription, and that is the only use this provider supports.

### Codex

Codex import reads the local Codex auth file and model cache. When a Codex access token or refresh token is available, LLMR can import it as a `Codex API` provider.

After import:

1. The protocol is `openai_responses`.
2. The API endpoint points to the Codex backend. The model list always includes at least `gpt-5-codex` and also merges models and display names from the local model cache.
3. LLMR creates Codex OAuth provider plugins. They hold no token. LLMR reads the login from `auth.json` in the Codex directory (`CODEX_HOME`, or `~/.codex`) on every use.
4. LLMR refreshes a ChatGPT login when it has expired or is within a minute of expiring, and saves the new login back to that file so the Codex CLI stays signed in. It never creates the file. It uses only a login stored in `auth.json`: if `cli_auth_credentials_store` in Codex's `config.toml` is set to anything other than `file`, LLMR does not refresh the login, and a login kept only in the system keyring is not visible to LLMR. It also does not refresh a login whose `auth.json` is a symbolic link, or whose file or folder it cannot write. In those cases a request fails once the login expires, with the advice to run `codex login`.
5. Account usage reads Codex quota, balance, and token-stat endpoints.

After import, select `Codex API/model-name` in routing or Agent Profiles. If the model cache is stale, open Codex first so it refreshes the model list, then return to LLMR to import again or edit the models.

### ZCode

ZCode import reads provider API keys, API endpoints, and model lists from local ZCode config. It can be imported as a `ZCode API` provider only when LLMR finds a usable provider key and Base URL.

After import:

1. The protocol is `anthropic_messages`.
2. Models come from local ZCode config first; if none are configured, LLMR uses the ZCode runtime cache or default models.
3. LLMR creates API-key provider plugins that use the key from local ZCode config for request authentication.
4. If the API endpoint matches a built-in LLMR preset, account usage settings are reused from that preset.

If LLMR detects ZCode login state but no usable provider API key, the import entry remains unavailable. Configure a usable model provider in ZCode first, then return to LLMR and add the provider.

### Kimi CLI

Kimi CLI import reads a managed OAuth login or API key from local Kimi config (default `~/.kimi-code/config.toml`). When a usable credential is available, LLMR can import it as a `Kimi CLI API` provider.

After import:

1. The protocol is `openai_chat_completions`.
2. Models come from the Kimi config first; if none are configured, LLMR falls back to the default model `kimi-for-coding`.
3. LLMR creates an OAuth or API-key provider plugin based on the credential type, reusing the Kimi login to access the upstream service.

If LLMR detects login traces but no usable OAuth token, the import entry shows why. Run `/login` in Kimi CLI, then return to LLMR and rescan.

### OpenCode

OpenCode import reads the local authentication file together with OpenCode's config and cached model catalog. LLMR treats the catalog provider IDs `opencode` and `opencode-go` as separate services, so overlapping model names do not cause a Go subscription to be imported as Zen.

Credentials resolve in this order per provider ID: OpenCode config (`provider.opencode` or `provider.opencode-go` `options.apiKey`, with `{env:VAR}` and `{file:path}` references), `OPENCODE_AUTH_CONTENT`, OpenCode's `auth.json`, then environment variables. `OPENCODE_API_KEY` follows OpenCode's catalog behavior and applies to both Zen and Go; LLMR also accepts `OPENCODE_GO_API_KEY` as a Go-specific override.

After import:

1. Zen keeps its configured or cached endpoint, defaulting to `https://opencode.ai/zen/v1`. Public zero-cost Zen models can still be imported without a login.
2. OpenCode Go uses its own catalog entry and endpoint, defaulting to `https://opencode.ai/zen/go/v1`, and uses the `opencode-go` credential resolved as described above.
3. Model IDs and display names come from the matching OpenCode provider catalog. Each model is grouped under the protocol declared by its AI SDK package, including mixed OpenAI Responses, Chat Completions, Anthropic, and Gemini catalogs.
4. For requests sent to the official OpenCode Go endpoint, LLMR forwards `x-claude-code-session-id` (or the legacy `x-claude-session-id`) as `x-opencode-session`. If the client supplies neither header, LLMR uses the request's `metadata.user_id` when present and otherwise a stable `llmr-<uuid>` generated once per process, which is a last-resort value for clients that send no session identity; explicit `x-opencode-session` configuration takes precedence. This header is not added to Zen or unrelated providers.
5. LLMR preserves the coding agent's `User-Agent` and accepts both OpenAI-compatible `prompt_tokens_details.cached_tokens` and DeepSeek-native `prompt_cache_hit_tokens` on Go Chat responses. If the upstream omits both fields, cache-read usage is unavailable and LLMR does not estimate it from the prompt size.
6. OpenCode Go account usage reads `GET https://opencode.ai/zen/go/v1/usage` with the imported `opencode-go` key and shows the 5-hour, weekly, and monthly windows as remaining percent. Zen has no equivalent account usage endpoint, so only Go is fetched automatically.

If OpenCode Go is unavailable or does not appear as an import option, connect `OpenCode Go` in OpenCode first and let OpenCode refresh its local model cache, then return to LLMR and rescan.

## Main fields

| Field | Capability |
| --- | --- |
| Select preset provider | Applies a built-in provider template, including default endpoint, supported protocols, default models, icon, provider website, and sometimes account usage settings. Choose `Other / custom API endpoint` for any OpenAI, Anthropic, or Gemini compatible upstream. |
| Name | Internal LLMR display name. It is also used by routing, model selectors, logs, and config references. Names must be unique; keep them short and stable. |
| API endpoint | Upstream API base URL. It controls where requests are sent, and is also used for protocol probing, model discovery, icon detection, and safety checks. Preset providers hide it by default while adding, but it can be overridden in Advanced settings. Custom providers must provide it. |
| API key | Default provider credential. When the credential pool is empty, model requests use this key. Protocol probing, model discovery, connection checks, and default usage fetching also use it. Only use a key issued for the selected endpoint. |
| Models | Model IDs exposed by LLMR. Routing rules, Agent Profile model selectors, the model catalog, and client `/models` responses all use this list. |
| Search models / All / Clear | When LLMR can discover models from the upstream or catalog, you can search, select all, clear, and choose models. Selected models are saved to the provider. |
| Custom models | Manually adds model IDs that discovery did not return. Use this when the provider lacks a `/models` endpoint or a new model is not in the catalog yet. |
| Check Connection | Sends real test requests with the current endpoint, API key, protocol, and selected models. It verifies key, model name, and protocol usability. |
| Models to check | Model selection inside the connection-check confirmation dialog. Use it to test only some models and avoid the extra usage of checking every model at once. |
| Check results | Shows whether each model is available, which protocol matched, and the upstream diagnostic message. Results are diagnostic. Add models through the main model selection when you want them saved. |

## Connectivity checks

`Check Connection` sends real model requests for the models you select. It verifies whether the endpoint, API key, protocol, and model IDs are usable. The check limits generated output, but it can still create extra token usage or count against provider-side request limits.

If the provider bills by request, input tokens, or output tokens, select only the models you need to verify. Checking every model at once can create unnecessary usage. Review the diagnostics, then adjust the model list or usage-fetching settings manually when needed.

## Credentials

`API key` is the simplest single-key setup. For multiple upstream keys, expand `Credential pool` in Advanced settings.

| Field | Capability |
| --- | --- |
| Show credential settings | Expands or collapses credential pool editing. Collapsing does not remove saved credentials. |
| Import JSON | Imports credentials from a JSON file. LLMR accepts a top-level array, or an object with a `credentials`, `keys`, or `apiKeys` array. |
| Add key | Adds one upstream API key row. |
| Enable | Controls whether this credential participates in request forwarding and usage fetching. Disabled credentials are kept but not selected. |
| Name | Display name for the credential. It appears in account usage, logs, and diagnostics, so use a recognizable purpose or quota source. |
| API key | The actual key sent to the upstream for this credential. When a credential pool is configured, LLMR expands enabled credentials into internal upstream targets and prefers the pool over the main form API key for model requests. |
| Remove | Deletes the credential row. |
| Advanced key options | Expands per-key scheduling and limit fields. |
| Priority | Credential priority. Lower numbers are tried first. If omitted, the row order is used. |
| Weight | Tie-break weight among credentials with the same priority and similar usage. Higher numbers are preferred. Defaults to `1`. |
| Limits JSON | Local limit rules for this key. LLMR tracks request, token, or image usage windows and skips a key once it would exceed its limit, then tries another key on the same provider. |

Common `Limits JSON` fields:

| Field | Meaning |
| --- | --- |
| `rpm` / `rph` / `rpd` | Max requests per minute / hour / day |
| `tpm` / `tph` / `tpd` | Max tokens per minute / hour / day |
| `ipm` / `iph` / `ipd` | Max images per minute / hour / day |
| `maxRequests` + `windowMs` | Max requests in a custom time window |
| `maxTokens` + `quotaWindowMs` | Max tokens in a custom time window |

Example:

```json
{
  "rpm": 60,
  "tpm": 100000
}
```

The credential pool is an upstream provider key pool. It is separate from the client access keys configured on the API Keys page: the pool decides which key LLMR uses to call a provider, while client access keys decide which key a client uses to call LLMR.

## Usage fetching

`Fetch usage` lets LLMR show balance, subscription quota, status, and messages in the provider list, tray, and account panels. It does not affect whether models can be requested.

| Field | Capability |
| --- | --- |
| Fetch usage | Enables or disables account usage fetching for this provider. When off, LLMR does not call the usage endpoint. |
| Usage mode | Usage connector mode. `Standard usage endpoint` uses LLMR standard account endpoints; `HTTP JSON request` maps a custom JSON endpoint; `Browser request` uses LLMR's in-app browser login state to run a browser-side request and map the JSON response; `Raw connector JSON` edits the connector array directly. |
| Refresh interval ms | Usage refresh interval in milliseconds. Empty uses the default interval. The minimum effective interval is 30000ms. |

### Standard usage endpoint

This mode tries provider-hosted LLMR account endpoints such as `/.well-known/llmr/account` and `/v1/account/limits`. It is best for providers or presets that already implement LLMR's standard account format.

### HTTP JSON request

Use this mode when the provider has a balance or quota endpoint that returns a custom JSON shape.

| Field | Capability |
| --- | --- |
| Method | Usage request method, `GET` or `POST`. |
| Usage request URL | Usage endpoint URL. It can be a full URL. The request includes the provider API key unless changed through raw connector JSON. |
| Headers | Extra headers for the usage endpoint. Avoid hard-coding sensitive auth headers here; prefer provider API key auth. |
| Body | `POST` request body. Must be valid JSON. |
| Balance remaining field | JSON path for remaining balance. |
| Balance total field | JSON path for total balance or total credits. |
| Balance used field | JSON path for used balance. |
| Balance unit | Balance unit, such as `USD`, `CNY`, or `%`. |
| Subscription remaining field | JSON path for remaining subscription, token, quota, or package amount. |
| Subscription limit field | JSON path for subscription, token, quota, or package limit. |
| Subscription reset field | JSON path for reset time. It may resolve to an ISO string, seconds timestamp, or milliseconds timestamp. |
| Subscription unit | Subscription unit, such as `tokens`, `requests`, or `hours`. |
| Status field | JSON path for account status. Supported values are `ok`, `warning`, `critical`, `error`, and `unsupported`. |
| Message field | JSON path for account message. Useful for provider errors, plan notes, or risk-control messages. |
| Test usage request | Requests and parses the usage endpoint before saving. |
| Response fields | Lists selectable paths from the response. Buttons such as `Balance rem`, `Balance total`, `Balance used`, `Sub rem`, `Sub limit`, and `Reset` fill the matching field. |

### Browser request

Use this mode when the usage endpoint depends on a website login session, cookies, or localStorage. It is saved as the underlying `webcontent-json` connector and is available only in LLMR Desktop. The endpoint response must still be JSON so the fields below can map it with LLMR's lightweight JSONPath syntax.

| Field | Capability |
| --- | --- |
| Browser login URL | Login page opened by `Open login browser`. The session is stored in LLMR's in-app browser partition. |
| Browser storage origin | Origin loaded by the hidden browser before the request. This is the origin used to read `localStorage` and `sessionStorage`. Empty uses the browser login URL origin, then falls back to the usage request URL origin. |
| Fetch credentials | Browser `fetch` credentials mode: `omit`, `include`, or `same-origin`. Use `omit` when authentication is sent through token headers and the API returns `Access-Control-Allow-Origin: *`; use `include` only when cookies are required and the API returns the exact website origin. |
| Browser timeout ms | Timeout for loading the origin and running the account request. Empty uses the default. |
| Browser header templates | Dynamic headers rendered in the hidden browser before `fetch`. Values can reference `${localStorage.key}`, `${sessionStorage.key}`, or bracket keys such as `${localStorage["access-token"]}`. |
| Open login browser | Opens LLMR's in-app browser so the user can sign in before testing. |
| Import from Chrome | Creates a Chrome login-state import job for the login URL, storage origin, and usage request URL domains, then writes cookies/localStorage into LLMR's in-app browser partition. |

Browser requests do not send the provider API key. LLMR runs `fetch` inside the in-app browser from the browser storage origin, renders dynamic headers there, and applies the selected browser credentials mode. The usage request URL may be on another origin when that API allows the website origin through CORS.

When `browser.credentials` is omitted, LLMR defaults to `omit` if `browser.headerTemplates` is configured, otherwise it keeps the legacy cookie-oriented default `include`.

Example raw connector for a site that stores an access token in `localStorage`:

```json
{
  "type": "webcontent-json",
  "endpoint": "https://api.vendor.example.com/account",
  "browser": {
    "credentials": "omit",
    "loginUrl": "https://vendor.example.com/login",
    "partition": "built-in-browser",
    "requestOrigin": "https://vendor.example.com",
    "headerTemplates": {
      "authorization": "Bearer ${localStorage.accessToken}"
    }
  },
  "mapping": {
    "meters": [
      {
        "id": "balance",
        "kind": "balance",
        "label": "Balance",
        "remaining": "$.balance.remaining",
        "unit": "USD"
      }
    ]
  }
}
```

Field paths use LLMR's lightweight JSONPath syntax:

| Syntax | Meaning |
| --- | --- |
| `$` | Whole response object |
| `$.balance.remaining` | Object field |
| `$.items[0].value` | Array index |
| `$["weird-key"]` | Field name with special characters |
| `$.limits[?(@.type=="TOKENS")].remaining` | First array item matching simple equality filters |
| `100 - $.data.percentage` | Numeric subtraction expression, often used to convert used percent into remaining percent |

### Raw connector JSON

`Connectors JSON` edits the `account.connectors` array directly for more complex provider setups.

| Connector type | Capability |
| --- | --- |
| `standard` | Uses LLMR standard account endpoints. |
| `http-json` | Requests a JSON endpoint and maps balance, subscription, status, and message fields. |
| `webcontent-json` | Uses LLMR Desktop's in-app browser login state to run a browser-side request and map the JSON response. The UI exposes this as `Browser request`. |
| `plugin` | Calls an account usage connector registered by an installed plugin. |
| `local-estimate` | Shows estimated quota from local time-window config without a remote request. |

`Insert example` fills an example connector array containing `standard`, `http-json`, `webcontent-json`, `plugin`, and `local-estimate` connectors.

### New API subscription quota

LLMR reads the subscriptions of a New API account through New API's `/api/subscription/self` route.

1. In New API, create an access token with the `wallet:read` scope.
2. In LLMR, turn on **Fetch usage**, choose **Raw connector JSON**, and click **Insert New API subscription quota**.
3. Replace `<new-api-access-token>` with the token.

The button appears only when LLMR detects New API or the JSON already names a New API parser. A proxy that strips New API's response headers hides it. In that case, paste the connector yourself, with your gateway's root URL in `endpoint`:

```json
{
  "auth": "none",
  "endpoint": "https://new-api.example/api/subscription/self",
  "headers": {
    "Authorization": "Bearer <new-api-access-token>"
  },
  "mapping": {
    "meters": [
      {
        "id": "new_api_subscription_quota",
        "kind": "quota",
        "label": "Subscription quota",
        "limit": "$.data.subscriptions[0].subscription.amount_total",
        "unit": "quota",
        "used": "$.data.subscriptions[0].subscription.amount_used"
      }
    ]
  },
  "method": "GET",
  "parser": "new-api-subscription-self",
  "type": "http-json"
}
```

**Test first JSON connector** checks only the first connector in the array. Check the result on the provider card after saving, or move this connector first to test it.

The meter totals all active subscriptions. When any of them is unlimited, the meter is labeled `Subscription used (unlimited)` and shows usage with no limit. With no active subscription, the provider shows `No active New API subscription.`

Fill **New API user ID** before clicking the button only if your New API version requires the `New-Api-User` header. The button then adds that header.

### Local model usage and pricing

Local compatible services such as llama.cpp also group token usage under the configured provider name. Runtime protocol and credential aliases are normalized to that name. A GGUF filename alias usually has no cloud catalog price. To calculate custom costs, set `inputUsdPerMillionTokens` and `outputUsdPerMillionTokens` in the model metadata's `pricing` object; both are USD per million tokens. Set both to `0` to explicitly record no API charge. Without a configured price, LLMR uses the catalog entry of the provider the base URL maps to, then the model maker's own entry, then the entry of the only catalog provider that lists the model, then LiteLLM's. When neither the provider's own entry nor the maker's price is known, LLMR uses the median of the prices resellers list for the model, recorded with the source `models.dev-median`. That figure is an estimate, not a listed price, and a price set on the provider's model overrides it. A model no catalog lists is recorded with no cost. LLMR does not infer hardware, electricity, or hosting costs. Existing historical records are not automatically rewritten.

## Deferred tool loading

Some clients mark tool declarations with `defer_loading`. A provider that has no deferred tool loader may reject every request that carries it. For such a provider, turn off **Deferred tool loading** under **Advanced settings**. This saves `supportsDeferredTools: false`. In a hand-edited config the value must be the JSON boolean `false`; LLMR ignores a string such as `"false"` and logs a warning.

LLMR then removes `defer_loading` from every tool declaration it sends to that provider: from the tool itself, from its `function` object, from tools nested in a namespace, and from the `default_config` and `configs` of a toolset. Tool names, descriptions and input schemas are sent unchanged. The setting is on by default, and it applies only to requests sent to this provider: when a request falls back to another provider, that provider receives the original declarations.
