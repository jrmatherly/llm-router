---
title: Extension mechanism
pageTitle: Extension mechanism
eyebrow: Extensions
lead: Learn how LLMR extensions are loaded, what they can register, and how to create, install, and debug your own extension.
---

## Extension types

LLMR has two extension layers:

| Type | Config location | Runtime | Good for |
| --- | --- | --- | --- |
| Wrapper plugin | `plugins` | LLMR Desktop's Electron wrapper process | Local HTTP routes, local backends, proxy capture routing, built-in browser entries, provider account meters |
| Core gateway plugin | `providerPlugins` or `plugins[].coreGateway.providerPlugins` | core gateway runtime | Upstream providers, auth methods, or internal core gateway behavior |

Most custom extensions should start as a Wrapper plugin. It receives LLMR config, a private data directory, a logger, and registration helpers through `ctx`.

`plugins[]` is the install unit for an extension package. One package can expose three independent runtime surfaces:

| Surface | Config key | What it enables |
| --- | --- | --- |
| App | `surfaces.apps` | Built-in browser entries from `apps` or `ctx.registerApp` |
| Gateway | `surfaces.gateway` | Gateway routes, proxy routes, HTTP backends, core gateway config, and virtual model config |
| Provider | `surfaces.provider` | Core provider plugins and provider account connectors |

For backward compatibility, all three surfaces are enabled by default. You can set a surface to `false` to keep the package installed but disable that capability. A static App entry can declare only `apps` without configuring `module`; a dynamic App entry can still be registered from JavaScript through the App surface, and must declare `trusted-code`.

## Loading flow

When the gateway starts, LLMR reads the `plugins` array and processes each extension whose `enabled !== false` in order:

1. It first applies config per enabled surface: `apps` for the App surface; `proxy.routes`, `coreGateway.virtualModelProfiles`, and `coreGateway.config` for the Gateway surface; and `coreGateway.providerPlugins` for the Provider surface.
2. When any enabled surface needs JavaScript to register capabilities, the extension module is loaded. `module` must resolve to a concrete local JavaScript file path — for example an absolute path, a `~/` path, or a `./...` path relative to the LLMR config directory.
3. Any extension that loads JavaScript through `module` must explicitly declare the `trusted-code` permission. The permission is not an OS-level sandbox; it scopes the LLMR plugin API and makes the "executing local code" trust boundary explicit.
4. If no `module` is configured, LLMR no longer loads a built-in fallback extension.
5. A module can export a function, or an object containing `setup(ctx)` or `activate(ctx)`.
6. On stop, LLMR runs `stop` and `onStop` hooks in reverse order, then closes the HTTP backends and SQLite stores registered by that extension.

Common module shapes:

```js
"use strict";

module.exports = {
  async setup(ctx) {
    ctx.logger.info("extension loaded");
  },
  async stop() {
    // Optional: release resources owned by the extension.
  }
};
```

You can also export the setup function directly:

```js
"use strict";

module.exports = async function setup(ctx) {
  ctx.logger.info(`loaded ${ctx.pluginId}`);
};
```

`setup(ctx)` or `activate(ctx)` can call `ctx.register...` methods directly, or return a registration object. Returned registrations support `apps`, `gatewayRoutes`, `proxyRoutes`, `providerAccountConnectors`, `coreGateway`, `virtualModelProfiles`, `stop`, and `onStop`.

## ctx reference

`setup(ctx)` receives these common fields and helpers:

| Field or method | Description |
| --- | --- |
| `ctx.pluginId` | Current plugin ID |
| `ctx.pluginConfig` | Custom value from `plugins[].config` |
| `ctx.config` | Current LLMR AppConfig snapshot |
| `ctx.logger` | `debug/info/warn/error` logger prefixed with `[plugin:<id>]` |
| `ctx.paths.configDir` | LLMR config directory |
| `ctx.paths.dataDir` | LLMR data directory |
| `ctx.paths.pluginDataDir` | Private data directory for this plugin |
| `ctx.registerGatewayRoute(route)` | Register a local HTTP route on the LLMR gateway |
| `ctx.registerHttpBackend(backend)` | Start a local HTTP backend and return `{ url, host, port }` |
| `ctx.registerProxyRoute(route)` | Route proxy-captured host/path traffic to a plugin backend or another upstream |
| `ctx.registerApp(app)` | Add an entry to the built-in browser app list |
| `ctx.openSqliteStore(options)` | Open a SQLite store under the plugin data directory |
| `ctx.registerProviderAccountConnector(connector)` | Register a provider balance or quota connector |
| `ctx.registerCoreGatewayProviderPlugin(plugin)` | Inject a provider plugin into the core gateway |
| `ctx.registerCoreGatewayVirtualModelProfile(profile)` | Inject a virtual model profile into the core gateway |

Provider account connector `resolve(request)` receives `request.fetchProviderAccountJson({ endpoint, method, requestOrigin, credentials, headers, body, timeoutMs })`. It runs the request through LLMR Desktop's built-in browser session, so `credentials: "include"` can send browser cookies for same-origin account APIs.

Gateway route handlers also receive helper functions:

| Helper | Description |
| --- | --- |
| `helpers.readBody(request)` | Read request body as a `Buffer` |
| `helpers.readJson(request)` | Read and parse JSON request body |
| `helpers.sendJson(response, statusCode, body)` | Send a JSON response |

`registerGatewayRoute` defaults to `auth: "gateway"`. If LLMR has API keys configured, requests must include `Authorization: Bearer <key>` or `x-api-key: <key>`. Use `auth: "none"` only for debugging or local public status routes.

## Create your first extension

Create a directory such as `~/llmr-extensions/hello-extension`:

```text
hello-extension/
  plugin.json
  index.cjs
```

`plugin.json` lets LLMR's local extension picker discover the extension ID, name, and entrypoint:

```json
{
  "id": "hello-extension",
  "name": "Hello Extension",
  "module": "index.cjs",
  "surfaces": ["apps", "gateway"],
  "permissions": ["trusted-code", "apps", "gateway-routes", "http-backends", "proxy-routes"],
  "apps": [
    {
      "id": "hello-status",
      "name": "Hello Status",
      "url": "http://127.0.0.1:3456/plugins/hello"
    }
  ]
}
```

`index.cjs` registers a status route, an echo backend, and one proxy route:

```js
"use strict";

module.exports = {
  async setup(ctx) {
    ctx.registerGatewayRoute({
      auth: "none",
      id: "hello-status",
      method: "GET",
      path: "/plugins/hello",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          ok: true,
          plugin: ctx.pluginId,
          message: ctx.pluginConfig?.message || "hello from LLMR"
        });
      }
    });

    const backend = await ctx.registerHttpBackend({
      id: "hello-echo",
      async handler(request, response, helpers) {
        const body = request.method === "POST"
          ? (await helpers.readBody(request)).toString("utf8")
          : "";

        helpers.sendJson(response, 200, {
          method: request.method,
          path: request.url,
          body
        });
      }
    });

    ctx.registerProxyRoute({
      host: "api.example.local",
      id: "hello-example-api",
      paths: ["/v1"],
      preserveHost: true,
      upstream: backend.url
    });

    ctx.logger.info(`hello backend listening at ${backend.url}`);
  }
};
```

This exposes:

- `GET /plugins/hello`: a route mounted directly on the LLMR gateway to verify that the plugin loaded.
- A local echo backend: LLMR assigns a free port automatically.
- A proxy rule: proxy-captured `api.example.local/v1...` traffic is forwarded to the echo backend.

## Install the extension

The recommended flow is through the desktop UI:

1. Open **Extensions**.
2. Add an extension and choose a local extension directory.
3. Select the `hello-extension` directory.
4. Save the config.
5. Open **Server** and restart the gateway.

LLMR stores runtime configuration in SQLite. Add extensions through the UI; the legacy JSON config file is kept here only as a reference. The extension entry has this shape:

```json
{
  "plugins": [
    {
      "id": "hello-extension",
      "enabled": true,
      "module": "/Users/you/llmr-extensions/hello-extension/index.cjs",
      "surfaces": { "apps": true, "gateway": true, "provider": false },
      "permissions": ["trusted-code", "apps", "gateway-routes", "http-backends", "proxy-routes"],
      "config": {
        "message": "hello from my config"
      }
    }
  ]
}
```

Restart the gateway after saving the extension config. See [Config database location](/en/configuration/configuration-file/).

The local directory picker recognizes entry metadata from:

- `plugin.json`
- `llmr-plugin.json`
- `.llmr-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `main`, `llmr.module`, or `llmrPlugin.module` in `package.json`

If no entrypoint is declared, LLMR tries `index.cjs`, `index.mjs`, `index.js`, `plugin.cjs`, `plugin.mjs`, or `plugin.js` in the selected directory.

## Debug extensions

### 1. Check syntax first

For CommonJS extensions:

```bash
node --check ~/llmr-extensions/hello-extension/index.cjs
```

If the extension depends on npm packages, install them in the extension directory and make sure Node can resolve the entrypoint.

### 2. Start LLMR from source

From the LLMR repository root:

```bash
npm install
npm run dev
```

`ctx.logger.info/warn/error` output appears in the terminal that started LLMR, with a prefix such as `[plugin:hello-extension]`.

### 3. Verify the Gateway route

After the gateway starts, request the status route:

```bash
curl http://127.0.0.1:3456/plugins/hello
```

If the route uses the default `auth: "gateway"` and LLMR has API keys configured:

```bash
curl -H "Authorization: Bearer <LLMR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

You can also use:

```bash
curl -H "x-api-key: <LLMR_API_KEY>" http://127.0.0.1:3456/plugins/hello
```

### 4. Verify the HTTP backend and proxy route

`registerHttpBackend` returns `backend.url`, which the example writes to logs. Request that URL directly first, then enable proxy mode and verify whether the target host/path hits `registerProxyRoute`.

Proxy route matching rules:

- `host` must match the target hostname. Exact host, `.example.com` suffix, and `*.example.com` wildcard patterns are supported.
- Empty `paths` matches all paths for that host.
- When multiple paths match, LLMR chooses the longest path prefix.
- `stripPathPrefix` removes the matched prefix from the forwarded path.
- `rewritePathPrefix` replaces the matched prefix with a configured prefix.

### 5. Common issues

| Symptom | What to check |
| --- | --- |
| Extension does not load | Check `plugins[].enabled`, `plugins[].module`, and terminal errors prefixed with `[plugin:<id>]` |
| `GET /plugins/hello` returns 404 | Restart the gateway and confirm `path` or `pathPrefix` starts with `/` |
| Response is 401 | Routes require gateway API key by default; set `auth: "none"` for debug routes |
| Code changes do not apply | Wrapper plugins reload when the gateway restarts; only restart LLMR if the process is stuck |
| Port is already in use | Omit `port` in `registerHttpBackend` so LLMR can allocate one automatically |
| Proxy route misses requests | Confirm proxy mode is enabled, the certificate is installed, and host matches the real request hostname |

## Security notes

- Use `auth: "none"` only for status pages, health checks, or local debugging routes.
- Do not log API keys, OAuth tokens, cookies, or complete request headers.
- Prefer `ctx.paths.pluginDataDir` for files written by your extension.
- Validate all external input returned by `readJson`.
- When proxying to external upstreams, handle headers explicitly so local auth material is not forwarded to untrusted services.

## Distribution and marketplace manifests

**Installing a local directory is a supported distribution method.** Ship `plugin.json`, the JavaScript entry, and runtime dependencies in a ZIP or repository. Users unpack it, select **Extensions → Install local directory**, review surfaces and permissions, save, and restart the gateway. Keep the directory in place: LLMR loads it directly. Install dependencies beforehand or bundle them. Release attachments are optional.

The default marketplace is `marketplace/plugins.json` in [jrmatherly/llm-router-extensions](https://github.com/jrmatherly/llm-router-extensions). It starts empty, so the Extensions page lists nothing from it until plugins are published there; local installation works regardless. When the manifest cannot be fetched, LLMR falls back to its cached catalog, or an empty list when no cache exists.

See the [canonical authoring JSON Schema](/schemas/plugin-marketplace.schema.json). It documents the recommended fields; the runtime also accepts legacy field aliases. A minimal marketplace repository looks like this:

```text
marketplace/plugins.json
plugins/example-usage/index.cjs
```

For `marketplace/plugins.json`, a provider usage connector entry can be:

```json
{
  "plugins": [{
    "id": "example-usage",
    "name": "Example account usage",
    "description": "Provider account usage connector",
    "module": "../plugins/example-usage/index.cjs",
    "surfaces": { "apps": false, "gateway": false, "provider": true },
    "permissions": ["trusted-code", "provider-account-connectors"]
  }]
}
```

Catalogs and modules require HTTPS. Relative module paths resolve against the catalog URL. Modules must be `.cjs`, `.mjs`, or `.js` files with dependencies bundled: the downloader fetches one file without installing npm packages or neighboring files. Distribute multi-file extensions as a local directory instead. Prefer an `integrity` field containing the module's actual 64-character hexadecimal SHA-256 or `sha256-<base64>` digest; update it whenever the module changes. Compute it with `shasum -a 256 index.cjs`.

`dependencies` lists plugin IDs or objects with `id`, `module`, `integrity`, `permissions`, and `surfaces`; these are plugin dependencies, not npm packages. `apps` contains entries such as `{ "id": "status", "name": "Status", "url": "/plugins/status" }`; app-only entries can omit `module`. `capabilities` is a string array. Set `LLMR_PLUGIN_MARKETPLACE_URL` before starting LLMR to use your own HTTPS catalog.

### External CLIs in desktop plugins

A desktop process may have a different PATH from a terminal. Support explicit executable paths and check their existence. For a confirmed Node.js entry script, use `process.execPath` and set `ELECTRON_RUN_AS_NODE=1` when running in Electron. Run native executables directly. Pass arguments as an array to `execFile` or `spawn`; avoid putting credentials in shell strings or logs.
