import * as p from '@clack/prompts';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { isInitialized, getDocsDir } from '../lib/config.js';
import { getAllSnapshots, resolveFullSnapshot } from '../lib/history.js';
import { diffSnapshots, type FileDiff, type DiffHunk } from '../lib/diff.js';
import pc from 'picocolors';
import glob from 'fast-glob';

interface DiffOptions {
  file?: string;
}

/** Read current .pmpt/docs/ as Record<filename, content>. */
function readWorkingCopy(projectPath: string): Record<string, string> {
  const docsDir = getDocsDir(projectPath);
  const files: Record<string, string> = {};
  if (!existsSync(docsDir)) return files;

  const mdFiles = glob.sync('**/*.md', { cwd: docsDir });
  for (const file of mdFiles) {
    try {
      files[file] = readFileSync(join(docsDir, file), 'utf-8');
    } catch {
      // skip unreadable
    }
  }
  return files;
}

/** Format unified diff hunk header. */
function formatHunkHeader(hunk: DiffHunk): string {
  const oldRange = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`;
  const newRange = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}`;
  return `@@ -${oldRange} +${newRange} @@`;
}

/** Print one file's diff to stdout with colors. */
function printFileDiff(fd: FileDiff): void {
  console.log(pc.bold(`--- a/${fd.fileName}`));
  console.log(pc.bold(`+++ b/${fd.fileName}`));

  for (const hunk of fd.hunks) {
    console.log(pc.cyan(formatHunkHeader(hunk)));
    for (const line of hunk.lines) {
      if (line.type === 'add') console.log(pc.green(`+${line.content}`));
      else if (line.type === 'remove') console.log(pc.red(`-${line.content}`));
      else console.log(pc.dim(` ${line.content}`));
    }
  }
  console.log('');
}

/** Print summary statistics. */
function printSummary(diffs: FileDiff[]): void {
  const modified = diffs.filter(d => d.status === 'modified').length;
  const added = diffs.filter(d => d.status === 'added').length;
  const removed = diffs.filter(d => d.status === 'removed').length;

  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} modified`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);

  let additions = 0;
  let deletions = 0;
  for (const fd of diffs) {
    for (const hunk of fd.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') additions++;
        if (line.type === 'remove') deletions++;
      }
    }
  }

  p.log.info(`${diffs.length} file(s) changed: ${parts.join(', ')}`);
  p.log.info(`${pc.green(`+${additions}`)} additions, ${pc.red(`-${deletions}`)} deletions`);
}

export function cmdDiff(
  v1: string,
  v2?: string | DiffOptions,
  pathOrOptions?: string | DiffOptions,
  maybeOptions?: DiffOptions,
): void {
  // Commander passes args in order: pmpt diff v1 [v2] [path] [options]
  // Smart parsing: if v2 looks like a path (not a version pattern), treat it as path.
  let v2Str: string | undefined;
  let path: string | undefined;
  let options: DiffOptions = {};

  const isVersion = (s: string) => /^v?\d+$/.test(s);

  if (typeof v2 === 'object') {
    // pmpt diff v1 --file x → (v1, options)
    options = v2;
  } else if (v2 !== undefined && !isVersion(v2)) {
    // pmpt diff v1 /some/path → v2 is actually a path
    path = v2;
    if (typeof pathOrOptions === 'object') {
      options = pathOrOptions;
    }
  } else {
    v2Str = v2;
    if (typeof pathOrOptions === 'object') {
      options = pathOrOptions;
    } else {
      path = pathOrOptions;
      if (maybeOptions) options = maybeOptions;
    }
  }

  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  const fromVersion = parseInt(v1.replace(/^v/, ''), 10);
  if (isNaN(fromVersion)) {
    p.log.error('Invalid version format. Use: pmpt diff v1 v2');
    process.exit(1);
  }

  const diffAgainstWorking = v2Str === undefined;
  let toVersion: number | undefined;
  if (!diffAgainstWorking) {
    toVersion = parseInt(v2Str!.replace(/^v/, ''), 10);
    if (isNaN(toVersion)) {
      p.log.error('Invalid version format. Use: pmpt diff v1 v2');
      process.exit(1);
    }
  }

  const snapshots = getAllSnapshots(projectPath);
  if (snapshots.length === 0) {
    p.log.error('No snapshots found.');
    process.exit(1);
  }

  const fromIndex = snapshots.findIndex(s => s.version === fromVersion);
  if (fromIndex === -1) {
    p.log.error(`Version v${fromVersion} not found.`);
    process.exit(1);
  }

  let toIndex: number | undefined;
  if (!diffAgainstWorking) {
    toIndex = snapshots.findIndex(s => s.version === toVersion);
    if (toIndex === -1) {
      p.log.error(`Version v${toVersion} not found.`);
      process.exit(1);
    }
  }

  // Resolve file contents
  const oldFiles = resolveFullSnapshot(snapshots, fromIndex);
  const newFiles = diffAgainstWorking
    ? readWorkingCopy(projectPath)
    : resolveFullSnapshot(snapshots, toIndex!);

  // Optional file filter
  let filteredOld = oldFiles;
  let filteredNew = newFiles;
  if (options.file) {
    filteredOld = oldFiles[options.file] !== undefined ? { [options.file]: oldFiles[options.file] } : {};
    filteredNew = newFiles[options.file] !== undefined ? { [options.file]: newFiles[options.file] } : {};
    if (Object.keys(filteredOld).length === 0 && Object.keys(filteredNew).length === 0) {
      p.log.error(`File "${options.file}" not found in either version.`);
      process.exit(1);
    }
  }

  const diffs = diffSnapshots(filteredOld, filteredNew);

  const targetLabel = diffAgainstWorking ? 'working copy' : `v${toVersion}`;
  p.intro(`pmpt diff v${fromVersion} → ${targetLabel}`);

  if (diffs.length === 0) {
    p.log.info('No differences found.');
    p.outro('');
    return;
  }

  // Changed files list
  const fileList = diffs.map(d => {
    const icon = d.status === 'added' ? pc.green('A')
      : d.status === 'removed' ? pc.red('D')
      : pc.yellow('M');
    return `  ${icon}  ${d.fileName}`;
  }).join('\n');
  p.note(fileList, 'Changed files');

  console.log('');
  for (const fd of diffs) {
    printFileDiff(fd);
  }

  printSummary(diffs);
  p.outro('');
}
