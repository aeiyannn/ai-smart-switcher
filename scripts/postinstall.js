#!/usr/bin/env node
// npm postinstall: wire ai-smart-switcher into Claude Code / OpenCode, then —
// only on an interactive GLOBAL install — offer to install missing agents and
// authenticate them.
//
// Rules:
//   - never fail the npm install (every path is wrapped, exit 0)
//   - never prompt in CI, in non-TTY environments, or with AI_SWITCHER_NO_PROMPT
//   - only prompt on global installs (npx / local installs stay silent)
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));
const silent =
  !process.stdin.isTTY ||
  !process.stdout.isTTY ||
  Boolean(process.env.CI) ||
  truthy(process.env.AI_SWITCHER_NO_PROMPT);

const isGlobal = truthy(process.env.npm_config_global) || process.env.npm_config_location === 'global';

// Small, dependency-free prompt. Returns '' when the user just hits enter.
async function ask(question) {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer).trim().toLowerCase());
    });
  });
}

const yes = (answer, def = false) => (answer === '' ? def : answer.startsWith('y'));

try {
  const { installIntegrations } = await import('../src/setup.js');

  // 1. Host integrations (always, no prompt): slash commands + autosave hooks.
  let report = installIntegrations();
  const wired = report.filter((r) => r.status === 'installed');
  if (wired.length) {
    console.log(
      `ai-smart-switcher: added /doctor /auto /context to ${wired.map((r) => r.name).join(' and ')}` +
        ' (re-run anytime with: sw setup)'
    );
  }
  const upgraded = wired.find((r) => r.hooks && /upgraded/.test(r.hooks));
  if (upgraded) console.log(`ai-smart-switcher: ${upgraded.hooks}`);

  // 2. Optional: install missing agents. Global + interactive only.
  if (!silent && isGlobal) {
    const { installOne } = await import('../src/commands.js');
    const { which } = await import('../src/detect.js');
    const { CLIS } = await import('../src/registry.js');
    const npmInstallable = CLIS.filter((c) => c.install?.npm);
    const missing = npmInstallable.filter((c) => !which(c.bin));

    if (missing.length) {
      console.log(
        `\nai-smart-switcher: ${missing.length} supported agent(s) are not installed: ` +
          missing.map((c) => c.name).join(', ')
      );
      const answer = await ask(`Install them globally now with npm? [y/N] `);
      if (yes(answer)) {
        let installedAny = false;
        for (const cli of missing) {
          if (installOne(cli)) installedAny = true;
        }
        // New binaries may unlock commands/hooks for hosts installed just now.
        if (installedAny) report = installIntegrations();
      } else {
        console.log('  Skipped. Install later with: sw install <cli|all>');
      }
    }

    // 3. Optional: authenticate everything installed.
    const installed = CLIS.filter((c) => which(c.bin));
    if (installed.length) {
      const answer = await ask('Log in / connect your agents now (sw auth all)? [y/N] ');
      if (yes(answer)) {
        const { spawnSync } = await import('node:child_process');
        const { fileURLToPath } = await import('node:url');
        const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
        spawnSync(process.execPath, [cliPath, 'auth', 'all'], { stdio: 'inherit' });
      } else {
        console.log('  Skipped. Connect later with: sw auth all');
      }
    }
  }
} catch {
  // never block installation
}
process.exit(0);
