import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { getHistoryDir, getDocsDir, loadConfig } from './config.js';
import { getGitInfo, isGitRepo } from './git.js';
import glob from 'fast-glob';

export interface SnapshotEntry {
  version: number;
  timestamp: string;
  snapshotDir: string;
  files: string[];
  changedFiles?: string[];  // only changed files stored in snapshot dir (undefined = all files stored)
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
 * .pmpt/docs 폴더의 MD 파일을 스냅샷으로 저장
 * 변경된 파일만 복사하여 저장 공간 최적화
 */
export function createFullSnapshot(projectPath: string): SnapshotEntry {
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  mkdirSync(historyDir, { recursive: true });

  // 다음 버전 번호 찾기
  const existing = getAllSnapshots(projectPath);
  const version = existing.length + 1;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snapshotName = `v${version}-${timestamp}`;
  const snapshotDir = join(historyDir, snapshotName);

  mkdirSync(snapshotDir, { recursive: true });

  // docs 폴더의 MD 파일 비교 후 변경분만 복사
  const files: string[] = [];
  const changedFiles: string[] = [];

  if (existsSync(docsDir)) {
    const mdFiles = glob.sync('**/*.md', { cwd: docsDir });

    for (const file of mdFiles) {
      const srcPath = join(docsDir, file);
      const newContent = readFileSync(srcPath, 'utf-8');
      files.push(file);

      // 이전 버전과 비교
      let hasChanged = true;
      if (existing.length > 0) {
        const prevContent = resolveFileContent(existing, existing.length - 1, file);
        if (prevContent !== null && prevContent === newContent) {
          hasChanged = false;
        }
      }

      if (hasChanged) {
        const destPath = join(snapshotDir, file);

        // 하위 디렉토리가 있으면 생성
        const destDir = join(snapshotDir, file.split('/').slice(0, -1).join('/'));
        if (destDir !== snapshotDir) {
          mkdirSync(destDir, { recursive: true });
        }

        copyFileSync(srcPath, destPath);
        changedFiles.push(file);
      }
    }
  }

  // Git 정보 수집
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

  // 메타데이터 저장
  const metaPath = join(snapshotDir, '.meta.json');
  writeFileSync(metaPath, JSON.stringify({
    version,
    timestamp,
    files,
    changedFiles,
    git: gitData,
  }, null, 2), 'utf-8');

  return {
    version,
    timestamp,
    snapshotDir,
    files,
    changedFiles,
    git: gitData,
  };
}

/**
 * 단일 파일 스냅샷 (pmpt 폴더 내 특정 파일만)
 * 기존 호환성을 위해 유지하되, 내부적으로 전체 스냅샷 사용
 */
export function createSnapshot(projectPath: string, filePath: string): HistoryEntry {
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);
  const relPath = relative(docsDir, filePath);

  // 파일이 docs 폴더 외부에 있는 경우
  if (relPath.startsWith('..')) {
    // 프로젝트 루트 기준 상대 경로 사용
    const projectRelPath = relative(projectPath, filePath);
    return createSingleFileSnapshot(projectPath, filePath, projectRelPath);
  }

  return createSingleFileSnapshot(projectPath, filePath, relPath);
}

function createSingleFileSnapshot(projectPath: string, filePath: string, relPath: string): HistoryEntry {
  const historyDir = getHistoryDir(projectPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // 해당 파일의 기존 버전 수 확인
  const existing = getFileHistory(projectPath, relPath);
  const version = existing.length + 1;

  // 버전 폴더 생성
  const snapshotName = `v${version}-${timestamp}`;
  const snapshotDir = join(historyDir, snapshotName);
  mkdirSync(snapshotDir, { recursive: true });

  // 파일 복사
  const destPath = join(snapshotDir, basename(filePath));
  copyFileSync(filePath, destPath);

  // Git 정보 수집
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

  // 메타데이터 저장
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
 * 모든 스냅샷 목록 조회
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
        // 메타 파일 파싱 실패 시 기본값 사용
      }
    }

    entries.push({
      version: parseInt(match[1], 10),
      timestamp: match[2].replace(/-/g, ':'),
      snapshotDir,
      files: meta.files || [],
      changedFiles: meta.changedFiles,
      git: meta.git,
    });
  }

  return entries.sort((a, b) => a.version - b.version);
}

/**
 * 특정 파일의 히스토리 조회 (하위 호환성)
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
        // 메타 파일 파싱 실패 시 무시
      }
    }

    entries.push({
      version: parseInt(match[1], 10),
      timestamp: match[2].replace(/-/g, ':'),
      filePath: relPath,
      historyPath: filePath,
      git: gitData,
    });
  }

  return entries.sort((a, b) => a.version - b.version);
}

/**
 * 전체 히스토리 조회 (모든 스냅샷의 모든 파일)
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
 * 추적 중인 파일 목록 (.pmpt/docs 기준)
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
