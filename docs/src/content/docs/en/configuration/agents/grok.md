---
title: Grok CLI setup and configuration
pageTitle: Grok CLI
eyebrow: Detailed configuration
lead: "Connect Grok CLI to LLMR. Grok CLI is CLI-only and always scoped to LLMR-launched sessions."
---

## Who this is for

Grok CLI is xAI's coding agent. In LLMR it is **CLI only** and always uses **Only opened from LLMR**.

Use this page to route Grok CLI to any LLMR provider or Fusion model, or to run several separate Grok CLI sessions.

> New to LLMR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. LLMR Desktop is running with at least one provider + model configured.
2. Grok CLI is installed (available as `grok` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Grok CLI**.
2. Enter a **Config name** (for example `Grok - Work`).
3. Select a **Model**.
4. Leave advanced environment settings empty unless you have a specific local setup need.
5. **Save**, then copy and run the command from the profile card.

## Configuration reference

Grok CLI is fixed to **Only opened from LLMR** and **CLI only**, so those two fields are not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Grok CLI** | Creates a Grok CLI launch entry in LLMR. |
| Config name | Free text, e.g. `Grok - Work` | Identifies the profile. Commands use `llmr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Model | A provider model or Fusion model | The model Grok CLI uses at startup. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |

## Open and use

Desktop command copied from the profile card:

```text
llmr "Grok - Work"
```

For CLI, run:

```text
llmr "Grok - Work"
```

Inside Grok CLI, use `/model` to switch among the provider and Fusion models LLMR returns; switched requests still go through LLMR.

## Multi-instance

Create separate Grok CLI profiles when you want separate launch entries with different models.

## Verify

1. Run the `llmr` command copied from the profile card.
2. Send one message in Grok CLI and confirm it replies.
3. Open **Request logs** in LLMR and confirm the request passed through the gateway.
4. Run `/model` and confirm the LLMR-exposed models appear.

## Common issues

- **Grok uses your xAI account instead of LLMR:** confirm you launched Grok from the LLMR profile card.
- **`grok` not found:** make sure Grok CLI is installed and available from the same shell environment used to start LLMR Desktop.
- **`/model` shows no LLMR models:** confirm a provider + model is configured in LLMR.
