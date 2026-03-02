import * as p from '@clack/prompts';
import { resolve, join, basename } from 'path';
import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import { isInitialized, getDocsDir, loadConfig } from '../lib/config.js';
import { createFullSnapshot, getTrackedFiles, getAllSnapshots } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';

export async function cmdSave(fileOrPath?: string): Promise<void> {
  const projectPath = fileOrPath && existsSync(fileOrPath) && statSync(fileOrPath).isDirectory()
    ? resolve(fileOrPath)
    : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  p.intro('pmpt save');

  const docsDir = getDocsDir(projectPath);
  const files = getTrackedFiles(projectPath);

  if (files.length === 0) {
    p.log.warn('No files to save.');
    p.log.info(`Docs folder: ${docsDir}`);
    p.log.info('Start with `pmpt plan` or add MD files to the docs folder.');
    p.outro('');
    return;
  }

  // Auto-create pmpt.md if missing
  const pmptMdPath = join(docsDir, 'pmpt.md');
  if (!existsSync(pmptMdPath)) {
    const planProgress = getPlanProgress(projectPath);
    const config = loadConfig(projectPath);
    const name = planProgress?.answers?.projectName || config?.lastPublishedSlug || basename(projectPath);
    const skeleton = [
      `# ${name}`,
      '',
      '## Progress',
      '- Project initialized',
      '',
      '## Snapshot Log',
      '',
      '## Decisions',
      '',
    ].join('\n');
    writeFileSync(pmptMdPath, skeleton, 'utf-8');
    p.log.info('Created pmpt.md (project tracking document)');
  }

  // Ask for summary
  const summary = await p.text({
    message: 'What did you accomplish? (this is shown on your project page)',
    placeholder: 'e.g. Added user auth with JWT, built login/signup pages',
  });

  if (p.isCancel(summary)) {
    p.cancel('Save cancelled.');
    process.exit(0);
  }

  const note = (summary as string).trim() || undefined;

  // Write summary to pmpt.md Snapshot Log before snapshot
  if (note) {
    const pmptMdPath = join(docsDir, 'pmpt.md');
    if (existsSync(pmptMdPath)) {
      let content = readFileSync(pmptMdPath, 'utf-8');
      const snapshots = getAllSnapshots(projectPath);
      const nextVersion = snapshots.length + 1;
      const date = new Date().toISOString().slice(0, 10);

      const noteLines = note.split(/(?:\.\s+|\n)/).filter(s => s.trim()).map(s => {
        const trimmed = s.trim().replace(/\.?$/, '');
        return `- ${trimmed}`;
      });
      const entry = `\n### v${nextVersion} — ${date}\n${noteLines.join('\n')}\n`;

      const logIndex = content.indexOf('## Snapshot Log');
      if (logIndex !== -1) {
        const afterHeader = content.indexOf('\n', logIndex);
        const nextSection = content.indexOf('\n## ', afterHeader + 1);
        const insertPos = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, insertPos) + entry + content.slice(insertPos);
      } else {
        content += `\n## Snapshot Log${entry}`;
      }

      writeFileSync(pmptMdPath, content, 'utf-8');
    }
  }

  const s = p.spinner();
  s.start(`Creating snapshot of ${files.length} file(s)...`);

  try {
    const entry = createFullSnapshot(projectPath, { note });
    s.stop('Snapshot saved');

    let msg = `v${entry.version} saved`;
    if (entry.git) {
      msg += ` · ${entry.git.commit}`;
      if (entry.git.dirty) msg += ' (uncommitted)';
    }

    const changedCount = entry.changedFiles?.length ?? entry.files.length;
    const unchangedCount = entry.files.length - changedCount;
    if (unchangedCount > 0) {
      msg += ` (${changedCount} changed, ${unchangedCount} skipped)`;
    }

    p.log.success(msg);

    if (note) {
      p.log.info(`Summary: ${note}`);
    }

    p.log.message('');
    p.log.info('Files included:');
    for (const file of entry.files) {
      const isChanged = entry.changedFiles ? entry.changedFiles.includes(file) : true;
      p.log.message(`  - ${file}${isChanged ? '' : ' (unchanged)'}`);
    }
  } catch (error) {
    s.stop('Save failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }

  p.outro('View history: pmpt history');
}
