---
description: Route a task to the best AI CLI with automatic fallback on quota/auth failure
---

Run `npx smart-switcher auto $ARGUMENTS` with the bash tool. It classifies the
task, picks the best installed+authenticated CLI and automatically retries on
the next CLI in the chain on quota/rate-limit/auth failures. Relay the output
and report which CLI completed the task.
