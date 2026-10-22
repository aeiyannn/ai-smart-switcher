# ai-smart-switcher — Release Guide (v0.2.0)

Everything is built and testable locally. Publishing is manual, from your own
npm/GitHub accounts. Nothing has been published or pushed by this refactor.

---

## What's in the box

```
ai-smart-switcher/
├── bin/cli.js               the `sw` command (entry, help, picker, dispatch)
├── src/
│   ├── registry.js          exactly 5 CLIs: claude, opencode, freebuff, devin, antigravity
│   ├── detect.js            installed? authenticated? (env vars + credential files)
│   ├── commands.js          doctor, install, auth (incl. auth all), use, model, run, free
│   ├── auto.js              task tiers + automatic quota/auth fallback
│   ├── context.js           AGENTS.md source + CLAUDE.md/knowledge.md mirrors
│   ├── store.js             one shared memory.md: save/search/show/autosave
│   ├── config.js            ~/.ai-smart-switcher/config.json + legacy migration
│   ├── setup.js             Claude Code / OpenCode wiring + hooks (and removal)
│   └── ui.js                zero-dependency terminal UI
├── scripts/postinstall.js   global-install prompt (opt-in), host wiring, never fails
├── plugins/
│   ├── claude/              Claude Code: /doctor /auto /context (+ plugin.json)
│   └── opencode/            OpenCode: same commands
├── .claude-plugin/marketplace.json   repo doubles as a Claude plugin marketplace
├── test/smoke.test.js       node:test smoke suite
├── README.md · PUBLISHING.md · AGENTS.md (+ CLAUDE.md/knowledge.md mirrors)
└── LICENSE
```

Zero runtime dependencies. Node >= 18.

---

## 1. Pre-flight (run from the repo root)

```bash
node --check bin/cli.js
node --check scripts/postinstall.js
node --check src/*.js
npm test
npm pack --dry-run
node bin/cli.js doctor
```

Also verify the context engine in a throwaway directory:

```bash
mkdir /tmp/sw-test && cd /tmp/sw-test
node /path/to/ai-smart-switcher/bin/cli.js context init
# expect: AGENTS.md created, CLAUDE.md + knowledge.md mirrors created
```

And confirm no stale references remain:

```bash
# should return nothing outside changelog/history text
rg -n "gemini|qwen|copilot|ollama|vercel|codex" --glob '!node_modules' .
rg -n "npx smart-switcher" .
```

---

## 2. Publish to npm

```bash
npm login
npm publish
```

Verify as a stranger:

```bash
npx ai-smart-switcher@latest doctor
```

On a **global interactive** install the postinstall asks before installing any
missing supported CLI and before running `sw auth all`. It also wires
`/doctor`, `/auto`, `/context` into Claude Code and OpenCode when present.
Users disable that wiring anytime with `sw setup remove`.

**Updates later:**

```bash
npm version patch   # 0.2.0 -> 0.2.1
npm publish
```

---

## 3. Claude Code plugin (optional)

The npm package already provides the integration through postinstall. To publish
the formal plugin marketplace:

1. `package.json` already points at `github.com/aeiyannn/ai-smart-switcher`.
2. Create the public repo if it does not exist.
3. Push this folder:
   ```bash
   git init
   git add -A
   git commit -m "ai-smart-switcher v0.2.0"
   git remote add origin https://github.com/aeiyannn/ai-smart-switcher.git
   git push -u origin main
   ```
4. Users install with:
   ```bash
   claude plugin marketplace add aeiyannn/ai-smart-switcher
   claude plugin install ai-smart-switcher@ai-smart-switcher
   ```

The plugin commands call the globally installed `sw` binary, so users should
`npm install -g ai-smart-switcher` first.

---

## 4. OpenCode

OpenCode has no central marketplace — npm is the distribution. Postinstall copies
the commands into `~/.config/opencode/command/`. Manual install:

```bash
cp plugins/opencode/command/*.md ~/.config/opencode/command/
```

Codex support was removed in 0.2.0; `sw setup` cleans up any prompt files it
previously wrote to `~/.codex/prompts`.

---

## What changed in 0.2.0

- Renamed the package to **ai-smart-switcher**; bins are `ai-smart-switcher` and `sw`.
- Supported set reduced to exactly **Claude Code, OpenCode, Freebuff, Devin, Antigravity**.
- One context source (`AGENTS.md`) with two mirrors (`CLAUDE.md`, `knowledge.md`).
- One shared memory file (`~/.ai-smart-switcher/memory.md`) instead of per-project JSON.
- `sw auth all` for one-shot authentication of every installed agent.
- Freebuff added: no auth, 100% free, interactive TUI, excluded from `sw auto`.
- Auto-fallback understands more quota/auth error shapes and uses each CLI's
  non-interactive mode (`autoArgs`).
- Plugin/hook commands use the global `sw` binary, not `npx <package>`.
- Postinstall now asks before global installs/auth; silent in CI and non-TTY.
- Legacy state and legacy mirror files are migrated/cleaned automatically.

---

## Checklist

- [ ] `npm test` passes
- [ ] `npm pack --dry-run` contains no `.tgz`, no `node_modules`, no backups
- [ ] `node bin/cli.js context init` in a temp dir creates `AGENTS.md` + both mirrors
- [ ] `sw context save` then `sw memory search` returns the note
- [ ] postinstall is silent under `AI_SWITCHER_NO_PROMPT=1`
- [ ] `npm publish`
- [ ] `npx ai-smart-switcher@latest doctor`
- [ ] (optional) push the GitHub repo and plugin marketplace
