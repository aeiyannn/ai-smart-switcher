// Persistent config at ~/.ai-smart-switcher/config.json
//
// AI_SWITCHER_HOME overrides the state directory (used by tests and by anyone
// who wants an isolated install). Legacy ~/.smart-switcher config is migrated
// on first read, without deleting the old file.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULTS = {
  defaultCli: null,
  models: {}, // per-cli preferred model, e.g. { claude: "sonnet", opencode: "anthropic/claude-sonnet" }
};

export const stateHome = () => process.env.AI_SWITCHER_HOME || join(homedir(), '.ai-smart-switcher');

export const configPath = () => join(stateHome(), 'config.json');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function migrateLegacyConfig() {
  // Keep tests and explicit AI_SWITCHER_HOME installs isolated from ~.
  if (process.env.AI_SWITCHER_HOME) return;
  const target = configPath();
  if (existsSync(target)) return;
  const legacy = join(homedir(), '.smart-switcher', 'config.json');
  if (!existsSync(legacy)) return;
  try {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(legacy, target);
  } catch {
    /* migration is best-effort */
  }
}

export function loadConfig() {
  migrateLegacyConfig();
  const parsed = readJson(configPath());
  const cfg = { ...DEFAULTS, ...(parsed || {}) };
  cfg.models = cfg.models && typeof cfg.models === 'object' ? cfg.models : {};
  if (Array.isArray(cfg.chain)) cfg.chain = cfg.chain.filter((id) => typeof id === 'string');
  return cfg;
}

export function saveConfig(cfg) {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return file;
}
