import * as p from '@clack/prompts';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { isInitialized, getDocsDir } from '../lib/config.js';
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

  const docsDir = getDocsDir(projectPath);
  const files = getTrackedFiles(projectPath);

  if (files.length === 0) {
    p.log.warn('No files to save.');
    p.log.info(`Docs folder: ${docsDir}`);
    p.log.info('Start with `pmpt plan` or add MD files to the docs folder.');
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

    const changedCount = entry.changedFiles?.length ?? entry.files.length;
    const unchangedCount = entry.files.length - changedCount;
    if (unchangedCount > 0) {
      msg += ` (${changedCount} changed, ${unchangedCount} skipped)`;
    }

    p.log.success(msg);

    // Warn if pmpt.md was not updated since last save
    if (entry.version > 1 && entry.changedFiles && !entry.changedFiles.includes('pmpt.md')) {
      p.log.message('');
      p.log.warn('pmpt.md has not been updated since the last save.');
      p.log.message('  Tip: Mark completed features and update the Snapshot Log before saving.');
    }

    p.log.message('');
    p.log.info('Files included:');
    for (const file of entry.files) {
      const isChanged = entry.changedFiles ? entry.changedFiles.includes(file) : true;
      p.log.message(`  - ${file}${isChanged ? '' : ' (unchanged)'}`);
    }
  } catch (error) {
    s.stop('Save failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}
