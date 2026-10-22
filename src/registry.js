// Registry of supported AI coding CLIs.
// Each entry is plain data; detection/auth logic lives in detect.js.
// homeDirs/authFiles are checked relative to the user's home directory.
//
// The supported set is intentionally small: Claude Code, OpenCode, Freebuff,
// Devin and Antigravity. Everything else was removed in 0.2.0.
export const CLIS = [
  {
    id: 'claude',
    name: 'Claude Code',
    vendor: 'Anthropic',
    bin: 'claude',
    install: { npm: '@anthropic-ai/claude-code', brew: null, curl: 'curl -fsSL https://claude.ai/install.sh | bash' },
    authEnv: ['ANTHROPIC_API_KEY'],
    authCmd: 'claude (run once, pick "Log in")',
    authFiles: ['.claude/.credentials.json', '.claude.json', 'Library/Application Support/Claude Code'],
    contextFiles: ['CLAUDE.md'],
    agentsMd: 'mirror', // reads CLAUDE.md; it points at AGENTS.md
    model: { flag: '--model <model>', env: 'ANTHROPIC_MODEL', examples: ['sonnet', 'opus', 'haiku'] },
    free: 'No free tier — Claude subscription (Pro/Max) or API key.',
    runArgs: (prompt) => (prompt ? ['-p', prompt] : []),
    autoArgs: (prompt) => ['-p', prompt],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'SST / opencode.ai',
    bin: 'opencode',
    install: { npm: 'opencode-ai', brew: 'anomalyco/tap/opencode', curl: 'curl -fsSL https://opencode.ai/install | bash' },
    authEnv: [],
    authCmd: 'opencode auth login',
    authFiles: ['.local/share/opencode/auth.json'],
    contextFiles: ['AGENTS.md'],
    agentsMd: 'native',
    model: { flag: '--model <provider/model>', cmd: '/models inside TUI', examples: ['anthropic/claude-sonnet', 'opencode/glm-5.3-flash'] },
    free: 'FREE & open source. $0 with OpenCode Zen free models (GLM 5.3 Flash, DeepSeek V4.1 Flash), or pay per provider.',
    runArgs: (prompt) => (prompt ? ['run', prompt] : []),
    autoArgs: (prompt) => ['run', prompt],
  },
  {
    id: 'freebuff',
    name: 'Freebuff',
    vendor: 'Freebuff',
    bin: 'freebuff',
    url: 'https://freebuff.com/',
    install: { npm: 'freebuff', brew: null, curl: null },
    authEnv: [],
    authCmd: null, // no account, no API key — ad-funded
    authFiles: [],
    contextFiles: ['knowledge.md', 'AGENTS.md', 'CLAUDE.md'],
    agentsMd: 'mirror', // reads knowledge.md first, then AGENTS.md, then CLAUDE.md
    model: {
      cmd: '/model inside the TUI',
      examples: ['GLM 5.3 Flash', 'DeepSeek V4.1 Flash', 'MiMo v2.6 Flash Fast', 'Solar Mini 4'],
    },
    free: '100% FREE and ad-funded — no API key, no credits. 5 h/day (4 h on VPN) of GLM 5.3 Flash, DeepSeek V4.1 Flash, MiMo v2.6 Flash Fast.',
    // Freebuff is an interactive TUI: it accepts no prompt argument.
    runArgs: () => [],
    auto: false,
    note: 'interactive TUI — no unattended prompt support',
  },
  {
    id: 'devin',
    name: 'Devin CLI',
    vendor: 'Cognition',
    bin: 'devin',
    install: { npm: null, brew: null, curl: 'curl -fsSL https://cli.devin.ai/install.sh | bash' },
    authEnv: [],
    authCmd: 'devin auth login',
    authFiles: ['.config/devin/config.json'],
    contextFiles: ['AGENTS.md'],
    agentsMd: 'native',
    model: { flag: '--model <name>', cmd: '/model inside TUI', examples: ['adaptive (default)', 'opus', 'sonnet', 'swe', 'codex', 'gemini'] },
    free: 'Effectively paid — plans from ~$20/mo (the free SWE-2 promo ended in October 2026).',
    runArgs: (prompt) => (prompt ? ['--', prompt] : []), // interactive session, prompt as first message
    autoArgs: (prompt) => ['-p', prompt], // non-interactive, safe for auto routing
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    vendor: 'Google',
    bin: 'agy',
    install: { npm: null, brew: null, curl: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' },
    authEnv: ['GEMINI_API_KEY'],
    authCmd: 'agy (run once — Google Sign-In in browser)',
    authFiles: ['.config/antigravity'],
    contextFiles: ['AGENTS.md', '.agents/'],
    agentsMd: 'native',
    model: { flag: '-m <model>', cmd: '/model inside TUI (also /effort, /usage)', examples: ['gemini-3.1-pro', 'claude-sonnet', 'gpt-oss-120b'] },
    free: 'FREE with a personal Google account (credit quota, check /usage). Google\'s designated free coding CLI since June 2026.',
    runArgs: (prompt) => (prompt ? ['-p', prompt] : []),
    autoArgs: (prompt) => ['-p', prompt],
  },
];

export const byId = (id) =>
  CLIS.find((x) => x.id === id || x.bin === id || x.name.toLowerCase() === String(id).toLowerCase());

// CLIs that can run unattended (auto mode). Freebuff's TUI is excluded.
export const AUTO_CLIS = CLIS.filter((x) => x.auto !== false && x.autoArgs);
