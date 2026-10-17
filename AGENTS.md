# Project context

> Single source of truth for ALL AI coding agents. CLAUDE.md / GEMINI.md /
> QWEN.md are symlinks to this file — edit only AGENTS.md.

## What this project is

smart-switcher: a zero-dependency Node.js CLI (`sw` / `npx smart-switcher`)
that manages AI coding CLIs — detect/install/auth/launch them, save default
models, and keep one shared AGENTS.md context via symlinks.

## Commands

- run locally: `node bin/cli.js <command>` (e.g. `status`, `free`, `context tokens`)
- syntax check: `node --check bin/cli.js src/*.js`

## Structure

- `bin/cli.js` — entry + command dispatch + interactive menu
- `src/registry.js` — data-only registry of supported CLIs (install/auth/model/free facts)
- `src/detect.js` — which/version/auth detection; `src/commands.js` — command impls
- `src/context.js` — AGENTS.md creation, symlinks, token report/optimizer
- `plugins/claude`, `plugins/opencode` — slash-command wrappers for those agents

## Conventions

- ESM, Node >= 18, ZERO runtime dependencies — keep it that way
- terminal UI helpers come from `src/ui.js` (no chalk/inquirer)

## Do not

- add npm dependencies
- edit CLAUDE.md/GEMINI.md/QWEN.md directly (they are symlinks to this file)

## Agent memory (applies to EVERY agent reading this)

- Before reading large files to answer a question, run
  `npx smart-switcher context search "<keywords>"` and use the matched chunk.
- After an important decision or completed task, run
  `npx smart-switcher context save "<one-line summary>"` so other agents know.
