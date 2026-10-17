---
description: Create/sync ONE universal context file (AGENTS.md) shared by every AI CLI
allowed-tools: Bash(npx smart-switcher:*), Read, Edit
---

Set up the universal context for this project:

1. Run `npx smart-switcher context init` with the Bash tool. This creates
   AGENTS.md (merging any existing CLAUDE.md/GEMINI.md/QWEN.md content) and
   symlinks CLAUDE.md, GEMINI.md, QWEN.md and .github/copilot-instructions.md
   to it, so every AI CLI reads the same single file.
2. Run `npx smart-switcher context tokens` and report the token size.
3. If AGENTS.md still contains template placeholders like `<one or two sentences>`,
   read the project (package.json, README, main source dirs) and fill the
   placeholders in AGENTS.md with real, SHORT content. Keep the whole file under
   ~1,500 tokens — every line is prepended to every prompt of every agent.
4. If the user passed `optimize` as $ARGUMENTS, also run
   `npx smart-switcher context optimize` and report the token savings.

Shared memory across ALL agents (token saver):
- Before reading large files to answer a question, try
  `npx smart-switcher context search "<keywords>"` — it instantly returns the
  most relevant chunks (project files + notes saved by any agent). Use the
  matched chunk instead of loading whole files.
- After an important decision or discovery, run
  `npx smart-switcher context save "<one-line summary>"` so OpenCode, Gemini
  and every other agent can find it later.
