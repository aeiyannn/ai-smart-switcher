// Cross-platform process helpers.
//
// Two Windows realities make this necessary:
//   1. `which` does not exist — the equivalent is `where`.
//   2. npm-installed CLIs are `.cmd` shims that cannot be spawned directly, and
//      when run through a shell their arguments must be quoted by hand (Node
//      joins them unescaped, so "fix the auth bug" would arrive as 4 args).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const WIN = process.platform === 'win32';

// Dirs where CLIs commonly land but that may be missing from a non-login PATH.
const EXTRA_DIRS = [
  '.local/bin', '.claude/local', '.npm-global/bin', '.bun/bin', '.opencode/bin', 'bin',
].map((d) => join(homedir(), d));

if (WIN) {
  EXTRA_DIRS.unshift(join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm'));
} else {
  EXTRA_DIRS.push('/opt/homebrew/bin', '/usr/local/bin');
}

// On Windows prefer a real executable over a shell shim: npm writes both a
// bash-style file with no extension and a `.cmd` next to it.
const WIN_EXTS = ['.exe', '.cmd', '.bat', '.com'];
const rank = (p) => {
  if (!WIN) return 0;
  const i = WIN_EXTS.findIndex((e) => p.toLowerCase().endsWith(e));
  return i === -1 ? WIN_EXTS.length + 1 : i;
};

export function which(bin) {
  // 1) let the OS resolve it (respects PATH and PATHEXT)
  try {
    const out = execFileSync(WIN ? 'where' : 'which', [bin], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const hits = out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && existsSync(s));
    if (hits.length) return hits.sort((a, b) => rank(a) - rank(b))[0];
  } catch { /* fall through to the manual scan */ }

  // 2) manual scan — finds CLIs in dirs missing from a non-login PATH
  const dirs = [...String(process.env.PATH || '').split(delimiter), ...EXTRA_DIRS].filter(Boolean);
  const candidates = [];
  for (const dir of dirs) {
    for (const ext of WIN ? [...WIN_EXTS, ''] : ['']) {
      const p = join(dir, bin + ext);
      if (existsSync(p)) candidates.push(p);
    }
  }
  return candidates.sort((a, b) => rank(a) - rank(b))[0] || null;
}

// True when a resolved path is a Windows shell shim rather than an executable.
export const needsShell = (file) => WIN && /\.(cmd|bat)$/i.test(String(file));

// Quote one argument for a `cmd.exe /d /s /c` command line.
const cmdQuote = (s) => {
  const a = String(s).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1');
  return `"${a}"`;
};

// Returns { file, args, options } to hand straight to spawn/spawnSync.
// On POSIX (and for .exe on Windows) this is the identity mapping.
export function spawnSpec(file, args = [], options = {}) {
  if (!needsShell(file)) return { file, args, options };
  const line = [cmdQuote(file), ...args.map(cmdQuote)].join(' ');
  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    options: { ...options, windowsVerbatimArguments: true },
  };
}

export function version(bin) {
  const spec = spawnSpec(bin, ['--version']);
  const r = spawnSync(spec.file, spec.args, { encoding: 'utf8', timeout: 8000, ...spec.options });
  if (r.status !== 0 && !r.stdout) return null;
  const line = (r.stdout || r.stderr || '').split('\n')[0].trim();
  const m = line.match(/\d+\.\d+[.\w-]*/);
  return m ? m[0] : line.slice(0, 20) || null;
}
