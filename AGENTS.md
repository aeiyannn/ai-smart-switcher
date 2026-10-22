# Project context

> Single source of truth for ALL AI coding agents. CLAUDE.md and knowledge.md
> are mirrors of this file — edit only AGENTS.md.

## What this project is

ai-smart-switcher: a zero-dependency Node.js CLI (`sw` / `npx ai-smart-switcher`)
that manages exactly five AI coding CLIs — Claude Code, OpenCode, Freebuff,
Devin CLI and Antigravity CLI. It detects/installs/authenticates them, saves
default models, routes tasks with automatic fallback, and keeps ONE shared
`AGENTS.md` context plus ONE shared memory file (`~/.ai-smart-switcher/memory.md`).

## Commands

- run locally: `node bin/cli.js <command>` (e.g. `status`, `free`, `context tokens`)
- tests: `npm test` (`node --test test/`)
- syntax check: `node --check bin/cli.js` and every `src/*.js`

## Structure

- `bin/cli.js` — entry, help, command dispatch, interactive picker
- `src/registry.js` — data-only registry: claude, opencode, freebuff, devin, antigravity
- `src/detect.js` — which/version/auth detection; `src/commands.js` — command impls
- `src/auto.js` — task classification, tier chains, quota/auth fallback
- `src/context.js` — AGENTS.md source, CLAUDE.md + knowledge.md mirrors, token report
- `src/store.js` — single `memory.md`: save/search/show/autosave
- `src/config.js` — `~/.ai-smart-switcher/config.json` (`AI_SWITCHER_HOME` overrides)
- `scripts/postinstall.js` — optional host wiring on global install
- `plugins/claude`, `plugins/opencode` — slash-command wrappers (call the global `sw`)

## Conventions

- ESM, Node >= 18, ZERO runtime dependencies — keep it that way
- terminal UI helpers come from `src/ui.js` (no chalk/inquirer)
- plugin commands call the globally installed `sw`, never `npx <package>`
- no prompt may run when `CI` / `AI_SWITCHER_NO_PROMPT` is set or stdin is not a TTY

## Do not

- add npm dependencies
- edit CLAUDE.md or knowledge.md directly (they mirror this file)
- re-add Codex, Gemini CLI, Copilot, Qwen, Ollama or Vercel support — the set is fixed

## Agent memory (applies to EVERY agent reading this)

- Before reading large files to answer a question, run
  `sw context search "<keywords>"` and use the matched chunk.
- After an important decision or completed task, run
  `sw context save "<one-line summary>"` so every agent knows.
- The full shared memory lives in one file: `~/.ai-smart-switcher/memory.md`.
