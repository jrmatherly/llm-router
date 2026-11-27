---
title: Logs and observability
pageTitle: Logs and observability
eyebrow: Detailed configuration
lead: "This page is the configuration reference for logging and observability: configure Request logs and Agent observability to inspect request details, execution traces, tool calls, tool results, and performance. For first-run verification of the pipeline, see [Enable logging and observability](../../guides/observability/)."
---

## How to enable

Open **Settings → Logs & Observability**:

1. Enable **Request logs** to record LLMR request details, and set **Keep request logs for (days)** to how long they are kept.
2. Enable **Agent observability** to populate the Observability page with agent execution traces.

## View the Observability page

Enable **Agent observability** when you need to inspect an agent's execution trace and performance. The Observability page shows which step called which tool, what result the tool returned, how long each step took, and where an agent may have stalled or failed.

It helps diagnose agents getting stuck, unexpected tool results, slow steps, or context flow that does not match expectations. Request logs provide the request body, response body, and error details for individual model requests.

## Request logs

Request logs record model request details passing through LLMR, including request time, request ID, client, path, requested model, resolved provider and model, credential, status code, success state, duration, tokens, cost estimate, request headers, request body, response headers, response body, and errors.

The Logs page supports filtering by status, provider, model, credential, request ID, model name, request body, or response body. A single record shows the main request and response fields, including `request model`, `resolved provider`, `resolved model`, status code, response body, errors, duration, tokens, and cost estimate.

Regular request logs are kept locally for 7 days by default. Change this under **Settings → Logs & Observability → Keep request logs for (days)**, from 1 to 90 days. Days are counted by local date, and today is kept on top of the setting: 1 keeps today's and yesterday's requests, 7 keeps today's and the 7 days before, so every date filter on the Logs page that the setting allows shows its full window. Lowering the setting deletes older logs as soon as it is saved, and they cannot be recovered. They are useful for troubleshooting, not long-term audit archiving.

## Body capture, sampling and retention

Request logs are governed by four low-level config options (the defaults fit most cases):

| Option | Default | Description |
| --- | --- | --- |
| `requestLogRetentionDays` | `7` | Number of days request logs are kept, from `1` to `90`. `1` keeps today's and yesterday's requests. A stored value that is not a whole number from `1` to `90` is read as `90`, with a warning. |
| `requestLogBodyCapture` | `all` | Whether to record request and response bodies: `all` records all, `errors` records bodies only for failed requests, `none` records no bodies. |
| `requestLogMaxBodyBytes` | `52428800` (50 MiB) | In-memory body capture and preview budget for a single request or response body. File-backed raw trace bodies can exceed this limit; the full body is stored in sidecar storage and loaded on demand from the Logs page. |
| `requestLogSuccessSampleRate` | `1` | Sampling rate for successful requests, between `0` and `1`. `1` records all, `0.1` records roughly one in ten. |
