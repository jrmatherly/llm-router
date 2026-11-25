# Claude apps gateway management inside LLM Router

Status: accepted by the owner on 2026-11-24, ready for a plan per phase. Audited the same day by two reviewers on other models, one for facts and one for the design, then reviewed twice more by the author with further live runs and a reading of Anthropic's terms. Confirmed findings from all three are applied. Nothing here is built. This spec lists what is wrong or missing today, the target design, and a build order. A plan per phase follows once the owner picks what to build.

## Why

The owner wants one place to manage, configure and observe a Claude apps gateway, and wants that place to be the LLM Router (LLMR) interface, as if the gateway had been part of LLMR's design from the start.

Today the two are joined at two thin points. LLMR can sign in to a gateway and use it as a provider, and LLMR labels a request with the developer's e-mail when a gateway forwards to it. Everything else about the gateway (its health, who is signed in, spend and caps, its audit trail, its config file, its process) is managed somewhere else or by hand.

"Claude apps gateway" in this document always means Anthropic's `claude gateway --config <yaml>` server. It is not LLMR's own internal gateway (`packages/core/src/gateway`), not the Claude Desktop third-party-inference feature (`agents/claude-app/gateway-*.ts`), and not `agents/bot-gateway`.

## Owner's decisions

Taken on 2026-11-24. A later line in this spec or in a plan that contradicts one of these is wrong.

| # | Decision |
|---|---|
| D-1 | LLMR manages both kinds of gateway: one that LLMR runs itself (an *owned* gateway), and one that is already deployed elsewhere (a *remote* gateway). |
| D-2 | Config management is versioned: drafts, numbered versions, publish and rollback. A read-only view or a plain edit-and-apply form is not enough. |
| D-3 | This run delivers this spec with a ranked gap list. Plans come after the owner picks. |
| D-4 | D-1 and D-2 retire the "Not in this phase" rulings of the two earlier specs that kept the admin API and the admin console out of LLMR (`specs/completed/2026-10-25-claude-apps-gateway-integration.md:44`, `specs/completed/2026-10-25-claude-apps-gateway-client.md:57-62`). Their reason was that another console owned that work. |
| D-5 | The owner accepted all ten recommendations in "Decisions on the researched questions" below (O-1 to O-10). Each recommendation there is a decision. One carries a later step that is still the owner's: the choice in O-5 after phase 5. |

## What was established, and how

Each row says how the fact was checked. "Live" means a run on 2026-11-24 against Claude Code 2.1.332 with the harness in `--load-test` mode, a scratch `HOME` and a scratch `CLAUDE_CONFIG_DIR`. "Binary" means the gateway's JavaScript read out of the 2.1.332 binary. "Code" means LLMR's source at `main` `51b15a2d`. "Docs" means Anthropic's gateway pages (`code.claude.com/docs/en/claude-apps-gateway`, `-config`, `-deploy`, `-spend-limits`).

### The gateway

| Fact | Checked |
|---|---|
| A device sign-in that sends no `client_id` and no `scope` (what LLMR sends today) returns an access token, a refresh token and `expires_in: 28800` with `ttl_hours: 8`. The token is a JWT carrying `sub`, `email`, `name`, `groups`. | Live |
| That bearer, for a user in `admin.admin_groups`, reads and writes the admin API. A cap created with it is audited as `oidc:<sub>`. With no credential the API answers 401. | Live |
| Admin routes: `GET`/`POST /v1/organizations/spend_limits`, `GET`/`DELETE /v1/organizations/spend_limits/{id}`, `GET .../spend_limits/effective`, `GET .../spend_limits/audit`. They exist only when the config has an `admin:` block. | Live for list, create, effective and audit. Binary and docs for the rest. |
| `GET /v1/organizations/analytics/cost` returns cost per user or per group per day, 31 days at most. The changelog records it as added to the gateway's admin API in 2.1.317, with a daily record of each person's groups that the report groups by. The gateway's own docs pages do not describe it. Its path, parameters and row shape match Anthropic's public Analytics API route of the same name, which is in beta. | Live (200, per-user rows). Binary for the parameters. Changelog and the public API page, read 2026-11-24. |
| The spend limits API also takes a pooled group budget (`pooled_budget`), one monthly budget shared by a group's members. It is accepted only on a group's monthly cap: a daily cap and a user cap were each refused with a 400 that says why. The cap comes back with the pool's amount, a `paused` flag and its spend to date. | Live |
| The gateway gains config keys often. The changelog shows `oidc.groups_jsonpath` in 2.1.331, and `admin.pooled_conflict_rule`, `login_notice` and others in the weeks before. About 22 of the 270 releases in the changelog add a gateway setting. | Changelog. The count is from a text match and is approximate. |
| No schema for the config file is published. The config accepts a `$schema` key, but the gateway's docs pages name no schema file and the binary holds no URL for one. | Docs and binary, searched 2026-11-24 |
| A static `x-api-key` from `admin.write_keys` or `admin.read_keys` is the other admin credential. It is audited as `admin-key:<id>`. | Live (a cap created with the harness's write key, audited as `admin-key:dev`) |
| `/healthz` answers `ok`. `/readyz` answers `ready`, and `503 store unavailable` when Postgres is down while `/healthz` stays 200. `/.well-known/oauth-authorization-server` answers only after a full boot and carries `gateway_protocol_version: 1`. The landing page `/` shows the version. | Live |
| `/v1/models` items are `{type, id, display_name, max_input_tokens?}`. `/api/oauth/usage` returns the caller's own spend and caps. `/managed/settings` answers `404 not configured` with no `managed:` block. | Live |
| The gateway has no route to read or change its config and no reload. The YAML is read once at boot. Only spend caps change live. | Binary (full route table, no `SIGHUP` or file watch) and docs ("redeploy to change it"). |
| `claude gateway --help` lists one option, `--config`. There is no check-only or validate flag. | Live |
| Audit events are always one JSON line each on stderr. `CLAUDE_GATEWAY_LOG_FORMAT=json` (2.1.319 or later) turns the ordinary log lines into JSON too. Events include `inference` (sub, email, model, upstream, status, ms) and `spend.metered` (tokens and cents per request). | Live for the JSON log lines and the `config.load` event. Binary and docs for the other events' fields. |
| At boot the gateway logs `config.load` with a sha256 of `JSON.stringify` of the config object it loaded. That is not the hash of the file, and it is not the hash of the YAML parsed to JSON either, so LLMR cannot compute it ahead of time. It is stable: the same file gave the same hash on two boots. | Binary, and live (three hashes compared) |
| `${VAR}` resolves from the gateway's environment and `${file:/path}` from a file. Each fills one whole scalar field. Neither can stand in for a list. | Binary and docs |
| `store.readiness_grace_seconds` (default 0) keeps `/readyz` answering ready for that long after Postgres stops. | Docs |
| The gateway keeps state under `CLAUDE_CONFIG_DIR`: the run created `.claude.json` and `backups/` there. | Live |
| Anthropic's terms give no stated right to redistribute the binary. The repository's licence file is a copyright line that points to the Commercial Terms. The legal page says that preinstalling or running Claude Code in a product needs agreement to the Commercial Terms, an unmodified binary with every built-in sign-in method left working, and no paying for or reselling of end users' usage. It also bars using the Claude Code or Anthropic names as part of a product or feature name. The deploy guide tells each operator to build their own image from a pinned release and verify it against the GPG-signed manifest. | The four pages, read on 2026-11-24. This is a reading, not legal advice. |
| The gateway needs Postgres and the native `claude` binary. It is supported as a server on Linux only. macOS works for local development. Windows is not supported. | Docs. Boot against Postgres 16 was live. |
| There is no list of signed-in users or sessions, no per-session revocation and no `/metrics`. | Binary |
| A restart with the same config and signing secret keeps people signed in. After a stop and a start, an access token issued before still worked on an admin route, a refresh token issued before still refreshed, and a device login begun before was approved and completed after. The new process was ready about 1 s after it started. | Live |
| After `SIGTERM` the gateway refuses every new connection at once, `/healthz` included, and stays up only to finish open requests. A stream with 9 s left finished whole and the process exited when it did. A stream with 37 s left was cut at the 25 s drain limit: the client got a 200 with a truncated body and no `message_stop`, and the gateway logged `drain window over after 25s: cut 1 request(s) still open`. With `CLAUDE_GATEWAY_DRAIN_TIMEOUT_MS=5000` the cut came at 5 s. | Live, against a mock upstream that streams one event a second |
| The gateway boots with an environment of only `PATH`, `HOME`, `CLAUDE_CONFIG_DIR` and `CLAUDE_GATEWAY_ALLOW_LOOPBACK`. | Live |
| A gateway can push managed settings that run commands on the machines of the people signed in to it. Its boot banner and the config reference both say so. | Live (banner) and docs |
| Claude Desktop 4.23118.0 or later, connected to a gateway, already gives members of `admin.admin_groups` a spend-limit view. It covers spend limits only. | Docs. Not seen. |

### LLMR today

| Fact | Checked |
|---|---|
| One session file per gateway host under `CONFIGDIR/claude-apps-gateway/`, mode 0600. It stores tokens, expiry, e-mail and the model list. It stores no `sub` and no groups, and the JWT is never decoded (`agents/claude-apps-gateway/session-store.ts:12-21`). | Code, by a survey agent, re-checked by the audit |
| The whole management surface is three methods (start, wait and cancel a login) and one form inside Providers, Add, "Import local agent provider". There is no list, no status and no sign-out (`contracts/ipc-channels.ts:52-54`, `ui/.../providers.tsx:1455-1467`). | Code, by a survey agent, re-checked by the audit |
| `removeClaudeAppsGatewaySession` has no production caller. | Code, re-checked by `git grep` |
| `inferGatewayClient` takes the `client` label from the first of five headers, `x-claude-gateway-user-email` among them, before it looks at the API key (`gateway/http/io.ts:11-17`). Any holder of any LLMR key can name any person. | Code, re-read |
| `x-claude-gateway-user-id` is stripped and recorded nowhere (`gateway/internal/shared.ts:287-291`). | Code, by a survey agent, re-checked by the audit |
| The e-mail lands in `usage_events.client` for every POST for 90 days, whether or not request logs are on. The guide says 7 days and only when logs are on (`usage/store.ts:154,461`, guide line 30). | Code, by a survey agent, re-checked by the audit |
| Importing a gateway as a provider writes a bearer into `providerPlugins` in `config.sqlite`. The runtime hook never uses it: it takes the token from the session file and fails when that file is gone (`gateway/core-runtime/local-agent-auth-provider-hook.ts:209-236`). The web RPC masks it, because `providerPlugins` is in `redactedConfigFields` and `authorization` is a secret field name (`web/provider-secrets.ts:8,16-22`). | Code, re-read |
| LLMR's gateway supervisor is one singleton with one child, one marker file and a Node IPC handshake (`gateway/application/gateway-service.ts`, `gateway/core-runtime/supervisor.ts`). It cannot run a second, different child as it stands: the class holds one `child` and one auth token (`gateway-service.ts:135,142`), there is one exported instance (`:1031`), the marker file name is a constant (`gateway/internal/shared.ts:301`), and the spawn is fixed to Node, the bootstrap entry and an IPC channel (`supervisor.ts:55-72`). | Code, re-read |
| `withoutLlmrSecretEnv()` removes only LLMR's own secret names (`mcp/child-env.ts:1-8`). `ANTHROPIC_*`, `CLAUDE_*` and `HOME` pass through it. `tests/architecture/child-env.test.mjs` catches a textual `...process.env` spread in the packages' `.ts` sources only. | Code, re-read |
| There is no secrets store. `config.sqlite` has `app_config`, `api_keys`, `runtime_state` and the migrations table (`config/config-repository.ts:261-290`). `ApiKeyConfig` has no field for a per-key flag (`contracts/app.ts:1695-1702`). `AppConfig` already has a `gateway` key, which is LLMR's internal gateway. | Code, by the audit |
| The web RPC masks a field only when its name looks like a secret (`authorization`, `token`, `secret`, `apikey` and the like), and only inside a section listed in `redactedConfigFields` of an object that has a `Providers` array (`web/provider-secrets.ts:16-22,62-82`). | Code, re-read |
| Over `llmr serve` and in Docker a caller is known only by one shared web token. There is no cookie, account or per-person identity (`web/management-server.ts:281-284`). | Code, re-read |
| The Docker image has no `claude` binary and no Postgres. `docker/claude-apps-gateway/` is a development harness: Postgres and Dex in Compose, the gateway on the host. When the gateway stops, the harness leaves the containers and the volume up. | Code, re-read. The leftover containers were seen live. |
| The harness still boots on 2.1.332. Its README and error text name 2.1.310. | Live |

## Gaps, ranked

Rank is by what blocks the goal first, then by harm done today. "Fix" is a defect in what exists. "Missing" is something the goal needs that does not exist.

| Rank | Id | Kind | Gap |
|---|---|---|---|
| 1 | G-1 | Missing | No model of a gateway as a managed thing. LLMR knows a gateway only as a session file and a provider. There is no record with a name, a mode (owned or remote), a credential and a state. |
| 2 | G-2 | Missing | No status view: health, readiness, version, protocol version, who is signed in, their groups, whether they are an admin, when the session ends. |
| 3 | G-3 | Fix | No sign-out. The guide tells the user to delete a file. |
| 4 | G-4 | Missing | No spend console: effective spend per user, caps (list, create, delete), audit trail, cost by day. All of it is one HTTP call away with the session LLMR already holds. |
| 5 | G-5 | Fix | Forwarded identity is trusted from anyone. All three identity headers (`x-claude-gateway-user-email`, `x-claude-gateway-user-id`, `x-litellm-end-user-id`) are accepted on any key. A per-user view built on them would show whatever a key holder typed. |
| 6 | G-6 | Fix | The stable user id is thrown away, and the e-mail shares the `client` column with tool names and key names. Gateway users cannot be told apart from other clients, and an e-mail change splits a person in two. |
| 7 | G-7 | Missing | No join between the gateway's view of a person (groups, cap, spend) and LLMR's view of the same person (requests, tokens, models, providers, cost). |
| 8 | G-8 | Missing | No supervision of a `claude gateway` process: find the binary, start, watch, restart with backoff, stop, capture stderr. |
| 9 | G-9 | Missing | No config control plane: a stored document, versions, typed editors, validation, publish by write-restart-wait-rollback. |
| 10 | G-10 | Missing | No activity view from the gateway's own audit events (sign-ins, refused requests, metered spend). The only source is the owned gateway's stderr. |
| 11 | G-11 | Missing | No supported deployment. `docker/claude-apps-gateway/` is a test harness, and the LLMR image cannot run a gateway. |
| 12 | G-12 | Missing | No way to publish config to a remote gateway. The gateway offers none, so it needs a small agent beside the remote gateway that pulls from LLMR. |
| 13 | G-13 | Fix | A never-used bearer is written into `config.sqlite` at import and goes stale there. |
| 14 | G-14 | Fix | The guide understates how long, and where, a developer's e-mail is kept. |
| 15 | G-15 | Fix | Harness upkeep: it leaves containers and a rendered file holding the JWT secret, it passes LLMR's whole environment to the child, and three files disagree on the verified version. |
| 16 | G-16 | Fix | `rpcHandlers` in `web/management-server.ts` is an untyped map, so a method missing on the server is a 404 at run time. `ViewId` is declared twice and copied a third time as `NavigationId`. Every phase below adds methods and a page, so each will hit both. |
| 17 | G-17 | Missing | No first-run flow for an owned gateway. Someone has to supply the issuer, client id and secret, the Postgres URL and a signing secret before there is anything to edit, and the gateway's port must not clash with LLMR's own. |
| 18 | G-18 | Missing | No check of the gateway's version against what LLMR's editors know. A newer binary can add or change config keys, and an older one refuses a key it does not know. |
| 19 | G-19 | Missing | No rule for who may change a gateway from LLMR, and no record in LLMR of who did. A published `managed` policy can run commands on developers' machines, and over `llmr serve` the only gate is one shared web token. |

G-17 to G-19 came out of review. Their rank number is their order of discovery. Each is closed in the phase the build order gives it.

## Target design

### The data shape

A managed gateway is one record. Everything in the interface hangs off it.

```ts
type ManagedAppsGateway = {
  id: string;
  name: string;
  url: string;                       // origin, same rule as the session store; unique across records
  adminKey?: { keyRef: string; access: "read" | "write" };   // unset means the signed-in user's bearer
} & (
  | { mode: "remote" }
  | {
      mode: "owned";
      binaryPath?: string;           // unset means found on PATH
      stateDir: string;              // CLAUDE_CONFIG_DIR for the child, inside LLMR's data dir
      activeVersion?: number;
    }
);

type AppsGatewayStatus =
  | { state: "unreachable"; error: string }
  | { state: "starting" | "stopped" | "crashed"; detail?: string }   // owned only
  | { state: "not-ready"; reason: string; version?: string }
  | { state: "ready"; version: string; protocolVersion: number; adminApi: boolean };

type AppsGatewayIdentity =
  | { state: "signed-out" }
  | { state: "signed-in"; sub: string; email?: string; groups: string[]; expiresAt: number; canRefresh: boolean; admin: "yes" | "no" | "unknown" };
```

Rules that follow from the shape:

- The records live in a new `AppConfig` section named `appsGateways`, so it cannot be read as the existing `gateway` key.
- A session belongs to an origin, not to a record, which is why `url` is unique. Signing out of a gateway signs out its one record.
- Secrets (an admin key, and later the config document's secrets) need a store that does not exist yet. Building it is part of phase 1: a table beside `api_keys`, with the record holding only a reference. No RPC returns a secret's value. A new RPC that returns anything outside `AppConfig` gets no masking from the web layer, so it must not carry a secret at all.
- `admin` is `unknown` until an admin route answers. It is set again by every admin call: a 200 makes it `yes`, a 401 or 403 makes it `no`. It is never cached across a refresh, because the gateway re-reads a person's groups at refresh, so an admin who was removed keeps working for up to `ttl_hours`. The gateway is the only judge of who is an admin. The interface never decides from a group name.
- The session store gains `sub` and `groups`, decoded from the JWT for display only. The gateway verifies the token. LLMR does not.
- Status is derived on demand from `/healthz`, `/readyz`, the discovery document and the landing page. Nothing about status is stored. `ready` means the gateway says it is ready. With a readiness grace period set, that is not proof that Postgres is up.
- `owned.stateDir` is never the user's own Claude directory. The gateway writes `.claude.json` and `backups/` into `CLAUDE_CONFIG_DIR`, and LLMR must not cause a write to `~/.claude.json`.

### One page, sections by capability

A top-level page, "Apps gateway", listing the managed gateways. Selecting one shows these sections. A section that the gateway or the credential cannot serve says why, in the gateway's own words where it has them.

| Section | Works for | Reads or calls |
|---|---|---|
| Status | owned, remote | `/healthz`, `/readyz`, discovery, `/`, the session |
| Sign in, sign out | owned, remote | the existing device login, plus removal of the session |
| Spend | owned, remote; needs an admin credential | `spend_limits/effective`, `analytics/cost` |
| Caps | owned, remote; needs an admin credential with write | `spend_limits`, pooled group budgets included |
| Audit | owned, remote; needs an admin credential | `spend_limits/audit` |
| Served to me | owned, remote | `/v1/models`, `/managed/settings`, `/api/oauth/usage` as the signed-in user |
| People | owned, remote; best with LLMR as the upstream | the join in G-7 |
| Process | owned | the supervisor: state, restarts, stderr tail |
| Activity | owned | the gateway's JSON audit events parsed from stderr |
| Config | owned; remote only through the agent in G-12 | the control plane |

The provider import stays where it is, and gains a link to the gateway's record.

### Identity from a gateway that forwards to LLMR

- An LLMR API key gets a flag that says "this key belongs to an apps gateway and may forward identity". LLMR reads the three identity headers only on a request made with such a key. On any other key they are ignored for attribution, and still stripped before the provider. The flag needs a column or a place in the key's stored limits, so it comes with a schema migration.
- The flag moves the trust to the key. Whoever holds a flagged key can still name any person, so a flagged key is for one gateway and nothing else. That limit is stated in the interface where the flag is set.
- LLMR refuses to import as a provider an owned gateway whose upstream is this same LLMR. The two would call each other.
- The usage and request-log rows gain two fields, the forwarded user id and e-mail, apart from `client`. `client` goes back to meaning the tool or the key.
- For an owned gateway LLMR creates that key and writes the `upstreams` entry itself (`provider: anthropic`, `base_url` of this LLMR, `forward_user_identity: true`), so the wiring is one action and cannot be half done.
- There are no consumers to migrate, so the old meaning of `client` is dropped without a compatibility path.

### Supervising an owned gateway

A second supervisor, written for this child, in its own module. It does not go into `gateway/service.ts` or `GatewayService`.

- It copies the proven parts of the existing supervisor: restart backoff of `min(30 s, 1 s * 2^n)` reset after 60 s up, generation counters to cancel stale work, and a pid-plus-identity check before any kill.
- Readiness is HTTP: `/healthz`, then `/readyz`, then the discovery document.
- The child's environment is built from an allow list: `PATH`, the proxy and cloud SDK variables the config needs, `CLAUDE_CONFIG_DIR` set to `stateDir`, `HOME` set inside `stateDir`, `CLAUDE_GATEWAY_LOG_FORMAT=json` and the secrets the config names. `withoutLlmrSecretEnv()` is not enough here, because it lets `HOME`, `CLAUDE_*` and `ANTHROPIC_*` through.
- One LLMR process owns a child. Ownership is a marker in `stateDir` holding the owner's pid and the child's pid, checked against the live processes before any start or kill. A second LLMR process (the desktop app beside `llmr serve`, say) shows the gateway as owned by the other and can neither start, stop nor publish. A test starts two supervisors over one `stateDir`.
- Stop is `SIGTERM` and a wait of up to the drain time.
- Captured stderr is kept to a size cap. Secrets are passed by environment or file and never on the command line, so they do not appear in it.
- LLMR does not run Postgres. The owner of the machine supplies a URL. The Docker shape supplies one as a Compose service.
- Owned mode is offered on Linux and macOS, and on macOS the page says Anthropic supports it for development only. On Windows the page offers remote mode only and says why.
- An owned gateway listens on loopback unless the document sets `listen.host` otherwise, and the editor repeats the gateway's own warning when it does.

### The config control plane

- A document is LLMR's own typed model of the gateway config, not YAML text. Rendering to YAML is a pure function, as the harness's `renderGatewayConfig` already is. Keys LLMR has no editor for are carried in a raw passthrough block so a new gateway key does not wait on an LLMR release.
- A version is an immutable row: number, document, author, time, note, and the sha256 of its rendered file. LLMR knows which version is running because it wrote the file and started the child. LLMR cannot compute the gateway's `config.load` hash, but the hash is stable for a given file. So LLMR stores the hash the gateway logs the first time a version boots, and a later boot that logs a different one means the file was changed outside LLMR.
- States: `draft`, `published`, `failed`, `superseded`. One draft at a time per gateway.
- Publish, for an owned gateway, in order:
  1. Preflight without touching the running gateway: the binary is there, Postgres answers, the issuer's discovery document answers.
  2. Render and write the file with mode 0600 beside the last good one.
  3. Restart the child and wait for readiness.
  4. If it does not come up, put the last good file back and restart again. If the old file comes up, the new version is `failed`, with the gateway's own error text. If the old file does not come up either, the result is an outage, the version stays a draft and the page says what the gateway reported.
- A restart keeps people signed in, and a device login in progress survives it, as long as the signing secret is unchanged (measured). New connections are refused from the moment the old process is told to stop until the new one is ready, and that holds for every client, LLMR included when the gateway is one of its providers. With nothing in flight that gap was about a second in the harness. With a stream in flight it lasts until the stream ends or the drain limit passes, 25 s by default, and a stream still open at the limit is cut with no error the client can read (all measured). So:
  - Publish asks for confirmation and states the worst case: up to the drain limit of refused connections, and any reply still streaming at the limit is lost.
  - The drain limit is a setting of the owned gateway, passed as `CLAUDE_GATEWAY_DRAIN_TIMEOUT_MS`. The supervisor waits that long plus a margin before it treats a stop as hung.
  - When this LLMR is the gateway's upstream, the confirmation shows how many requests from that gateway are in flight, which LLMR can count. For any other upstream it says the count is unknown.
  - A version that removes the signing secret in use signs everyone out, and the page says that before the publish.
  - A publish with no downtime would need a second gateway process behind a proxy. That is not in this program.
- Rollback is a publish of an earlier version's document as a new version.
- Secrets never enter a version. The document holds references. LLMR renders the YAML itself, so a list of secrets (a rotating `session.jwt_secret`, say) is rendered as a list whose every element is its own `${VAR}`, and the supervisor passes the values in the child's environment. A field that must be a file uses `${file:}` with a 0600 file in `stateDir`. The version's hash is over the file with references in it, not over the values.
- The raw passthrough block cannot hold a secret reference. A key that needs one waits for an editor.
- The editors record the gateway version they were written against. The page warns when the running binary is older or newer than that, and a publish that fails on an unknown key says which key.
- Validation before publish is LLMR's own schema check. It cannot be complete, because the gateway has no validate flag and its schema is not published. The restart-and-rollback path is what makes a bad config safe.

### Who may change a gateway

- Starting, stopping and publishing are the acts that can hurt people other than the operator. A publish can change `managed` policy, which runs on developers' machines.
- A publish that changes `managed`, `oidc`, `admin` or `upstreams` needs a signed-in gateway session whose user the gateway accepts as an admin at that moment. A static admin key is not enough for these, because it names no person.
- LLMR keeps its own record of every start, stop, publish and rollback: time, the gateway user's id and e-mail when one is signed in, the version, and the outcome. The gateway's audit trail covers spend caps only, so without this record a config change has no author.
- Over `llmr serve` and in Docker the shared web token is the outer gate, and everyone who holds it is one operator as far as LLMR can tell. The record says so by naming the gateway user and not an LLMR user.

### Remote publish

A remote gateway has no config route, so LLMR alone cannot publish to it. The only general answer is a small process that runs beside the remote gateway, pulls the active version from LLMR, writes the file, restarts the gateway and reports back. Until that exists a remote gateway gets every section except Process, Activity and Config, and Config can still be used to author a document and export the rendered file.

### Deployment

`docker/claude-apps-gateway/` becomes a supported shape next to the harness. It is a Compose file with LLMR, Postgres and the gateway, loopback-published like the existing files. How the `claude` binary reaches the image is decision O-2.

## Build order

Each phase is one or more squash-merged PRs and ends in a check on a real gateway, which the harness provides.

| Phase | Closes | What ships | Proof |
|---|---|---|---|
| 0 | G-16, then G-3, G-5, G-6, G-13, G-14, G-15 | The fixes, one PR each, with `rpcHandlers` typed against the client API first because every later PR adds methods. Then sign-out end to end, the key flag with its migration and the identity fields, no bearer written at import, the guide corrected, the harness tidied. | Unit tests, plus one harness run: a request with a forged header on an ordinary key is not attributed. |
| 1 | G-1, G-2 | The record, the secrets store, the status derivation, the page with Status and sign-in for a gateway named by URL. | Harness: the page shows ready, version 2.1.x, the mock user, their group, admin yes. Stop Postgres with the default grace of 0: not ready, with the gateway's reason. |
| 2 | G-4 | Spend, Caps, Audit, Served to me. | Harness: create and delete a cap from the page, and see both in Audit under the user's own id. |
| 3 | G-7 | People: the join of gateway spend and LLMR usage per person, keyed on the user id and on the e-mail only where no id was recorded. It starts empty and fills from the day the phase 0 identity fields ship. | Harness with LLMR as the upstream: one request appears under the mock user with LLMR's tokens and the gateway's cap. |
| 4a | G-8, G-17 | The supervisor, the Process section, the first-run flow, the one-action wiring of LLMR as the upstream. | Kill the child: it comes back with backoff. Start a second LLMR: it cannot take the child. The real home's Claude files are unchanged. |
| 4b | G-10 | The Activity section from the audit events on stderr. | Activity shows the sign-in and the request from the harness run. |
| 5 | G-9, G-18, G-19 | The control plane for an owned gateway, with the rule for who may publish and LLMR's record of it. Start and stop are recorded from phase 4a. | Publish a good version: the gateway is ready on the new file, people stay signed in, and the record names the publisher. Publish a broken one: the gateway is back on the last good file and the version reads failed. Publish with Postgres stopped: nothing is restarted and no version is marked failed. |
| 6 | G-11 | The Compose deployment, with a build step that downloads and verifies the operator's own copy of the binary. It follows O-2. | `docker compose up` on a clean machine reaches a ready gateway managed from LLMR's web UI. |
| 7 | G-12 | The remote agent. | A gateway on another host takes a published version and reports it. |

Phases 0 to 2 use only calls that were run live for this spec. Phases 4a and 5 carry the risk: process control, and a publish that must never leave a gateway down. Each of those starts with a throwaway prototype of its riskiest step before its plan is written.

## Decisions on the researched questions

The owner accepted every recommendation in this table on 2026-11-24 (D-5), so the third column is the decision. Each question was researched the same day, and the last column is what the research found.

| # | Question | Decision | What the research found |
|---|---|---|---|
| O-1 | Build the cost report into Spend? | Yes, behind a version check, with the `effective` route as the fallback for older gateways. | It is not undocumented, as an earlier draft said. The changelog adds it in 2.1.317, and it mirrors Anthropic's public Analytics API. That API is marked beta, so the shape can still change. It ran live. |
| O-2 | How does the `claude` binary get into a container? | Installed by the operator at build, from a pinned release and checked against the signed manifest. Not shipped in any image LLMR publishes. This path needs no further confirmation, because LLMR distributes nothing of Anthropic's. Only Anthropic can grant a right to ship the binary, so that question is put to Anthropic if shipping it is ever wanted. | Anthropic's terms state no right to redistribute. The licence file is a copyright line. The legal page sets conditions on preinstalling Claude Code in a product. The deploy guide tells each operator to build their own image. |
| O-3 | The default admin credential. | The signed-in user's bearer. A read key is offered for an unattended, read-only view. A write key is offered and marked as naming no person. | The bearer ran live and audits as `oidc:<sub>`. A key audits as `admin-key:<id>`. Losing admin at the identity provider takes effect at the next refresh, within `ttl_hours`. One caution: LLMR holds one session per gateway, so over `llmr serve` everyone with the web token acts as whoever signed in. The page must say so. |
| O-4 | Where the page sits in the sidebar. | Its own entry under Setup, after Providers. | The groups today are Workspace, Setup (Providers, Profiles, Routing), Monitor (Logs, Observability) and Advanced (`components/layout.tsx:37-40`). A gateway is infrastructure beside the providers. This is cheap to change later. |
| O-5 | Build phase 7, the remote agent? | Not as a shipped agent. Phase 5 already exports a rendered file. If a remote gateway needs more, add an authenticated endpoint that serves the active version, and document a pull script. Decide after phase 5. | The pattern is proven: an existing console's supervisor pulls a version every 30 s, writes it, restarts the gateway, waits for readiness and puts the last good file back on failure. Anthropic's deploy guide mounts the config from a ConfigMap, so many operators will want the exported file in their own pipeline and no agent at all. |
| O-6 | Should LLMR accept the gateway's OTLP relay? | Not in this program, but record it as the next one. It is the only way a remote gateway could get an Activity view, because the stderr events exist only for an owned gateway. | LLMR has no OTLP receiver. Clients send `http/protobuf` unless a policy sets `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, so a JSON-only receiver would work for a gateway whose policy LLMR writes. Each export carries the person's id, e-mail and groups. |
| O-7 | When LLMR quits, does an owned gateway stop? | Stop with the desktop app. Keep running when LLMR runs as a server, and adopt it on the next start. Make it a setting of the gateway. | LLMR stops its internal gateway on exit in both modes today (`electron/src/main/main-app.ts`, `web/management-server.ts:613`), so keeping this one up is a deliberate difference. The reason is measured: a stop refuses connections for up to the drain limit and cuts long streams, and an LLMR upgrade should not do that to a team. Adoption is needed anyway, because a crash of LLMR leaves the child running. |
| O-8 | Are phases 1 to 3 built before any process control, so they ship for a gateway named by URL? | Yes. | Every call those phases need ran live over plain HTTP from outside the gateway. An owned gateway is the same thing plus a process. |
| O-9 | Is a spend console in LLMR still wanted, given that Claude Desktop shows spend limits to gateway admins? | Yes. | Anthropic's docs say the Desktop view covers spend limits only. It was not seen. LLMR adds the cost report, the audit trail, pooled budgets and the join with LLMR's own usage. If the owner disagrees, phase 2 shrinks to Audit and Served to me. |
| O-10 | What does LLMR call the page? | "Apps gateway" as the label, with body text that says it manages Anthropic's Claude apps gateway. No Anthropic logo. | The legal page allows an accurate plain-text statement and bars Anthropic's names inside a product or feature name. The trademark guidelines (effective Aug 1, 2024) are stricter in general terms and say nothing about descriptive use. LLMR already labels things "Claude Code" where it names the tool a profile is for, and that is outside this spec. |

## Still open

| # | Question | Recommendation | What the research found |
|---|---|---|---|
| O-11 | Over `llmr serve` and in Docker, whose identity do admin actions carry? This refines O-3, which the owner accepted before this was researched. | Each browser signs in to the gateway for admin work on its own. That session is held in the server's memory against a handle the browser keeps, it is never written to disk, and it ends with the gateway's session. The stored session stays for provider traffic only and is not used for admin calls in these modes. The desktop app has one user and keeps using the stored session for both. | LLMR knows a web caller only by the shared token, so with one stored session every admin change is audited under whoever signed in first. The pending device login already works this way: a per-process map keyed by a random handle (`agents/claude-apps-gateway/device-login-service.ts:37`). Without this, the rule that a risky publish needs a named admin cannot hold in these modes. |

## Not in this program

- LLMR speaking the gateway protocol to Claude Code in place of the gateway.
- Fleet delivery of managed settings to machines (MDM, plist, registry).
- Running or managing Postgres or the identity provider.
- A list of signed-in users or forced sign-out of one user. The gateway offers neither.
- A review of how the rest of LLMR uses Anthropic's names and images. LLMR bundles a Claude Code logo and an Anthropic icon and shows the first in its README. That was raised with the owner on 2026-11-24 as a separate matter.

## Constraints carried into every plan

- A live check proves first that it cannot touch the real home: a scratch `HOME` and `CLAUDE_CONFIG_DIR`, and a before-and-after comparison of the real files.
- No test imports the gateway binary or needs Docker. Unit and integration tests use a fake gateway on `127.0.0.1:0`. The harness is for the proof at the end of a phase.
- English only. One page per view file is not required, but a new view does not go into `providers.tsx`.
- Every new RPC method lands in all of: `contracts/app.ts`, `ipc-channels.ts`, the Electron handler, preload, `electron.d.ts`, `web-client-bridge.ts` and `rpcHandlers`.
- A device login started over the web RPC must be finished by the same process, because pending logins live in memory.
- A feature that depends on the gateway's version (the cost report needs 2.1.317 or later) is used only behind a check that the running gateway has it. Behaviour found in the binary that Anthropic's gateway pages do not describe (the `cri` block, booting without `oidc`) is not built on.
