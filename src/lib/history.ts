import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { getHistoryDir } from './config.js';

export interface HistoryEntry {
  version: number;
  timestamp: string;
  filePath: string;
  historyPath: string;
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

  copyFileSync(filePath, historyPath);

  return {
    version,
    timestamp,
    filePath: relPath,
    historyPath,
  };
}

export function getFileHistory(projectPath: string, relPath: string): HistoryEntry[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const fileName = basename(relPath, '.md');
  const files = readdirSync(historyDir);

  const entries: HistoryEntry[] = [];
  for (const file of files) {
    if (file.startsWith(fileName + '-v')) {
      const match = file.match(/-v(\d+)-(.+)\.md$/);
      if (match) {
        entries.push({
          version: parseInt(match[1], 10),
          timestamp: match[2].replace(/-/g, ':'),
          filePath: relPath,
          historyPath: join(historyDir, file),
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
    const match = file.match(/^(.+)-v(\d+)-(.+)\.md$/);
    if (match) {
      const [, name, versionStr, timestamp] = match;
      entries.push({
        version: parseInt(versionStr, 10),
        timestamp: timestamp.replace(/-/g, ':'),
        filePath: name + '.md',
        historyPath: join(historyDir, file),
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
    const match = file.match(/^(.+)-v\d+-.*\.md$/);
    if (match) {
      tracked.add(match[1] + '.md');
    }
  }

  return Array.from(tracked);
}
