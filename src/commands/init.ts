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
  let selectedDocsPath: string | undefined;

  if (existingFolders.length > 0) {
    p.log.info('Found existing folders that might contain your AI prompts/docs:');
    for (const folder of existingFolders) {
      p.log.message(`  • ${folder}/`);
    }
    p.log.message('');

    const folderOptions = [
      ...existingFolders.map(folder => ({
        value: folder,
        label: `Use ${folder}/`,
        hint: 'Track existing files',
      })),
      {
        value: '__new__',
        label: 'Create new folder',
        hint: '.pmpt/docs/ (default)',
      },
      {
        value: '__custom__',
        label: 'Enter custom path',
        hint: 'Specify your own folder',
      },
    ];

    const folderChoice = await p.select({
      message: 'Which folder should pmpt track?',
      options: folderOptions,
    });

    if (p.isCancel(folderChoice)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    if (folderChoice === '__custom__') {
      const customPath = await p.text({
        message: 'Enter the folder path to track',
        placeholder: 'e.g., my-prompts, specs/ai',
        validate: (value) => {
          if (!value) return 'Please enter a folder path';
          return undefined;
        },
      });

      if (p.isCancel(customPath)) {
        p.cancel('Cancelled');
        process.exit(0);
      }

      selectedDocsPath = customPath as string;
    } else if (folderChoice !== '__new__') {
      selectedDocsPath = folderChoice as string;
    }
    // If __new__, selectedDocsPath remains undefined (will use default)
  }

  // Build confirmation message
  const confirmMessage = [
    `Initialize pmpt in this folder?`,
    `  Path: ${projectPath}`,
  ];

  if (selectedDocsPath) {
    confirmMessage.push(`  Docs: ${selectedDocsPath}/`);
  } else {
    confirmMessage.push(`  Docs: .pmpt/docs/ (new)`);
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
      docsPath: selectedDocsPath,
    });
    s.stop('Initialized');

    // Build folder structure display
    const docsDisplay = selectedDocsPath || '.pmpt/docs';
    const isExternalDocs = selectedDocsPath && !selectedDocsPath.startsWith('.pmpt');

    const notes = [
      `Path: ${config.projectPath}`,
      '',
      'Folder structure:',
    ];

    if (isExternalDocs) {
      notes.push(`  ${docsDisplay}/         ← Your docs (tracked)`);
      notes.push(`  .pmpt/`);
      notes.push(`  ├── config.json     Config`);
      notes.push(`  └── .history/       Snapshots`);
    } else {
      notes.push(`  .pmpt/`);
      notes.push(`  ├── config.json     Config`);
      notes.push(`  ├── docs/           Your docs`);
      notes.push(`  └── .history/       Snapshots`);
    }

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
