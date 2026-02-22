import * as p from '@clack/prompts';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { isInitialized } from '../lib/config.js';
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
}

export async function cmdPlan(path?: string, options?: PlanOptions): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  // Check initialization
  if (!isInitialized(projectPath)) {
    p.intro('PromptWiki Plan');
    p.log.error('Project not initialized.');
    p.log.info('Run `pmpt init` first to initialize the project.');
    p.outro('');
    process.exit(1);
  }

  // Reset option
  if (options?.reset) {
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

  // Check progress
  let progress = getPlanProgress(projectPath);

  // If already completed
  if (progress?.completed) {
    p.intro('PromptWiki Plan');
    p.log.success('Plan already completed.');

    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'view', label: 'View AI prompt', hint: 'Copy and paste to AI' },
        { value: 'restart', label: 'Restart plan', hint: 'Start fresh' },
        { value: 'watch', label: 'Start file watching', hint: 'pmpt watch' },
        { value: 'exit', label: 'Exit' },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      p.outro('See you next time!');
      process.exit(0);
    }

    if (action === 'view') {
      // Read pmpt.md from pmpt folder
      const { getPmptDir } = await import('../lib/config.js');
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      const pmptDir = getPmptDir(projectPath);
      const promptPath = join(pmptDir, 'pmpt.md');

      try {
        if (existsSync(promptPath)) {
          const content = readFileSync(promptPath, 'utf-8');

          p.log.message('');
          p.log.info('=== AI Prompt (copy the content below) ===');
          p.log.message('');
          console.log(content);
          p.log.message('');
          p.log.info(`File location: ${promptPath}`);
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

  p.intro('PromptWiki Plan — Quick Product Planning');
  p.log.info('Answer 6 questions to generate an AI-ready prompt.');
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
  s.start('Generating documents...');

  const { planPath, promptPath } = savePlanDocuments(projectPath, answers);

  // Update progress
  progress.completed = true;
  progress.answers = answers;
  savePlanProgress(projectPath, progress);

  s.stop('Done!');

  // Show results
  p.log.message('');
  p.log.success('Plan completed!');
  p.log.message('');
  p.log.info(`Plan document: ${planPath}`);
  p.log.info(`AI prompt: ${promptPath}`);
  p.log.message('');

  // Preview AI prompt
  const showPrompt = await p.confirm({
    message: 'View AI prompt now?',
    initialValue: true,
  });

  if (!p.isCancel(showPrompt) && showPrompt) {
    const content = readFileSync(promptPath, 'utf-8');
    p.log.message('');
    p.log.info('=== AI Prompt (copy the content below) ===');
    p.log.message('');
    console.log(content);
    p.log.message('');
  }

  // Next steps
  p.log.message('');
  p.log.step('Next steps:');
  p.log.message('1. Copy the AI prompt above and paste to Claude/ChatGPT');
  p.log.message('2. Build your product with AI');
  p.log.message('3. Save snapshots with pmpt save (or pmpt watch for auto-save)');
  p.log.message('');

  const startWatch = await p.confirm({
    message: 'Start file watching? (pmpt watch)',
    initialValue: false,
  });

  if (!p.isCancel(startWatch) && startWatch) {
    p.log.message('');
    await cmdWatch(projectPath);
  } else {
    p.log.info('Start watching later with `pmpt watch`');
    p.outro('Good luck!');
  }
}
