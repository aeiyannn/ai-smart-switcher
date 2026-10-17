# smart-switcher

**One manager for every AI coding CLI.** Stop juggling installs, logins, model
pickers and five different context files. `smart-switcher` detects, installs,
authenticates and launches Claude Code, OpenCode, Gemini CLI, Codex, GitHub
Copilot CLI, Qwen Code, Ollama, Vercel AI Gateway, Devin and Antigravity — and
keeps **one** shared `AGENTS.md` context file so every agent reads the same
instructions without duplicated tokens.

```
npx smart-switcher          # interactive picker — choose an agent, it launches
```

## Why

- **Too many clicks to switch.** Every CLI has its own model menu and login.
  `sw use opencode`, `sw run` — done.
- **Context drift & wasted tokens.** CLAUDE.md, GEMINI.md, QWEN.md,
  copilot-instructions.md all say the same thing (or worse, different things).
  `sw context init` makes `AGENTS.md` the single source of truth and symlinks
  the rest to it. Edit one file; every agent sees it.
- **Free options are scattered.** `sw free` lists every zero-cost way to run a
  coding agent, including a fully local stack.

## Install

```bash
# one-off, no install
npx smart-switcher status

# or install globally — gives you the short `sw` command
npm install -g smart-switcher
```

**Installing it auto-wires Claude Code and OpenCode.** A postinstall step
detects them on your machine and drops `/doctor`, `/auto` and `/context` into
`~/.claude/commands/` and `~/.config/opencode/command/` — no plugin
marketplace, no copying files, zero manual steps. Restart any open session and
the commands are there. Re-run anytime (e.g. after installing OpenCode later)
with `sw setup` — and `sw install opencode` / `sw install claude` runs it for
you automatically.

## Commands

Four commands cover everything:

| Command | What it does |
|---|---|
| `sw` | Pick a **connected** agent (installed + logged in) and launch it |
| `sw auto "<task>"` | **Smart routing**: picks the best agent for the task (free ones first for easy tasks, strongest first for hard ones) and **auto-switches to the next agent** on a quota, rate-limit or auth error |
| `sw doctor` | Full checkup in one place: what's installed, what's logged in, exact fix commands, and free agents you could add |
| `sw context` | Create one `AGENTS.md` (merging existing CLAUDE.md/GEMINI.md/…) and symlink all per-CLI files to it |

Setup & extras:

| Command | What it does |
|---|---|
| `sw install <cli\|all>` | Install an agent via npm/brew (`sw install ollama`) |
| `sw auth <cli\|all>` | Log in to one agent — or all of them, one after another |
| `sw use [cli]` | Set the default agent |
| `sw model <cli> [model]` | Save a default model (`sw model claude opus`) |
| `sw run [cli] [prompt]` | Launch an agent with your saved model |
| `sw chain [ids\|auto]` | Pin the fallback order, e.g. `sw chain claude,gemini,ollama` |
| `sw context tokens` / `optimize` | Token report / shrink the context file |
| `sw setup` | Install `/doctor` `/auto` `/context` + auto-capture hooks into Claude Code, OpenCode & Codex |
| `sw setup remove` | **Disable** it all: removes our commands and hooks, touches nothing else |

Supported CLI ids: `claude`, `opencode`, `gemini`, `codex`, `copilot`, `qwen`,
`ollama`, `vercel`, `devin`, `antigravity`.

## Auto mode — how the switching works

```bash
sw auto "rename the variable x to count"   # → routed to a FREE CLI (light task)
sw auto "refactor auth and fix the race condition"  # → routed to Claude/Codex (heavy)
```

1. **Classify**: keywords + length decide if the task is `light`, `medium` or `heavy`.
2. **Build the chain**: from the tier's preferred order (or your pinned `sw chain`),
   keeping only CLIs that are installed **and** authenticated.
3. **Run & watch**: output streams to you live while smart-switcher watches for
   failure patterns — `429`, `rate limit`, `quota`, `out of credits`,
   `unauthorized`, `expired`, non-zero exit…
4. **Switch**: on failure it instantly relaunches the same prompt on the next
   CLI in the chain, until one completes.

So when your Claude tokens run out mid-day, `sw auto` quietly finishes the job
on Gemini/Antigravity/Ollama instead of stopping you.

## The universal context file

`sw context init` in a project:

1. Creates `AGENTS.md` — the open standard read natively by OpenCode, Codex,
   Copilot, Devin and Antigravity. If you already have a CLAUDE.md/GEMINI.md,
   their content is merged in (originals backed up to `.smart-switcher-backup/`).
2. Symlinks `CLAUDE.md`, `GEMINI.md`, `QWEN.md` and
   `.github/copilot-instructions.md` → `AGENTS.md`.

Result: **one file on disk, zero drift.** Keep it under ~1,500 tokens — every
line is prepended to every prompt of every agent, so a bloated context file is
a tax on all of them. `sw context tokens` tells you where you stand.

## Code for free

```bash
sw free
```

The short version, ranked by generosity (verified October 2026):

1. **Ollama** — 100% free, local, unlimited. Its `ollama launch claude|opencode|codex`
   auto-configures any agent CLI against a local model.
2. **Antigravity CLI (`agy`)** — free with a personal Google account; Google's
   designated free coding CLI (it replaced Gemini CLI's free tier in June 2026).
3. **OpenCode + Zen free models** — `opencode auth login` gives free access to
   GLM-5.3-Flash, DeepSeek V4.1 Flash, Nemotron 3 Ultra (limited-time).
4. **GitHub Copilot CLI** — Copilot Free: 50 premium requests + 2,000 completions/month.
5. **Free API keys usable in any CLI** — Gemini API key (250 req/day, Flash),
   Groq (~1,000 req/day), OpenRouter `:free` models (50 req/day).

⚠️ Dead free tiers you'll still find in old blog posts: Qwen OAuth (ended
Apr 2026), Gemini CLI free OAuth for new users (June 2026), Devin's free
SWE-2 promo (ended Oct 2026).

## Use it inside Claude Code & OpenCode

Installed **automatically** when you `npm install -g smart-switcher` (see above).
In both agents you get three commands:

- `/doctor` — checkup + fixes + free agents to add; `/doctor gemini` switches the default
- `/auto <task>` — smart routing with automatic fallback
- `/context` — set up the universal AGENTS.md and have the agent fill it in

Prefer the formal Claude Code plugin instead of the dropped-in commands? The
repo also ships one:

```bash
claude plugin marketplace add /path/to/smart-switcher/plugins
claude plugin install smart-switcher
```

## Config

`~/.smart-switcher/config.json`:

```json
{
  "defaultCli": "claude",
  "models": { "claude": "sonnet", "opencode": "ollama/qwen3-coder" }
}
```

## Notes on specific CLIs

- **Claude Code** — no free tier (Pro/Max subscription or API key). It reads
  `CLAUDE.md`, *not* AGENTS.md — that's exactly why `sw context init` symlinks
  CLAUDE.md → AGENTS.md.
- **Codex CLI** — requires a paid ChatGPT plan (Plus and up) or an API key.
- **Vercel AI CLI** — `ai-cli` on npm (bin: `ai`) is a generation tool, not a
  coding agent. The useful part for this stack: `npx vercel ai-gateway setup`
  provisions one AI Gateway key and auto-configures your coding CLIs with it.
- **Devin CLI** — real and polished (`curl -fsSL https://cli.devin.ai/install.sh | bash`,
  `devin setup`), reads AGENTS.md natively, but effectively needs a paid plan (~$20/mo).
- **Antigravity CLI** — `agy`, Google's free coding CLI
  (`curl -fsSL https://antigravity.google/cli/install.sh | bash`). Reads AGENTS.md.
  Note: its consumer terms forbid wrapping `agy` inside other agents.
- **Qwen Code** — the CLI is free open source, but the famous "2,000 free
  requests/day" OAuth tier was discontinued in April 2026; pair it with Ollama.

MIT
