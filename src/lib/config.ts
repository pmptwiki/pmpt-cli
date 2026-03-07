import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

export interface ProjectConfig {
  projectPath: string;
  docsPath: string;           // docs folder path (always .pmpt/docs)
  ignorePatterns: string[];
  createdAt: string;
  lastPublished?: string;
  lastPublishedSlug?: string;
  lastPublishedVersionCount?: number;
  // Git integration settings
  repo?: string;
  trackGit?: boolean;
  // Project origin tracking
  origin?: 'new' | 'adopted';
  gitCommitsAtInit?: number;
}

const CONFIG_DIR = '.pmpt';
const CONFIG_FILE = 'config.json';
const DEFAULT_DOCS_DIR = 'docs';
const HISTORY_DIR = '.history';

export function getConfigDir(projectPath: string): string {
  return join(projectPath, CONFIG_DIR);
}

export function getDocsDir(projectPath: string): string {
  return join(getConfigDir(projectPath), DEFAULT_DOCS_DIR);
}

// Alias for backward compatibility
export const getPmptDir = getDocsDir;

export function getHistoryDir(projectPath: string): string {
  return join(getConfigDir(projectPath), HISTORY_DIR);
}

export function isInitialized(projectPath: string): boolean {
  return existsSync(join(getConfigDir(projectPath), CONFIG_FILE));
}

export interface InitOptions {
  repo?: string;
  trackGit?: boolean;
  origin?: 'new' | 'adopted';
  gitCommitsAtInit?: number;
}

export function initializeProject(projectPath: string, options?: InitOptions): ProjectConfig {
  const configDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  // docsPath is always .pmpt/docs
  const docsPath = join(CONFIG_DIR, DEFAULT_DOCS_DIR);

  // Create directories
  mkdirSync(configDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const config: ProjectConfig = {
    projectPath,
    docsPath,
    ignorePatterns: ['node_modules/**', '.pmpt/.history/**', 'dist/**'],
    createdAt: new Date().toISOString(),
    repo: options?.repo,
    trackGit: options?.trackGit ?? true,
    origin: options?.origin,
    gitCommitsAtInit: options?.gitCommitsAtInit,
  };

  saveConfig(projectPath, config);

  // Create README.md if it doesn't exist
  const readmePath = join(configDir, 'README.md');
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, PMPT_README, 'utf-8');
  }

  return config;
}

export function loadConfig(projectPath: string): ProjectConfig | null {
  const configPath = join(getConfigDir(projectPath), CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveConfig(projectPath: string, config: ProjectConfig): void {
  const configPath = join(getConfigDir(projectPath), CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

const PMPT_CLAUDE_SECTION = `
<!-- pmpt -->
## pmpt MCP Tools

This project uses [pmpt](https://pmptwiki.com) to track development progress.

**If pmpt MCP is available in this session**, use these tools proactively — do not wait for the user to ask:
- \`mcp__pmpt__pmpt_save\` — save a snapshot after milestones (always include a \`summary\`)
- \`mcp__pmpt__pmpt_status\` — check project status
- \`mcp__pmpt__pmpt_read_context\` — read project context at session start

Save after: feature completion, architecture decisions, bug fixes, or any significant progress.

If pmpt MCP is not available, run \`pmpt save\` in terminal instead.
<!-- /pmpt -->
`;

/**
 * Add pmpt MCP instructions to CLAUDE.md in the project root.
 * Creates the file if it doesn't exist; appends the section if not already present.
 */
export function ensurePmptClaudeMd(projectPath: string): void {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  const marker = '<!-- pmpt -->';

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(marker)) return; // already has pmpt section
    writeFileSync(claudeMdPath, content.trimEnd() + '\n' + PMPT_CLAUDE_SECTION, 'utf-8');
  } else {
    writeFileSync(claudeMdPath, '# Project Instructions\n' + PMPT_CLAUDE_SECTION, 'utf-8');
  }
}

function detectPmptMcpPath(): string | null {
  // Strategy 1: sibling to the current pmpt binary
  try {
    const pmptBin = process.argv[1];
    const siblingPath = join(dirname(pmptBin), 'pmpt-mcp');
    if (existsSync(siblingPath)) return siblingPath;
  } catch { /* skip */ }

  // Strategy 2: which / where command
  try {
    const cmd = process.platform === 'win32' ? 'where pmpt-mcp' : 'which pmpt-mcp';
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const firstLine = result.split('\n')[0].trim();
    if (firstLine && existsSync(firstLine)) return firstLine;
  } catch { /* not in PATH */ }

  return null;
}

/**
 * Create or update .mcp.json in the project root to register the pmpt MCP server.
 * Skips silently if pmpt-mcp binary cannot be found.
 */
export function ensureMcpJson(projectPath: string): void {
  const mcpJsonPath = join(projectPath, '.mcp.json');
  const mcpPath = detectPmptMcpPath();
  if (!mcpPath) return; // can't detect binary — skip silently

  let config: Record<string, unknown> = {};
  if (existsSync(mcpJsonPath)) {
    try { config = JSON.parse(readFileSync(mcpJsonPath, 'utf-8')); } catch { config = {}; }
    // Already registered — don't overwrite
    const servers = config.mcpServers as Record<string, unknown> | undefined;
    if (servers?.pmpt) return;
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>).pmpt = { command: mcpPath };
  writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

const PMPT_README = `# .pmpt — Your Project's Development Journal

This folder is managed by [pmpt](https://pmptwiki.com). It records your product development journey with AI.

## What's Inside

\`\`\`
.pmpt/
├── config.json     ← Project settings (auto-generated)
├── docs/
│   ├── pmpt.md     ← Human-facing project document (YOU update this)
│   ├── pmpt.ai.md  ← AI-facing prompt (paste into your AI tool)
│   └── plan.md     ← Original plan from pmpt plan
└── .history/       ← Version snapshots (auto-managed)
\`\`\`

## Quick Reference

| Command | What it does |
|---------|-------------|
| \`pmpt plan\` | Create or view your AI prompt |
| \`pmpt save\` | Save a snapshot of current docs |
| \`pmpt history\` | View version history |
| \`pmpt diff\` | Compare versions side by side |
| \`pmpt publish\` | Share your journey on pmptwiki.com |

## How to Get the Most Out of pmpt

1. **Paste \`pmpt.ai.md\` into your AI tool** to start building
2. **Update \`pmpt.md\` as you go** — mark features done, log decisions
3. **Run \`pmpt save\` at milestones** — after setup, after each feature, after big changes
4. **Publish when ready** — others can clone your journey and learn from it

## When Things Go Wrong

| Problem | Solution |
|---------|----------|
| Lost your AI prompt | \`pmpt plan\` to regenerate or view it |
| Messed up docs | \`pmpt history\` → \`pmpt diff\` to find the good version |
| Need to start over | \`pmpt recover\` rebuilds context from history |
| Accidentally deleted .pmpt | Re-clone from pmptwiki.com if published |

## One Request

Please keep \`pmpt.md\` updated as you build. It's the human-readable record of your journey — what you tried, what worked, what you decided. When you publish, this is what others will learn from.

Your snapshots tell a story. Make it a good one.

---

*Learn more at [pmptwiki.com](https://pmptwiki.com)*
`;

