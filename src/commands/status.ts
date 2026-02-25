import * as p from '@clack/prompts';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { isInitialized, loadConfig, getDocsDir } from '../lib/config.js';
import { getTrackedFiles, getAllSnapshots } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { computeQuality } from '../lib/quality.js';
import pc from 'picocolors';

export function cmdStatus(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const config = loadConfig(projectPath);
  const tracked = getTrackedFiles(projectPath);
  const snapshots = getAllSnapshots(projectPath);

  p.intro('pmpt status');

  const notes = [
    `Path: ${projectPath}`,
    `Created: ${new Date(config!.createdAt).toLocaleString()}`,
  ];

  if (config!.lastPublished) {
    notes.push(`Last published: ${new Date(config!.lastPublished).toLocaleString()}`);
  }

  notes.push('');
  notes.push(`Docs folder: ${config!.docsPath}/`);
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

  // Quality Score
  const docsDir = getDocsDir(projectPath);
  const aiMdPath = join(docsDir, 'pmpt.ai.md');
  const pmptAiMd = existsSync(aiMdPath) ? readFileSync(aiMdPath, 'utf-8') : null;

  const planProgress = getPlanProgress(projectPath);
  const hasGit = snapshots.some(s => !!s.git);

  const quality = computeQuality({
    pmptAiMd,
    planAnswers: planProgress?.answers ?? null,
    versionCount: snapshots.length,
    docFiles: tracked,
    hasGit,
  });

  const gradeColor = quality.grade === 'A' ? pc.green
    : quality.grade === 'B' ? pc.blue
    : quality.grade === 'C' ? pc.yellow
    : pc.red;

  const qLines = [
    `Score: ${gradeColor(`${quality.score}/100`)} (Grade ${gradeColor(quality.grade)})`,
    '',
  ];

  for (const item of quality.details) {
    const icon = item.score === item.maxScore ? pc.green('✓') : pc.red('✗');
    const scoreStr = `${item.score}/${item.maxScore}`.padStart(5);
    qLines.push(`${icon}  ${item.label.padEnd(20)} ${scoreStr}`);
  }

  const tips = quality.details.filter(d => d.tip).map(d => d.tip!);
  if (tips.length > 0) {
    qLines.push('');
    for (const tip of tips) {
      qLines.push(`${pc.dim('→')} ${tip}`);
    }
  }

  p.note(qLines.join('\n'), 'Quality Score');

  p.outro('');
}
