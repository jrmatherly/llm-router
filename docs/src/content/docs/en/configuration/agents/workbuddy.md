---
title: WorkBuddy setup and configuration
pageTitle: WorkBuddy
eyebrow: Detailed configuration
lead: "Connect WorkBuddy to LLMR. WorkBuddy is App-only in LLMR."
---

## Prerequisites

1. LLMR Desktop is running with at least one provider + model configured.
2. WorkBuddy is installed on this machine. If LLMR cannot detect it, set **APP_PATH** to the WorkBuddy executable.
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **WorkBuddy**.
2. Enter a **Config name** (for example `WorkBuddy - Work`).
3. Confirm the **WorkBuddy model**.
4. Optionally restrict **Allowed model list**. Leaving it empty makes every LLMR model available in WorkBuddy.
5. Set **APP_PATH** only if auto-detection does not find WorkBuddy.
6. If you use AgentClaw, bind a **Bot**.
7. **Save**, then open WorkBuddy from LLMR with the play button.

## Configuration reference

WorkBuddy is fixed to **App only**, so the entry mode is not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **WorkBuddy** | Creates a WorkBuddy App launch entry in LLMR. |
| Config name | Free text, e.g. `WorkBuddy - Work` | Identifies the profile. Commands use `llmr "<name>" app`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from LLMR` / `System default` | Keeps the profile limited to LLMR launches, or makes it the system-default WorkBuddy profile. Only one enabled system-default WorkBuddy profile is allowed. |
| Provider reference | Not editable | LLMR registers itself in WorkBuddy as `llm-router` (`claude-code-router` in profiles made before the rename) with the display name `LLM Router`. |
| WorkBuddy model | A provider model or Fusion model | Default model when WorkBuddy App opens. |
| Allowed model list | Optional multi-select | Controls which LLMR models appear in WorkBuddy. Empty means all models. |
| APP_PATH | Optional executable path | Overrides app auto-detection. Use it when WorkBuddy is installed in a custom location. |
| Config file | Path | Used for the system-default WorkBuddy profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |
| Bot | Select a saved Bot | Binds an AgentClaw IM bot to the WorkBuddy App entry. |

## Model list behavior

WorkBuddy's model settings follow the profile's **Allowed model list**:

- If **Allowed model list** has selections, only those models are written.
- If **Allowed model list** is empty, every LLMR model is available.
- The selected **WorkBuddy model** is used as the default model.

After changing providers or model lists, reopen WorkBuddy from LLMR. If the WorkBuddy settings window is already open, close and reopen that window to refresh the list.

## Open and use

Click the play button on the profile card to open WorkBuddy with this profile's model, provider, and model list. Reopening the same profile activates the existing window.

Desktop App command copied from the profile card:

```text
llmr "WorkBuddy - Work" app
```

For CLI, run:

```text
llmr "WorkBuddy - Work" app
```

## Multi-instance

Create separate WorkBuddy profiles when you want different model lists or providers.

## AgentClaw (Bot)

With a Bot bound and WorkBuddy opened from LLMR, WorkBuddy can relay activity through the selected IM channel. Closing WorkBuddy takes the relay offline. See [AgentClaw](/en/agentclaw/) for the full IM setup.

## Verify

1. Open WorkBuddy from LLMR.
2. Open WorkBuddy **Models** settings and confirm the expected models are listed.
3. Send one message and confirm it replies.
4. Open **Request logs** in LLMR and confirm the request passed through the gateway.

## Common issues

- **Only one model appears:** apply the WorkBuddy profile again and reopen WorkBuddy from LLMR. Empty **Allowed model list** means all LLMR models should be available.
- **Requests bypass LLMR:** confirm the profile is **Enabled** and you opened WorkBuddy from LLMR; reopen it from LLMR if it was already running.
- **Wrong model in the App:** confirm the **WorkBuddy model** field and the model list in WorkBuddy settings.
- **WorkBuddy was not found:** set **APP_PATH** to the WorkBuddy executable.
