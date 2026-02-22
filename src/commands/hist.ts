import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized } from '../lib/config.js';
import { getAllSnapshots } from '../lib/history.js';

export function cmdHistory(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const snapshots = getAllSnapshots(projectPath);

  if (snapshots.length === 0) {
    p.intro('PromptWiki — Version History');
    p.log.warn('No snapshots saved yet.');
    p.log.info('Save snapshots with pmpt save or pmpt watch.');
    p.outro('');
    return;
  }

  p.intro(`PromptWiki — Version History (${snapshots.length} total)`);

  for (const snapshot of snapshots) {
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

  p.outro('');
}
