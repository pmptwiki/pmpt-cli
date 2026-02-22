import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ProjectConfig {
  projectPath: string;
  watchPatterns: string[];
  ignorePatterns: string[];
  createdAt: string;
  lastPublished?: string;
}

const CONFIG_DIR = '.promptwiki';
const CONFIG_FILE = 'config.json';
const HISTORY_DIR = 'history';

export function getConfigDir(projectPath: string): string {
  return join(projectPath, CONFIG_DIR);
}

export function getHistoryDir(projectPath: string): string {
  return join(getConfigDir(projectPath), HISTORY_DIR);
}

export function isInitialized(projectPath: string): boolean {
  return existsSync(join(getConfigDir(projectPath), CONFIG_FILE));
}

export function initializeProject(projectPath: string): ProjectConfig {
  const configDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);

  mkdirSync(configDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });

  const config: ProjectConfig = {
    projectPath,
    watchPatterns: ['**/*.md', '**/*.mdx'],
    ignorePatterns: ['node_modules/**', '.promptwiki/**', 'dist/**'],
    createdAt: new Date().toISOString(),
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
