---
description: Create/sync ONE universal context file (AGENTS.md) shared by every AI CLI
allowed-tools: Bash(sw:*), Read, Edit
---

<!-- ai-smart-switcher -->

Set up the universal context for this project:

1. Run `sw context init` with the Bash tool. This creates AGENTS.md (merging
   any existing CLAUDE.md/knowledge.md content) and mirrors CLAUDE.md (Claude
   Code) and knowledge.md (Freebuff) to it. OpenCode, Devin and Antigravity
   read AGENTS.md natively — one file for every agent.
2. Run `sw context tokens` and report the token size.
3. If AGENTS.md still contains template placeholders like `<one or two sentences>`,
   read the project (package.json, README, main source dirs) and fill the
   placeholders in AGENTS.md with real, SHORT content. Keep the whole file under
   ~1,500 tokens — every line is prepended to every prompt of every agent.
4. If the user passed `optimize` as $ARGUMENTS, also run `sw context optimize`
   and report the token savings.

Shared memory across ALL agents (token saver):
- Before reading large files to answer a question, try
  `sw context search "<keywords>"` — it instantly returns the most relevant
  chunks (project files + notes saved by any agent). Use the matched chunk
  instead of loading whole files.
- After an important decision or discovery, run
  `sw context save "<one-line summary>"` so Claude Code, OpenCode, Freebuff,
  Devin and Antigravity can find it later.
