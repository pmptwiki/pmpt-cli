import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, isAbsolute } from 'path';

export interface ProjectConfig {
  projectPath: string;
  docsPath: string;           // pmpt 생성 파일 위치 (항상 .pmpt/docs)
  watchPaths: string[];       // 추적할 폴더들 (기존 폴더 + docsPath)
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
  // docsPath is always .pmpt/docs
  return join(getConfigDir(projectPath), DEFAULT_DOCS_DIR);
}

// Get all watch paths (for tracking multiple folders)
export function getWatchPaths(projectPath: string): string[] {
  const config = loadConfig(projectPath);
  if (config?.watchPaths) {
    return config.watchPaths.map(p =>
      isAbsolute(p) ? p : join(projectPath, p)
    );
  }
  // Default fallback
  return [getDocsDir(projectPath)];
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
  additionalWatchPaths?: string[];  // 추가로 추적할 기존 폴더들
}

export function initializeProject(projectPath: string, options?: InitOptions): ProjectConfig {
  const configDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);

  // docsPath is always .pmpt/docs (pmpt-generated files go here)
  const docsPath = join(CONFIG_DIR, DEFAULT_DOCS_DIR);

  // Create directories
  mkdirSync(configDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  mkdirSync(join(projectPath, docsPath), { recursive: true });

  // Build watchPaths: always include docsPath + any additional paths
  const watchPaths = [docsPath];
  if (options?.additionalWatchPaths) {
    for (const p of options.additionalWatchPaths) {
      if (!watchPaths.includes(p)) {
        watchPaths.push(p);
      }
    }
  }

  const config: ProjectConfig = {
    projectPath,
    docsPath,
    watchPaths,
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
