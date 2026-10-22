---
description: Route a task to the best AI CLI with automatic fallback on quota/auth failure
allowed-tools: Bash(sw:*)
---

<!-- ai-smart-switcher -->

Run `sw auto $ARGUMENTS` with the Bash tool. This classifies the task, picks
the best installed+authenticated CLI (Freebuff/Antigravity/OpenCode for light
tasks, Claude Code/Devin for heavy ones) and automatically retries on the next
CLI in the chain if one fails with a quota/rate-limit/auth error.

Relay the streamed output and report which CLI completed the task. If every
CLI failed, run `sw doctor` and tell the user which CLIs need `sw auth` or
`sw install`.
