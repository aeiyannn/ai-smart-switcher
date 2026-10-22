// Smoke tests — run with: npm test  (node --test)
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// Isolate state before importing anything that reads it at call time.
const HOME = mkdtempSync(join(tmpdir(), 'ai-switcher-test-'));
process.env.AI_SWITCHER_HOME = join(HOME, 'state');
process.env.NO_COLOR = '1';

const { AUTO_CLIS, CLIS, byId } = await import('../src/registry.js');
const { classify, failureReason } = await import('../src/auto.js');
const { configPath, loadConfig, saveConfig, stateHome } = await import('../src/config.js');
const { contextInit } = await import('../src/context.js');
const { contextSave, memoryFile } = await import('../src/store.js');

let project;

before(() => {
  project = join(HOME, 'project');
  // contextInit expects an existing directory
  mkdirSync(project, { recursive: true });
});

after(() => {
  rmSync(HOME, { recursive: true, force: true });
});

test('registry contains exactly the five supported CLIs', () => {
  assert.deepEqual(
    CLIS.map((c) => c.id),
    ['claude', 'opencode', 'freebuff', 'devin', 'antigravity']
  );
  for (const removed of ['codex', 'gemini', 'copilot', 'qwen', 'ollama', 'vercel']) {
    assert.equal(byId(removed), undefined, `${removed} must not be supported`);
  }
});

test('Freebuff is free, authless and excluded from auto mode', () => {
  const freebuff = byId('freebuff');
  assert.equal(freebuff.authCmd, null);
  assert.deepEqual(freebuff.authEnv, []);
  assert.equal(freebuff.auto, false);
  assert.ok(!AUTO_CLIS.some((c) => c.id === 'freebuff'));
  assert.ok(AUTO_CLIS.length >= 4);
  assert.equal(freebuff.url, 'https://freebuff.com/');
});

test('every auto-capable CLI has non-interactive args', () => {
  for (const cli of AUTO_CLIS) {
    assert.equal(typeof cli.autoArgs, 'function', `${cli.id} needs autoArgs`);
    assert.ok(Array.isArray(cli.autoArgs('fix it')));
  }
  assert.deepEqual(byId('devin').autoArgs('x'), ['-p', 'x']);
  assert.deepEqual(byId('claude').autoArgs('x'), ['-p', 'x']);
});

test('every plugin command is tagged so sw setup remove can find it', () => {
  const root = new URL('../plugins/', import.meta.url);
  const files = [
    'claude/commands/auto.md',
    'claude/commands/context.md',
    'claude/commands/doctor.md',
    'opencode/command/auto.md',
    'opencode/command/context.md',
    'opencode/command/doctor.md',
  ];
  for (const rel of files) {
    const text = readFileSync(new URL(rel, root), 'utf8');
    assert.ok(
      text.includes('<!-- ai-smart-switcher -->'),
      `${rel} needs the ownership marker (sw setup remove relies on it)`
    );
  }
});

test('classify routes light, medium and heavy tasks', () => {
  assert.equal(classify('rename the variable x to count'), 'light');
  assert.equal(classify('add a button to the settings page'), 'medium');
  assert.equal(classify('refactor auth and fix the race condition'), 'heavy');
  assert.equal(classify('x'.repeat(500)), 'heavy');
});

test('failureReason recognises quota and auth failures', () => {
  assert.equal(failureReason(1, 'Error: 429 Too Many Requests'), 'quota/rate limit');
  assert.equal(failureReason(1, 'You are out of credits'), 'quota/rate limit');
  assert.equal(failureReason(1, 'not logged in — please sign in'), 'auth expired/missing');
  assert.equal(failureReason(2, 'boom'), 'exit code 2');
  assert.equal(failureReason(0, 'all good'), null);
});

test('config lives in the AI_SWITCHER_HOME state dir', () => {
  assert.equal(stateHome(), join(HOME, 'state'));
  assert.equal(configPath(), join(HOME, 'state', 'config.json'));
  const cfg = loadConfig();
  cfg.defaultCli = 'opencode';
  cfg.models = { opencode: 'anthropic/claude-sonnet' };
  saveConfig(cfg);
  const reread = loadConfig();
  assert.equal(reread.defaultCli, 'opencode');
  assert.equal(reread.models.opencode, 'anthropic/claude-sonnet');
});

test('context init creates AGENTS.md and both mirrors', () => {
  contextInit(project);
  assert.ok(existsSync(join(project, 'AGENTS.md')));
  assert.ok(existsSync(join(project, 'CLAUDE.md')));
  assert.ok(existsSync(join(project, 'knowledge.md')));

  const source = readFileSync(join(project, 'AGENTS.md'), 'utf8');
  assert.match(source, /Single source of truth/);
  // Windows fallback copies start with the mirror marker; symlinks resolve to the source.
  const mirror = readFileSync(join(project, 'knowledge.md'), 'utf8');
  assert.ok(mirror.includes('mirror of AGENTS.md') || mirror === source);
});

test('memory is one sectioned file and deduplicates repeats', () => {
  contextSave(['decided', 'to', 'use', 'smoke', 'tests'], project);
  contextSave(['decided', 'to', 'use', 'smoke', 'tests'], project);
  const text = readFileSync(memoryFile(), 'utf8');
  assert.match(text, /# AI Smart Switcher/);
  assert.ok(text.includes(project));
  assert.equal((text.match(/decided to use smoke tests/g) || []).length, 1);
});
