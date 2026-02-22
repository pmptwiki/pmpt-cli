import * as p from '@clack/prompts';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { isInitialized } from '../lib/config.js';
import { getAllSnapshots, type SnapshotEntry } from '../lib/history.js';

interface HistoryOptions {
  compact?: boolean;
}

// Simple diff calculation: count changed lines
function calculateDiffSize(oldContent: string, newContent: string): number {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let changes = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes++;
    }
  }

  return changes;
}

// Get total diff between two snapshots
function getSnapshotDiff(prev: SnapshotEntry, curr: SnapshotEntry): number {
  let totalChanges = 0;
  const allFiles = new Set([...prev.files, ...curr.files]);

  for (const file of allFiles) {
    const prevPath = join(prev.snapshotDir, file);
    const currPath = join(curr.snapshotDir, file);

    const prevContent = existsSync(prevPath) ? readFileSync(prevPath, 'utf-8') : '';
    const currContent = existsSync(currPath) ? readFileSync(currPath, 'utf-8') : '';

    totalChanges += calculateDiffSize(prevContent, currContent);
  }

  return totalChanges;
}

export function cmdHistory(path?: string, options?: HistoryOptions): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const snapshots = getAllSnapshots(projectPath);

  if (snapshots.length === 0) {
    p.intro('pmpt history');
    p.log.warn('No snapshots saved yet.');
    p.log.info('Save snapshots with pmpt save or pmpt watch.');
    p.outro('');
    return;
  }

  // In compact mode, filter out versions with minimal changes
  let displaySnapshots = snapshots;
  const hiddenVersions: number[] = [];

  if (options?.compact && snapshots.length > 1) {
    displaySnapshots = [snapshots[0]]; // Always show first

    for (let i = 1; i < snapshots.length; i++) {
      const diffSize = getSnapshotDiff(snapshots[i - 1], snapshots[i]);

      // Threshold: hide if less than 5 lines changed
      if (diffSize < 5) {
        hiddenVersions.push(snapshots[i].version);
      } else {
        displaySnapshots.push(snapshots[i]);
      }
    }
  }

  const title = options?.compact
    ? `pmpt history (${displaySnapshots.length} shown, ${hiddenVersions.length} hidden)`
    : `pmpt history (${snapshots.length} total)`;

  p.intro(title);

  for (const snapshot of displaySnapshots) {
    const dateStr = new Date(snapshot.timestamp).toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let header = `v${snapshot.version} — ${dateStr}`;
    if (snapshot.git) {
      header += ` · ${snapshot.git.commit}`;
      if (snapshot.git.dirty) header += ' (dirty)';
    }

    const files = snapshot.files.map((f) => `  - ${f}`).join('\n');

    p.note(files || '  (no files)', header);
  }

  if (options?.compact && hiddenVersions.length > 0) {
    p.log.info(`Hidden versions (minor changes): ${hiddenVersions.map(v => `v${v}`).join(', ')}`);
    p.log.info('Run without --compact to see all versions.');
  }

  if (!options?.compact && snapshots.length > 3) {
    p.log.info('Tip: Use --compact to hide minor changes, or "pmpt squash v1 v3" to merge.');
  }

  p.outro('');
}
