#!/usr/bin/env node

/**
 * pmpt MCP Server
 *
 * Exposes pmpt functionality as MCP tools so AI tools
 * (Claude Code, Cursor, etc.) can interact with pmpt directly.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import glob from 'fast-glob';
import { createRequire } from 'module';

import { isInitialized, loadConfig, getDocsDir } from './lib/config.js';
import { createFullSnapshot, getAllSnapshots, getTrackedFiles, resolveFullSnapshot } from './lib/history.js';
import { computeQuality, type QualityInput } from './lib/quality.js';
import { getPlanProgress } from './lib/plan.js';
import { isGitRepo } from './lib/git.js';
import { diffSnapshots, type FileDiff } from './lib/diff.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// ── Server ──────────────────────────────────────────

const server = new McpServer({
  name: 'pmpt',
  version,
});

// ── Helpers ─────────────────────────────────────────

function resolveProjectPath(projectPath?: string): string {
  return projectPath ? resolve(projectPath) : process.cwd();
}

function assertInitialized(pp: string): void {
  if (!isInitialized(pp)) {
    throw new Error(`Project not initialized at ${pp}. Run \`pmpt init\` first.`);
  }
}

function readWorkingCopy(pp: string): Record<string, string> {
  const docsDir = getDocsDir(pp);
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

function buildQualityInput(pp: string): QualityInput {
  const docsDir = getDocsDir(pp);
  const aiMdPath = join(docsDir, 'pmpt.ai.md');
  const pmptAiMd = existsSync(aiMdPath) ? readFileSync(aiMdPath, 'utf-8') : null;
  const planProgress = getPlanProgress(pp);
  const tracked = getTrackedFiles(pp);
  const snapshots = getAllSnapshots(pp);
  const hasGit = snapshots.some((s) => !!s.git) || isGitRepo(pp);
  return {
    pmptAiMd,
    planAnswers: planProgress?.answers ?? null,
    versionCount: snapshots.length,
    docFiles: tracked,
    hasGit,
  };
}

function formatDiffs(diffs: FileDiff[]): string {
  if (diffs.length === 0) return 'No differences found.';
  const lines: string[] = [];
  const modified = diffs.filter((d) => d.status === 'modified').length;
  const added = diffs.filter((d) => d.status === 'added').length;
  const removed = diffs.filter((d) => d.status === 'removed').length;
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} modified`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  lines.push(`${diffs.length} file(s) changed: ${parts.join(', ')}`);
  lines.push('');
  for (const fd of diffs) {
    const icon = fd.status === 'added' ? 'A' : fd.status === 'removed' ? 'D' : 'M';
    lines.push(`[${icon}] ${fd.fileName}`);
    for (const hunk of fd.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        lines.push(`${prefix}${line.content}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Tools ───────────────────────────────────────────

server.tool(
  'pmpt_save',
  'Save a snapshot of .pmpt/docs/ files. Call after completing features, fixes, or milestones.',
  { projectPath: z.string().optional().describe('Project root path. Defaults to cwd.') },
  async ({ projectPath }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const tracked = getTrackedFiles(pp);
      if (tracked.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No files to save. Add .md files to .pmpt/docs/ first.' }] };
      }

      const entry = createFullSnapshot(pp);
      const changedCount = entry.changedFiles?.length ?? entry.files.length;

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Snapshot v${entry.version} saved (${changedCount} changed, ${entry.files.length - changedCount} unchanged).`,
            '',
            `Files: ${entry.files.join(', ')}`,
            entry.changedFiles ? `Changed: ${entry.changedFiles.join(', ')}` : '',
            entry.git ? `Git: ${entry.git.commit} (${entry.git.branch}${entry.git.dirty ? ', dirty' : ''})` : '',
          ].filter(Boolean).join('\n'),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_status',
  'Check pmpt project status: tracked files, snapshot count, and quality score.',
  { projectPath: z.string().optional().describe('Project root path. Defaults to cwd.') },
  async ({ projectPath }) => {
    try {
      const pp = resolveProjectPath(projectPath);

      if (!isInitialized(pp)) {
        return { content: [{ type: 'text' as const, text: 'Project not initialized. Run `pmpt init` to start.' }] };
      }

      const config = loadConfig(pp);
      const tracked = getTrackedFiles(pp);
      const snapshots = getAllSnapshots(pp);
      const quality = computeQuality(buildQualityInput(pp));

      const lines = [
        `pmpt status: ${tracked.length} file(s), ${snapshots.length} snapshot(s), quality ${quality.score}/100 (${quality.grade})`,
        `Files: ${tracked.join(', ') || '(none)'}`,
        config?.lastPublished ? `Last published: ${config.lastPublished.slice(0, 10)}` : '',
        '',
      ];

      for (const d of quality.details) {
        const icon = d.score === d.maxScore ? '[PASS]' : '[FAIL]';
        lines.push(`${icon} ${d.label}: ${d.score}/${d.maxScore}${d.tip ? ` — ${d.tip}` : ''}`);
      }

      return { content: [{ type: 'text' as const, text: lines.filter(Boolean).join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_history',
  'View version history of pmpt snapshots.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    limit: z.number().optional().describe('Max snapshots to return (most recent). Defaults to all.'),
  },
  async ({ projectPath, limit }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const snapshots = getAllSnapshots(pp);
      if (snapshots.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No snapshots yet. Run `pmpt save` to create one.' }] };
      }

      let display = snapshots;
      if (limit && limit > 0 && limit < snapshots.length) {
        display = snapshots.slice(-limit);
      }

      const lines = [`${snapshots.length} snapshot(s)${limit ? `, showing last ${display.length}` : ''}:`, ''];
      for (const s of display) {
        const changed = s.changedFiles?.length ?? s.files.length;
        const git = s.git ? ` [${s.git.commit}]` : '';
        lines.push(`v${s.version} — ${s.timestamp.slice(0, 16)} — ${changed} changed, ${s.files.length} total${git}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_diff',
  'Compare two versions, or a version against the current working copy.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    v1: z.number().describe('First version number (e.g. 1 for v1).'),
    v2: z.number().optional().describe('Second version. If omitted, compares against working copy.'),
  },
  async ({ projectPath, v1, v2 }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const snapshots = getAllSnapshots(pp);
      const fromIndex = snapshots.findIndex((s) => s.version === v1);
      if (fromIndex === -1) {
        return { content: [{ type: 'text' as const, text: `Version v${v1} not found.` }], isError: true };
      }

      const oldFiles = resolveFullSnapshot(snapshots, fromIndex);
      let newFiles: Record<string, string>;
      let targetLabel: string;

      if (v2 !== undefined) {
        const toIndex = snapshots.findIndex((s) => s.version === v2);
        if (toIndex === -1) {
          return { content: [{ type: 'text' as const, text: `Version v${v2} not found.` }], isError: true };
        }
        newFiles = resolveFullSnapshot(snapshots, toIndex);
        targetLabel = `v${v2}`;
      } else {
        newFiles = readWorkingCopy(pp);
        targetLabel = 'working copy';
      }

      const diffs = diffSnapshots(oldFiles, newFiles);
      return {
        content: [
          { type: 'text' as const, text: `Diff: v${v1} → ${targetLabel}` },
          { type: 'text' as const, text: formatDiffs(diffs) },
        ],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_quality',
  'Check project quality score and publish readiness.',
  { projectPath: z.string().optional().describe('Project root path. Defaults to cwd.') },
  async ({ projectPath }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const quality = computeQuality(buildQualityInput(pp));
      const lines = [
        `Quality: ${quality.score}/100 (Grade ${quality.grade})`,
        `Publish ready: ${quality.passesMinimum ? 'Yes' : 'No (minimum 40 required)'}`,
        '',
      ];
      for (const item of quality.details) {
        const icon = item.score === item.maxScore ? '[PASS]' : '[FAIL]';
        lines.push(`${icon} ${item.label}: ${item.score}/${item.maxScore}${item.tip ? ` — ${item.tip}` : ''}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ── Start ───────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('pmpt MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
