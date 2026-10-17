// Auto mode: route a prompt to the best available CLI, and fall back to the
// next one automatically when a CLI fails (quota exhausted, rate limit,
// expired auth, crash). "Best" = capable enough for the task, cheapest first
// when the task is easy.
import { spawn } from 'node:child_process';
import { CLIS, byId } from './registry.js';
import { inspect, which } from './detect.js';
import { spawnSpec } from './spawn.js';
import { loadConfig, saveConfig } from './config.js';
import { c, fail, heading, info, ok, warn } from './ui.js';

// --- 1. Classify the prompt -------------------------------------------------

const HEAVY = /refactor|architect|redesign|debug|fix (the )?bug|root cause|security|vulnerab|migrat|implement|build (a|the)|feature|multi.?file|complex|optimi[sz]e|review|concurren|race condition|memory leak|rewrite|integrat|database schema|api design/i;
const LIGHT = /rename|format|typo|comment|docstring|explain|what (is|does)|summari[sz]e|translate|one.?liner|regex|convert|list |show |simple|small|quick|readme|\.gitignore/i;

export function classify(prompt) {
  const p = prompt.trim();
  if (HEAVY.test(p) || p.length > 400) return 'heavy';
  if (LIGHT.test(p) && p.length < 200) return 'light';
  return 'medium';
}

// Preferred order per tier. Light = free/local first; heavy = strongest first.
const TIER_ORDER = {
  light: ['ollama', 'antigravity', 'gemini', 'opencode', 'copilot', 'qwen', 'claude', 'codex'],
  medium: ['antigravity', 'gemini', 'opencode', 'copilot', 'claude', 'codex', 'qwen', 'ollama'],
  heavy: ['claude', 'codex', 'devin', 'antigravity', 'opencode', 'gemini', 'copilot', 'qwen', 'ollama'],
};

// --- 2. Detect "this CLI is out of juice" failures ---------------------------

const QUOTA_RE = /rate.?limit|quota|usage limit|limit (reached|exceeded)|exceeded|429|insufficient|out of (credits?|tokens?)|no credits?|credit balance|billing|overloaded|capacity|try again later|too many requests/i;
const AUTH_RE = /unauthori[sz]ed|not (logged|signed) in|login required|authentication|invalid (api )?key|expired|401|403|forbidden|please (log|sign) in/i;

export function failureReason(code, output) {
  const tail = output.slice(-4000);
  if (QUOTA_RE.test(tail)) return 'quota/rate limit';
  if (AUTH_RE.test(tail)) return 'auth expired/missing';
  if (code !== 0) return `exit code ${code}`;
  return null;
}

// --- 3. Build the fallback chain ---------------------------------------------

export function buildChain(prompt, cfg = loadConfig()) {
  const tier = classify(prompt);
  const order = cfg.chain?.length ? cfg.chain : TIER_ORDER[tier];
  const ready = [];
  for (const id of order) {
    const cli = byId(id);
    if (!cli || !cli.runArgs) continue;
    if (!which(cli.bin)) continue;
    const s = inspect(cli);
    if (!s.auth.authed) continue;
    ready.push(cli);
  }
  return { tier, chain: ready };
}

// --- 4. Run with fallback ----------------------------------------------------

function runOnce(cli, prompt, model) {
  return new Promise((resolve) => {
    const args = [];
    if (model && cli.model?.flag) args.push(cli.model.flag.split(' ')[0], model);
    args.push(...cli.runArgs(prompt));
    const spec = spawnSpec(which(cli.bin), args, { stdio: ['inherit', 'pipe', 'pipe'] });
    const child = spawn(spec.file, spec.args, spec.options);
    let output = '';
    const tee = (stream, dest) =>
      stream.on('data', (buf) => {
        output += buf.toString();
        dest.write(buf);
      });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('error', (err) => resolve({ code: 1, output: output + '\n' + err.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

export async function cmdAuto(promptParts) {
  const prompt = (promptParts || []).join(' ').trim();
  if (!prompt) return fail('Usage: sw auto <prompt>   e.g. sw auto fix the failing test');

  const cfg = loadConfig();
  const { tier, chain } = buildChain(prompt, cfg);
  if (!chain.length) {
    return fail('No installed + authenticated CLI available. Run: sw status, then sw auth all');
  }

  heading(`Auto mode — task looks ${c.bold(tier)}`);
  info(`Chain: ${chain.map((x) => x.id).join(' → ')}  ${c.gray('(override: sw chain <id,id,...>)')}`);

  for (let i = 0; i < chain.length; i++) {
    const cli = chain[i];
    const model = cfg.models[cli.id];
    console.log(`\n${c.cyan('▶')} ${c.bold(cli.name)}${model ? c.gray(' · ' + model) : ''}`);
    const { code, output } = await runOnce(cli, prompt, model);
    const reason = failureReason(code, output);
    if (!reason) {
      console.log();
      ok(`Task completed by ${c.bold(cli.name)}.`);
      return;
    }
    warn(`${cli.name} failed (${reason}).`);
    if (i < chain.length - 1) info(`Switching to ${c.bold(chain[i + 1].name)}…`);
  }
  console.log();
  fail('All CLIs in the chain failed. Check: sw status / sw auth all');
  process.exit(1);
}

// --- 5. Chain management -----------------------------------------------------

export function cmdChain(arg) {
  const cfg = loadConfig();
  if (!arg) {
    heading('Fallback chain');
    if (cfg.chain?.length) {
      console.log('  custom: ' + c.bold(cfg.chain.join(' → ')));
      console.log(c.gray('  reset with: sw chain auto'));
    } else {
      console.log('  automatic (picked per prompt):');
      for (const [tier, order] of Object.entries(TIER_ORDER)) {
        console.log(`    ${c.cyan(tier.padEnd(6))} ${order.join(' → ')}`);
      }
      console.log(c.gray('\n  pin your own: sw chain claude,gemini,ollama'));
    }
    return;
  }
  if (arg === 'auto' || arg === 'reset') {
    delete cfg.chain;
    saveConfig(cfg);
    return ok('Chain reset to automatic per-prompt selection.');
  }
  const ids = arg.split(/[,\s]+/).filter(Boolean);
  const bad = ids.filter((id) => !byId(id));
  if (bad.length) return fail(`Unknown CLI id(s): ${bad.join(', ')}. Known: ${CLIS.map((x) => x.id).join(', ')}`);
  cfg.chain = ids;
  saveConfig(cfg);
  ok(`Fallback chain set: ${ids.join(' → ')} (used for every sw auto run).`);
}
