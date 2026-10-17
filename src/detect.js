// Detect which CLIs are installed and whether they look authenticated.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { version, which } from './spawn.js';

export { version, which };

export function authStatus(cli) {
  // 1) env var present?
  for (const env of cli.authEnv || []) {
    if (process.env[env]) return { authed: true, via: `$${env}` };
  }
  // 2) credential/config file present?
  for (const f of cli.authFiles || []) {
    if (existsSync(join(homedir(), f))) return { authed: true, via: '~/' + f.split('/')[0] };
  }
  if (!cli.authCmd && !(cli.authEnv || []).length) return { authed: true, via: 'no auth needed' };
  return { authed: false, via: null };
}

export function inspect(cli) {
  const path = which(cli.bin);
  const installed = Boolean(path);
  return {
    cli,
    installed,
    path,
    version: installed ? version(path) : null,
    auth: installed ? authStatus(cli) : { authed: false, via: null },
  };
}

export function inspectAll(clis) {
  return clis.map(inspect);
}
