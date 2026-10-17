---
description: Route a task to the best AI CLI with automatic fallback on quota/auth failure
allowed-tools: Bash(npx smart-switcher:*)
---

Run `npx smart-switcher auto $ARGUMENTS` with the Bash tool. This classifies
the task, picks the best installed+authenticated CLI (free ones for light
tasks, strongest for heavy ones) and automatically retries on the next CLI in
the chain if one fails with a quota/rate-limit/auth error.

Relay the streamed output and report which CLI completed the task. If every
CLI failed, run `npx smart-switcher status` and tell the user which CLIs need
`sw auth` or `sw install`.
