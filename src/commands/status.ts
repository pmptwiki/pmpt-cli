import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized, loadConfig, getPmptDir } from '../lib/config.js';
import { getTrackedFiles, getAllSnapshots } from '../lib/history.js';

export function cmdStatus(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const config = loadConfig(projectPath);
  const tracked = getTrackedFiles(projectPath);
  const snapshots = getAllSnapshots(projectPath);

  p.intro('PromptWiki — Project Status');

  const notes = [
    `Path: ${projectPath}`,
    `Created: ${new Date(config!.createdAt).toLocaleString()}`,
  ];

  if (config!.lastPublished) {
    notes.push(`Last published: ${new Date(config!.lastPublished).toLocaleString()}`);
  }

  notes.push('');
  notes.push(`pmpt folder: .promptwiki/pmpt/`);
  notes.push(`Snapshots: ${snapshots.length}`);
  notes.push('');
  notes.push(`Tracked files: ${tracked.length}`);

  for (const f of tracked) {
    notes.push(`  - ${f}`);
  }

  if (tracked.length === 0) {
    notes.push('  (none - start with pmpt plan)');
  }

  p.note(notes.join('\n'), 'Project Info');

  p.outro('');
}
