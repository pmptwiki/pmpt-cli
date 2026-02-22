import * as p from '@clack/prompts';
import { resolve, join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { isInitialized, getConfigDir, getHistoryDir, getDocsDir, initializeProject } from '../lib/config.js';
import { validatePmptFile, SCHEMA_VERSION, type PmptFile } from '../lib/pmptFile.js';

interface ImportOptions {
  force?: boolean;
}

/**
 * Restore history from .pmpt file
 */
function restoreHistory(historyDir: string, history: PmptFile['history']): void {
  mkdirSync(historyDir, { recursive: true });

  for (const version of history) {
    const timestamp = version.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const snapshotName = `v${version.version}-${timestamp}`;
    const snapshotDir = join(historyDir, snapshotName);

    mkdirSync(snapshotDir, { recursive: true });

    // Write files
    for (const [filename, content] of Object.entries(version.files)) {
      const filePath = join(snapshotDir, filename);
      const fileDir = dirname(filePath);

      if (fileDir !== snapshotDir) {
        mkdirSync(fileDir, { recursive: true });
      }

      writeFileSync(filePath, content, 'utf-8');
    }

    // Write metadata
    const metaPath = join(snapshotDir, '.meta.json');
    writeFileSync(metaPath, JSON.stringify({
      version: version.version,
      timestamp: version.timestamp,
      files: Object.keys(version.files),
      git: version.git,
    }, null, 2), 'utf-8');
  }
}

/**
 * Restore docs from .pmpt file
 */
function restoreDocs(docsDir: string, docs: Record<string, string>): void {
  mkdirSync(docsDir, { recursive: true });

  for (const [filename, content] of Object.entries(docs)) {
    const filePath = join(docsDir, filename);
    const fileDir = dirname(filePath);

    if (fileDir !== docsDir) {
      mkdirSync(fileDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
  }
}

export async function cmdImport(pmptFile: string, options?: ImportOptions): Promise<void> {
  if (!pmptFile) {
    p.log.error('Please provide a .pmpt file path.');
    p.log.info('Usage: pmpt import <file.pmpt>');
    process.exit(1);
  }

  const filePath = resolve(pmptFile);

  if (!existsSync(filePath)) {
    p.log.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (!filePath.endsWith('.pmpt')) {
    p.log.error('Please provide a .pmpt file.');
    p.log.info('Use `pmpt export` to create a .pmpt file.');
    process.exit(1);
  }

  p.intro('pmpt import');

  const s = p.spinner();
  s.start('Reading .pmpt file...');

  // Read file
  let fileContent: string;
  try {
    fileContent = readFileSync(filePath, 'utf-8');
  } catch {
    s.stop('Read failed');
    p.log.error('Failed to read file.');
    process.exit(1);
  }

  // Validate
  s.message('Validating...');
  const validation = validatePmptFile(fileContent);

  if (!validation.success || !validation.data) {
    s.stop('Validation failed');
    p.log.error(validation.error || 'Invalid .pmpt file.');
    process.exit(1);
  }

  const pmptData = validation.data;
  s.stop('Validation passed');

  // Show summary and confirm
  const summaryLines = [
    `Project: ${pmptData.meta.projectName}`,
    `Versions: ${pmptData.history.length}`,
    `Schema: v${pmptData.schemaVersion}`,
    pmptData.meta.description ? `Description: ${pmptData.meta.description.slice(0, 50)}...` : '',
  ].filter(Boolean);

  p.note(summaryLines.join('\n'), 'Import Preview');

  const projectPath = process.cwd();

  // Check if already initialized
  if (isInitialized(projectPath) && !options?.force) {
    const overwrite = await p.confirm({
      message: 'Project already initialized. Merge imported history?',
      initialValue: true,
    });

    if (p.isCancel(overwrite)) {
      p.cancel('Import cancelled.');
      process.exit(0);
    }

    if (!overwrite) {
      p.log.info('Use --force to overwrite existing project.');
      p.outro('');
      return;
    }
  }

  const importSpinner = p.spinner();
  importSpinner.start('Importing project...');

  // Initialize project if not exists
  if (!isInitialized(projectPath)) {
    initializeProject(projectPath, { trackGit: true });
  }

  const pmptDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  // Restore history
  restoreHistory(historyDir, pmptData.history);

  // Restore docs
  if (pmptData.docs) {
    restoreDocs(docsDir, pmptData.docs);
  }

  // Restore plan progress
  if (pmptData.plan) {
    const planProgressPath = join(pmptDir, 'plan-progress.json');
    writeFileSync(planProgressPath, JSON.stringify({
      completed: true,
      startedAt: pmptData.meta.createdAt,
      updatedAt: pmptData.meta.exportedAt,
      answers: pmptData.plan,
    }, null, 2), 'utf-8');
  }

  // Count imported versions
  let versionCount = 0;
  if (existsSync(historyDir)) {
    versionCount = readdirSync(historyDir).filter(d => d.startsWith('v')).length;
  }

  importSpinner.stop('Import complete!');

  // Summary
  const summary = [
    `Project: ${pmptData.meta.projectName}`,
    `Versions imported: ${versionCount}`,
    `Location: ${pmptDir}`,
  ];

  p.note(summary.join('\n'), 'Import Summary');

  p.log.info('Next steps:');
  p.log.message('  pmpt history    — View imported versions');
  p.log.message('  pmpt plan       — View or copy AI prompt');
  p.log.message('  pmpt save       — Save a new snapshot');

  p.outro('Ready to continue the journey!');
}
