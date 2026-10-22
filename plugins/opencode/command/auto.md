---
description: Route a task to the best AI CLI with automatic fallback on quota/auth failure
---

<!-- ai-smart-switcher -->

Run `sw auto $ARGUMENTS` with the bash tool. It classifies the task, picks the
best installed+authenticated CLI and automatically retries on the next CLI in
the chain on quota/rate-limit/auth failures. Freebuff is skipped in auto mode
because it is an interactive TUI. Relay the output and report which CLI
completed the task.
