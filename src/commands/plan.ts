import * as p from '@clack/prompts';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { isInitialized } from '../lib/config.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { cmdWatch } from './watch.js';
import {
  PLAN_QUESTIONS,
  getPlanProgress,
  initPlanProgress,
  savePlanProgress,
  savePlanDocuments,
} from '../lib/plan.js';

interface PlanOptions {
  reset?: boolean;
  answersFile?: string;
}

function loadAnswersFromFile(projectPath: string, inputPath: string): Record<string, string> {
  const filePath = resolve(projectPath, inputPath);
  if (!existsSync(filePath)) {
    throw new Error(`Answers file not found: ${filePath}`);
  }

  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const requiredKeys = ['projectName', 'productIdea', 'coreFeatures'] as const;
  for (const key of requiredKeys) {
    if (!raw[key] || String(raw[key]).trim().length === 0) {
      throw new Error(`Missing required field in answers file: ${key}`);
    }
  }

  return {
    projectName: String(raw.projectName ?? '').trim(),
    productIdea: String(raw.productIdea ?? '').trim(),
    additionalContext: String(raw.additionalContext ?? '').trim(),
    coreFeatures: String(raw.coreFeatures ?? '').trim(),
    techStack: String(raw.techStack ?? '').trim(),
  };
}

export async function cmdPlan(path?: string, options?: PlanOptions): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  // Check initialization
  if (!isInitialized(projectPath)) {
    p.intro('pmpt plan');
    p.log.error('Project not initialized.');
    p.log.info('Run `pmpt init` first to initialize the project.');
    p.outro('');
    process.exit(1);
  }

  // Reset option
  if (options?.reset) {
    if (options.answersFile) {
      initPlanProgress(projectPath);
    } else {
      const confirm = await p.confirm({
        message: 'Restart plan from scratch?',
        initialValue: false,
      });
      if (p.isCancel(confirm) || !confirm) {
        p.cancel('Cancelled');
        process.exit(0);
      }
      initPlanProgress(projectPath);
    }
  }

  // Check progress
  let progress = getPlanProgress(projectPath);

  // If already completed
  if (progress?.completed && !options?.answersFile) {
    p.intro('pmpt plan');
    p.log.success('Plan already completed.');

    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'copy', label: 'Copy AI prompt to clipboard', hint: 'Ready for Ctrl+V' },
        { value: 'view', label: 'View AI prompt', hint: 'Display in terminal' },
        { value: 'restart', label: 'Restart plan', hint: 'Start fresh' },
        { value: 'watch', label: 'Start file watching', hint: 'pmpt watch' },
        { value: 'exit', label: 'Exit' },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      p.outro('See you next time!');
      process.exit(0);
    }

    if (action === 'copy' || action === 'view') {
      const { getPmptDir } = await import('../lib/config.js');
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      const pmptDir = getPmptDir(projectPath);
      // Prefer pmpt.ai.md, fall back to pmpt.md for older projects
      let promptPath = join(pmptDir, 'pmpt.ai.md');
      if (!existsSync(promptPath)) {
        promptPath = join(pmptDir, 'pmpt.md');
      }

      try {
        if (existsSync(promptPath)) {
          const content = readFileSync(promptPath, 'utf-8');

          if (action === 'copy') {
            const copied = copyToClipboard(content);
            if (copied) {
              p.log.success('AI prompt copied to clipboard!');
              p.log.message('');

              // Eye-catching next step banner
              const banner = [
                '',
                '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
                '┃                                                        ┃',
                '┃   📋  NEXT STEP                                        ┃',
                '┃                                                        ┃',
                '┃   Open your AI coding tool and press:           ┃',
                '┃                                                        ┃',
                '┃              ⌘ + V  (Mac)                              ┃',
                '┃             Ctrl + V (Windows/Linux)                   ┃',
                '┃                                                        ┃',
                '┃   Your product journey starts now! 🚀                  ┃',
                '┃                                                        ┃',
                '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
                '',
              ];
              console.log(banner.join('\n'));
            } else {
              p.log.warn('Could not copy to clipboard. Showing content instead:');
              p.log.message('');
              console.log(content);
            }
          } else {
            p.log.message('');
            p.log.info('=== AI Prompt ===');
            p.log.message('');
            console.log(content);
          }
          p.log.message('');
          p.log.info(`File: ${promptPath}`);
        } else {
          p.log.error('AI prompt file not found.');
        }
      } catch {
        p.log.error('Failed to read AI prompt file.');
      }

      p.outro('');
      process.exit(0);
    }

    if (action === 'restart') {
      initPlanProgress(projectPath);
      progress = getPlanProgress(projectPath);
    }

    if (action === 'watch') {
      await cmdWatch(projectPath);
      return;
    }
  }

  // Starting fresh
  if (!progress) {
    progress = initPlanProgress(projectPath);
  }

  // Non-interactive mode for agents/automation
  if (options?.answersFile) {
    p.log.info('Plan: non-interactive mode');
    let answers: Record<string, string>;
    try {
      answers = loadAnswersFromFile(projectPath, options.answersFile);
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : 'Invalid answers file.');
      p.outro('');
      process.exit(1);
    }

    const s = p.spinner();
    s.start('Generating documents from answers file...');
    const { planPath, promptPath } = savePlanDocuments(projectPath, answers);
    progress.completed = true;
    progress.answers = answers;
    savePlanProgress(projectPath, progress);
    s.stop('Done!');

    const pmptMdPath = promptPath.replace('pmpt.ai.md', 'pmpt.md');
    p.note(
      [
        `plan.md: ${planPath}`,
        `pmpt.md: ${pmptMdPath}`,
        `pmpt.ai.md: ${promptPath}`,
      ].join('\n'),
      'Generated'
    );
    return;
  }

  p.intro('pmpt plan — Your Product Journey Starts Here!');
  p.log.info(`Answer ${PLAN_QUESTIONS.length} quick questions to generate your AI prompt.`);
  p.log.message('You can answer in any language you prefer.');
  p.log.message('');

  const answers: Record<string, string> = {};

  // Ask questions
  for (let i = 0; i < PLAN_QUESTIONS.length; i++) {
    const question = PLAN_QUESTIONS[i];
    const questionNum = `[${i + 1}/${PLAN_QUESTIONS.length}]`;

    const answer = await p.text({
      message: `${questionNum} ${question.question}`,
      placeholder: question.placeholder,
      validate: question.required
        ? (value) => (!value ? 'This field is required' : undefined)
        : undefined,
    });

    if (p.isCancel(answer)) {
      p.cancel('Continue later with `pmpt plan`');
      process.exit(0);
    }

    answers[question.key] = answer as string;
  }

  // Generate documents
  const s = p.spinner();
  s.start('Generating your AI prompt...');

  const { planPath, promptPath } = savePlanDocuments(projectPath, answers);

  // Update progress
  progress.completed = true;
  progress.answers = answers;
  savePlanProgress(projectPath, progress);

  s.stop('Done!');

  // Show document explanation
  p.log.message('');
  p.log.success('Two documents have been created:');
  p.log.message('');

  const pmptMdPath = promptPath.replace('pmpt.ai.md', 'pmpt.md');
  const docExplanation = [
    `1. plan.md — Your product overview`,
    `   • Features checklist to track progress`,
    `   • Reference for you`,
    `   Location: ${planPath}`,
    '',
    `2. pmpt.md — Your project document`,
    `   • Track progress, decisions, and milestones`,
    `   • Human-readable — write in any language`,
    `   Location: ${pmptMdPath}`,
    '',
    `3. pmpt.ai.md — AI prompt (THE IMPORTANT ONE!)`,
    `   • Copy this to Claude Code / Codex / Cursor`,
    `   • AI will help you build step by step`,
    `   • Always in English for best AI performance`,
    `   Location: ${promptPath}`,
  ];

  p.note(docExplanation.join('\n'), 'What are these files?');

  // Copy to clipboard
  const content = readFileSync(promptPath, 'utf-8');
  const copied = copyToClipboard(content);

  if (copied) {
    p.log.message('');
    p.log.success('AI prompt copied to clipboard!');
    p.log.message('');

    // Eye-catching next step banner
    const banner = [
      '',
      '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
      '┃                                                        ┃',
      '┃   📋  NEXT STEP                                        ┃',
      '┃                                                        ┃',
      '┃   Open your AI coding tool and press:           ┃',
      '┃                                                        ┃',
      '┃              ⌘ + V  (Mac)                              ┃',
      '┃             Ctrl + V (Windows/Linux)                   ┃',
      '┃                                                        ┃',
      '┃   Your product journey starts now! 🚀                  ┃',
      '┃                                                        ┃',
      '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
      '',
    ];
    console.log(banner.join('\n'));
  } else {
    // Fallback: show prompt
    p.log.message('');
    p.log.info('=== AI Prompt (copy this to AI) ===');
    p.log.message('');
    console.log(content);
    p.log.message('');
  }

  // Ask about watch mode
  const startWatch = await p.confirm({
    message: 'Start file watching? (auto-save versions as you work)',
    initialValue: false,
  });

  if (!p.isCancel(startWatch) && startWatch) {
    p.log.message('');
    await cmdWatch(projectPath);
  } else {
    p.log.message('');
    p.log.info('Tips:');
    p.log.message('  pmpt save     — Save a snapshot anytime');
    p.log.message('  pmpt watch    — Auto-save on file changes');
    p.log.message('  pmpt history  — View version history');
    p.outro('Good luck with your build!');
  }
}
