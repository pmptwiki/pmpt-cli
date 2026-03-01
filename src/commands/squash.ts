import * as p from '@clack/prompts';
import { resolve, join, basename } from 'path';
import { existsSync, rmSync, renameSync, writeFileSync, readFileSync } from 'fs';
import { isInitialized, getHistoryDir } from '../lib/config.js';
import { getAllSnapshots, type SnapshotEntry } from '../lib/history.js';

export async function cmdSquash(from?: string, to?: string, opts?: { auto?: boolean; path?: string }): Promise<void> {
  const projectPath = opts?.path ? resolve(opts.path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const snapshots = getAllSnapshots(projectPath);

  if (snapshots.length === 0) {
    p.log.error('No snapshots found.');
    process.exit(1);
  }

  if (opts?.auto) {
    return autoSquash(projectPath, snapshots);
  }

  // Manual squash: require from and to
  if (!from || !to) {
    p.log.error('Usage: pmpt squash v2 v5  or  pmpt squash --auto');
    process.exit(1);
  }

  return manualSquash(projectPath, snapshots, from, to);
}

/**
 * Renumber remaining snapshots to v1, v2, v3... sequentially.
 * Renames directories and updates .meta.json version fields.
 */
function renumberSnapshots(projectPath: string): void {
  const historyDir = getHistoryDir(projectPath);
  const remaining = getAllSnapshots(projectPath); // sorted by version

  for (let i = 0; i < remaining.length; i++) {
    const snap = remaining[i];
    const newVersion = i + 1;

    if (snap.version === newVersion) continue; // already correct

    // Rename directory: v5-20260228T164006 → v2-20260228T164006
    const dirName = basename(snap.snapshotDir);
    const newDirName = dirName.replace(/^v\d+/, `v${newVersion}`);
    const newDir = join(historyDir, newDirName);

    renameSync(snap.snapshotDir, newDir);

    // Update .meta.json
    const metaPath = join(newDir, '.meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.version = newVersion;
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
  }
}

async function autoSquash(projectPath: string, snapshots: SnapshotEntry[]): Promise<void> {
  // Find empty snapshots (no changed files)
  const emptySnapshots = snapshots.filter(s =>
    s.changedFiles && s.changedFiles.length === 0
  );

  if (emptySnapshots.length === 0) {
    p.log.info('No empty snapshots found. Nothing to clean up.');
    return;
  }

  p.intro('pmpt squash --auto');

  p.log.info(`Found ${emptySnapshots.length} empty snapshot(s) (no file changes):`);
  for (const s of emptySnapshots) {
    const git = s.git ? ` [${s.git.commit}]` : '';
    p.log.message(`  v${s.version} — ${s.timestamp.slice(0, 16)}${git}`);
  }

  const confirm = await p.confirm({
    message: `Delete ${emptySnapshots.length} empty snapshot(s) and renumber?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const sp = p.spinner();
  sp.start('Removing empty snapshots...');

  try {
    let deleted = 0;
    for (const snapshot of emptySnapshots) {
      if (existsSync(snapshot.snapshotDir)) {
        rmSync(snapshot.snapshotDir, { recursive: true });
        deleted++;
      }
    }

    renumberSnapshots(projectPath);

    sp.stop('Cleaned up');

    const remaining = snapshots.length - deleted;
    p.log.success(`Removed ${deleted} empty snapshot(s), renumbered to v1-v${remaining}`);
  } catch (error) {
    sp.stop('Failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}

async function manualSquash(projectPath: string, snapshots: SnapshotEntry[], from: string, to: string): Promise<void> {
  const fromVersion = parseInt(from.replace(/^v/, ''), 10);
  const toVersion = parseInt(to.replace(/^v/, ''), 10);

  if (isNaN(fromVersion) || isNaN(toVersion)) {
    p.log.error('Invalid version format. Use: pmpt squash v2 v3');
    process.exit(1);
  }

  if (fromVersion >= toVersion) {
    p.log.error('First version must be less than second version.');
    process.exit(1);
  }

  const versionList = snapshots.map(s => `v${s.version}`).join(', ');

  // Find snapshots to squash
  const toSquash = snapshots.filter(s => s.version >= fromVersion && s.version <= toVersion);

  if (toSquash.length < 2) {
    p.log.error(`Need at least 2 versions to squash. Found ${toSquash.length} in range v${fromVersion}-v${toVersion}.`);
    p.log.info(`Available versions: ${versionList}`);
    process.exit(1);
  }

  p.intro('pmpt squash');

  p.log.info(`Squashing v${fromVersion} through v${toVersion} (${toSquash.length} versions)`);

  const confirm = await p.confirm({
    message: `This will keep v${fromVersion} and delete v${fromVersion + 1} through v${toVersion}. Continue?`,
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const s = p.spinner();
  s.start('Squashing versions...');

  try {
    const keepSnapshot = toSquash[0]; // Keep the first one
    const deleteSnapshots = toSquash.slice(1); // Delete the rest

    // Delete the snapshots we're squashing
    for (const snapshot of deleteSnapshots) {
      const snapshotDir = snapshot.snapshotDir;
      if (existsSync(snapshotDir)) {
        rmSync(snapshotDir, { recursive: true });
      }
    }

    // Update metadata of kept snapshot to note squash
    const metaPath = join(keepSnapshot.snapshotDir, '.meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.squashedFrom = toSquash.map(s => s.version);
      meta.squashedAt = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    renumberSnapshots(projectPath);

    s.stop('Squashed');

    const remaining = getAllSnapshots(projectPath);
    p.log.success(`Squashed v${fromVersion}-v${toVersion}, renumbered to v1-v${remaining.length}`);
    p.log.info(`Deleted ${deleteSnapshots.length} version(s)`);
  } catch (error) {
    s.stop('Squash failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}
