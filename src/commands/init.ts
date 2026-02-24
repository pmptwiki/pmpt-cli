import * as p from '@clack/prompts';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized } from '../lib/config.js';
import { isGitRepo, getGitInfo, formatGitInfo } from '../lib/git.js';
import { cmdPlan } from './plan.js';
import { scanProject, scanResultToAnswers } from '../lib/scanner.js';
import { savePlanDocuments, initPlanProgress, savePlanProgress } from '../lib/plan.js';
import { copyToClipboard } from '../lib/clipboard.js';

interface InitOptions {
  repo?: string;
  guide?: boolean;
}

export async function cmdInit(path?: string, options?: InitOptions): Promise<void> {
  p.intro('pmpt init');

  const projectPath = path ? resolve(path) : process.cwd();

  if (!existsSync(projectPath)) {
    p.outro(`Path does not exist: ${projectPath}`);
    process.exit(1);
  }

  if (isInitialized(projectPath)) {
    p.log.warn('Project already initialized.');
    p.log.message('');
    p.log.info('Available commands:');
    p.log.message('  pmpt plan      — Generate or view AI prompt');
    p.log.message('  pmpt save      — Save a snapshot');
    p.log.message('  pmpt watch     — Auto-save on file changes');
    p.log.message('  pmpt history   — View version history');
    p.log.message('');
    p.log.message('To reinitialize, remove .pmpt/ and run `pmpt init` again.');
    p.outro('');
    process.exit(0);
  }

  // Detect Git repository
  const isGit = isGitRepo(projectPath);
  let repoUrl = options?.repo;
  let gitInfo = null;

  if (isGit) {
    gitInfo = getGitInfo(projectPath, repoUrl);
    if (gitInfo?.repo && !repoUrl) {
      repoUrl = gitInfo.repo;
    }
  }

  // Build confirmation message
  const confirmMessage = [
    `Initialize pmpt in this folder?`,
    `  Path: ${projectPath}`,
    `  Docs: .pmpt/docs/`,
  ];

  if (isGit && gitInfo) {
    confirmMessage.push(`  Git: ${formatGitInfo(gitInfo)}`);
  }

  const confirm = await p.confirm({
    message: confirmMessage.join('\n'),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  // If Git repo but no repoUrl, suggest connecting
  if (isGit && !repoUrl) {
    const repoChoice = await p.select({
      message: 'Connect GitHub repository? (optional)',
      options: [
        { value: 'skip', label: 'Skip for now', hint: 'Recommended' },
        { value: 'now', label: 'Connect now', hint: 'Enter repository URL' },
      ],
    });

    if (p.isCancel(repoChoice)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    if (repoChoice === 'now') {
      const inputRepo = await p.text({
        message: 'Enter GitHub repository URL',
        placeholder: 'https://github.com/username/repo',
        validate: (value) => {
          if (!value) return 'Please enter repository URL';
          if (!value.includes('github.com')) return 'Please enter a GitHub URL';
          return undefined;
        },
      });

      if (!p.isCancel(inputRepo) && inputRepo) {
        repoUrl = inputRepo;
      }
    }
  }

  const s = p.spinner();
  s.start('Initializing project...');

  try {
    const config = initializeProject(projectPath, {
      repo: repoUrl,
      trackGit: isGit,
    });
    s.stop('Initialized');

    // Build folder structure display
    const notes = [
      `Path: ${config.projectPath}`,
      '',
      'Folder structure:',
      `  .pmpt/`,
      `  ├── config.json     Config`,
      `  ├── docs/           Your docs`,
      `  └── .history/       Snapshots`,
    ];

    if (config.repo) {
      notes.push('', `Repository: ${config.repo}`);
    }

    if (config.trackGit) {
      notes.push(`Git tracking: Enabled`);
    }

    notes.push('', 'Commands:');
    notes.push('  pmpt plan     # Generate AI prompt');
    notes.push('  pmpt save     # Save snapshot');
    notes.push('  pmpt watch    # Auto-save on changes');
    notes.push('  pmpt history  # View versions');

    p.note(notes.join('\n'), 'Project Info');

    // Scan for existing project
    const scanResult = scanProject(projectPath);

    if (scanResult.isExistingProject) {
      // Show scan summary
      const scanNotes: string[] = [];
      if (scanResult.packageInfo) {
        scanNotes.push(`Package: ${scanResult.packageInfo.name}`);
        if (scanResult.packageInfo.description) {
          scanNotes.push(`Description: ${scanResult.packageInfo.description}`);
        }
        scanNotes.push(`Dependencies: ${scanResult.packageInfo.dependencies.length} production, ${scanResult.packageInfo.devDependencies.length} dev`);
      }
      if (scanResult.detectedFramework) {
        scanNotes.push(`Framework: ${scanResult.detectedFramework}`);
      }
      if (scanResult.directoryStructure.length > 0) {
        scanNotes.push(`Structure: ${scanResult.directoryStructure.map((d) => d + '/').join(', ')}`);
      }
      if (scanResult.gitSummary) {
        const gs = scanResult.gitSummary;
        let gitLine = `Git: ${gs.totalCommits} commits`;
        if (gs.firstCommitDate) {
          gitLine += ` since ${gs.firstCommitDate.split('T')[0]}`;
        }
        gitLine += `, ${gs.contributors} contributor(s)`;
        scanNotes.push(gitLine);
      }

      p.note(scanNotes.join('\n'), 'Existing Project Detected');

      const scanChoice = await p.select({
        message: 'Auto-generate plan from detected project files?',
        options: [
          { value: 'auto', label: 'Auto-generate plan', hint: 'Recommended — instant AI prompt from project analysis' },
          { value: 'manual', label: 'Manual planning', hint: '5 questions interactive flow' },
          { value: 'skip', label: 'Skip for now' },
        ],
      });

      if (p.isCancel(scanChoice)) {
        p.cancel('Cancelled');
        process.exit(0);
      }

      if (scanChoice === 'auto') {
        // Ask for project description
        const defaultDesc = scanResult.readmeDescription
          || scanResult.packageInfo?.description
          || '';

        const userDesc = await p.text({
          message: 'Briefly describe what this project does:',
          defaultValue: defaultDesc || undefined,
          placeholder: defaultDesc || 'e.g., A web app for sharing AI project histories',
        });

        if (p.isCancel(userDesc)) {
          p.cancel('Cancelled');
          process.exit(0);
        }

        const s2 = p.spinner();
        s2.start('Scanning project and generating plan...');

        const answers = scanResultToAnswers(scanResult, userDesc as string);
        const { planPath, promptPath } = savePlanDocuments(projectPath, answers);

        const progress = initPlanProgress(projectPath);
        progress.completed = true;
        progress.answers = answers;
        savePlanProgress(projectPath, progress);

        s2.stop('Plan generated!');

        p.log.message('');
        p.log.success('Two documents have been created:');
        p.log.message('');

        const docExplanation = [
          `1. plan.md — Your product overview`,
          `   Location: ${planPath}`,
          '',
          `2. pmpt.md — AI prompt (THE IMPORTANT ONE!)`,
          `   Copy this to Claude/ChatGPT/Codex`,
          `   Location: ${promptPath}`,
        ];
        p.note(docExplanation.join('\n'), 'Auto-generated from project scan');

        // Copy to clipboard
        const content = readFileSync(promptPath, 'utf-8');
        const copied = copyToClipboard(content);

        if (copied) {
          p.log.message('');
          p.log.success('AI prompt copied to clipboard!');
          p.log.message('');

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
            '┃   Your project context is ready! 🚀                    ┃',
            '┃                                                        ┃',
            '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
            '',
          ];
          console.log(banner.join('\n'));
        } else {
          p.log.warn('Could not copy to clipboard.');
          p.log.info(`Read it at: ${promptPath}`);
        }

        p.log.info('Tips:');
        p.log.message('  pmpt plan     — View or edit your AI prompt');
        p.log.message('  pmpt save     — Save a snapshot anytime');
        p.log.message('  pmpt watch    — Auto-save on file changes');
        p.outro('Ready to go!');
      } else if (scanChoice === 'manual') {
        p.log.message('');
        await cmdPlan(projectPath);
      } else {
        p.outro('Ready! Run `pmpt plan` when you want to start.');
      }
    } else {
      // New/empty project — original flow
      const startPlan = await p.confirm({
        message: 'Start planning? (Generate AI prompt with 5 quick questions)',
        initialValue: true,
      });

      if (!p.isCancel(startPlan) && startPlan) {
        p.log.message('');
        await cmdPlan(projectPath);
      } else {
        p.outro('Ready! Run `pmpt plan` when you want to start.');
      }
    }
  } catch (error) {
    s.stop('Initialization failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
