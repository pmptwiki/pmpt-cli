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
import { existsSync, readFileSync, writeFileSync } from 'fs';
import glob from 'fast-glob';
import { createRequire } from 'module';

import { isInitialized, loadConfig, getDocsDir, getConfigDir } from './lib/config.js';
import { createFullSnapshot, getAllSnapshots, getTrackedFiles, resolveFullSnapshot } from './lib/history.js';
import { computeQuality, type QualityInput } from './lib/quality.js';
import { getPlanProgress, savePlanProgress, savePlanDocuments, PLAN_QUESTIONS } from './lib/plan.js';
import { isGitRepo } from './lib/git.js';
import { diffSnapshots, type FileDiff } from './lib/diff.js';
import { loadAuth } from './lib/auth.js';
import { publishProject, graduateProject } from './lib/api.js';
import { createPmptFile, type Version, type ProjectMeta, type PlanAnswers } from './lib/pmptFile.js';

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

server.tool(
  'pmpt_plan_questions',
  'Get the planning questions to ask the user. Call this FIRST when a user wants to build something, then ask each question conversationally. After collecting all answers, call pmpt_plan to generate the project.',
  { projectPath: z.string().optional().describe('Project root path. Defaults to cwd.') },
  async ({ projectPath }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const existing = getPlanProgress(pp);

      const lines = [
        'Ask the user these questions one by one in a natural, conversational way.',
        'You may skip questions the user has already answered in the conversation.',
        'Required questions are marked with *.',
        '',
      ];

      for (const q of PLAN_QUESTIONS) {
        lines.push(`${q.required ? '*' : ' '} ${q.key}: ${q.question}`);
        if (q.placeholder) lines.push(`    hint: ${q.placeholder}`);
      }

      if (existing?.completed && existing.answers) {
        lines.push('');
        lines.push('NOTE: A plan already exists. Current answers:');
        for (const q of PLAN_QUESTIONS) {
          const val = existing.answers[q.key];
          if (val) lines.push(`  ${q.key}: ${val}`);
        }
        lines.push('Ask if the user wants to update or start fresh.');
      }

      lines.push('');
      lines.push('After collecting answers, call pmpt_plan with the collected answers.');

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_plan',
  'Finalize the plan: submit collected answers to generate AI prompt and project docs (plan.md, pmpt.md, pmpt.ai.md). Call pmpt_plan_questions first to get the questions, ask the user conversationally, then call this with the answers.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    projectName: z.string().describe('Project name (e.g. "my-awesome-app").'),
    productIdea: z.string().describe('What to build with AI — the core product idea.'),
    coreFeatures: z.string().describe('Key features, separated by commas or semicolons.'),
    additionalContext: z.string().optional().describe('Any extra context AI should know.'),
    techStack: z.string().optional().describe('Preferred tech stack. AI will suggest if omitted.'),
  },
  async ({ projectPath, projectName, productIdea, coreFeatures, additionalContext, techStack }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const answers: Record<string, string> = {
        projectName,
        productIdea,
        coreFeatures,
        additionalContext: additionalContext || '',
        techStack: techStack || '',
      };

      // Save plan progress
      savePlanProgress(pp, {
        completed: true,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        answers,
      });

      // Generate and save plan documents (plan.md, pmpt.md, pmpt.ai.md) + initial snapshot
      const result = savePlanDocuments(pp, answers);

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Plan completed for "${projectName}"!`,
            '',
            `Generated files:`,
            `  - ${result.planPath} (project plan)`,
            `  - ${result.promptPath} (AI instruction — paste into AI tool)`,
            '',
            `Questions answered:`,
            ...PLAN_QUESTIONS.map(q => `  ${q.key}: ${answers[q.key] || '(skipped)'}`),
            '',
            `The AI prompt in pmpt.ai.md contains your development instructions.`,
            `You can now start building based on the plan. Run pmpt_save after milestones.`,
          ].join('\n'),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_read_context',
  'Read project context to understand current state. Call this at the START of a new session to resume where you left off. Returns plan answers, docs content, recent history, and quality score.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    includeDocsContent: z.boolean().optional().describe('Include full content of docs files. Defaults to true.'),
  },
  async ({ projectPath, includeDocsContent }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const config = loadConfig(pp);
      const planProgress = getPlanProgress(pp);
      const tracked = getTrackedFiles(pp);
      const snapshots = getAllSnapshots(pp);
      const quality = computeQuality(buildQualityInput(pp));
      const docsDir = getDocsDir(pp);

      const lines: string[] = [];

      // Project overview
      const projectName = planProgress?.answers?.projectName || config?.lastPublishedSlug || '(unknown)';
      lines.push(`# Project: ${projectName}`);
      lines.push(`Quality: ${quality.score}/100 (${quality.grade}) | Snapshots: ${snapshots.length} | Files: ${tracked.length}`);
      if (config?.lastPublished) lines.push(`Last published: ${config.lastPublished.slice(0, 10)}`);
      lines.push('');

      // Plan answers
      if (planProgress?.completed && planProgress.answers) {
        lines.push('## Plan');
        for (const q of PLAN_QUESTIONS) {
          const val = planProgress.answers[q.key];
          if (val) lines.push(`${q.key}: ${val}`);
        }
        lines.push('');
      }

      // Docs content
      if (includeDocsContent !== false) {
        lines.push('## Docs');
        for (const file of tracked) {
          const filePath = join(docsDir, file);
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8');
            lines.push(`### ${file}`);
            lines.push(content);
            lines.push('');
          }
        }
      }

      // Recent history (last 5)
      if (snapshots.length > 0) {
        lines.push('## Recent History');
        const recent = snapshots.slice(-5);
        for (const s of recent) {
          const changed = s.changedFiles?.length ?? s.files.length;
          const git = s.git ? ` [${s.git.commit}]` : '';
          lines.push(`v${s.version} — ${s.timestamp.slice(0, 16)} — ${changed} changed${git}`);
        }
        lines.push('');
      }

      // Quality details
      const failing = quality.details.filter(d => d.score < d.maxScore);
      if (failing.length > 0) {
        lines.push('## Improvement Areas');
        for (const d of failing) {
          lines.push(`- ${d.label}: ${d.score}/${d.maxScore}${d.tip ? ` — ${d.tip}` : ''}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_update_doc',
  'Update pmpt.md: check off completed features, add progress notes, or append content. Use this after completing work to keep the project document up to date.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    completedFeatures: z.array(z.string()).optional().describe('Feature names to mark as done (matches against checkbox items in pmpt.md).'),
    progressNote: z.string().optional().describe('Progress note to append to the Snapshot Log section.'),
    snapshotVersion: z.string().optional().describe('Version label for the snapshot log entry (e.g. "v3 - Auth Complete"). Auto-generated if omitted.'),
  },
  async ({ projectPath, completedFeatures, progressNote, snapshotVersion }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const docsDir = getDocsDir(pp);
      const pmptMdPath = join(docsDir, 'pmpt.md');

      if (!existsSync(pmptMdPath)) {
        return { content: [{ type: 'text' as const, text: 'pmpt.md not found. Run pmpt_plan first to generate project docs.' }], isError: true };
      }

      let content = readFileSync(pmptMdPath, 'utf-8');
      const changes: string[] = [];

      // Check off completed features
      if (completedFeatures && completedFeatures.length > 0) {
        for (const feature of completedFeatures) {
          const pattern = new RegExp(`- \\[ \\] (.*${feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*)`,'i');
          const match = content.match(pattern);
          if (match) {
            content = content.replace(match[0], `- [x] ${match[1]}`);
            changes.push(`Checked: ${match[1]}`);
          }
        }
      }

      // Add progress note to Snapshot Log
      if (progressNote) {
        const snapshots = getAllSnapshots(pp);
        const label = snapshotVersion || `v${snapshots.length} - Progress`;
        const entry = `\n### ${label}\n- ${progressNote}\n`;

        const logIndex = content.indexOf('## Snapshot Log');
        if (logIndex !== -1) {
          // Find the end of the Snapshot Log header line
          const afterHeader = content.indexOf('\n', logIndex);
          // Find the next ## section or end of file
          const nextSection = content.indexOf('\n## ', afterHeader + 1);
          const insertPos = nextSection !== -1 ? nextSection : content.length;
          content = content.slice(0, insertPos) + entry + content.slice(insertPos);
        } else {
          content += `\n## Snapshot Log${entry}`;
        }
        changes.push(`Added log: ${label}`);
      }

      if (changes.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changes to make. Provide completedFeatures or progressNote.' }] };
      }

      writeFileSync(pmptMdPath, content, 'utf-8');

      return {
        content: [{
          type: 'text' as const,
          text: [`Updated pmpt.md:`, ...changes.map(c => `  - ${c}`), '', 'Run pmpt_save to create a snapshot.'].join('\n'),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_log_decision',
  'Record an architectural or technical decision in pmpt.md. Use this when making important choices (tech stack, library selection, design patterns, etc.) so the reasoning is preserved.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    title: z.string().describe('Short decision title (e.g. "Database: SQLite over PostgreSQL").'),
    reasoning: z.string().describe('Why this decision was made.'),
  },
  async ({ projectPath, title, reasoning }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      const docsDir = getDocsDir(pp);
      const pmptMdPath = join(docsDir, 'pmpt.md');

      if (!existsSync(pmptMdPath)) {
        return { content: [{ type: 'text' as const, text: 'pmpt.md not found. Run pmpt_plan first.' }], isError: true };
      }

      let content = readFileSync(pmptMdPath, 'utf-8');
      const date = new Date().toISOString().slice(0, 10);
      const entry = `- **${title}** — ${reasoning} _(${date})_\n`;

      const decisionsIndex = content.indexOf('## Decisions');
      if (decisionsIndex !== -1) {
        const afterHeader = content.indexOf('\n', decisionsIndex);
        const nextSection = content.indexOf('\n## ', afterHeader + 1);
        const insertPos = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, insertPos) + entry + content.slice(insertPos);
      } else {
        // Insert before Snapshot Log if it exists, otherwise append
        const logIndex = content.indexOf('## Snapshot Log');
        if (logIndex !== -1) {
          content = content.slice(0, logIndex) + `## Decisions\n${entry}\n` + content.slice(logIndex);
        } else {
          content += `\n## Decisions\n${entry}`;
        }
      }

      writeFileSync(pmptMdPath, content, 'utf-8');

      return {
        content: [{
          type: 'text' as const,
          text: `Decision recorded: ${title}\nReasoning: ${reasoning}`,
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_publish',
  'Publish the project to pmptwiki.com. Requires prior login via `pmpt login` in CLI. Packages project docs and history into a .pmpt file and uploads it.',
  {
    projectPath: z.string().optional().describe('Project root path. Defaults to cwd.'),
    slug: z.string().describe('Project slug (3-50 chars, lowercase alphanumeric and hyphens).'),
    description: z.string().optional().describe('Project description (max 500 chars).'),
    tags: z.array(z.string()).optional().describe('Tags for the project (max 10).'),
    category: z.string().optional().describe('Category: web-app, mobile-app, cli-tool, api-backend, ai-ml, game, library, other.'),
    productUrl: z.string().optional().describe('Product URL (GitHub repo or live site).'),
    productUrlType: z.enum(['git', 'url']).optional().describe('Type of product URL.'),
  },
  async ({ projectPath, slug, description, tags, category, productUrl, productUrlType }) => {
    try {
      const pp = resolveProjectPath(projectPath);
      assertInitialized(pp);

      // Check auth
      const auth = loadAuth();
      if (!auth) {
        return { content: [{ type: 'text' as const, text: 'Not logged in. Run `pmpt login` in the terminal first.' }], isError: true };
      }

      // Build .pmpt file content
      const config = loadConfig(pp);
      const planProgress = getPlanProgress(pp);
      const snapshots = getAllSnapshots(pp);
      const docsDir = getDocsDir(pp);
      const quality = computeQuality(buildQualityInput(pp));

      if (quality.score < 40) {
        return {
          content: [{
            type: 'text' as const,
            text: `Quality score ${quality.score}/100 is below minimum (40). Improve your project before publishing.\n\n${quality.details.filter(d => d.score < d.maxScore).map(d => `- ${d.label}: ${d.tip}`).join('\n')}`,
          }],
          isError: true,
        };
      }

      const projectName = planProgress?.answers?.projectName || config?.lastPublishedSlug || slug;

      // Build versions
      const history: Version[] = snapshots.map((s, i) => {
        const files = resolveFullSnapshot(snapshots, i);
        return {
          version: s.version,
          timestamp: s.timestamp,
          files,
          changedFiles: s.changedFiles,
          note: s.note,
          git: s.git,
        };
      });

      // Build docs
      const docs: Record<string, string> = {};
      const tracked = getTrackedFiles(pp);
      for (const file of tracked) {
        const filePath = join(docsDir, file);
        if (existsSync(filePath)) {
          docs[file] = readFileSync(filePath, 'utf-8');
        }
      }

      const meta: ProjectMeta = {
        projectName,
        createdAt: snapshots[0]?.timestamp || new Date().toISOString(),
        exportedAt: new Date().toISOString(),
        description: description || '',
      };

      const planAnswers: PlanAnswers | undefined = planProgress?.answers
        ? planProgress.answers as unknown as PlanAnswers
        : undefined;

      const pmptContent = createPmptFile(meta, planAnswers, docs, history);

      // Publish
      const result = await publishProject(auth.token, {
        slug,
        pmptContent,
        description: description || '',
        tags: tags || [],
        category,
        productUrl,
        productUrlType,
      });

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Published "${projectName}" to pmptwiki!`,
            '',
            `URL: ${result.url}`,
            `Download: ${result.downloadUrl}`,
            `Slug: ${slug}`,
            `Author: @${auth.username}`,
          ].join('\n'),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  'pmpt_graduate',
  'Graduate a project on pmptwiki — archives it with a Hall of Fame badge. The project can no longer be updated. Requires prior login via `pmpt login`.',
  {
    slug: z.string().describe('Project slug to graduate.'),
    note: z.string().optional().describe('Graduation note (e.g., "Reached 1000 users!").'),
  },
  async ({ slug, note }) => {
    try {
      const auth = loadAuth();
      if (!auth) {
        return { content: [{ type: 'text' as const, text: 'Not logged in. Run `pmpt login` in the terminal first.' }], isError: true };
      }

      const result = await graduateProject(auth.token, slug, note);

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Project "${slug}" has graduated! 🎓`,
            '',
            `Graduated at: ${result.graduatedAt}`,
            `Hall of Fame: https://pmptwiki.com/hall-of-fame`,
            '',
            'The project is now archived. No further updates are allowed.',
          ].join('\n'),
        }],
      };
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
