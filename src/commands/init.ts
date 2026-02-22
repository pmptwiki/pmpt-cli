import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized, detectExistingFolders } from '../lib/config.js';
import { isGitRepo, getGitInfo, formatGitInfo } from '../lib/git.js';
import { cmdPlan } from './plan.js';

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

  // Detect existing AI tool folders
  const existingFolders = detectExistingFolders(projectPath);
  let additionalWatchPaths: string[] = [];

  if (existingFolders.length > 0) {
    p.log.info('Found existing AI/docs folders:');
    for (const folder of existingFolders) {
      p.log.message(`  • ${folder}/`);
    }
    p.log.message('');

    const trackChoice = await p.confirm({
      message: 'Track these folders alongside .pmpt/docs?',
      initialValue: true,
    });

    if (p.isCancel(trackChoice)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    if (trackChoice) {
      // Multi-select for folders to track
      const folderOptions = existingFolders.map(folder => ({
        value: folder,
        label: folder,
      }));

      const selectedFolders = await p.multiselect({
        message: 'Select folders to track (space to toggle, enter to confirm)',
        options: folderOptions,
        initialValues: existingFolders, // All selected by default
      });

      if (p.isCancel(selectedFolders)) {
        p.cancel('Cancelled');
        process.exit(0);
      }

      additionalWatchPaths = selectedFolders as string[];
    }
  }

  // Build confirmation message
  const confirmMessage = [
    `Initialize pmpt in this folder?`,
    `  Path: ${projectPath}`,
    `  Docs: .pmpt/docs/ (pmpt-generated files)`,
  ];

  if (additionalWatchPaths.length > 0) {
    confirmMessage.push(`  Also tracking: ${additionalWatchPaths.join(', ')}`);
  }

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
      additionalWatchPaths,
    });
    s.stop('Initialized');

    // Build folder structure display
    const notes = [
      `Path: ${config.projectPath}`,
      '',
      'Folder structure:',
    ];

    if (additionalWatchPaths.length > 0) {
      for (const folder of additionalWatchPaths) {
        notes.push(`  ${folder}/           ← Tracked (read-only)`);
      }
    }

    notes.push(`  .pmpt/`);
    notes.push(`  ├── config.json     Config`);
    notes.push(`  ├── docs/           Your docs (pmpt writes here)`);
    notes.push(`  └── .history/       Snapshots`);

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

    // Ask to start plan mode
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
  } catch (error) {
    s.stop('Initialization failed');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
