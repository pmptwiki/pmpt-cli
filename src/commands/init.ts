import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized } from '../lib/config.js';
import { isGitRepo, getGitInfo, formatGitInfo } from '../lib/git.js';
import { cmdPlan } from './plan.js';

interface InitOptions {
  repo?: string;
  guide?: boolean;
}

export async function cmdInit(path?: string, options?: InitOptions): Promise<void> {
  p.intro('PromptWiki — Project Initialization');

  const projectPath = path ? resolve(path) : process.cwd();

  if (!existsSync(projectPath)) {
    p.outro(`Path does not exist: ${projectPath}`);
    process.exit(1);
  }

  if (isInitialized(projectPath)) {
    p.outro(`Project already initialized: ${projectPath}`);
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
    `Track AI conversation history in this folder?`,
    `  Path: ${projectPath}`,
  ];

  if (isGit && gitInfo) {
    confirmMessage.push(`  Git: ${formatGitInfo(gitInfo)}`);
    if (repoUrl) {
      confirmMessage.push(`  Repository: ${repoUrl}`);
    }
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
    p.log.info(`Tip: Connect a GitHub repo with --repo for more features!`);
    p.log.message(`   • Auto-record commit hash for each version`);
    p.log.message(`   • Create PRs directly with pmpt submit`);
    p.log.message(`   • Others can reproduce exact code states`);
    p.log.message('');

    const repoChoice = await p.select({
      message: 'Connect GitHub repository?',
      options: [
        { value: 'now', label: 'Connect now', hint: 'Enter repository URL' },
        { value: 'later', label: 'Connect later', hint: 'Re-run with pmpt init --repo <url>' },
        { value: 'skip', label: 'Skip', hint: 'Use Git tracking only' },
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

    const notes = [
      `Path: ${config.projectPath}`,
      '',
      'Folder structure:',
      '  .promptwiki/',
      '  ├── config.json     Config file',
      '  ├── pmpt/           Working folder (MD files)',
      '  └── .history/       Version history',
    ];

    if (config.repo) {
      notes.push('', `Git repository: ${config.repo}`);
    }

    if (config.trackGit) {
      notes.push(`Git tracking: Enabled`);
    }

    notes.push('', 'Get started with:');
    notes.push('  pmpt plan     # Start product planning');
    notes.push('  pmpt save     # Save current state snapshot');
    notes.push('  pmpt watch    # Auto-detect file changes');
    notes.push('  pmpt history  # View version history');

    p.note(notes.join('\n'), 'Project Info');

    // Ask to start plan mode
    const startPlan = await p.confirm({
      message: 'Start plan mode? (Recommended for first-timers!)',
      initialValue: true,
    });

    if (!p.isCancel(startPlan) && startPlan) {
      p.log.message('');
      await cmdPlan(projectPath);
    } else {
      p.outro('PromptWiki project initialized');
    }
  } catch (error) {
    s.stop('Initialization failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
