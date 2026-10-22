# ai-smart-switcher

**One manager for five AI coding CLIs.** `ai-smart-switcher` detects, installs,
authenticates and launches **Claude Code, OpenCode, Freebuff, Devin CLI and
Antigravity CLI** — saves a default model for each — and keeps **one** shared
context file plus **one** shared memory file so every agent starts with the
same instructions.

```bash
npx ai-smart-switcher          # interactive picker — choose an agent, it launches
```

Zero runtime dependencies. Node >= 18. ESM.

## Why

- **Switching costs clicks.** Every CLI has its own login, model menu and flags.
  `sw use opencode`, then `sw run` — done.
- **Context drift wastes tokens.** `CLAUDE.md`, `knowledge.md`, `AGENTS.md` and
  agent-specific files drift apart. `sw context init` makes `AGENTS.md` the
  single source of truth and mirrors it to the two files that need one.
- **Limits hit mid-task.** `sw auto "<task>"` routes to the best available agent
  and automatically retries on the next one when quota, rate limits or auth fail.
- **Memory is scattered.** Every note lives in one file:
  `~/.ai-smart-switcher/memory.md`, searchable by any agent.

## Install

```bash
# one-off, no install
npx ai-smart-switcher status

# or install globally — gives you the short `sw` command
npm install -g ai-smart-switcher
```

On a **global, interactive** install, the postinstall step:

1. wires `/doctor`, `/auto` and `/context` into Claude Code and OpenCode (plus
   Claude Code auto-capture hooks) when those hosts are present;
2. **asks** before npm-installing any missing supported CLI
   (`claude`, `opencode`, `freebuff`);
3. **asks** whether to run `sw auth all` right away.

Nothing is prompted in CI, in non-TTY shells, or with `AI_SWITCHER_NO_PROMPT=1`.
`npx` and local installs stay silent. Postinstall never fails the npm install.
Re-run the wiring anytime with `sw setup`; disable it with `sw setup remove`.

## Commands

| Command | What it does |
|---|---|
| `sw` | Pick a **connected** agent (installed + authenticated) and launch it |
| `sw auto "<task>"` | Classify the task, pick the best agent, auto-switch to the next on quota/rate-limit/auth failure |
| `sw doctor` | Full checkup: installed, connected, exact fix commands, free options |
| `sw context` | Create/sync one `AGENTS.md` and its Claude Code / Freebuff mirrors |
| `sw memory` | Show the single shared memory file (`sw memory search "<q>"`) |

Setup & extras:

| Command | What it does |
|---|---|
| `sw install <cli\|all>` | Install one agent or every missing npm-installable agent |
| `sw auth <cli\|all>` | Authenticate one agent — or all installed agents, one after another (`sw auth all`) |
| `sw use [cli]` | Set the default agent |
| `sw model <cli> [model]` | Save a default model (`sw model claude opus`) |
| `sw run [cli] [prompt]` | Launch an agent with its saved model |
| `sw chain [ids\|auto]` | Pin the fallback order (`sw chain claude,devin,opencode`) or reset it |
| `sw context init` / `show` / `tokens` / `optimize` | Sync mirrors / show memory / token report / shrink context |
| `sw context save "<note>"` / `search "<q>"` | Write to / search the shared memory |
| `sw setup` / `sw setup remove` | Enable / disable Claude Code + OpenCode integrations |
| `sw free` | Free and low-cost options, ranked |

Supported CLI ids — exactly these five: `claude`, `opencode`, `freebuff`,
`devin`, `antigravity`.

## Auto mode — how the switching works

```bash
sw auto "rename the variable x to count"              # light  → free agents first
sw auto "refactor auth and fix the race condition"    # heavy  → strongest first
```

1. **Classify** the prompt by keywords and length: `light`, `medium` or `heavy`.
2. **Build the chain** from the tier's preferred order (or your pinned
   `sw chain`), keeping only CLIs that are installed **and** authenticated.
3. **Run & watch** the output live for `429`, `rate limit`, `quota`,
   `out of credits`, `unauthorized`, `expired`, non-zero exit, …
4. **Switch** to the next CLI in the chain with the same prompt until one
   completes.

Default tier orders:

| Tier | Order |
|---|---|
| light | Freebuff → OpenCode → Antigravity → Claude → Devin |
| medium | Antigravity → Freebuff → OpenCode → Claude → Devin |
| heavy | Claude → Devin → OpenCode → Antigravity → Freebuff |

**Freebuff is excluded at runtime** from `sw auto`: it is an interactive TUI
and accepts no unattended prompt. The other four all support non-interactive
mode (`claude -p`, `opencode run`, `devin -p`, `agy -p`).

## One context file, one memory file

`sw context init` in a project:

1. Creates `AGENTS.md` — read natively by OpenCode, Devin and Antigravity.
   If you already have a `CLAUDE.md` or `knowledge.md`, its content is used as
   the seed (the original is backed up to `.ai-smart-switcher-backup/`).
2. Mirrors it to:
   - `CLAUDE.md` for Claude Code
   - `knowledge.md` for Freebuff (it reads `knowledge.md` first)

On systems that allow symlinks, the mirrors are real symlinks. On Windows
without Developer Mode they are generated copies marked with a comment; every
`sw context` run refreshes them.

Keep `AGENTS.md` under ~1,500 tokens — every line is prepended to every prompt
of every agent. `sw context tokens` reports the size; `sw context optimize`
strips dead weight.

Memory is separate from context and lives in **one** file for all projects:

```
~/.ai-smart-switcher/memory.md

## C:\path\to\project
- 2026-10-22 14:03 · [asked] fix the auth race
- 2026-10-22 14:31 · [done] moved token refresh into auth.js
```

- `sw context save "<note>"` appends to the current project's section
- `sw memory` shows the file; `sw memory search "<q>"` scores notes **and**
  project chunks locally (term-frequency cosine, zero dependencies)
- Claude Code hooks auto-capture prompts and results when `sw setup` is enabled

## The five agents

| Agent | Install | Auth | Free tier |
|---|---|---|---|
| **Claude Code** | `npm i -g @anthropic-ai/claude-code` | `claude` login or `ANTHROPIC_API_KEY` | No — Pro/Max or API key |
| **OpenCode** | `npm i -g opencode-ai` | `opencode auth login` | Yes — open source + Zen free models |
| **Freebuff** | `npm i -g freebuff` | none (ad-funded) | **100% free**, 5 h/day (4 h on VPN) |
| **Devin CLI** | `curl -fsSL https://cli.devin.ai/install.sh \| bash` | `devin auth login` | No — paid plans (~$20/mo) |
| **Antigravity CLI** | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | Google Sign-In | Yes — personal Google account quota |

### Freebuff

[freebuff.com](https://freebuff.com/) — interactive TUI only, no prompt
argument, no API key, no credits. It runs GLM 5.3 Flash, DeepSeek V4.1 Flash
and MiMo v2.6 Flash Fast for 5 hours/day (4 on VPN). Launch it with
`sw run freebuff` and paste your task inside the TUI. Because it cannot run
unattended, `sw auto` never routes to it.

### Notes

- **Claude Code** reads `CLAUDE.md`, not `AGENTS.md` — that is why the mirror exists.
- **OpenCode**, **Devin** and **Antigravity** read `AGENTS.md` natively.
- **Antigravity** (`agy`) is free with a personal Google account; check `/usage`.
  Its consumer terms forbid wrapping `agy` inside another agent.
- **Devin** is installed with the official curl script (no npm package) and is
  authenticated with `devin auth login`.

## Use it inside Claude Code & OpenCode

Global install wires three slash commands into both hosts:

- `/doctor` — checkup, fixes, free agents; `/doctor <cli>` switches the default
- `/auto <task>` — smart routing with automatic fallback
- `/context` — set up the universal `AGENTS.md` and fill it in

They call the globally installed `sw` binary — no `npx` round-trip per command.

Prefer the formal Claude Code plugin? The repo ships a marketplace:

```bash
claude plugin marketplace add /path/to/ai-smart-switcher/plugins
claude plugin install ai-smart-switcher
```

## Config

`~/.ai-smart-switcher/config.json`:

```json
{
  "defaultCli": "claude",
  "models": { "claude": "sonnet", "opencode": "anthropic/claude-sonnet" }
}
```

`AI_SWITCHER_HOME` overrides the state directory (useful for tests or isolated
installs). Legacy `~/.smart-switcher/config.json` and per-project JSON memory
are migrated on first run.

## Development

```bash
node bin/cli.js doctor     # run locally
npm test                   # node --test
```

MIT
