---
description: Checkup of all AI CLIs — installed, connected, fixes, free options, switch default
allowed-tools: Bash(sw:*)
---

<!-- ai-smart-switcher -->

Run `sw doctor` with the Bash tool and relay the result in a clean, simple way:
which agents are connected, which need fixing (and the exact command to fix
them), and which free agents the user could add.

If the user passed arguments ($ARGUMENTS):
- a CLI name (claude, opencode, freebuff, devin, antigravity) → run
  `sw use $ARGUMENTS` to make it the default agent.
- `<cli> <model>` → run `sw model <cli> <model>` to save that model as the
  CLI's default.
