// Auto-integration: install ai-smart-switcher's slash commands into Claude Code
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
];

// Hosts we used to write into in 0.1.x, or still want to clean up even though
// they are no longer supported. Only OUR files are ever touched.
const LEGACY_TARGETS = [
  {
    id: 'codex',
    name: 'Codex CLI (legacy)',
    dest: join(homedir(), '.codex', 'prompts'),
    how: 'custom prompts in ~/.codex/prompts',
  },
];

// A file in a host's command dir is ours only if it mentions ai-smart-switcher
// (or the old smart-switcher name, so upgrades can clean themselves up).
const isOurs = (p) => {
  try {
    const text = readFileSync(p, 'utf8');
    return text.includes('smart-switcher');
  } catch {
    return false;
  }
};

// Auto context capture for Claude Code: hooks that pipe each prompt and each
// finished turn to `ai-smart-switcher context autosave`. Merged into
// ~/.claude/settings.json without touching anything else in the file.
const AUTOSAVE_CMD = 'ai-smart-switcher context autosave';
const HOOK_MARKER = 'smart-switcher context autosave';
const NEW_HOOK_MARKER = 'ai-smart-switcher context autosave';
const OLD_HOOK_RE = /smart-switcher context autosave/;

// True for a hook string written by 0.1.x (which used bare `smart-switcher` or
// `npx smart-switcher`), false for the current `ai-smart-switcher` hook.
const isOldHook = (entry) => {
  const text = JSON.stringify(entry);
  return text.includes(HOOK_MARKER) && !text.includes(NEW_HOOK_MARKER);
};

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

  // Drop stale 0.1.x hooks first so an upgrade does not run them twice.
  let cleaned = 0;
  for (const event of Object.keys(settings.hooks)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter((entry) => !isOldHook(entry));
    cleaned += before - settings.hooks[event].length;
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }

  let added = 0;
  for (const event of ['UserPromptSubmit', 'Stop']) {
    const entries = (settings.hooks[event] = settings.hooks[event] || []);
    const present = entries.some((entry) => JSON.stringify(entry).includes(NEW_HOOK_MARKER));
    if (!present) {
      entries.push({ hooks: [{ type: 'command', command: AUTOSAVE_CMD, async: true }] });
      added++;
    }
  }

  if (!added && !cleaned) return 'auto-capture hooks already present';
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  if (added) {
    return 'auto-capture hooks installed (prompts + results saved to shared memory)';
  }
  return `upgraded ${cleaned} auto-capture hook(s) to ai-smart-switcher`;
}

function removeLegacyIntegrations() {
  const removed = [];
  for (const t of LEGACY_TARGETS) {
    try {
      if (!existsSync(t.dest)) continue;
      for (const f of readdirSync(t.dest).filter((x) => x.endsWith('.md'))) {
        const p = join(t.dest, f);
        if (isOurs(p)) {
          unlinkSync(p);
          removed.push(`${t.id}/${f}`);
        }
      }
    } catch { /* leave it */ }
  }
  return removed;
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
  const legacy = removeLegacyIntegrations();
  if (legacy.length) report.push({ id: 'legacy', name: 'Legacy hosts', status: 'cleaned', files: legacy });
  return report;
}

// Disable: remove OUR command/prompt files from every host and strip the
// autosave hooks from ~/.claude/settings.json — everything else is untouched.
export function removeIntegrations() {
  const report = [];
  for (const t of [...TARGETS, ...LEGACY_TARGETS]) {
    let removed = 0;
    try {
      if (existsSync(t.dest)) {
        for (const f of readdirSync(t.dest).filter((x) => x.endsWith('.md'))) {
          const p = join(t.dest, f);
          if (isOurs(p)) {
            unlinkSync(p);
            removed++;
          }
        }
      }
      report.push({ ...t, status: 'removed', count: removed });
    } catch (err) {
      report.push({ ...t, status: 'error', error: err?.message });
    }
  }
  // strip autosave hooks (old and new)
  const file = join(homedir(), '.claude', 'settings.json');
  let hooksMsg = 'no hooks found';
  try {
    if (existsSync(file)) {
      const settings = JSON.parse(readFileSync(file, 'utf8'));
      let stripped = 0;
      for (const event of Object.keys(settings.hooks || {})) {
        if (!Array.isArray(settings.hooks[event])) continue;
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(
          (entry) => !OLD_HOOK_RE.test(JSON.stringify(entry))
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
    heading('Disabling ai-smart-switcher integrations');
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
    console.log(c.gray('  To remove everything: npm uninstall -g ai-smart-switcher'));
    return;
  }
  heading('Installing Claude Code / OpenCode integrations');
  const report = installIntegrations();
  for (const r of report) {
    if (r.status === 'installed') {
      ok(`${r.name}: ${r.files.map((f) => '/' + f.replace('.md', '')).join(' ')} → ${r.how}`);
      if (r.hooks) info(`${r.name}: ${r.hooks}`);
    } else if (r.status === 'absent') {
      info(`${r.name} not found on this machine — skipped. (Install it, then re-run: sw setup)`);
    } else if (r.status === 'cleaned') {
      info(`Removed ${r.files.length} legacy file(s): ${r.files.join(', ')}`);
    } else {
      warn(`${r.name}: ${r.error}`);
    }
  }
  console.log(c.gray('\n  Restart any open Claude Code / OpenCode session to pick up new commands.'));
}
