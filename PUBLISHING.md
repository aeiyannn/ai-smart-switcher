# smart-switcher — Final Release Guide (v0.1.0)

Everything is built, tested, and packed. This file is the complete manual for
submitting to **npm**, **Claude Code**, and **OpenCode** — all steps run by
YOU, from your own accounts, whenever you choose. Nothing has been published
or pushed anywhere yet.

---

## What's in the box

```
smart-switcher/
├── bin/cli.js               the sw command (entry, menu, dispatch)
├── src/
│   ├── registry.js          10 supported AI CLIs (install/auth/model/free facts)
│   ├── detect.js            installed? authenticated? (env vars + cred files)
│   ├── commands.js          doctor, install, auth, use, model, run
│   ├── auto.js              smart routing + auto-fallback on quota/auth errors
│   ├── context.js           AGENTS.md + symlinks + token report/optimizer
│   ├── store.js             shared memory: save/search/autosave (term vectors)
│   ├── setup.js             installs/removes host integrations + hooks
│   └── ui.js                zero-dep terminal UI (colors, table, picker)
├── scripts/postinstall.js   auto-wires hosts on npm install
├── plugins/
│   ├── claude/              Claude Code: /doctor /auto /context (+ plugin.json)
│   ├── opencode/            OpenCode: same commands
│   └── codex/               Codex CLI: same as custom prompts
├── .claude-plugin/marketplace.json   repo doubles as a Claude plugin marketplace
├── README.md · PUBLISHING.md · LICENSE · package.json
└── smart-switcher-0.1.0.tgz          ready-to-publish npm tarball
```

Zero runtime dependencies. Node >= 18.

---

## 1. Submit to npm

```bash
cd ~/Desktop/smart-switcher
npm login                 # browser opens — use YOUR npm account
npm publish               # name "smart-switcher" was free as of Oct 17, 2026
```

Then verify like a stranger would:

```bash
npx smart-switcher@latest doctor
```

Installing the package auto-wires Claude Code, OpenCode and Codex on any
machine (slash commands + auto-capture hooks). Users disable it anytime with
`sw setup remove`.

**Updates later:** bump and republish —

```bash
npm version patch         # 0.1.0 -> 0.1.1
npm publish
```

---

## 2. Submit to Claude Code (plugin)

Two ways — the second needs a GitHub repo, which you will create yourself
when ready (none was created for you).

**A. Zero-effort (already works):** the npm package from step 1 IS the Claude
Code integration — postinstall drops `/doctor`, `/auto`, `/context` into
`~/.claude/commands/` and the auto-capture hooks into settings. Nothing more
to submit.

**B. Formal plugin marketplace (optional):**

1. In `package.json`, replace `YOUR_GITHUB_USERNAME` with your GitHub username.
2. Create an empty PUBLIC repo named `smart-switcher` on github.com.
3. From this folder:
   ```bash
   git init
   git add -A
   git commit -m "smart-switcher v0.1.0"
   git remote add origin https://github.com/YOUR_USERNAME/smart-switcher.git
   git push -u origin main
   ```
4. The repo root already has `.claude-plugin/marketplace.json`, so the repo
   itself is the marketplace. Anyone installs with:
   ```bash
   claude plugin marketplace add YOUR_USERNAME/smart-switcher
   claude plugin install smart-switcher@smart-switcher
   ```

---

## 3. Submit to OpenCode

OpenCode has no central marketplace — the npm package is the distribution.
Postinstall copies `/doctor`, `/auto`, `/context` into
`~/.config/opencode/command/` automatically. Mention in your npm/GitHub
description: "Works inside OpenCode out of the box."

Manual install for anyone who wants only the OpenCode part:

```bash
cp plugins/opencode/command/*.md ~/.config/opencode/command/
```

(Codex CLI works the same way via `~/.codex/prompts/` — also automatic.)

---

## Pre-flight checklist (all already verified on this machine)

- [x] `node --check` passes on every file
- [x] `npm pack` builds clean (23+ files, ~20 kB, zero deps)
- [x] `npx ./smart-switcher-0.1.0.tgz doctor` runs
- [x] postinstall auto-wires Claude Code + OpenCode (tested live)
- [x] `sw setup remove` cleanly disables everything (tested live)
- [x] auto-fallback proven with simulated 429 quota failure
- [x] context symlinks + merge + token report tested in fresh folders
- [x] autosave hooks pipe-tested with real payload shapes

Your to-dos, in order:

1. [ ] `npm login` → `npm publish`
2. [ ] (optional) replace `YOUR_GITHUB_USERNAME` in package.json, create repo, push
3. [ ] test as a stranger: `npx smart-switcher doctor`
