// Auto-integration: install smart-switcher's slash commands into Claude Code
// and OpenCode so /switch, /auto, /context and /free work there with zero
// manual steps. Runs from npm postinstall and from `sw setup`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { which } from './detect.js';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  {
    id: 'claude',
    name: 'Claude Code',
    // present if the binary OR its home dir exists
    detect: () => which('claude') || existsSync(join(homedir(), '.claude')),
    src: join(PKG_ROOT, 'plugins', 'claude', 'commands'),
    dest: join(homedir(), '.claude', 'commands'),
    how: 'slash commands in ~/.claude/commands',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    detect: () =>
      which('opencode') ||
      existsSync(join(homedir(), '.config', 'opencode')) ||
      existsSync(join(homedir(), '.local', 'share', 'opencode')),
    src: join(PKG_ROOT, 'plugins', 'opencode', 'command'),
    dest: join(homedir(), '.config', 'opencode', 'command'),
    how: 'commands in ~/.config/opencode/command',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    detect: () => which('codex') || existsSync(join(homedir(), '.codex')),
    src: join(PKG_ROOT, 'plugins', 'codex', 'prompts'),
    dest: join(homedir(), '.codex', 'prompts'),
    how: 'custom prompts in ~/.codex/prompts',
  },
];

// A file in a host's command dir is ours only if it mentions smart-switcher.
const isOurs = (p) => {
  try { return readFileSync(p, 'utf8').includes('smart-switcher'); } catch { return false; }
};

// Auto context capture for Claude Code: hooks that pipe each prompt and each
// finished turn to `smart-switcher context autosave`. Merged into
// ~/.claude/settings.json without touching anything else in the file.
const AUTOSAVE_CMD = 'smart-switcher context autosave 2>/dev/null || true';

function installClaudeHooks() {
  const file = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return 'skipped: could not parse ~/.claude/settings.json';
    }
  }
  settings.hooks = settings.hooks || {};
  let added = 0;
  for (const event of ['UserPromptSubmit', 'Stop']) {
    const entries = (settings.hooks[event] = settings.hooks[event] || []);
    const present = JSON.stringify(entries).includes('smart-switcher context autosave');
    if (!present) {
      entries.push({ hooks: [{ type: 'command', command: AUTOSAVE_CMD, async: true }] });
      added++;
    }
  }
  if (!added) return 'auto-capture hooks already present';
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  return 'auto-capture hooks installed (prompts + results saved to shared memory)';
}

// Returns a report; never throws (postinstall must not break npm install).
export function installIntegrations({ log = () => {} } = {}) {
  const report = [];
  for (const t of TARGETS) {
    try {
      if (!t.detect()) {
        report.push({ ...t, status: 'absent' });
        continue;
      }
      mkdirSync(t.dest, { recursive: true });
      // Remove commands from older versions, but only if they are ours.
      for (const stale of ['switch.md', 'free.md']) {
        const p = join(t.dest, stale);
        try {
          if (existsSync(p) && isOurs(p)) unlinkSync(p);
        } catch { /* leave it */ }
      }
      const files = readdirSync(t.src).filter((f) => f.endsWith('.md'));
      for (const f of files) copyFileSync(join(t.src, f), join(t.dest, f));
      const hooks = t.id === 'claude' ? installClaudeHooks() : undefined;
      report.push({ ...t, status: 'installed', count: files.length, files, hooks });
      log(t);
    } catch (err) {
      report.push({ ...t, status: 'error', error: err?.message });
    }
  }
  return report;
}

// Disable: remove OUR command/prompt files from every host and strip the
// autosave hooks from ~/.claude/settings.json — everything else is untouched.
export function removeIntegrations() {
  const report = [];
  for (const t of TARGETS) {
    let removed = 0;
    try {
      if (existsSync(t.dest)) {
        for (const f of readdirSync(t.dest).filter((x) => x.endsWith('.md'))) {
          const p = join(t.dest, f);
          if (isOurs(p)) { unlinkSync(p); removed++; }
        }
      }
      report.push({ ...t, status: 'removed', count: removed });
    } catch (err) {
      report.push({ ...t, status: 'error', error: err?.message });
    }
  }
  // strip autosave hooks
  const file = join(homedir(), '.claude', 'settings.json');
  let hooksMsg = 'no hooks found';
  try {
    if (existsSync(file)) {
      const settings = JSON.parse(readFileSync(file, 'utf8'));
      let stripped = 0;
      for (const event of Object.keys(settings.hooks || {})) {
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(
          (entry) => !JSON.stringify(entry).includes('smart-switcher context autosave')
        );
        stripped += before - settings.hooks[event].length;
        if (!settings.hooks[event].length) delete settings.hooks[event];
      }
      if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
      if (stripped) {
        writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
        hooksMsg = `removed ${stripped} auto-capture hook(s) from ~/.claude/settings.json`;
      }
    }
  } catch {
    hooksMsg = 'could not update ~/.claude/settings.json — remove the autosave hooks manually';
  }
  return { report, hooksMsg };
}

export async function cmdSetup(action) {
  const { c, heading, ok, info, warn } = await import('./ui.js');
  if (action === 'remove' || action === 'off' || action === 'uninstall' || action === 'disable') {
    heading('Disabling smart-switcher integrations');
    const { report, hooksMsg } = removeIntegrations();
    for (const r of report) {
      if (r.status === 'removed') {
        r.count
          ? ok(`${r.name}: removed ${r.count} command(s) from ${r.how}`)
          : info(`${r.name}: nothing to remove`);
      } else warn(`${r.name}: ${r.error}`);
    }
    info(`Claude Code: ${hooksMsg}`);
    console.log(c.gray('\n  The sw CLI itself still works. Re-enable anytime with: sw setup'));
    console.log(c.gray('  To remove everything: npm uninstall -g smart-switcher'));
    return;
  }
  heading('Installing Claude Code / OpenCode / Codex integrations');
  const report = installIntegrations();
  for (const r of report) {
    if (r.status === 'installed') {
      ok(`${r.name}: ${r.files.map((f) => '/' + f.replace('.md', '')).join(' ')} → ${r.how}`);
      if (r.hooks) info(`${r.name}: ${r.hooks}`);
    } else if (r.status === 'absent') {
      info(`${r.name} not found on this machine — skipped. (Install it, then re-run: sw setup)`);
    } else {
      warn(`${r.name}: ${r.error}`);
    }
  }
  console.log(c.gray('\n  Restart any open Claude Code / OpenCode session to pick up new commands.'));
}
