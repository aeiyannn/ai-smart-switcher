import { spawn, spawnSync } from 'node:child_process';
import { CLIS, byId } from './registry.js';
import { authStatus, inspect, inspectAll, which } from './detect.js';
import { spawnSpec } from './spawn.js';
import { loadConfig, saveConfig, configPath } from './config.js';
import { c, fail, heading, info, ok, select, table, warn } from './ui.js';

const statusCell = (s) => {
  if (!s.installed) return c.gray('not installed');
  if (s.auth.authed) return c.green('connected') + c.gray(` (${s.auth.via})`);
  return c.red('not connected');
};

export function cmdStatus() {
  const cfg = loadConfig();
  heading('ai-smart-switcher — AI CLI status');
  const rows = inspectAll(CLIS).map((s) => [
    (cfg.defaultCli === s.cli.id ? c.cyan('★ ') : '  ') + c.bold(s.cli.id),
    s.cli.name,
    s.installed ? c.green(s.version || 'installed') : c.red('—'),
    statusCell(s),
    cfg.models[s.cli.id] || c.gray(s.cli.model?.examples?.[0] || ''),
  ]);
  table(rows, ['', 'CLI', 'version', 'status', 'model']);
  console.log(c.gray(`\n  ★ default · config: ${configPath()}`));
  console.log(c.gray('  sw install <cli> · sw auth <cli|all> · sw use <cli> · sw run [cli] [prompt]'));
}

// One checkup command: status table + what's broken + how to fix + free options.
export function cmdDoctor() {
  cmdStatus();
  const states = inspectAll(CLIS);
  const needAuth = states.filter((s) => s.installed && !s.auth.authed && s.cli.authCmd);
  const freeMissing = states.filter((s) => !s.installed && /free/i.test(s.cli.free || ''));

  heading('Fixes');
  if (!needAuth.length) ok('Everything installed is logged in.');
  for (const s of needAuth) warn(`${s.cli.name} is installed but logged out  →  ${c.bold('sw auth ' + s.cli.id)}`);
  if (needAuth.length > 1) info(`Or all at once: ${c.bold('sw auth all')}`);

  if (freeMissing.length) {
    heading('Free agents you could add');
    for (const s of freeMissing) {
      console.log(`  ${c.green('+')} ${c.bold(s.cli.id.padEnd(12))} ${c.gray(s.cli.free)}`);
      console.log(`    ${c.cyan('sw install ' + s.cli.id)}`);
    }
  }
  console.log(c.gray('\n  Then: sw  (pick & launch)  ·  sw auto "<task>"  (auto-route with fallback)'));
}

// Install a single CLI. Returns true when its binary is available afterwards.
export function installOne(cli) {
  if (which(cli.bin)) {
    ok(`${cli.name} already installed.`);
    return true;
  }
  const { npm, curl } = cli.install || {};
  if (npm) {
    info(`Installing ${cli.name}: npm install -g ${npm}`);
    const spec = spawnSpec(which('npm') || 'npm', ['install', '-g', npm], { stdio: 'inherit' });
    const r = spawnSync(spec.file, spec.args, spec.options);
    if (r.status !== 0) {
      fail(`npm install failed for ${cli.name}. Try manually: npm install -g ${npm}`);
      return false;
    }
    ok(`${cli.name} installed.`);
    if (cli.id === 'freebuff') {
      info('Freebuff opens its own interactive TUI — launch it with: sw run freebuff');
    }
    return true;
  }
  if (curl) {
    warn(`${cli.name} has no npm package. Install it manually:\n    ${curl}`);
    return false;
  }
  warn(`${cli.name}: no automated install available. See ${cli.url || cli.vendor}.`);
  return false;
}

export async function cmdInstall(id) {
  const targets = id === 'all'
    ? CLIS.filter((x) => !which(x.bin))
    : [mustFind(id)];

  if (!targets.length) return ok('Every supported CLI is already installed.');

  for (const cli of targets) installOne(cli);

  // Claude Code / OpenCode get our slash commands + Claude autosave hooks.
  const wantsIntegration = targets.some((x) => x.id === 'claude' || x.id === 'opencode');
  if (wantsIntegration && targets.some((x) => which(x.bin))) {
    const { cmdSetup } = await import('./setup.js');
    await cmdSetup();
  }
}

export async function cmdAuthAll() {
  heading('Authenticating every installed CLI');
  const states = inspectAll(CLIS).filter((s) => s.installed);
  if (!states.length) return fail('Nothing installed yet. Run: sw install all');
  const todo = states.filter((s) => !s.auth.authed && s.cli.authCmd);
  for (const s of states.filter((x) => x.auth.authed)) ok(`${s.cli.name} — already authenticated (${s.auth.via}).`);
  if (!todo.length) return ok('All installed CLIs are authenticated. You are fully loaded.');
  info(`${todo.length} CLI(s) need login: ${todo.map((s) => s.cli.id).join(', ')}`);
  for (const s of todo) {
    console.log();
    const go = await confirmStep(`Log in to ${c.bold(s.cli.name)} now?`);
    if (go) cmdAuth(s.cli.id);
    else warn(`Skipped ${s.cli.name}.`);
  }
  console.log();
  cmdStatus();
}

async function confirmStep(q) {
  if (!process.stdin.isTTY) return true; // non-interactive: just run them in order
  const { confirm } = await import('./ui.js');
  return confirm(q, true);
}

export function cmdAuth(id) {
  if (id === 'all') return cmdAuthAll();
  const cli = mustFind(id);
  const s = inspect(cli);
  if (!s.installed) return fail(`${cli.name} is not installed. Run: sw install ${cli.id}`);
  if (s.auth.authed) return ok(`${cli.name} already authenticated via ${s.auth.via}.`);
  if (!cli.authCmd) return ok(`${cli.name} needs no authentication.`);
  heading(`Authenticating ${cli.name}`);
  info(`Method: ${cli.authCmd}`);
  if (cli.authEnv?.length) info(`Alternative: export ${cli.authEnv[0]}=<key>`);
  // If authCmd is a plain runnable command (no parenthesised hint), run it.
  const runnable = cli.authCmd.split(' ');
  if (!cli.authCmd.includes('(')) {
    const spec = spawnSpec(which(runnable[0]) || runnable[0], runnable.slice(1), { stdio: 'inherit' });
    const r = spawnSync(spec.file, spec.args, spec.options);
    if (r.status === 0) ok('Done.');
  } else {
    info(`This CLI authenticates interactively — launching ${c.bold(cli.bin)} now, follow its login flow.`);
    const spec = spawnSpec(s.path || cli.bin, [], { stdio: 'inherit' });
    spawnSync(spec.file, spec.args, spec.options);
  }
}

export async function cmdUse(id) {
  const cfg = loadConfig();
  let cli = id ? mustFind(id) : null;
  if (!cli) {
    const states = inspectAll(CLIS).filter((s) => s.installed);
    if (!states.length) return fail('No AI CLIs installed yet. Run: sw install all');
    const picked = await select('Set default CLI:', states.map((s) => ({
      label: s.cli.name, value: s.cli.id, note: statusCell(s).replace(/\x1b\[[0-9;]*m/g, ''),
    })), { hint: '↑↓ + enter' });
    if (!picked) return;
    cli = byId(picked);
  }
  cfg.defaultCli = cli.id;
  saveConfig(cfg);
  ok(`Default CLI is now ${c.bold(cli.name)}. Launch it with: sw run`);
}

export function cmdModel(id, model) {
  const cli = mustFind(id);
  const cfg = loadConfig();
  if (!model) {
    heading(`${cli.name} — model switching`);
    if (cli.model?.flag) console.log(`  flag: ${c.bold(cli.bin + ' ' + cli.model.flag)}`);
    if (cli.model?.env) console.log(`  env:  ${c.bold(cli.model.env)}`);
    if (cli.model?.cmd) console.log(`  in-app: ${c.bold(cli.model.cmd)}`);
    if (cli.model?.examples) console.log(`  examples: ${cli.model.examples.join(', ')}`);
    if (cfg.models[cli.id]) console.log(`  saved default: ${c.cyan(cfg.models[cli.id])}`);
    console.log(c.gray(`\n  Save a default: sw model ${cli.id} <model> — sw run will use it.`));
    return;
  }
  cfg.models[cli.id] = model;
  saveConfig(cfg);
  if (!cli.model?.flag) {
    warn(`${cli.name} picks models inside its own TUI — saved "${model}" is informational only.`);
  } else {
    ok(`${cli.name} default model set to ${c.bold(model)} (applied by "sw run ${cli.id}").`);
  }
}

export function cmdRun(id, promptParts) {
  const cfg = loadConfig();
  let cli = id ? byId(id) : null;
  let prompt = promptParts;
  if (id && !cli) { prompt = [id, ...promptParts]; cli = null; } // "sw run fix the bug"
  if (!cli) cli = byId(cfg.defaultCli) || null;
  if (!cli) return fail('No default CLI set. Run: sw use');
  const binPath = which(cli.bin);
  if (!binPath) return fail(`${cli.name} is not installed. Run: sw install ${cli.id}`);
  const auth = authStatus(cli);
  if (!auth.authed) warn(`${cli.name} is not connected. Run: sw auth ${cli.id}`);

  const text = (prompt || []).join(' ').trim();
  if (cli.id === 'freebuff' && text) {
    warn('Freebuff is an interactive TUI — it takes no prompt argument. Launching it now; paste your task there.');
  }

  const args = [];
  const model = cfg.models[cli.id];
  if (model && cli.model?.flag) args.push(cli.model.flag.split(' ')[0], model);
  args.push(...(cli.runArgs ? cli.runArgs(text || undefined) : []));

  info(`Launching ${c.bold(cli.name)}${model && cli.model?.flag ? ' with model ' + c.cyan(model) : ''}…`);
  const spec = spawnSpec(binPath, args, { stdio: 'inherit' });
  const child = spawn(spec.file, spec.args, spec.options);
  child.on('exit', (code) => process.exit(code ?? 0));
}

export function cmdFree() {
  heading('Free ways to run AI coding agents');
  table(CLIS.map((cli) => [c.bold(cli.id), cli.free]));

  console.log(`
  ${c.bold('Best free stack (verified October 2026):')}
  1. ${c.cyan('Freebuff')} — 100% free and ad-funded, no API key. GLM 5.3 Flash,
     DeepSeek V4.1 Flash, MiMo v2.6 Flash Fast. Free for 5 hours/day
     (4 hours on VPN). ${c.gray('npm i -g freebuff')} → ${c.bold('sw run freebuff')}
  2. ${c.cyan('Antigravity CLI (agy)')} — free with a personal Google account;
     Google's designated free coding CLI since June 2026. Check ${c.bold('/usage')}.
  3. ${c.cyan('OpenCode + Zen free models')} — open source; ${c.bold('opencode auth login')}
     gives free GLM 5.3 Flash / DeepSeek V4.1 Flash access (limited time).
  4. ${c.cyan('Free API keys in any CLI')} — Groq (~1,000 req/day) and OpenRouter
     ":free" models (50 req/day) work well inside OpenCode.

  ${c.gray('Paid (no free tier): Claude Code needs Pro/Max or an API key; Devin needs a plan.')}
  ${c.gray('Freebuff is an interactive TUI, so "sw auto" never routes to it.')}`);
}

function mustFind(id) {
  const cli = byId(id);
  if (!cli) {
    fail(`Unknown CLI "${id}". Known: ${CLIS.map((x) => x.id).join(', ')}`);
    process.exit(1);
  }
  return cli;
}
