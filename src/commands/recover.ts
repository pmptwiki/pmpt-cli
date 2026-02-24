import * as p from '@clack/prompts';
import { resolve, basename } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { isInitialized, getDocsDir } from '../lib/config.js';
import { getAllSnapshots, resolveFileContent } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { copyToClipboard } from '../lib/clipboard.js';

export async function cmdRecover(path?: string): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` first.');
    process.exit(1);
  }

  p.intro('pmpt recover');

  const docsDir = getDocsDir(projectPath);
  const pmptMdPath = join(docsDir, 'pmpt.md');
  const planMdPath = join(docsDir, 'plan.md');

  // Check current state
  const currentExists = existsSync(pmptMdPath);
  const currentContent = currentExists ? readFileSync(pmptMdPath, 'utf-8').trim() : '';

  if (currentExists && currentContent.length > 100) {
    const proceed = await p.confirm({
      message: `pmpt.md exists (${currentContent.length} chars). Overwrite with recovered version?`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  // Gather all available context
  const context: string[] = [];

  // 1. Plan progress answers
  const planProgress = getPlanProgress(projectPath);
  if (planProgress?.answers) {
    const a = planProgress.answers;
    context.push('## Project Plan Answers');
    if (a.projectName) context.push(`- **Project Name**: ${a.projectName}`);
    if (a.productIdea) context.push(`- **Product Idea**: ${a.productIdea}`);
    if (a.coreFeatures) context.push(`- **Core Features**: ${a.coreFeatures}`);
    if (a.techStack) context.push(`- **Tech Stack**: ${a.techStack}`);
    if (a.additionalContext) context.push(`- **Additional Context**: ${a.additionalContext}`);
    context.push('');
  }

  // 2. plan.md content
  if (existsSync(planMdPath)) {
    const planMd = readFileSync(planMdPath, 'utf-8').trim();
    if (planMd) {
      context.push('## Current plan.md');
      context.push('```markdown');
      context.push(planMd);
      context.push('```');
      context.push('');
    }
  }

  // 3. Last known good pmpt.md from history
  const snapshots = getAllSnapshots(projectPath);
  let lastPmptMd: string | null = null;
  let lastPmptVersion = 0;

  if (snapshots.length > 0) {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const content = resolveFileContent(snapshots, i, 'pmpt.md');
      if (content && content.trim().length > 50) {
        lastPmptMd = content;
        lastPmptVersion = snapshots[i].version;
        break;
      }
    }
  }

  if (lastPmptMd) {
    context.push(`## Last Known pmpt.md (from v${lastPmptVersion})`);
    context.push('```markdown');
    context.push(lastPmptMd);
    context.push('```');
    context.push('');
  }

  // 4. package.json info
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      context.push('## package.json');
      const fields: string[] = [];
      if (pkg.name) fields.push(`- **name**: ${pkg.name}`);
      if (pkg.description) fields.push(`- **description**: ${pkg.description}`);
      if (pkg.dependencies) fields.push(`- **dependencies**: ${Object.keys(pkg.dependencies).join(', ')}`);
      if (pkg.devDependencies) fields.push(`- **devDependencies**: ${Object.keys(pkg.devDependencies).join(', ')}`);
      if (pkg.scripts) fields.push(`- **scripts**: ${Object.keys(pkg.scripts).join(', ')}`);
      context.push(fields.join('\n'));
      context.push('');
    } catch { /* skip */ }
  }

  // 5. Directory structure
  const dirEntries = readdirTopLevel(projectPath);
  if (dirEntries.length > 0) {
    context.push('## Project Structure');
    context.push(dirEntries.join('\n'));
    context.push('');
  }

  if (context.length === 0) {
    p.log.error('No project context found. Nothing to recover from.');
    process.exit(1);
  }

  // Show what we found
  const sources: string[] = [];
  if (planProgress?.answers) sources.push('plan answers');
  if (existsSync(planMdPath)) sources.push('plan.md');
  if (lastPmptMd) sources.push(`history v${lastPmptVersion}`);
  if (existsSync(pkgPath)) sources.push('package.json');

  p.log.info(`Found context: ${sources.join(', ')}`);

  // Build recovery prompt
  const projectName = planProgress?.answers?.projectName || basename(projectPath);

  const prompt = `# pmpt.md Recovery Request

I need you to regenerate the \`.pmpt/docs/pmpt.md\` file for my project "${projectName}".

This file is the main AI prompt document — it contains the product development context that gets pasted into AI tools (Claude Code, Codex, Cursor, etc.) to continue development.

## Available Context

${context.join('\n')}

## Instructions

Based on the context above, regenerate \`.pmpt/docs/pmpt.md\` with the following structure:

\`\`\`
# {Project Name} — Product Development Request

## What I Want to Build
{describe the product idea}

## Key Features
- {feature 1}
- {feature 2}
...

## Tech Stack Preferences
{detected or specified tech stack}

## Additional Context
{any extra context}

---

Please help me build this product based on the requirements above.

1. First, review the requirements and ask if anything is unclear.
2. Propose a technical architecture.
3. Outline the implementation steps.
4. Start coding from the first step.

I'll confirm progress at each step before moving to the next.

## Documentation Rule

**Important:** Update this document (located at \`.pmpt/docs/pmpt.md\`) at these moments:
- When architecture or tech decisions are finalized
- When a feature is implemented (mark as done)
- When a development phase is completed
- When requirements change or new decisions are made
\`\`\`

${lastPmptMd ? 'Use the "Last Known pmpt.md" as the primary reference — update it rather than starting from scratch.' : 'Generate a fresh pmpt.md based on the available context.'}

Write the content directly to \`.pmpt/docs/pmpt.md\`. After writing, run \`pmpt save\` to create a snapshot.`;

  // Copy to clipboard
  const copied = copyToClipboard(prompt);

  if (copied) {
    p.log.success('Recovery prompt copied to clipboard!');
  } else {
    p.log.warn('Could not copy to clipboard. Prompt printed below:');
    console.log('\n' + prompt + '\n');
  }

  p.note(
    [
      '1. Paste the prompt into your AI tool (Claude Code, Cursor, etc.)',
      '2. The AI will regenerate .pmpt/docs/pmpt.md',
      '3. Run `pmpt save` to snapshot the recovered file',
    ].join('\n'),
    'Next Steps'
  );

  p.outro('');
}

function readdirTopLevel(projectPath: string): string[] {
  const ignore = new Set([
    'node_modules', '.git', '.pmpt', 'dist', 'build', '.next',
    '.nuxt', '.astro', '.vercel', '.cache', 'coverage', '.turbo',
  ]);

  try {
    const entries = readdirSync(projectPath, { encoding: 'utf-8' });
    return entries
      .filter(e => !ignore.has(e) && !e.startsWith('.'))
      .slice(0, 30)
      .map(e => {
        try {
          const stat = statSync(join(projectPath, e));
          return stat.isDirectory() ? `${e}/` : e;
        } catch {
          return e;
        }
      });
  } catch {
    return [];
  }
}
