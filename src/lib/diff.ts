/**
 * Simple unified diff implementation using LCS (Longest Common Subsequence).
 * Pure functions — no file I/O, no UI.
 */

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
}

export interface FileDiff {
  fileName: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  hunks: DiffHunk[];
}

/** LCS DP table — O(n*m), fine for markdown files (<500 lines). */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/** Backtrack LCS table → ordered DiffLine array. */
function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'context', content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', content: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', content: a[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

/** Build a DiffHunk from a slice of diff lines. */
function buildHunk(lines: DiffLine[], start: number, end: number): DiffHunk {
  const hunkLines = lines.slice(start, end + 1);

  let oldLine = 1;
  let newLine = 1;
  for (let i = 0; i < start; i++) {
    if (lines[i].type === 'context' || lines[i].type === 'remove') oldLine++;
    if (lines[i].type === 'context' || lines[i].type === 'add') newLine++;
  }

  let oldCount = 0;
  let newCount = 0;
  for (const line of hunkLines) {
    if (line.type === 'context' || line.type === 'remove') oldCount++;
    if (line.type === 'context' || line.type === 'add') newCount++;
  }

  return { oldStart: oldLine, oldCount, newStart: newLine, newCount, lines: hunkLines };
}

/** Group diff lines into hunks with context (default 3 lines, like git). */
function groupIntoHunks(lines: DiffLine[], contextLines = 3): DiffHunk[] {
  const changeIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') changeIndices.push(i);
  }

  if (changeIndices.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let hunkStart = Math.max(0, changeIndices[0] - contextLines);
  let hunkEnd = Math.min(lines.length - 1, changeIndices[0] + contextLines);

  for (let k = 1; k < changeIndices.length; k++) {
    const nextStart = Math.max(0, changeIndices[k] - contextLines);
    const nextEnd = Math.min(lines.length - 1, changeIndices[k] + contextLines);

    if (nextStart <= hunkEnd + 1) {
      hunkEnd = nextEnd;
    } else {
      hunks.push(buildHunk(lines, hunkStart, hunkEnd));
      hunkStart = nextStart;
      hunkEnd = nextEnd;
    }
  }

  hunks.push(buildHunk(lines, hunkStart, hunkEnd));
  return hunks;
}

/** Normalize trailing newline from split. */
function splitLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Compute unified diff hunks between two strings. */
export function computeDiff(oldContent: string, newContent: string): DiffHunk[] {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const dp = lcsTable(oldLines, newLines);
  const diffLines = backtrack(dp, oldLines, newLines);
  return groupIntoHunks(diffLines);
}

/** Diff a single file between two versions. */
export function diffFile(fileName: string, oldContent: string | null, newContent: string | null): FileDiff {
  if (oldContent === null && newContent === null) {
    return { fileName, status: 'unchanged', hunks: [] };
  }

  if (oldContent === null) {
    const lines: DiffLine[] = splitLines(newContent!).map(l => ({ type: 'add', content: l }));
    return {
      fileName,
      status: 'added',
      hunks: lines.length > 0 ? [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length, lines }] : [],
    };
  }

  if (newContent === null) {
    const lines: DiffLine[] = splitLines(oldContent).map(l => ({ type: 'remove', content: l }));
    return {
      fileName,
      status: 'removed',
      hunks: lines.length > 0 ? [{ oldStart: 1, oldCount: lines.length, newStart: 0, newCount: 0, lines }] : [],
    };
  }

  if (oldContent === newContent) {
    return { fileName, status: 'unchanged', hunks: [] };
  }

  return { fileName, status: 'modified', hunks: computeDiff(oldContent, newContent) };
}

/** Diff all files between two snapshots (Record<filename, content>). */
export function diffSnapshots(oldFiles: Record<string, string>, newFiles: Record<string, string>): FileDiff[] {
  const allNames = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);
  const diffs: FileDiff[] = [];

  for (const name of [...allNames].sort()) {
    const fd = diffFile(name, oldFiles[name] ?? null, newFiles[name] ?? null);
    if (fd.status !== 'unchanged') diffs.push(fd);
  }

  return diffs;
}
