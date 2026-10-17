#!/usr/bin/env node
// smart-switcher — universal manager for AI coding CLIs.
import { CLIS, byId } from '../src/registry.js';
import { inspectAll } from '../src/detect.js';
import { loadConfig } from '../src/config.js';
import { contextInit, contextOptimize, contextTokens } from '../src/context.js';
import { cmdAuth, cmdDoctor, cmdFree, cmdInstall, cmdModel, cmdRun, cmdStatus, cmdUse } from '../src/commands.js';
import { cmdAuto, cmdChain } from '../src/auto.js';
import { cmdSetup } from '../src/setup.js';
import { c, select } from '../src/ui.js';

const [cmd, ...rest] = process.argv.slice(2);

const HELP = `
${c.bold('smart-switcher')} — one manager for every AI coding CLI

  ${c.cyan('sw')}                    pick a connected agent and launch it
  ${c.cyan('sw auto "<task>"')}      best agent for the task, auto-switches when limits hit
  ${c.cyan('sw doctor')}             full checkup: installed? logged in? fixes + free options
  ${c.cyan('sw context')}            one AGENTS.md shared by every agent (saves tokens)
  ${c.cyan('sw context save "<note>"')}   remember a decision — shared with ALL agents
  ${c.cyan('sw context search "<q>"')}    instant local search: paste only the match, not whole files

${c.bold('Setup')}
  ${c.cyan('sw install <cli|all>')}  ${c.cyan('sw auth <cli|all>')}  ${c.cyan('sw use <cli>')}  ${c.cyan('sw model <cli> <model>')}

${c.bold('More')}
  ${c.cyan('sw run [cli] [prompt]')}   ${c.cyan('sw chain [ids|auto]')}
  ${c.cyan('sw setup')} ${c.gray('add /doctor /auto /context + auto-capture to Claude Code, OpenCode & Codex')}
  ${c.cyan('sw setup remove')} ${c.gray('disable it all again (commands + hooks; nothing else touched)')}
  ${c.gray('context subcommands: init · tokens · optimize · save · search')}

${c.gray('Agents: ' + CLIS.map((x) => x.id).join(', '))}
`;

async function interactive() {
  const cfg = loadConfig();
  const states = inspectAll(CLIS);
  const connected = states.filter((s) => s.installed && s.auth.authed);
  const disconnected = states.filter((s) => s.installed && !s.auth.authed); // red: installed, not logged in
  const notInstalled = states.filter((s) => !s.installed);

  // current agent first
  connected.sort((a, b) => (b.cli.id === cfg.defaultCli) - (a.cli.id === cfg.defaultCli));

  const items = [
    ...connected.map((s) => ({
      label: (cfg.defaultCli === s.cli.id ? '★ ' : '') + s.cli.name + (cfg.defaultCli === s.cli.id ? c.gray(' (current)') : ''),
      value: 'run:' + s.cli.id,
      note: cfg.models[s.cli.id] || '',
    })),
    {
      label: c.yellow('+ connect another agent'),
      value: 'connect',
      note: disconnected.length ? c.red(`${disconnected.length} installed but not connected`) : '',
    },
    { label: c.gray('⚙ doctor — checkup & fixes'), value: 'doctor' },
  ];
  const picked = await select(connected.length ? 'Launch which agent?' : 'No agent connected yet', items, { hint: '↑↓ enter · q quits' });
  if (!picked) return;
  if (picked === 'doctor') return cmdDoctor();
  if (picked.startsWith('run:')) return cmdRun(picked.slice(4), []);

  // connect flow: red = installed but not logged in (one enter to fix),
  // gray = not installed yet.
  const options = [
    ...disconnected.map((s) => ({
      label: c.red(s.cli.name),
      value: 'auth:' + s.cli.id,
      note: c.red('installed, not connected — enter to log in'),
    })),
    ...notInstalled.map((s) => ({
      label: s.cli.name,
      value: 'install:' + s.cli.id,
      note: c.gray(/FREE/.test(s.cli.free || '') ? 'free · not installed' : 'not installed'),
    })),
  ];
  if (!options.length) return cmdDoctor();
  const choice = await select('Connect which agent?', options, { hint: 'red = just needs login' });
  if (!choice) return;
  const [action, id] = choice.split(':');
  if (action === 'auth') return cmdAuth(id);
  await cmdInstall(id);
  return cmdAuth(id);
}

try {
  switch (cmd) {
    case undefined:
    case 'menu':
      await interactive();
      break;
    case 'doctor':
    case 'status':
    case 'list':
      cmdDoctor();
      break;
    case 'install':
    case 'i':
      await cmdInstall(rest[0] || 'all');
      break;
    case 'auth':
    case 'login':
      rest[0] ? await cmdAuth(rest[0]) : console.log('Usage: sw auth <cli|all>');
      break;
    case 'auto':
    case 'a':
    case 'ask':
      await cmdAuto(rest);
      break;
    case 'chain':
      cmdChain(rest.join(','));
      break;
    case 'setup':
    case 'integrate':
      await cmdSetup(rest[0]);
      break;
    case 'disable':
      await cmdSetup('remove');
      break;
    case 'use':
    case 'switch':
      await cmdUse(rest[0]);
      break;
    case 'run':
    case 'r':
      cmdRun(rest[0], rest.slice(1));
      break;
    case 'model':
    case 'models':
      rest[0] ? cmdModel(rest[0], rest[1]) : console.log('Usage: sw model <cli> [model]');
      break;
    case 'context':
    case 'ctx': {
      const sub = rest[0] || 'init';
      if (sub === 'init' || sub === 'sync') contextInit();
      else if (sub === 'tokens') contextTokens();
      else if (sub === 'optimize') contextOptimize();
      else if (sub === 'save') (await import('../src/store.js')).contextSave(rest.slice(1));
      else if (sub === 'autosave') await (await import('../src/store.js')).contextAutosave();
      else if (sub === 'search' || sub === 'find') (await import('../src/store.js')).contextSearch(rest.slice(1));
      else console.log('Usage: sw context <init|tokens|optimize|save|search>');
      break;
    }
    case 'free':
    case 'offers':
      cmdFree();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(HELP);
      if (cmd && !['help', '--help', '-h'].includes(cmd) && byId(cmd)) {
        console.log(c.yellow(`Did you mean: sw run ${cmd}`));
      }
  }
} catch (err) {
  console.error(c.red('error: ') + (err?.message || err));
  process.exit(1);
}
