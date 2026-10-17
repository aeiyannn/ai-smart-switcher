#!/usr/bin/env node
// npm postinstall: silently wire smart-switcher into Claude Code / OpenCode
// if they exist on this machine. Must NEVER fail the npm install.
try {
  const { installIntegrations } = await import('../src/setup.js');
  const report = installIntegrations();
  const done = report.filter((r) => r.status === 'installed');
  if (done.length) {
    console.log(
      'smart-switcher: added /doctor /auto /context to ' +
        done.map((r) => r.name).join(' and ') +
        ' (re-run anytime with: sw setup)'
    );
  }
} catch {
  // never block installation
}
process.exit(0);
