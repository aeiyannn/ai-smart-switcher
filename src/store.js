// Universal memory + fast local search.
//
// One file — ~/.ai-smart-switcher/memory.md — is shared by EVERY agent.
// Notes are grouped by project:
//
//   ## C:\path\to\project
//   - 2026-10-22 14:03 · [asked] fix the auth race
//
// Token-saving idea: instead of loading whole files, an agent runs
// `sw context search "<query>"` (or `sw memory search`) and pastes ONLY the
// matching chunk. Chunks are scored with sparse term-frequency vectors
// (cosine similarity) — zero dependencies, instant, fully local.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { stateHome } from './config.js';
import { c, fail, heading, info, ok } from './ui.js';

const TEXT_EXT = new Set(['.md', '.txt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.json', '.yml', '.yaml', '.toml', '.sh', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.ai-smart-switcher-backup', '.smart-switcher-backup', 'vendor']);
const MAX_FILE = 200 * 1024;
const CHUNK_LINES = 30;
const MAX_NOTES_PER_PROJECT = 300;

export const memoryFile = () => join(stateHome(), 'memory.md');

const MEMORY_HEADER = `# AI Smart Switcher — shared memory

One memory file shared by every supported agent: Claude Code, OpenCode,
Freebuff, Devin and Antigravity. Entries are grouped by project.

- Read it:    sw memory
- Search it:  sw memory search "<keywords>"
- Add a note: sw context save "<one-line summary>"

`;

// --- memory file -------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

function stamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseMemory(text) {
  const projects = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('## ')) {
      current = line.slice(3).trim();
      if (!projects.has(current)) projects.set(current, []);
    } else if (current && line.startsWith('- ')) {
      projects.get(current).push(line.slice(2).trim());
    }
  }
  return projects;
}

const noteText = (entry) => {
  const i = entry.indexOf(' · ');
  return i === -1 ? entry : entry.slice(i + 3);
};

const entryDate = (entry) => {
  const i = entry.indexOf(' · ');
  return i === -1 ? '' : entry.slice(0, i);
};

function renderMemory(projects) {
  let out = MEMORY_HEADER;
  for (const [root, entries] of projects) {
    out += `## ${root}\n\n`;
    out += entries.map((e) => `- ${e}`).join('\n');
    out += '\n\n';
  }
  return out.replace(/\n{3,}$/, '\n');
}

// Import the 0.1.x per-project JSON stores once, so no memory is lost on
// upgrade. Skipped when AI_SWITCHER_HOME isolates the install.
function migrateLegacyMemory() {
  if (process.env.AI_SWITCHER_HOME) return;
  const file = memoryFile();
  if (existsSync(file)) return;
  const dir = join(homedir(), '.smart-switcher', 'context');
  if (!existsSync(dir)) return;

  const projects = new Map();
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return; }
  for (const name of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      const root = String(data.root || 'imported project');
      const entries = (data.snapshots || [])
        .map((s) => {
          const at = String(s.at || '').replace('T', ' ').slice(0, 16);
          const note = String(s.note || '').replace(/\s+/g, ' ').trim();
          return note ? `${at} · ${note}` : '';
        })
        .filter(Boolean);
      if (entries.length) projects.set(root, entries.slice(-MAX_NOTES_PER_PROJECT));
    } catch { /* skip unreadable legacy file */ }
  }
  if (!projects.size) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderMemory(projects));
  } catch { /* migration is best-effort */ }
}

function readProjects() {
  migrateLegacyMemory();
  const file = memoryFile();
  if (!existsSync(file)) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, MEMORY_HEADER);
    } catch { /* read-only home: fall through to empty */ }
  }
  try {
    return parseMemory(readFileSync(file, 'utf8'));
  } catch {
    return new Map();
  }
}

function appendNote(root, rawNote) {
  const note = String(rawNote || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!note) return { saved: false, count: 0, reason: 'empty' };

  const key = resolve(root);
  const projects = readProjects();
  const entries = projects.get(key) || [];
  const last = entries[entries.length - 1];
  if (last && noteText(last) === note) return { saved: false, count: entries.length, reason: 'duplicate' };

  entries.push(`${stamp()} · ${note}`);
  if (entries.length > MAX_NOTES_PER_PROJECT) entries.splice(0, entries.length - MAX_NOTES_PER_PROJECT);
  projects.set(key, entries);

  const file = memoryFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderMemory(projects));
  return { saved: true, count: entries.length, reason: 'saved' };
}

// --- sparse term vectors ------------------------------------------------------

const tokenize = (s) => s.toLowerCase().match(/[a-z0-9_$]{2,}/g) || [];

function vectorize(text) {
  const v = Object.create(null);
  for (const t of tokenize(text)) v[t] = (v[t] || 0) + 1;
  return v;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) {
    na += a[k] * a[k];
    if (b[k]) dot += a[k] * b[k];
  }
  if (!dot) return 0;
  for (const k in b) nb += b[k] * b[k];
  return dot / Math.sqrt(na * nb);
}

// --- chunking the project -----------------------------------------------------

function* walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p, depth + 1);
    } else if (TEXT_EXT.has(extname(e.name))) {
      yield p;
    }
  }
}

function chunksOf(root) {
  const chunks = [];
  for (const file of walk(root)) {
    let st;
    try { st = statSync(file); } catch { continue; }
    if (st.size > MAX_FILE || st.size === 0) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    const rel = relative(root, file);
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      const slice = lines.slice(i, i + CHUNK_LINES).join('\n').trim();
      if (slice.length < 40) continue;
      chunks.push({ src: `${rel}:${i + 1}`, text: slice });
    }
  }
  return chunks;
}

// --- commands -----------------------------------------------------------------

export function contextSave(noteParts, root = process.cwd()) {
  const note = (noteParts || []).join(' ').trim();
  if (!note) return fail('Usage: sw context save "<what you learned / decided>"');
  const { saved, count } = appendNote(root, note);
  if (!saved) {
    info(`Already the latest note for this project (${count} note(s)). Nothing new saved.`);
    return;
  }
  ok(`Saved to the shared memory (${count} note(s) for this project).`);
  info(`Every agent can read it: ${memoryFile()}`);
}

// AUTO capture — no manual step. Claude Code hooks pipe their JSON payload to
// `ai-smart-switcher context autosave`:
//   UserPromptSubmit -> saves what was asked   ([asked] ...)
//   Stop             -> saves what the agent answered/did ([done] ...)
// Silent, never fails, always exits 0 (a hook must not break the session).
export async function contextAutosave() {
  try {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    const payload = JSON.parse(raw || '{}');
    const root = payload.cwd || process.cwd();
    let note = '';

    if (payload.prompt) {
      const p = String(payload.prompt).trim().replace(/\s+/g, ' ');
      if (p.length < 15 || p.startsWith('/')) return; // skip trivial prompts & slash commands
      note = '[asked] ' + p.slice(0, 240);
    } else if (payload.transcript_path) {
      const lines = readFileSync(payload.transcript_path, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0 && i > lines.length - 400; i--) {
        let row;
        try { row = JSON.parse(lines[i]); } catch { continue; }
        if (row?.type !== 'assistant') continue;
        const content = row.message?.content;
        if (!Array.isArray(content)) continue;
        const text = content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim().replace(/\s+/g, ' ');
        if (text.length > 30) { note = '[done] ' + text.slice(0, 280); break; }
      }
    }
    if (!note) return;
    appendNote(root, note);
  } catch {
    /* hooks must never fail the session */
  }
}

export function contextSearch(queryParts, root = process.cwd()) {
  const query = (queryParts || []).join(' ').trim();
  if (!query) return fail('Usage: sw context search "<question or keywords>"');

  const key = resolve(root);
  const projects = readProjects();
  const pool = [];
  for (const [project, entries] of projects) {
    for (const entry of entries) {
      const note = noteText(entry);
      if (!note) continue;
      const label = basename(project) || project;
      pool.push({
        src: `memory · ${label}${entryDate(entry) ? ' · ' + entryDate(entry) : ''}`,
        text: note,
        project,
      });
    }
  }
  pool.push(...chunksOf(root));
  if (!pool.length) return fail('Nothing to search yet. Save notes with: sw context save "<note>"');

  const q = vectorize(query);
  const scored = pool
    .map((ch) => {
      let score = cosine(q, vectorize(ch.text));
      if (ch.project && resolve(ch.project) === key) score *= 1.25; // this project wins ties
      if (ch.src.startsWith('memory')) score *= 1.1;               // concise notes over raw chunks
      return { ...ch, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  heading(`Context search: "${query}"`);
  if (!scored.length) return info('No matches. Try different keywords.');
  for (const hit of scored) {
    console.log(`\n  ${c.cyan('▸')} ${c.bold(hit.src)} ${c.gray('score ' + hit.score.toFixed(2))}`);
    const preview = hit.text.split('\n').slice(0, 8).map((l) => '    ' + l).join('\n');
    console.log(preview);
  }
  console.log(c.gray(`\n  ${pool.length} chunks searched (${projects.size} project(s) in shared memory). Paste only the matching chunk — not the whole file.`));
}

export function contextShow(root = process.cwd()) {
  const projects = readProjects();
  const key = resolve(root);
  const mine = projects.get(key) || [];
  let total = 0;
  for (const entries of projects.values()) total += entries.length;

  heading('Shared memory — one file for every agent');
  console.log(`  file:     ${c.bold(memoryFile())}`);
  console.log(`  projects: ${projects.size}   notes: ${total}`);

  if (mine.length) {
    heading(`This project — ${mine.length} note(s)`);
    for (const entry of mine.slice(-20)) console.log(`  ${c.gray('·')} ${entry}`);
    if (mine.length > 20) info(`Showing the latest 20 of ${mine.length}. Open the file for the rest.`);
  } else {
    info('No notes for this project yet. Save one with: sw context save "<one-line summary>"');
  }

  const others = [...projects.keys()].filter((p) => p !== key);
  if (others.length) {
    heading(`Other projects (${others.length})`);
    for (const p of others.slice(0, 10)) console.log(`  ${c.gray('·')} ${p}`);
  }
  console.log(c.gray(`\n  Search across all of it: sw memory search "<keywords>"`));
}
