import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, isAbsolute } from 'path';

export interface ProjectConfig {
  projectPath: string;
  docsPath: string;           // 문서 폴더 경로 (상대 경로)
  watchPatterns: string[];
  ignorePatterns: string[];
  createdAt: string;
  lastPublished?: string;
  // Git 연동 설정
  repo?: string;
  trackGit?: boolean;
}

const CONFIG_DIR = '.pmpt';
const CONFIG_FILE = 'config.json';
const DEFAULT_DOCS_DIR = 'docs';
const HISTORY_DIR = '.history';

// Common AI tool folders to detect
export const KNOWN_AI_FOLDERS = [
  '.cursor',
  '.claude',
  '.copilot',
  '.aider',
  '.continue',
  'prompts',
  'specs',
  'docs',
];

export function getConfigDir(projectPath: string): string {
  return join(projectPath, CONFIG_DIR);
}

export function getDocsDir(projectPath: string): string {
  const config = loadConfig(projectPath);
  if (config?.docsPath) {
    // If docsPath is absolute, use it; otherwise resolve relative to projectPath
    if (isAbsolute(config.docsPath)) {
      return config.docsPath;
    }
    return join(projectPath, config.docsPath);
  }
  // Default fallback
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

// Detect existing AI tool folders
export function detectExistingFolders(projectPath: string): string[] {
  const found: string[] = [];

  for (const folder of KNOWN_AI_FOLDERS) {
    const folderPath = join(projectPath, folder);
    if (existsSync(folderPath)) {
      // Check if it has any MD files
      try {
        const files = readdirSync(folderPath, { recursive: true });
        const hasMd = files.some((f: string | Buffer) =>
          typeof f === 'string' && f.endsWith('.md')
        );
        if (hasMd || folder === '.cursor' || folder === '.claude') {
          found.push(folder);
        }
      } catch {
        // If we can't read, still add common AI folders
        if (folder === '.cursor' || folder === '.claude') {
          found.push(folder);
        }
      }
    }
  }

  return found;
}

export interface InitOptions {
  repo?: string;
  trackGit?: boolean;
  docsPath?: string;  // Custom docs folder path
}

export function initializeProject(projectPath: string, options?: InitOptions): ProjectConfig {
  const configDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);

  // Determine docs path
  let docsPath: string;
  if (options?.docsPath) {
    // Use custom path
    docsPath = options.docsPath;
  } else {
    // Default to .pmpt/docs
    docsPath = join(CONFIG_DIR, DEFAULT_DOCS_DIR);
  }

  // Create directories
  mkdirSync(configDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });

  // Only create docs folder if it's the default one
  if (!options?.docsPath) {
    const fullDocsPath = join(projectPath, docsPath);
    mkdirSync(fullDocsPath, { recursive: true });
  }

  const config: ProjectConfig = {
    projectPath,
    docsPath,
    watchPatterns: [`${docsPath}/**/*.md`],
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
