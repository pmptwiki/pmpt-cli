import * as p from '@clack/prompts';
import { resolve, basename } from 'path';
import { readFileSync, existsSync } from 'fs';
import { isInitialized, loadConfig, saveConfig, getDocsDir } from '../lib/config.js';
import { getAllSnapshots, resolveFullSnapshot } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { createPmptFile, SCHEMA_VERSION, type Version, type ProjectMeta, type PlanAnswers } from '../lib/pmptFile.js';
import { loadAuth } from '../lib/auth.js';
import { publishProject, fetchProjects, type ProjectEntry } from '../lib/api.js';
import { computeQuality } from '../lib/quality.js';
import pc from 'picocolors';
import glob from 'fast-glob';
import { join } from 'path';

interface PublishOptions {
  force?: boolean;
}

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

export async function cmdPublish(path?: string, options?: PublishOptions): Promise<void> {
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

  p.intro('pmpt publish');

  const config = loadConfig(projectPath);
  const snapshots = getAllSnapshots(projectPath);
  const planProgress = getPlanProgress(projectPath);

  if (snapshots.length === 0) {
    p.log.warn('No snapshots found. Run `pmpt save` or `pmpt plan` first.');
    p.outro('');
    return;
  }

  // Validate pmpt.ai.md exists and has content
  const docsDir = getDocsDir(projectPath);
  const aiMdPath = join(docsDir, 'pmpt.ai.md');
  if (!existsSync(aiMdPath)) {
    p.log.error('pmpt.ai.md not found. Run `pmpt plan` to generate it first.');
    process.exit(1);
  }
  const aiMdContent = readFileSync(aiMdPath, 'utf-8').trim();
  if (aiMdContent.length === 0) {
    p.log.error('pmpt.ai.md is empty. Run `pmpt plan` to generate content.');
    process.exit(1);
  }

  // Quality gate
  const trackedFiles = glob.sync('**/*.md', { cwd: docsDir });
  const hasGit = snapshots.some(s => !!s.git);

  const quality = computeQuality({
    pmptAiMd: aiMdContent,
    planAnswers: planProgress?.answers ?? null,
    versionCount: snapshots.length,
    docFiles: trackedFiles,
    hasGit,
  });

  const gradeColor = quality.grade === 'A' ? pc.green
    : quality.grade === 'B' ? pc.blue
    : quality.grade === 'C' ? pc.yellow
    : pc.red;

  const qLines = [`Score: ${gradeColor(`${quality.score}/100`)} (Grade ${gradeColor(quality.grade)})`];
  for (const item of quality.details) {
    const icon = item.score === item.maxScore ? pc.green('✓') : pc.red('✗');
    qLines.push(`${icon}  ${item.label.padEnd(20)} ${item.score}/${item.maxScore}`);
  }
  p.note(qLines.join('\n'), 'Quality Score');

  if (!quality.passesMinimum) {
    const tips = quality.details.filter(d => d.tip).map(d => `  → ${d.tip}`);
    p.log.warn(`Quality score ${quality.score}/100 is below minimum (40).`);
    if (tips.length > 0) {
      p.log.info('How to improve:\n' + tips.join('\n'));
    }
    if (!options?.force) {
      p.log.error('Use `pmpt publish --force` to publish anyway.');
      process.exit(1);
    }
    p.log.warn('Publishing with --force despite low quality score.');
  }

  const projectName = planProgress?.answers?.projectName || basename(projectPath);

  // Try to load existing published data for prefill
  let existing: ProjectEntry | undefined;
  const savedSlug = config?.lastPublishedSlug;
  try {
    const index = await fetchProjects();
    if (savedSlug) {
      existing = index.projects.find((p) => p.slug === savedSlug && p.author === auth.username);
    }
  } catch { /* ignore — first publish or offline */ }

  const defaultSlug = savedSlug
    || projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  // Collect publish info
  const slug = await p.text({
    message: 'Project slug (used in URL):',
    placeholder: defaultSlug,
    defaultValue: savedSlug || '',
    validate: (v) => {
      if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(v)) {
        return '3-50 chars, lowercase letters, numbers, and hyphens only.';
      }
    },
  });
  if (p.isCancel(slug)) { p.cancel('Cancelled'); process.exit(0); }

  const description = await p.text({
    message: 'Project description (brief):',
    placeholder: existing?.description || planProgress?.answers?.productIdea?.slice(0, 100) || '',
    defaultValue: existing?.description || planProgress?.answers?.productIdea?.slice(0, 200) || '',
  });
  if (p.isCancel(description)) { p.cancel('Cancelled'); process.exit(0); }

  const tagsInput = await p.text({
    message: 'Tags (comma-separated):',
    placeholder: 'react, saas, mvp',
    defaultValue: existing?.tags?.join(', ') || '',
  });
  if (p.isCancel(tagsInput)) { p.cancel('Cancelled'); process.exit(0); }

  const tags = (tagsInput as string)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const category = await p.select({
    message: 'Project category:',
    initialValue: existing?.category || 'other',
    options: [
      { value: 'web-app',     label: 'Web App' },
      { value: 'mobile-app',  label: 'Mobile App' },
      { value: 'cli-tool',    label: 'CLI Tool' },
      { value: 'api-backend', label: 'API/Backend' },
      { value: 'ai-ml',       label: 'AI/ML' },
      { value: 'game',        label: 'Game' },
      { value: 'library',     label: 'Library' },
      { value: 'other',       label: 'Other' },
    ],
  });
  if (p.isCancel(category)) { p.cancel('Cancelled'); process.exit(0); }

  // Build .pmpt content (resolve from optimized snapshots)
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
    description: description as string,
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

  // Confirm
  p.note(
    [
      `Project: ${projectName}`,
      `Slug: ${slug}`,
      `Versions: ${snapshots.length}`,
      `Size: ${(pmptContent.length / 1024).toFixed(1)} KB`,
      `Author: @${auth.username}`,
      `Category: ${category}`,
      tags.length ? `Tags: ${tags.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
    'Publish Preview'
  );

  const confirm = await p.confirm({
    message: 'Publish this project?',
    initialValue: true,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  // Upload
  const s = p.spinner();
  s.start('Uploading...');

  try {
    const result = await publishProject(auth.token, {
      slug: slug as string,
      pmptContent,
      description: description as string,
      tags,
      category: category as string,
    });

    s.stop('Published!');

    // Update config
    if (config) {
      config.lastPublished = new Date().toISOString();
      config.lastPublishedSlug = slug as string;
      saveConfig(projectPath, config);
    }

    p.note(
      [
        `URL: ${result.url}`,
        `Download: ${result.downloadUrl}`,
        '',
        `pmpt clone ${slug}  — others can clone this project`,
      ].join('\n'),
      'Published!'
    );
  } catch (err) {
    s.stop('Publish failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to publish.');
    process.exit(1);
  }

  p.outro('');
}
