1. Run `npx smart-switcher context init` — creates AGENTS.md and symlinks
   CLAUDE.md/GEMINI.md/QWEN.md/.github/copilot-instructions.md to it.
2. Run `npx smart-switcher context tokens` and report the size.
3. If AGENTS.md has template placeholders, fill them with real, short project
   facts (keep under ~1,500 tokens).
4. With `optimize` as $ARGUMENTS, also run `npx smart-switcher context optimize`.

Shared memory across ALL agents (token saver):
- Before reading large files, run `npx smart-switcher context search "<keywords>"`
  and use the matched chunk instead of whole files.
- After an important decision, run `npx smart-switcher context save "<summary>"`
  so every other agent can find it later.
