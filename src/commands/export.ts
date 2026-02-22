import * as p from '@clack/prompts';
import { resolve, join, basename } from 'path';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { isInitialized, getConfigDir, getDocsDir, loadConfig } from '../lib/config.js';
import { getAllSnapshots } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { createPmptFile, SCHEMA_VERSION, type Version, type ProjectMeta, type PlanAnswers } from '../lib/pmptFile.js';
import glob from 'fast-glob';

interface ExportOptions {
  output?: string;
}

/**
 * Read all files from a snapshot directory
 */
function readSnapshotFiles(snapshotDir: string): Record<string, string> {
  const files: Record<string, string> = {};

  if (!existsSync(snapshotDir)) return files;

  const mdFiles = glob.sync('**/*.md', { cwd: snapshotDir });

  for (const file of mdFiles) {
    const filePath = join(snapshotDir, file);
    try {
      files[file] = readFileSync(filePath, 'utf-8');
    } catch {
      // Skip files that can't be read
    }
  }

  return files;
}

/**
 * Read current docs folder
 */
function readDocsFolder(docsDir: string): Record<string, string> {
  const files: Record<string, string> = {};

  if (!existsSync(docsDir)) return files;

  const mdFiles = glob.sync('**/*.md', { cwd: docsDir });

  for (const file of mdFiles) {
    const filePath = join(docsDir, file);
    try {
      files[file] = readFileSync(filePath, 'utf-8');
    } catch {
      // Skip files that can't be read
    }
  }

  return files;
}

export async function cmdExport(path?: string, options?: ExportOptions): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  p.intro('pmpt export');

  const config = loadConfig(projectPath);
  const snapshots = getAllSnapshots(projectPath);
  const planProgress = getPlanProgress(projectPath);

  if (snapshots.length === 0) {
    p.log.warn('No snapshots found.');
    p.log.info('Run `pmpt save` or `pmpt plan` first to create versions.');
    p.outro('');
    return;
  }

  const projectName = planProgress?.answers?.projectName || basename(projectPath);
  const timestamp = new Date().toISOString().slice(0, 10);
  const exportName = `${projectName}-${timestamp}`;

  // Output path - .pmpt extension
  const outputPath = options?.output
    ? resolve(options.output)
    : resolve(projectPath, `${exportName}.pmpt`);

  const s = p.spinner();
  s.start('Creating .pmpt file...');

  // Build history array with file contents
  const history: Version[] = [];

  for (const snapshot of snapshots) {
    const files = readSnapshotFiles(snapshot.snapshotDir);

    history.push({
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      files,
      git: snapshot.git,
    });
  }

  // Read current docs
  const docsDir = getDocsDir(projectPath);
  const docs = readDocsFolder(docsDir);

  // Build metadata
  const meta: ProjectMeta = {
    projectName,
    description: planProgress?.answers?.productIdea,
    createdAt: config?.createdAt || new Date().toISOString(),
    exportedAt: new Date().toISOString(),
  };

  // Convert plan answers to typed format
  const planAnswers: PlanAnswers | undefined = planProgress?.answers
    ? {
        projectName: planProgress.answers.projectName,
        productIdea: planProgress.answers.productIdea,
        additionalContext: planProgress.answers.additionalContext,
        coreFeatures: planProgress.answers.coreFeatures,
        techStack: planProgress.answers.techStack,
      }
    : undefined;

  // Create .pmpt file content
  const pmptContent = createPmptFile(
    meta,
    planAnswers,
    docs,
    history
  );

  // Write file
  try {
    writeFileSync(outputPath, pmptContent, 'utf-8');
  } catch (err) {
    s.stop('Export failed');
    p.log.error('Failed to write .pmpt file.');
    process.exit(1);
  }

  s.stop('Export complete!');

  // File size
  const fileSizeBytes = statSync(outputPath).size;
  const fileSize = fileSizeBytes < 1024
    ? `${fileSizeBytes} B`
    : fileSizeBytes < 1024 * 1024
      ? `${(fileSizeBytes / 1024).toFixed(1)} KB`
      : `${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB`;

  // Summary
  const summary = [
    `Project: ${projectName}`,
    `Versions: ${snapshots.length}`,
    `Schema: v${SCHEMA_VERSION}`,
    `Size: ${fileSize}`,
    '',
    `Output: ${outputPath}`,
  ];

  p.note(summary.join('\n'), 'Export Summary');

  p.log.info('Share this .pmpt file to let others reproduce your AI development journey!');
  p.log.message('  pmpt import <file.pmpt>  — Import on another machine');
  p.outro('');
}
