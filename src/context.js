// Universal context file management.
//
// Strategy: AGENTS.md (the open standard) is the single source of truth.
// Every other per-CLI file (CLAUDE.md, GEMINI.md, QWEN.md,
// .github/copilot-instructions.md) becomes a symlink to it, so:
//   - you edit ONE file,
//   - every CLI reads the SAME instructions,
//   - no drift, no duplicated tokens across files.
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync,
  renameSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { c, fail, heading, info, ok, warn } from './ui.js';

export const SOURCE = 'AGENTS.md';

// target file -> relative symlink destination from that file's directory
export const MIRRORS = [
  { file: 'CLAUDE.md', cli: 'Claude Code' },
  { file: 'GEMINI.md', cli: 'Gemini CLI' },
  { file: 'QWEN.md', cli: 'Qwen Code' },
  { file: '.github/copilot-instructions.md', cli: 'GitHub Copilot' },
];

const TEMPLATE = `# Project context

> Single source of truth for ALL AI coding agents (Claude Code, OpenCode,
> Gemini CLI, Codex, Copilot, Qwen...). CLAUDE.md / GEMINI.md / QWEN.md are
> mirrors of this file (symlinks, or copies on Windows without Developer Mode)
> — edit only AGENTS.md. Keep it short: every line here is prepended to every
> prompt, so each line costs tokens on every request.

## What this project is

<one or two sentences>

## Commands

- build: \`npm run build\`
- test: \`npm test\`
- lint: \`npm run lint\`

## Conventions

- <code style, patterns to follow>

## Do not

- <things agents must not touch: generated files, secrets, prod configs>

## Agent memory (applies to EVERY agent reading this)

- Before reading large files to answer a question, run
  \`npx smart-switcher context search "<keywords>"\` and use the matched chunk.
- After an important decision or completed task, run
  \`npx smart-switcher context save "<one-line summary>"\` so other agents know.
`;

const isSymlink = (p) => {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
};

// Windows without Developer Mode (or admin) cannot create symlinks, so mirrors
// fall back to a generated copy that every `sw context` run refreshes. The
// marker is what lets us tell our own copy apart from a file the user wrote.
const MIRROR_NOTE = '<!-- smart-switcher mirror of AGENTS.md — do not edit; edit AGENTS.md and run: npx smart-switcher context -->';
const isMirror = (p) => {
  try { return readFileSync(p, 'utf8').startsWith(MIRROR_NOTE); } catch { return false; }
};

// Is this file already synced to AGENTS.md (symlinked, or our generated copy)?
const isSynced = (p) => isSymlink(p) || isMirror(p);

function writeMirrorCopy(root, file) {
  const sourcePath = join(root, SOURCE);
  writeFileSync(join(root, file), MIRROR_NOTE + '\n\n' + readFileSync(sourcePath, 'utf8'));
}

// Re-copy any mirror that could not be symlinked. Returns how many were updated.
function refreshMirrorCopies(root) {
  if (!existsSync(join(root, SOURCE))) return 0;
  let n = 0;
  for (const m of MIRRORS) {
    const p = join(root, m.file);
    if (!existsSync(p) || isSymlink(p) || !isMirror(p)) continue;
    writeMirrorCopy(root, m.file);
    n++;
  }
  return n;
}

export const estimateTokens = (text) => Math.ceil(text.length / 4);

function backup(root, file) {
  const dir = join(root, '.smart-switcher-backup');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, file.replaceAll('/', '__') + '.' + Date.now() + '.bak');
  renameSync(join(root, file), dest);
  return relative(root, dest);
}

export function contextInit(root = process.cwd()) {
  const sourcePath = join(root, SOURCE);
  heading('Universal context — one file for every CLI');

  // 1. Create or merge AGENTS.md
  let merged = '';
  if (!existsSync(sourcePath)) {
    // Seed from the largest existing per-CLI file if any, else template.
    const existing = MIRRORS
      .map((m) => join(root, m.file))
      .filter((p) => existsSync(p) && !isSynced(p));
    if (existing.length) {
      const texts = existing.map((p) => readFileSync(p, 'utf8'));
      merged = texts[0];
      for (let i = 1; i < texts.length; i++) {
        if (!merged.includes(texts[i].slice(0, 200))) {
          merged += `\n\n<!-- merged from ${relative(root, existing[i])} -->\n\n` + texts[i];
        }
      }
      writeFileSync(sourcePath, merged);
      ok(`Created ${SOURCE} from ${existing.map((p) => relative(root, p)).join(' + ')}`);
    } else {
      writeFileSync(sourcePath, TEMPLATE);
      ok(`Created ${SOURCE} from template — fill in the sections.`);
    }
  } else {
    info(`${SOURCE} already exists — keeping it as the source of truth.`);
  }

  // 2. Point every mirror at it
  for (const m of MIRRORS) {
    const p = join(root, m.file);
    const dir = dirname(p);
    mkdirSync(dir, { recursive: true });
    const linkTarget = relative(dir, sourcePath) || SOURCE;

    if (isSymlink(p)) {
      if (readlinkSync(p) === linkTarget) { ok(`${m.file} → ${SOURCE}  ${c.gray('(' + m.cli + ', already linked)')}`); continue; }
      unlinkSync(p);
    } else if (existsSync(p)) {
      if (isMirror(p)) {
        unlinkSync(p); // our own generated copy — refresh it below
      } else {
        const saved = backup(root, m.file);
        warn(`${m.file} had its own content — backed up to ${saved}`);
      }
    }

    try {
      symlinkSync(linkTarget, p);
      ok(`${m.file} → ${SOURCE}  ${c.gray('(' + m.cli + ')')}`);
    } catch {
      // Windows without Developer Mode/admin cannot create symlinks: keep a
      // generated copy instead so every agent still reads the same content.
      writeMirrorCopy(root, m.file);
      ok(`${m.file} ⇄ ${SOURCE} (copy)  ${c.gray(m.cli + ' — enable Developer Mode for links')}`);
    }
  }

  info('OpenCode, Codex, Copilot, Devin and Antigravity read AGENTS.md natively — nothing to link.');
  contextTokens(root);
}

export function contextTokens(root = process.cwd()) {
  const sourcePath = join(root, SOURCE);
  if (!existsSync(sourcePath)) return fail(`No ${SOURCE} here. Run: sw context init`);
  const text = readFileSync(sourcePath, 'utf8');
  const tokens = estimateTokens(text);
  const linked = MIRRORS.filter((m) => isSynced(join(root, m.file))).length;
  heading('Context token report');
  console.log(`  ${SOURCE}: ~${c.bold(tokens.toLocaleString())} tokens (${text.length.toLocaleString()} chars, ${text.split('\n').length} lines)`);
  console.log(`  Mirrors synced: ${linked}/${MIRRORS.length} — one copy on disk instead of ${linked + 1}.`);
  console.log(c.gray(`  Every line is sent on every request to every agent. Target: < 1,500 tokens.`));
  if (tokens > 1500) warn(`Context is large. Run: sw context optimize`);
}

// Lossless-ish shrink: trailing whitespace, >2 blank lines, HTML comments,
// horizontal rules used as decoration.
export function contextOptimize(root = process.cwd()) {
  const sourcePath = join(root, SOURCE);
  if (!existsSync(sourcePath)) return fail(`No ${SOURCE} here. Run: sw context init`);
  const before = readFileSync(sourcePath, 'utf8');
  let after = before
    .replace(/<!--[\s\S]*?-->/g, '')          // HTML comments
    .replace(/[ \t]+$/gm, '')                 // trailing whitespace
    .replace(/^\s*(---|\*\*\*)\s*$/gm, '')    // decorative rules
    .replace(/\n{3,}/g, '\n\n')               // collapse blank lines
    .replace(/^ {0,3}([-*+]) {2,}/gm, '$1 '); // extra spaces after bullets
  if (!after.endsWith('\n')) after += '\n';

  const b = estimateTokens(before);
  const a = estimateTokens(after);
  if (a >= b) return ok(`Already tight: ~${b.toLocaleString()} tokens, nothing to strip.`);
  writeFileSync(sourcePath, after);
  const refreshed = refreshMirrorCopies(root);
  ok(`Optimized ${SOURCE}: ~${b.toLocaleString()} → ~${a.toLocaleString()} tokens (${c.green('-' + (b - a).toLocaleString())}).`);
  if (refreshed) info(`Re-synced ${refreshed} mirror copy(ies).`);
  info('For bigger savings, delete lines an agent could learn from the code itself.');
}
