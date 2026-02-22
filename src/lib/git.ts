import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface GitInfo {
  repo?: string;         // 원격 저장소 URL
  commit: string;        // 현재 커밋 해시 (short)
  commitFull: string;    // 전체 커밋 해시
  branch: string;        // 현재 브랜치
  dirty: boolean;        // uncommitted 변경 있음
  timestamp: string;     // 커밋 타임스탬프
  tag?: string;          // 현재 커밋의 태그 (있으면)
}

/**
 * 디렉토리가 git 저장소인지 확인
 */
export function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}

/**
 * git 명령어 실행 헬퍼
 */
function git(path: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd: path,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 현재 git 상태 정보 수집
 */
export function getGitInfo(path: string, remoteUrl?: string): GitInfo | null {
  if (!isGitRepo(path)) {
    return null;
  }

  // 커밋 해시
  const commitFull = git(path, 'rev-parse HEAD');
  if (!commitFull) return null;

  const commit = git(path, 'rev-parse --short HEAD') || commitFull.slice(0, 7);

  // 브랜치
  const branch = git(path, 'rev-parse --abbrev-ref HEAD') || 'HEAD';

  // uncommitted 변경 확인
  const status = git(path, 'status --porcelain');
  const dirty = status !== null && status.length > 0;

  // 커밋 타임스탬프
  const timestamp = git(path, 'log -1 --format=%cI') || new Date().toISOString();

  // 현재 커밋의 태그
  const tag = git(path, 'describe --tags --exact-match 2>/dev/null') || undefined;

  // 원격 저장소 URL (제공되지 않으면 origin에서 가져옴)
  let repo = remoteUrl;
  if (!repo) {
    const origin = git(path, 'remote get-url origin');
    if (origin) {
      // SSH URL을 HTTPS로 변환
      repo = origin
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '');
    }
  }

  return {
    repo,
    commit,
    commitFull,
    branch,
    dirty,
    timestamp,
    tag: tag || undefined,
  };
}

/**
 * git 상태가 clean한지 확인
 */
export function isGitClean(path: string): boolean {
  const status = git(path, 'status --porcelain');
  return status !== null && status.length === 0;
}

/**
 * 특정 커밋이 현재 커밋과 일치하는지 확인
 */
export function isCommitMatch(path: string, expectedCommit: string): boolean {
  const currentFull = git(path, 'rev-parse HEAD');
  const currentShort = git(path, 'rev-parse --short HEAD');

  if (!currentFull || !currentShort) return false;

  return (
    currentFull === expectedCommit ||
    currentShort === expectedCommit ||
    currentFull.startsWith(expectedCommit) ||
    expectedCommit.startsWith(currentShort)
  );
}

/**
 * git 정보를 사람이 읽기 쉬운 문자열로 변환
 */
export function formatGitInfo(info: GitInfo): string {
  const parts = [
    `commit: ${info.commit}`,
    `branch: ${info.branch}`,
  ];

  if (info.tag) {
    parts.push(`tag: ${info.tag}`);
  }

  if (info.dirty) {
    parts.push('(uncommitted changes)');
  }

  return parts.join(' · ');
}
