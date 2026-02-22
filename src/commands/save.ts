import * as p from '@clack/prompts';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { isInitialized, getWatchPaths } from '../lib/config.js';
import { createFullSnapshot, getTrackedFiles } from '../lib/history.js';

export async function cmdSave(fileOrPath?: string): Promise<void> {
  const projectPath = fileOrPath && existsSync(fileOrPath) && statSync(fileOrPath).isDirectory()
    ? resolve(fileOrPath)
    : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  p.intro('pmpt save');

  const watchPaths = getWatchPaths(projectPath);
  const files = getTrackedFiles(projectPath);

  if (files.length === 0) {
    p.log.warn('No files to save.');
    p.log.info(`Watching: ${watchPaths.join(', ')}`);
    p.log.info('Start with `pmpt plan` or add MD files to the watched folders.');
    p.outro('');
    return;
  }

  const s = p.spinner();
  s.start(`Creating snapshot of ${files.length} file(s)...`);

  try {
    const entry = createFullSnapshot(projectPath);
    s.stop('Snapshot saved');

    let msg = `v${entry.version} saved`;
    if (entry.git) {
      msg += ` · ${entry.git.commit}`;
      if (entry.git.dirty) msg += ' (uncommitted)';
    }
    p.log.success(msg);

    p.log.message('');
    p.log.info('Files included:');
    for (const file of entry.files) {
      p.log.message(`  - ${file}`);
    }
  } catch (error) {
    s.stop('Save failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}
