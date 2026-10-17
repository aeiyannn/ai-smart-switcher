// Shared context store + fast local search.
//
// Token-saving idea: instead of every agent loading whole files into its
// prompt, it runs `sw context search "<query>"` and pastes ONLY the matching
// chunk. Chunks are scored with sparse term-frequency vectors (cosine
// similarity) — zero dependencies, instant, fully local.
// (Note: base64 does NOT save tokens — it makes text ~33% longer. Retrieval
// of small relevant chunks is what actually cuts token use.)
//
// `sw context save "<note>"` stores a note/summary in a per-project store at
// ~/.smart-switcher/context/, so EVERY agent (Claude Code, OpenCode, Gemini…)
// can search what another agent learned earlier.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { c, fail, heading, info, ok } from './ui.js';

const STORE_DIR = join(homedir(), '.smart-switcher', 'context');
const TEXT_EXT = new Set(['.md', '.txt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.json', '.yml', '.yaml', '.toml', '.sh', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.smart-switcher-backup', 'vendor']);
const MAX_FILE = 200 * 1024;
const CHUNK_LINES = 30;

const projectFile = (root) =>
  join(STORE_DIR, createHash('sha1').update(root).digest('hex').slice(0, 12) + '.json');

function loadStore(root) {
  try {
    return JSON.parse(readFileSync(projectFile(root), 'utf8'));
  } catch {
    return { root, snapshots: [] };
  }
}

function persist(root, store) {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(projectFile(root), JSON.stringify(store));
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

function* walk(dir, root, depth = 0) {
  if (depth > 6) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p, root, depth + 1);
    } else if (TEXT_EXT.has(extname(e.name))) {
      yield p;
    }
  }
}

function chunksOf(root) {
  const chunks = [];
  for (const file of walk(root, root)) {
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
  const store = loadStore(root);
  store.snapshots.push({ at: new Date().toISOString().slice(0, 16), note });
  if (store.snapshots.length > 300) store.snapshots.splice(0, store.snapshots.length - 300);
  persist(root, store);
  ok(`Saved to the shared context store (${store.snapshots.length} notes). Every agent can find it with: sw context search`);
}

// AUTO capture — no manual step. Claude Code hooks pipe their JSON payload to
// `smart-switcher context autosave`:
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

    const store = loadStore(root);
    const last = store.snapshots[store.snapshots.length - 1];
    if (last && last.note === note) return; // dedupe
    store.snapshots.push({ at: new Date().toISOString().slice(0, 16), note });
    if (store.snapshots.length > 300) store.snapshots.splice(0, store.snapshots.length - 300);
    persist(root, store);
  } catch {
    /* hooks must never fail the session */
  }
}

export function contextSearch(queryParts, root = process.cwd()) {
  const query = (queryParts || []).join(' ').trim();
  if (!query) return fail('Usage: sw context search "<question or keywords>"');

  const store = loadStore(root);
  const pool = [
    ...store.snapshots.map((s) => ({ src: `saved note (${s.at})`, text: s.note })),
    ...chunksOf(root),
  ];
  if (!pool.length) return fail('Nothing to search yet. Save notes with: sw context save "<note>"');

  const q = vectorize(query);
  const scored = pool
    .map((ch) => ({ ...ch, score: cosine(q, vectorize(ch.text)) }))
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
  console.log(c.gray(`\n  ${pool.length} chunks searched. Paste only the matching chunk into your agent — not the whole file. That is the token saving.`));
}
