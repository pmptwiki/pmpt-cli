import * as p from '@clack/prompts';
import { join, basename } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { isInitialized, getDocsDir, getPmptDir } from '../lib/config.js';
import { getPlanProgress } from '../lib/plan.js';
import { copyToClipboard } from '../lib/clipboard.js';

export async function cmdRemix(): Promise<void> {
  const projectPath = process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('Project not initialized. Run `pmpt init` or `pmpt clone <slug>` first.');
    process.exit(1);
  }

  p.intro('pmpt remix');

  const docsDir = getDocsDir(projectPath);
  const aiMdPath = join(docsDir, 'pmpt.ai.md');
  const planPath = join(getPmptDir(projectPath), 'plan-progress.json');

  // Read original project info
  const originalAiMd = existsSync(aiMdPath) ? readFileSync(aiMdPath, 'utf-8') : '';
  const planProgress = getPlanProgress(projectPath);
  const originalName = planProgress?.answers?.projectName || basename(projectPath);
  const originalIdea = planProgress?.answers?.productIdea || '';
  const originalTech = planProgress?.answers?.techStack || '';

  p.note(
    [
      `Original: ${originalName}`,
      originalIdea ? `Idea: ${originalIdea.slice(0, 100)}${originalIdea.length > 100 ? '...' : ''}` : '',
      originalTech ? `Tech: ${originalTech}` : '',
    ].filter(Boolean).join('\n'),
    'Remixing From'
  );

  // Ask remix questions
  const newName = await p.text({
    message: 'New project name?',
    placeholder: `my-${basename(projectPath)}-variant`,
    validate: (v) => {
      if (!v.trim()) return 'Project name is required.';
    },
  });
  if (p.isCancel(newName)) { p.cancel('Cancelled'); process.exit(0); }

  const twist = await p.text({
    message: 'What\'s different about your version? (your key differentiation)',
    placeholder: 'e.g., Web-based version, Korean market focus, B2B instead of B2C',
    validate: (v) => {
      if (!v.trim()) return 'Please describe your differentiation.';
    },
  });
  if (p.isCancel(twist)) { p.cancel('Cancelled'); process.exit(0); }

  const targetAudience = await p.text({
    message: 'Target audience or context? (optional)',
    placeholder: 'e.g., Small business owners, Students, Enterprise teams',
  });
  if (p.isCancel(targetAudience)) { p.cancel('Cancelled'); process.exit(0); }

  const techOverride = await p.text({
    message: 'Tech stack? (leave blank to keep original)',
    placeholder: originalTech || 'e.g., Next.js, Supabase, Vercel',
  });
  if (p.isCancel(techOverride)) { p.cancel('Cancelled'); process.exit(0); }

  const techStack = (typeof techOverride === 'string' && techOverride.trim())
    ? techOverride.trim()
    : originalTech;

  // Generate remixed pmpt.ai.md
  const contextSection = (typeof targetAudience === 'string' && targetAudience.trim())
    ? `\n## Target Audience\n${targetAudience.trim()}\n`
    : '';

  const techSection = techStack
    ? `\n## Tech Stack\n${techStack}\n`
    : '';

  const remixedPrompt = `<!-- This file is for AI tools only. Do not edit manually. -->
<!-- Paste this into Claude Code, Codex, Cursor, or any AI coding tool. -->

# ${(newName as string).trim()} — Remix

## My Version
${(twist as string).trim()}
${contextSection}${techSection}
---

## Instructions for AI

This is a **remix** of an existing project. Before building anything, do the following:

**Step 1 — Understand & Clarify (do this first)**

Read my "My Version" section above and the original project below carefully, then ask me clarifying questions. Specifically, identify:
- Anything in my differentiation that is ambiguous or unclear
- Information that would be needed to build my version but is not provided
- Assumptions you would have to make — ask instead of assuming
- Any conflict between my twist and the original that needs resolution

Ask all your questions in a single message. Wait for my answers before proceeding.

**Step 2 — Build**

After I answer your questions, build MY version based on the differentiation and my answers.
- Same core concept as the original, but with my differentiation applied throughout
- Do NOT copy content verbatim. Adapt everything to fit my context
- Start with core features first, then iterate

### Documentation Rule

When you make progress, update \`.pmpt/docs/pmpt.md\`:
- When architecture or tech decisions are finalized
- When a feature is implemented (mark as done)
- When a development phase is completed

Keep the Snapshot Log up to date. **Always save proactively after milestones — do not wait for the user to ask.**

Try the pmpt MCP tool first:
- Claude Code: call \`mcp__pmpt__pmpt_save\` with a descriptive \`summary\`
- Other MCP clients: call \`pmpt_save\` with a descriptive \`summary\`

If no MCP tool is available, run \`pmpt save\` in terminal.

---

## Original Project Reference

${originalAiMd}
`;

  writeFileSync(aiMdPath, remixedPrompt, 'utf-8');

  // Update pmpt.md project name if exists
  const pmptMdPath = join(docsDir, 'pmpt.md');
  if (existsSync(pmptMdPath)) {
    let content = readFileSync(pmptMdPath, 'utf-8');
    // Replace first heading
    content = content.replace(/^# .+$/m, `# ${(newName as string).trim()}`);
    writeFileSync(pmptMdPath, content, 'utf-8');
  }

  // Update plan-progress.json
  if (existsSync(planPath)) {
    try {
      const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
      plan.answers = {
        ...plan.answers,
        projectName: (newName as string).trim(),
        productIdea: `${originalIdea}\n\nMy differentiation: ${(twist as string).trim()}`,
        techStack,
      };
      writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }

  // Copy to clipboard
  const copied = copyToClipboard(remixedPrompt);

  p.log.success(`Remix prompt generated for "${(newName as string).trim()}"`);
  p.log.message('');
  p.log.info('Next steps:');
  p.log.message('  1. Paste the prompt into your AI tool');
  p.log.message('  2. Build your version');
  p.log.message('  3. pmpt save — save your progress');
  p.log.message('  4. pmpt publish — share your remix');
  p.log.message('');

  if (copied) {
    const banner = [
      '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
      '┃                                                        ┃',
      '┃   📋  NEXT STEP                                        ┃',
      '┃                                                        ┃',
      '┃   Remix prompt copied to clipboard!                    ┃',
      '┃   Open your AI coding tool and paste it:               ┃',
      '┃                                                        ┃',
      '┃              ⌘ + V  (Mac)                              ┃',
      '┃             Ctrl + V (Windows/Linux)                   ┃',
      '┃                                                        ┃',
      '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
      '',
    ];
    console.log(banner.join('\n'));
  } else {
    p.log.warn('Could not copy to clipboard.');
    p.log.info(`Read it at: ${aiMdPath}`);
  }

  p.outro('Ready to remix!');
}
