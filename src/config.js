// Persistent config at ~/.smart-switcher/config.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.smart-switcher');
const FILE = join(DIR, 'config.json');

const DEFAULTS = {
  defaultCli: null,
  models: {}, // per-cli preferred model, e.g. { claude: "sonnet", opencode: "ollama/qwen3-coder" }
};

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
  return FILE;
}

export const configPath = FILE;
