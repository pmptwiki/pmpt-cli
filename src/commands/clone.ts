import * as p from '@clack/prompts';
import { join, dirname, resolve, relative, sep } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { isInitialized, getConfigDir, getHistoryDir, getDocsDir, initializeProject } from '../lib/config.js';
import { validatePmptFile, isSafeFilename, type PmptFile } from '../lib/pmptFile.js';
import { fetchPmptFile, trackClone } from '../lib/api.js';

/**
 * Restore history from .pmpt data (shared with import command)
 */
export function restoreHistory(historyDir: string, history: PmptFile['history']): void {
  mkdirSync(historyDir, { recursive: true });

  for (const version of history) {
    const timestamp = version.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const snapshotName = `v${version.version}-${timestamp}`;
    const snapshotDir = join(historyDir, snapshotName);

    mkdirSync(snapshotDir, { recursive: true });

    for (const [filename, content] of Object.entries(version.files)) {
      if (!isSafeFilename(filename)) continue; // skip unsafe filenames
      const filePath = join(snapshotDir, filename);
      // Double-check resolved path stays within snapshot dir
      if (!resolve(filePath).startsWith(resolve(snapshotDir) + sep)) continue;
      const fileDir = dirname(filePath);
      if (fileDir !== snapshotDir) {
        mkdirSync(fileDir, { recursive: true });
      }
      writeFileSync(filePath, content, 'utf-8');
    }

    writeFileSync(
      join(snapshotDir, '.meta.json'),
      JSON.stringify({
        version: version.version,
        timestamp: version.timestamp,
        files: Object.keys(version.files),
        git: version.git,
      }, null, 2),
      'utf-8'
    );
  }
}

/**
 * Restore docs from .pmpt data (shared with import command)
 */
export function restoreDocs(docsDir: string, docs: Record<string, string>): void {
  mkdirSync(docsDir, { recursive: true });

  for (const [filename, content] of Object.entries(docs)) {
    if (!isSafeFilename(filename)) continue; // skip unsafe filenames
    const filePath = join(docsDir, filename);
    if (!resolve(filePath).startsWith(resolve(docsDir) + sep)) continue;
    const fileDir = dirname(filePath);
    if (fileDir !== docsDir) {
      mkdirSync(fileDir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
  }
}

export async function cmdClone(slug: string): Promise<void> {
  if (!slug) {
    p.log.error('Please provide a slug.');
    p.log.info('Usage: pmpt clone <slug>');
    process.exit(1);
  }

  p.intro(`pmpt clone — ${slug}`);

  const s = p.spinner();
  s.start('Downloading project...');

  let fileContent: string;
  try {
    fileContent = await fetchPmptFile(slug);
  } catch (err) {
    s.stop('Download failed');
    p.log.error(err instanceof Error ? err.message : 'Project not found.');
    process.exit(1);
  }

  s.message('Validating...');
  const validation = validatePmptFile(fileContent);
  if (!validation.success || !validation.data) {
    s.stop('Validation failed');
    p.log.error(validation.error || 'Invalid .pmpt file.');
    process.exit(1);
  }

  const pmptData = validation.data;
  s.stop('Download complete');

  // Show summary
  p.note(
    [
      `Project: ${pmptData.meta.projectName}`,
      `Versions: ${pmptData.history.length}`,
      pmptData.meta.author ? `Author: @${pmptData.meta.author}` : '',
      pmptData.meta.description ? `Description: ${pmptData.meta.description.slice(0, 80)}` : '',
    ].filter(Boolean).join('\n'),
    'Project Info'
  );

  const projectPath = process.cwd();

  if (isInitialized(projectPath)) {
    const overwrite = await p.confirm({
      message: 'Project already initialized. Merge history?',
      initialValue: true,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  const importSpinner = p.spinner();
  importSpinner.start('Restoring project...');

  if (!isInitialized(projectPath)) {
    initializeProject(projectPath, { trackGit: true });
  }

  const pmptDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  restoreHistory(historyDir, pmptData.history);

  if (pmptData.docs) {
    restoreDocs(docsDir, pmptData.docs);
  }

  if (pmptData.plan) {
    writeFileSync(
      join(pmptDir, 'plan-progress.json'),
      JSON.stringify({
        completed: true,
        startedAt: pmptData.meta.createdAt,
        updatedAt: pmptData.meta.exportedAt,
        answers: pmptData.plan,
      }, null, 2),
      'utf-8'
    );
  }

  let versionCount = 0;
  if (existsSync(historyDir)) {
    versionCount = readdirSync(historyDir).filter((d) => d.startsWith('v')).length;
  }

  importSpinner.stop('Restore complete!');

  // Track clone event (fire-and-forget)
  trackClone(slug);

  p.note(
    [
      `Project: ${pmptData.meta.projectName}`,
      `Versions: ${versionCount}`,
      `Location: ${pmptDir}`,
    ].join('\n'),
    'Clone Summary'
  );

  p.log.info('Next steps:');
  p.log.message('  pmpt history    — view version history');
  p.log.message('  pmpt plan       — view AI prompt');
  p.log.message('  pmpt save       — save a new snapshot');

  p.outro('Project cloned!');
}
