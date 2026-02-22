import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { getHistoryDir, loadConfig } from './config.js';
import { getGitInfo, isGitRepo, type GitInfo } from './git.js';

export interface HistoryEntry {
  version: number;
  timestamp: string;
  filePath: string;
  historyPath: string;
  git?: {
    commit: string;
    commitFull: string;
    branch: string;
    dirty: boolean;
    tag?: string;
  };
}

export function createSnapshot(projectPath: string, filePath: string): HistoryEntry {
  const historyDir = getHistoryDir(projectPath);
  const relPath = relative(projectPath, filePath);
  const fileName = basename(filePath, '.md');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Find next version number
  const existing = getFileHistory(projectPath, relPath);
  const version = existing.length + 1;

  const historyFileName = `${fileName}-v${version}-${timestamp}.md`;
  const historyPath = join(historyDir, historyFileName);

  // Git 정보 수집 (설정에서 trackGit이 활성화된 경우)
  const config = loadConfig(projectPath);
  let gitData: HistoryEntry['git'] | undefined;

  if (config?.trackGit && isGitRepo(projectPath)) {
    const gitInfo = getGitInfo(projectPath, config.repo);
    if (gitInfo) {
      gitData = {
        commit: gitInfo.commit,
        commitFull: gitInfo.commitFull,
        branch: gitInfo.branch,
        dirty: gitInfo.dirty,
        tag: gitInfo.tag,
      };
    }
  }

  // 파일 복사
  copyFileSync(filePath, historyPath);

  // Git 정보를 메타데이터 파일로 저장
  if (gitData) {
    const metaPath = historyPath.replace(/\.md$/, '.meta.json');
    writeFileSync(metaPath, JSON.stringify({
      version,
      timestamp,
      filePath: relPath,
      git: gitData,
    }, null, 2), 'utf-8');
  }

  return {
    version,
    timestamp,
    filePath: relPath,
    historyPath,
    git: gitData,
  };
}

export function getFileHistory(projectPath: string, relPath: string): HistoryEntry[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const fileName = basename(relPath, '.md');
  const files = readdirSync(historyDir);

  const entries: HistoryEntry[] = [];
  for (const file of files) {
    if (file.startsWith(fileName + '-v') && file.endsWith('.md') && !file.endsWith('.meta.json')) {
      const match = file.match(/-v(\d+)-(.+)\.md$/);
      if (match) {
        const historyPath = join(historyDir, file);
        const metaPath = historyPath.replace(/\.md$/, '.meta.json');

        let gitData: HistoryEntry['git'] | undefined;
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            gitData = meta.git;
          } catch {
            // 메타 파일 파싱 실패 시 무시
          }
        }

        entries.push({
          version: parseInt(match[1], 10),
          timestamp: match[2].replace(/-/g, ':'),
          filePath: relPath,
          historyPath,
          git: gitData,
        });
      }
    }
  }

  return entries.sort((a, b) => a.version - b.version);
}

export function getAllHistory(projectPath: string): HistoryEntry[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir);
  const entries: HistoryEntry[] = [];

  for (const file of files) {
    // .meta.json 파일 제외
    if (file.endsWith('.meta.json')) continue;

    const match = file.match(/^(.+)-v(\d+)-(.+)\.md$/);
    if (match) {
      const [, name, versionStr, timestamp] = match;
      const historyPath = join(historyDir, file);
      const metaPath = historyPath.replace(/\.md$/, '.meta.json');

      let gitData: HistoryEntry['git'] | undefined;
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          gitData = meta.git;
        } catch {
          // 메타 파일 파싱 실패 시 무시
        }
      }

      entries.push({
        version: parseInt(versionStr, 10),
        timestamp: timestamp.replace(/-/g, ':'),
        filePath: name + '.md',
        historyPath,
        git: gitData,
      });
    }
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function getTrackedFiles(projectPath: string): string[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir);
  const tracked = new Set<string>();

  for (const file of files) {
    // .meta.json 파일 제외
    if (file.endsWith('.meta.json')) continue;

    const match = file.match(/^(.+)-v\d+-.*\.md$/);
    if (match) {
      tracked.add(match[1] + '.md');
    }
  }

  return Array.from(tracked);
}
