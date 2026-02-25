import * as p from '@clack/prompts';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { getDocsDir, initializeProject, isInitialized } from '../lib/config.js';
import { createFullSnapshot } from '../lib/history.js';
import { cmdPlan } from './plan.js';
import { cmdPublish } from './publish.js';

interface InternalSeedOptions {
  spec?: string;
}

interface SeedStep {
  files?: Record<string, string>;
  filesFrom?: Record<string, string>;
  saveNote?: string;
}

interface SeedPublishConfig {
  enabled?: boolean;
  force?: boolean;
  yes?: boolean;
  metaFile?: string;
  slug?: string;
  description?: string;
  tags?: string[] | string;
  category?: string;
}

interface SeedSpec {
  projectPath?: string;
  answersFile?: string;
  answers?: Record<string, unknown>;
  resetPlan?: boolean;
  versions?: SeedStep[];
  publish?: SeedPublishConfig;
}

function assertInternalEnabled(): void {
  if (process.env.PMPT_INTERNAL !== '1') {
    p.log.error('internal-seed is disabled.');
    p.log.info('Set PMPT_INTERNAL=1 to enable internal automation commands.');
    process.exit(1);
  }
}

function readJsonFile<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    throw new Error(`Invalid JSON: ${filePath}`);
  }
}

function writeDocFile(docsDir: string, fileName: string, content: string): void {
  const outPath = resolve(docsDir, fileName);
  const docsRoot = resolve(docsDir);
  if (!outPath.startsWith(docsRoot + '/') && outPath !== docsRoot) {
    throw new Error(`Unsafe docs path: ${fileName}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
}

function normalizeTags(tags: string[] | string | undefined): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.join(',');
  return tags;
}

export async function cmdInternalSeed(options?: InternalSeedOptions): Promise<void> {
  assertInternalEnabled();

  if (!options?.spec) {
    p.log.error('Missing required option: --spec <file>');
    process.exit(1);
  }

  const specPath = resolve(options.spec);
  const specDir = dirname(specPath);
  const spec = readJsonFile<SeedSpec>(specPath);
  const projectPath = spec.projectPath ? resolve(spec.projectPath) : process.cwd();

  p.intro('pmpt internal-seed');

  if (!isInitialized(projectPath)) {
    initializeProject(projectPath, { trackGit: true });
    p.log.info(`Initialized: ${projectPath}`);
  }

  let answersFileForPlan: string | undefined;
  if (spec.answers) {
    const tempAnswersPath = join(projectPath, '.pmpt', '.internal-seed-answers.json');
    mkdirSync(dirname(tempAnswersPath), { recursive: true });
    writeFileSync(tempAnswersPath, JSON.stringify(spec.answers, null, 2), 'utf-8');
    answersFileForPlan = tempAnswersPath;
  } else if (spec.answersFile) {
    answersFileForPlan = resolve(specDir, spec.answersFile);
  }

  if (answersFileForPlan) {
    await cmdPlan(projectPath, {
      reset: spec.resetPlan ?? true,
      answersFile: answersFileForPlan,
    });

    // Clean up temp answers file
    const tempAnswersPath = join(projectPath, '.pmpt', '.internal-seed-answers.json');
    if (spec.answers && existsSync(tempAnswersPath)) {
      unlinkSync(tempAnswersPath);
    }
  }

  const docsDir = getDocsDir(projectPath);
  for (const step of spec.versions ?? []) {
    for (const [fileName, content] of Object.entries(step.files ?? {})) {
      writeDocFile(docsDir, fileName, content);
    }
    for (const [fileName, fromPath] of Object.entries(step.filesFrom ?? {})) {
      const content = readFileSync(resolve(specDir, fromPath), 'utf-8');
      writeDocFile(docsDir, fileName, content);
    }

    const entry = createFullSnapshot(projectPath);
    const note = step.saveNote ? ` — ${step.saveNote}` : '';
    p.log.success(`v${entry.version} saved${note}`);
  }

  if (spec.publish?.enabled) {
    await cmdPublish(projectPath, {
      force: spec.publish.force ?? false,
      nonInteractive: true,
      yes: spec.publish.yes ?? true,
      metaFile: spec.publish.metaFile ? resolve(specDir, spec.publish.metaFile) : undefined,
      slug: spec.publish.slug,
      description: spec.publish.description,
      tags: normalizeTags(spec.publish.tags),
      category: spec.publish.category,
    });
  }

  p.outro('internal-seed completed');
}
