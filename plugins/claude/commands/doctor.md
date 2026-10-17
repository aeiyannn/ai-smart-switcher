---
description: Checkup of all AI CLIs — installed, logged in, fixes, free options, switch default
allowed-tools: Bash(npx smart-switcher:*)
---

Run `npx smart-switcher doctor` with the Bash tool and relay the result in a
clean, simple way: which agents are connected, which need fixing (and the exact
command to fix them), and which free agents the user could add.

If the user passed arguments ($ARGUMENTS):
- a CLI name (claude, opencode, gemini, codex, copilot, qwen, ollama…) → run
  `npx smart-switcher use $ARGUMENTS` to make it the default agent.
- `<cli> <model>` → run `npx smart-switcher model <cli> <model>` to save that
  model as the CLI's default.
