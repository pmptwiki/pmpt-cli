import * as p from '@clack/prompts';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

interface McpClientOption {
  value: string;
  label: string;
  hint: string;
  configPath: string | null;
  alreadyConfigured: boolean;
}

function detectPmptMcpPath(): string | null {
  // Strategy 1: sibling to the current pmpt binary (same bin directory)
  const pmptBin = process.argv[1];
  const siblingPath = join(dirname(pmptBin), 'pmpt-mcp');
  if (existsSync(siblingPath)) {
    return siblingPath;
  }

  // Strategy 2: which / where command
  try {
    const cmd = process.platform === 'win32' ? 'where pmpt-mcp' : 'which pmpt-mcp';
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const firstLine = result.split('\n')[0].trim();
    if (firstLine && existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // not found in PATH
  }

  return null;
}

function isCommandAvailable(cmd: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${cmd}`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function isClaudeAlreadyConfigured(): boolean {
  try {
    const result = execSync('claude mcp list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.includes('pmpt');
  } catch {
    return false;
  }
}

function isJsonConfigured(configPath: string): boolean {
  try {
    if (!existsSync(configPath)) return false;
    const content = JSON.parse(readFileSync(configPath, 'utf-8'));
    return !!content?.mcpServers?.pmpt;
  } catch {
    return false;
  }
}

function configureClaudeCode(mcpBinaryPath: string): void {
  // Remove existing entry first (ignore errors if not found)
  try {
    execSync('claude mcp remove pmpt', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    // not configured yet — that's fine
  }
  execSync(
    `claude mcp add --transport stdio pmpt -- "${mcpBinaryPath}"`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function configureJsonFile(configPath: string, mcpBinaryPath: string): void {
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      config = {};
    }
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  (config.mcpServers as Record<string, unknown>).pmpt = {
    command: mcpBinaryPath,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export async function cmdMcpSetup(): Promise<void> {
  p.intro('pmpt mcp-setup');

  // Step 1: Detect pmpt-mcp absolute path
  const s = p.spinner();
  s.start('Detecting pmpt-mcp location...');
  let mcpPath = detectPmptMcpPath();

  if (mcpPath) {
    s.stop(`Found: ${mcpPath}`);
  } else {
    s.stop('Could not auto-detect pmpt-mcp path');

    p.log.warn('pmpt-mcp binary not found automatically.');
    p.log.info('Install globally if not yet: npm install -g pmpt');

    const manualPath = await p.text({
      message: 'Enter the absolute path to pmpt-mcp:',
      placeholder: '/usr/local/bin/pmpt-mcp',
      validate: (value) => {
        if (!value.trim()) return 'Path is required';
        if (!existsSync(value.trim())) return `File not found: ${value.trim()}`;
        return undefined;
      },
    });

    if (p.isCancel(manualPath)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    mcpPath = (manualPath as string).trim();
  }

  // Step 2: Detect available MCP clients
  const claudeAvailable = isCommandAvailable('claude');
  const claudeConfigured = claudeAvailable && isClaudeAlreadyConfigured();

  const cursorConfigPath = join(homedir(), '.cursor', 'mcp.json');
  const cursorDirExists = existsSync(join(homedir(), '.cursor'));
  const cursorConfigured = isJsonConfigured(cursorConfigPath);

  const mcpJsonPath = join(process.cwd(), '.mcp.json');
  const mcpJsonConfigured = isJsonConfigured(mcpJsonPath);

  const options: McpClientOption[] = [];

  if (claudeAvailable) {
    options.push({
      value: 'claude-code',
      label: 'Claude Code',
      hint: claudeConfigured ? 'Already configured — will reconfigure' : 'claude CLI detected',
      configPath: null,
      alreadyConfigured: claudeConfigured,
    });
  }

  if (cursorDirExists) {
    options.push({
      value: 'cursor',
      label: 'Cursor',
      hint: cursorConfigured ? 'Already configured — will reconfigure' : '~/.cursor/mcp.json',
      configPath: cursorConfigPath,
      alreadyConfigured: cursorConfigured,
    });
  }

  options.push({
    value: 'mcp-json',
    label: '.mcp.json (project root)',
    hint: mcpJsonConfigured ? 'Already configured — will reconfigure' : 'Works with any MCP-compatible tool',
    configPath: mcpJsonPath,
    alreadyConfigured: mcpJsonConfigured,
  });

  // Step 3: Select client
  const selected = await p.select({
    message: 'Which MCP client do you want to configure?',
    options: options.map(o => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const client = options.find(o => o.value === selected)!;

  // Step 4: Configure
  const s2 = p.spinner();
  s2.start(`Configuring ${client.label}...`);

  try {
    switch (client.value) {
      case 'claude-code':
        configureClaudeCode(mcpPath);
        break;
      case 'cursor':
        configureJsonFile(client.configPath!, mcpPath);
        break;
      case 'mcp-json':
        configureJsonFile(client.configPath!, mcpPath);
        break;
    }
    s2.stop(`${client.label} configured!`);
  } catch (err) {
    s2.stop('Configuration failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to write configuration.');
    process.exit(1);
  }

  // Step 5: Summary
  p.log.success(`MCP server registered for ${client.label}`);

  if (client.value === 'claude-code') {
    p.log.info('Registered via claude CLI.');
  } else {
    p.log.info(`Config written to: ${client.configPath}`);
  }

  p.note(
    [
      `Binary:  ${mcpPath}`,
      `Client:  ${client.label}`,
      '',
      'Available MCP tools:',
      '  pmpt_save, pmpt_status, pmpt_history, pmpt_diff,',
      '  pmpt_quality, pmpt_plan, pmpt_read_context, pmpt_publish',
    ].join('\n'),
    'MCP Setup Complete',
  );

  p.outro('Restart your AI tool to activate the MCP server.');
}
