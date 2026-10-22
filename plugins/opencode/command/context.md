---
description: Create/sync ONE universal context file (AGENTS.md) shared by every AI CLI
---

<!-- ai-smart-switcher -->

1. Run `sw context init` — creates AGENTS.md and mirrors CLAUDE.md (Claude Code)
   and knowledge.md (Freebuff) to it. OpenCode, Devin and Antigravity read
   AGENTS.md natively.
2. Run `sw context tokens` and report the size.
3. If AGENTS.md has template placeholders, fill them with real, short project
   facts (keep under ~1,500 tokens).
4. With `optimize` as $ARGUMENTS, also run `sw context optimize`.

Shared memory across ALL agents (token saver):
- Before reading large files, try `sw context search "<keywords>"` and use the
  matched chunk instead of whole files.
- After an important decision, run `sw context save "<summary>"` so every other
  agent can find it later.
