import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ProjectConfig {
  projectPath: string;
  docsPath: string;           // docs folder path (always .pmpt/docs)
  ignorePatterns: string[];
  createdAt: string;
  lastPublished?: string;
  lastPublishedSlug?: string;
  // Git integration settings
  repo?: string;
  trackGit?: boolean;
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
  };

  saveConfig(projectPath, config);
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
