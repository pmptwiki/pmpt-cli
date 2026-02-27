import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface GitInfo {
  repo?: string;         // Remote repository URL
  commit: string;        // Current commit hash (short)
  commitFull: string;    // Full commit hash
  branch: string;        // Current branch
  dirty: boolean;        // Has uncommitted changes
  timestamp: string;     // Commit timestamp
  tag?: string;          // Tag of current commit (if any)
}

/**
 * Check if directory is a git repository
 */
export function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}

/**
 * Git command execution helper
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
 * Collect current git status info
 */
export function getGitInfo(path: string, remoteUrl?: string): GitInfo | null {
  if (!isGitRepo(path)) {
    return null;
  }

  // Commit hash
  const commitFull = git(path, 'rev-parse HEAD');
  if (!commitFull) return null;

  const commit = git(path, 'rev-parse --short HEAD') || commitFull.slice(0, 7);

  // Branch
  const branch = git(path, 'rev-parse --abbrev-ref HEAD') || 'HEAD';

  // Check uncommitted changes
  const status = git(path, 'status --porcelain');
  const dirty = status !== null && status.length > 0;

  // Commit timestamp
  const timestamp = git(path, 'log -1 --format=%cI') || new Date().toISOString();

  // Current commit tag
  const tag = git(path, 'describe --tags --exact-match 2>/dev/null') || undefined;

  // Remote repository URL (fetched from origin if not provided)
  let repo = remoteUrl;
  if (!repo) {
    const origin = git(path, 'remote get-url origin');
    if (origin) {
      // Convert SSH URL to HTTPS
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
 * Check if git status is clean
 */
export function isGitClean(path: string): boolean {
  const status = git(path, 'status --porcelain');
  return status !== null && status.length === 0;
}

/**
 * Check if specific commit matches current commit
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
 * Count total commits in the repository
 */
export function getCommitCount(path: string): number {
  const count = git(path, 'rev-list --count HEAD');
  return count ? parseInt(count, 10) : 0;
}

/**
 * Convert git info to human-readable string
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
