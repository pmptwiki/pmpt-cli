import * as p from '@clack/prompts';
import { resolve, join } from 'path';
import { existsSync, rmSync, renameSync, writeFileSync, readFileSync } from 'fs';
import { isInitialized, getHistoryDir } from '../lib/config.js';
import { getAllSnapshots } from '../lib/history.js';

export async function cmdSquash(from: string, to: string, path?: string): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  // Parse version numbers
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

  const snapshots = getAllSnapshots(projectPath);

  if (snapshots.length === 0) {
    p.log.error('No snapshots found.');
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
    const historyDir = getHistoryDir(projectPath);
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

    s.stop('Squashed');

    p.log.success(`Squashed v${fromVersion}-v${toVersion} into v${fromVersion}`);
    p.log.info(`Deleted ${deleteSnapshots.length} version(s)`);
  } catch (error) {
    s.stop('Squash failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}
