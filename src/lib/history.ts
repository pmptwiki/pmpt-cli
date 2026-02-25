import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { getHistoryDir, getDocsDir, loadConfig } from './config.js';
import { getGitInfo, isGitRepo } from './git.js';
import glob from 'fast-glob';

/** Generate compact timestamp for snapshot dir names: 20260225T163000 */
function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:\.]/g, '').slice(0, 15);
}

/** Parse snapshot dir timestamp (compact or legacy) to ISO string */
function parseTimestamp(raw: string): string {
  // Compact: 20260225T163000
  if (/^\d{8}T\d{6}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}`;
  }
  // Legacy: 2026-02-25T16-30-00
  return raw.replace(/T(.+)$/, (_, time: string) => 'T' + time.replace(/-/g, ':'));
}

export interface SnapshotEntry {
  version: number;
  timestamp: string;
  snapshotDir: string;
  files: string[];
  changedFiles?: string[];  // only changed files stored in snapshot dir (undefined = all files stored)
  note?: string;
  git?: {
    commit: string;
    commitFull: string;
    branch: string;
    dirty: boolean;
    tag?: string;
  };
}

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

/**
 * Save .pmpt/docs MD files as snapshot
 * Copy only changed files to optimize storage
 */
export function createFullSnapshot(projectPath: string, options?: { note?: string }): SnapshotEntry {
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  mkdirSync(historyDir, { recursive: true });

  // Find next version number
  const existing = getAllSnapshots(projectPath);
  const version = existing.length + 1;

  const timestamp = compactTimestamp();
  const snapshotName = `v${version}-${timestamp}`;
  const snapshotDir = join(historyDir, snapshotName);

  mkdirSync(snapshotDir, { recursive: true });

  // Compare docs folder MD files and copy only changes
  const files: string[] = [];
  const changedFiles: string[] = [];

  if (existsSync(docsDir)) {
    const mdFiles = glob.sync('**/*.md', { cwd: docsDir });

    for (const file of mdFiles) {
      const srcPath = join(docsDir, file);
      const newContent = readFileSync(srcPath, 'utf-8');
      files.push(file);

      // Compare with previous version
      let hasChanged = true;
      if (existing.length > 0) {
        const prevContent = resolveFileContent(existing, existing.length - 1, file);
        if (prevContent !== null && prevContent === newContent) {
          hasChanged = false;
        }
      }

      if (hasChanged) {
        const destPath = join(snapshotDir, file);

        // Create subdirectory if needed
        const destDir = join(snapshotDir, file.split('/').slice(0, -1).join('/'));
        if (destDir !== snapshotDir) {
          mkdirSync(destDir, { recursive: true });
        }

        copyFileSync(srcPath, destPath);
        changedFiles.push(file);
      }
    }
  }

  // Collect git info
  const config = loadConfig(projectPath);
  let gitData: SnapshotEntry['git'] | undefined;

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

  // Save metadata
  const note = options?.note;
  const metaPath = join(snapshotDir, '.meta.json');
  writeFileSync(metaPath, JSON.stringify({
    version,
    timestamp,
    files,
    changedFiles,
    ...(note ? { note } : {}),
    git: gitData,
  }, null, 2), 'utf-8');

  return {
    version,
    timestamp,
    snapshotDir,
    files,
    changedFiles,
    note,
    git: gitData,
  };
}

/**
 * Single file snapshot (specific file in pmpt folder)
 * Kept for backward compatibility, uses full snapshot internally
 */
export function createSnapshot(projectPath: string, filePath: string): HistoryEntry {
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);
  const relPath = relative(docsDir, filePath);

  // If file is outside docs folder
  if (relPath.startsWith('..')) {
    // Use relative path from project root
    const projectRelPath = relative(projectPath, filePath);
    return createSingleFileSnapshot(projectPath, filePath, projectRelPath);
  }

  return createSingleFileSnapshot(projectPath, filePath, relPath);
}

function createSingleFileSnapshot(projectPath: string, filePath: string, relPath: string): HistoryEntry {
  const historyDir = getHistoryDir(projectPath);
  const timestamp = compactTimestamp();

  // Check existing version count for this file
  const existing = getFileHistory(projectPath, relPath);
  const version = existing.length + 1;

  // Create version folder
  const snapshotName = `v${version}-${timestamp}`;
  const snapshotDir = join(historyDir, snapshotName);
  mkdirSync(snapshotDir, { recursive: true });

  // Copy file
  const destPath = join(snapshotDir, basename(filePath));
  copyFileSync(filePath, destPath);

  // Collect git info
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

  // Save metadata
  const metaPath = join(snapshotDir, '.meta.json');
  writeFileSync(metaPath, JSON.stringify({
    version,
    timestamp,
    filePath: relPath,
    git: gitData,
  }, null, 2), 'utf-8');

  return {
    version,
    timestamp,
    filePath: relPath,
    historyPath: destPath,
    git: gitData,
  };
}

/**
 * List all snapshots
 */
export function getAllSnapshots(projectPath: string): SnapshotEntry[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const entries: SnapshotEntry[] = [];
  const dirs = readdirSync(historyDir);

  for (const dir of dirs) {
    const match = dir.match(/^v(\d+)-(.+)$/);
    if (!match) continue;

    const snapshotDir = join(historyDir, dir);
    if (!statSync(snapshotDir).isDirectory()) continue;

    const metaPath = join(snapshotDir, '.meta.json');
    let meta: any = {};

    if (existsSync(metaPath)) {
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      } catch {
        // Use defaults if meta file parsing fails
      }
    }

    entries.push({
      version: parseInt(match[1], 10),
      timestamp: parseTimestamp(match[2]),
      snapshotDir,
      files: meta.files || [],
      changedFiles: meta.changedFiles,
      note: meta.note,
      git: meta.git,
    });
  }

  return entries.sort((a, b) => a.version - b.version);
}

/**
 * Get file history (backward compatibility)
 */
export function getFileHistory(projectPath: string, relPath: string): HistoryEntry[] {
  const historyDir = getHistoryDir(projectPath);
  if (!existsSync(historyDir)) return [];

  const fileName = basename(relPath);
  const entries: HistoryEntry[] = [];
  const dirs = readdirSync(historyDir);

  for (const dir of dirs) {
    const match = dir.match(/^v(\d+)-(.+)$/);
    if (!match) continue;

    const snapshotDir = join(historyDir, dir);
    if (!statSync(snapshotDir).isDirectory()) continue;

    const filePath = join(snapshotDir, fileName);
    if (!existsSync(filePath)) continue;

    const metaPath = join(snapshotDir, '.meta.json');
    let gitData: HistoryEntry['git'] | undefined;

    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        gitData = meta.git;
      } catch {
        // Skip if meta file parsing fails
      }
    }

    entries.push({
      version: parseInt(match[1], 10),
      timestamp: parseTimestamp(match[2]),
      filePath: relPath,
      historyPath: filePath,
      git: gitData,
    });
  }

  return entries.sort((a, b) => a.version - b.version);
}

/**
 * Get full history (all files across all snapshots)
 */
export function getAllHistory(projectPath: string): HistoryEntry[] {
  const snapshots = getAllSnapshots(projectPath);
  const entries: HistoryEntry[] = [];

  for (const snapshot of snapshots) {
    for (const file of snapshot.files) {
      entries.push({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        filePath: file,
        historyPath: join(snapshot.snapshotDir, file),
        git: snapshot.git,
      });
    }
  }

  return entries.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * List tracked files (from .pmpt/docs)
 */
export function getTrackedFiles(projectPath: string): string[] {
  const docsDir = getDocsDir(projectPath);
  if (!existsSync(docsDir)) return [];

  return glob.sync('**/*.md', { cwd: docsDir });
}

/**
 * Resolve file content by walking backwards through snapshots.
 * Handles optimized snapshots where unchanged files are not stored.
 */
export function resolveFileContent(snapshots: SnapshotEntry[], fromIndex: number, fileName: string): string | null {
  for (let i = fromIndex; i >= 0; i--) {
    const filePath = join(snapshots[i].snapshotDir, fileName);
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
  }
  return null;
}

/**
 * Resolve all file contents for a specific snapshot version.
 * Reconstructs the full file set by walking backwards through history.
 */
export function resolveFullSnapshot(snapshots: SnapshotEntry[], targetIndex: number): Record<string, string> {
  const target = snapshots[targetIndex];
  const files: Record<string, string> = {};

  for (const fileName of target.files) {
    const content = resolveFileContent(snapshots, targetIndex, fileName);
    if (content !== null) {
      files[fileName] = content;
    }
  }

  return files;
}
