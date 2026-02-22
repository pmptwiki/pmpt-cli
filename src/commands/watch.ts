import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized, getDocsDir } from '../lib/config.js';
import { startWatching } from '../lib/watcher.js';

export function cmdWatch(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const docsDir = getDocsDir(projectPath);

  p.intro('pmpt watch — File Watcher');
  p.log.info(`Watching: ${docsDir}`);
  p.log.info('Auto-saving snapshots on MD file changes.');
  p.log.info('Press Ctrl+C to stop.');
  p.log.message('');

  const watcher = startWatching(projectPath, (version, files, git) => {
    let msg = `v${version} saved (${files.length} file(s))`;
    if (git) {
      msg += ` · ${git.commit}`;
      if (git.dirty) msg += ' (uncommitted)';
    }
    p.log.success(msg);
  });

  process.on('SIGINT', () => {
    p.log.message('');
    p.log.info('Stopping watcher...');
    watcher.close();
    p.outro('Watcher stopped');
    process.exit(0);
  });
}
