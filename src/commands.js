import { spawn, spawnSync } from 'node:child_process';
import { CLIS, byId } from './registry.js';
import { inspect, inspectAll, which } from './detect.js';
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
  heading('smart-switcher — AI CLI status');
  const rows = inspectAll(CLIS).map((s) => [
    (cfg.defaultCli === s.cli.id ? c.cyan('★ ') : '  ') + c.bold(s.cli.id),
    s.cli.name,
    s.installed ? c.green(s.version || 'installed') : c.red('—'),
    statusCell(s),
    cfg.models[s.cli.id] || c.gray(s.cli.model?.examples?.[0] || ''),
  ]);
  table(rows, ['', 'CLI', 'version', 'status', 'model']);
  console.log(c.gray(`\n  ★ default · config: ${configPath}`));
  console.log(c.gray('  sw install <cli> · sw auth <cli> · sw use <cli> · sw run [cli] [prompt]'));
}

// One checkup command: status table + what's broken + how to fix + free options.
export function cmdDoctor() {
  cmdStatus();
  const states = inspectAll(CLIS);
  const needAuth = states.filter((s) => s.installed && !s.auth.authed && s.cli.authCmd);
  const freeMissing = states.filter((s) => !s.installed && /FREE/.test(s.cli.free || ''));

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

export async function cmdInstall(id) {
  const targets = id === 'all'
    ? CLIS.filter((x) => !which(x.bin) && (x.install.npm || x.install.brew))
    : [mustFind(id)];
  const wantsIntegration = targets.some((x) => x.id === 'claude' || x.id === 'opencode');
  for (const cli of targets) {
    if (which(cli.bin)) { ok(`${cli.name} already installed.`); continue; }
    const { npm, brew, curl } = cli.install;
    if (npm) {
      info(`Installing ${cli.name}: npm install -g ${npm}`);
      const spec = spawnSpec(which('npm') || 'npm', ['install', '-g', npm], { stdio: 'inherit' });
      const r = spawnSync(spec.file, spec.args, spec.options);
      r.status === 0 ? ok(`${cli.name} installed.`) : fail(`npm install failed for ${cli.name}.`);
    } else if (brew && which('brew')) {
      info(`Installing ${cli.name}: brew install ${brew}`);
      const spec = spawnSpec(which('brew'), ['install', ...brew.split(' ').slice(0, 1)], { stdio: 'inherit' });
      const r = spawnSync(spec.file, spec.args, spec.options);
      r.status === 0 ? ok(`${cli.name} installed.`) : fail(`brew install failed for ${cli.name}.`);
    } else if (curl) {
      warn(`${cli.name} has no npm package. Install manually:\n    ${curl}`);
    } else {
      warn(`${cli.name}: no automated install available.`);
    }
  }
  if (wantsIntegration) {
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
  // If authCmd is a plain runnable command (no spaces-with-parens hint), run it.
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
  ok(`${cli.name} default model set to ${c.bold(model)} (applied by "sw run ${cli.id}").`);
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

  const args = [];
  const model = cfg.models[cli.id];
  if (model && cli.model?.flag) args.push(cli.model.flag.split(' ')[0], model);
  const text = (prompt || []).join(' ').trim();
  args.push(...(cli.runArgs ? cli.runArgs(text || undefined) : []));

  info(`Launching ${c.bold(cli.name)}${model ? ' with model ' + c.cyan(model) : ''}…`);
  const spec = spawnSpec(binPath, args, { stdio: 'inherit' });
  const child = spawn(spec.file, spec.args, spec.options);
  child.on('exit', (code) => process.exit(code ?? 0));
}

export function cmdFree() {
  heading('Free ways to run AI coding agents');
  const rows = CLIS
    .map((cli) => [c.bold(cli.id), cli.free])
    .sort((a, b) => Number(b[1].includes('FREE')) - Number(a[1].includes('FREE')));
  table(rows);
  console.log(`
  ${c.bold('Best free stack (zero cost, verified Oct 2026):')}
  1. ${c.cyan('Ollama')} — unlimited local models, and ${c.bold('ollama launch claude|opencode|codex')}
     auto-wires any agent to a local model (no manual config)
  2. ${c.cyan('Antigravity CLI (agy)')} — free with a Google account; Google's
     designated free coding CLI (replaced Gemini CLI's free tier, June 2026)
  3. ${c.cyan('OpenCode + Zen free models')} — opencode auth login → free GLM-5.3-Flash,
     DeepSeek V4.1 Flash, Nemotron 3 Ultra ("limited time")
  4. ${c.cyan('Copilot CLI')} — Copilot Free: 50 premium requests/month
  5. ${c.cyan('Free API keys in any CLI')} — Gemini key (250 req/day Flash),
     Groq (~1,000 req/day), OpenRouter ':free' models (50 req/day)

  ${c.gray('Dead free tiers (do not trust old blog posts): Qwen OAuth (ended Apr 2026),')}
  ${c.gray('Gemini CLI free OAuth for new users (June 2026), Devin SWE-2 promo (Oct 2026).')}`);
}

function mustFind(id) {
  const cli = byId(id);
  if (!cli) {
    fail(`Unknown CLI "${id}". Known: ${CLIS.map((x) => x.id).join(', ')}`);
    process.exit(1);
  }
  return cli;
}
