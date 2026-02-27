import * as p from '@clack/prompts';
import { resolve, basename } from 'path';
import { readFileSync, existsSync } from 'fs';
import { isInitialized, loadConfig, saveConfig, getDocsDir } from '../lib/config.js';
import { getAllSnapshots, resolveFullSnapshot } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { createPmptFile, type Version, type ProjectMeta, type PlanAnswers } from '../lib/pmptFile.js';
import { loadAuth } from '../lib/auth.js';
import { publishProject, fetchProjects, type ProjectEntry } from '../lib/api.js';
import { computeQuality } from '../lib/quality.js';
import { copyToClipboard } from '../lib/clipboard.js';
import pc from 'picocolors';
import glob from 'fast-glob';
import { join } from 'path';

function readDocsFolder(docsDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(docsDir)) return files;
  const mdFiles = glob.sync('**/*.md', { cwd: docsDir });
  for (const file of mdFiles) {
    try {
      files[file] = readFileSync(join(docsDir, file), 'utf-8');
    } catch { /* skip */ }
  }
  return files;
}

export async function cmdUpdate(path?: string): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const auth = loadAuth();
  if (!auth?.token || !auth?.username) {
    p.log.error('Login required. Run `pmpt login` first.');
    process.exit(1);
  }

  p.intro('pmpt update');

  const config = loadConfig(projectPath);
  const savedSlug = config?.lastPublishedSlug;

  if (!savedSlug) {
    p.log.error('No previously published project found.');
    p.log.info('Run `pmpt publish` first to publish your project.');
    p.outro('');
    process.exit(1);
  }

  // Find existing project on platform
  let existing: ProjectEntry | undefined;
  try {
    const index = await fetchProjects();
    existing = index.projects.find((proj) => proj.slug === savedSlug && proj.author === auth.username);
  } catch {
    p.log.error('Failed to fetch project info. Check your internet connection.');
    p.outro('');
    process.exit(1);
  }

  if (!existing) {
    p.log.error(`Project "${savedSlug}" not found on platform.`);
    p.log.info('Run `pmpt publish` to publish it first.');
    p.outro('');
    process.exit(1);
  }

  const snapshots = getAllSnapshots(projectPath);
  const planProgress = getPlanProgress(projectPath);

  if (snapshots.length === 0) {
    p.log.warn('No snapshots found. Run `pmpt save` first.');
    p.outro('');
    return;
  }

  // Quality gate
  const docsDir = getDocsDir(projectPath);
  const aiMdPath = join(docsDir, 'pmpt.ai.md');
  const aiMdContent = existsSync(aiMdPath) ? readFileSync(aiMdPath, 'utf-8').trim() : '';
  const trackedFiles = glob.sync('**/*.md', { cwd: docsDir });
  const hasGit = snapshots.some((s) => !!s.git);

  const quality = computeQuality({
    pmptAiMd: aiMdContent || null,
    planAnswers: planProgress?.answers ?? null,
    versionCount: snapshots.length,
    docFiles: trackedFiles,
    hasGit,
  });

  if (!quality.passesMinimum) {
    p.log.warn(`Quality score ${quality.score}/100 is below minimum (40).`);
    p.log.info('Run `pmpt publish` for detailed quality breakdown and improvement tips.');
    p.outro('');
    process.exit(1);
  }

  // Build .pmpt content
  const projectName = planProgress?.answers?.projectName || basename(projectPath);

  const history: Version[] = snapshots.map((snapshot, i) => ({
    version: snapshot.version,
    timestamp: snapshot.timestamp,
    files: resolveFullSnapshot(snapshots, i),
    git: snapshot.git,
  }));

  const docs = readDocsFolder(docsDir);

  const meta: ProjectMeta = {
    projectName,
    author: auth.username,
    description: existing.description,
    createdAt: config?.createdAt || new Date().toISOString(),
    exportedAt: new Date().toISOString(),
  };

  const planAnswers: PlanAnswers | undefined = planProgress?.answers
    ? {
        projectName: planProgress.answers.projectName,
        productIdea: planProgress.answers.productIdea,
        additionalContext: planProgress.answers.additionalContext,
        coreFeatures: planProgress.answers.coreFeatures,
        techStack: planProgress.answers.techStack,
      }
    : undefined;

  const pmptContent = createPmptFile(meta, planAnswers, docs, history);

  // Show summary
  p.note(
    [
      `Slug: ${savedSlug}`,
      `Versions: ${snapshots.length}`,
      `Size: ${(pmptContent.length / 1024).toFixed(1)} KB`,
      `Quality: ${quality.score}/100 (${quality.grade})`,
    ].join('\n'),
    'Update Preview',
  );

  // Upload
  const s = p.spinner();
  s.start('Uploading...');

  try {
    const result = await publishProject(auth.token, {
      slug: savedSlug,
      pmptContent,
      description: existing.description,
      tags: existing.tags || [],
      category: existing.category,
      ...(existing.productUrl && { productUrl: existing.productUrl, productUrlType: existing.productUrlType }),
    });

    s.stop('Updated!');

    if (config) {
      config.lastPublished = new Date().toISOString();
      saveConfig(projectPath, config);
    }

    p.note(
      [
        `URL: ${result.url}`,
        '',
        'Content updated. Metadata unchanged.',
        'To change metadata, use `pmpt edit`.',
      ].join('\n'),
      'Updated!',
    );
  } catch (err) {
    s.stop('Update failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to update.');
    process.exit(1);
  }

  p.outro('');
}
