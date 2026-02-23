#!/usr/bin/env node
import { Command } from 'commander';
import { cmdNew } from './commands/new.js';
import { cmdValidate } from './commands/validate.js';
import { cmdSubmit } from './commands/submit.js';
import { cmdInit } from './commands/init.js';
import { cmdStatus } from './commands/status.js';
import { cmdHistory } from './commands/hist.js';
import { cmdWatch } from './commands/watch.js';
import { cmdPlan } from './commands/plan.js';
import { cmdSave } from './commands/save.js';
import { cmdSquash } from './commands/squash.js';
import { cmdExport } from './commands/export.js';
import { cmdImport } from './commands/import.js';
import { cmdLogin } from './commands/login.js';
import { cmdPublish } from './commands/publish.js';
import { cmdClone } from './commands/clone.js';
import { cmdBrowse } from './commands/browse.js';

const program = new Command();

program
  .name('pmpt')
  .description('pmpt — Record and share your AI-driven product development journey')
  .version('1.4.0')
  .addHelpText('after', `
Examples:
  $ pmpt init                    Initialize project
  $ pmpt plan                    Start product planning (5 questions → AI prompt)
  $ pmpt save                    Save snapshot of docs folder
  $ pmpt watch                   Auto-detect file changes
  $ pmpt history                 View version history
  $ pmpt squash v2 v5            Merge versions v2-v5 into v2
  $ pmpt export                  Export as .pmpt file (single JSON)
  $ pmpt import <file.pmpt>      Import from .pmpt file
  $ pmpt login                   Authenticate with pmptwiki
  $ pmpt publish                 Publish project to pmptwiki
  $ pmpt clone <slug>            Clone a project from pmptwiki
  $ pmpt browse                  Browse published projects

Documentation: https://pmptwiki.com
`);

// Project tracking commands
program
  .command('init [path]')
  .description('Initialize project folder and start history tracking')
  .option('-r, --repo <url>', 'GitHub repository URL')
  .action(cmdInit);

program
  .command('watch [path]')
  .description('Watch for file changes and auto-save versions')
  .action(cmdWatch);

program
  .command('save [path]')
  .description('Save current state of docs folder as snapshot')
  .action(cmdSave);

program
  .command('status [path]')
  .description('Check project status and tracked files')
  .action(cmdStatus);

program
  .command('history [path]')
  .description('View saved version history')
  .option('-c, --compact', 'Show compact history (hide small changes)')
  .action(cmdHistory);

program
  .command('squash <from> <to> [path]')
  .description('Squash multiple versions into one (e.g., pmpt squash v2 v5)')
  .action(cmdSquash);

program
  .command('export [path]')
  .description('Export project history as a shareable zip archive')
  .option('-o, --output <file>', 'Output file path')
  .action(cmdExport);

program
  .command('import <file>')
  .description('Import project from exported zip archive')
  .option('-f, --force', 'Overwrite existing project')
  .action(cmdImport);

program
  .command('plan [path]')
  .description('Quick product planning with 5 questions — auto-generate AI prompt')
  .option('--reset', 'Restart plan from scratch')
  .action(cmdPlan);

// Contribution commands
program
  .command('new')
  .description('Create new document interactively')
  .action(cmdNew);

program
  .command('validate <file>')
  .description('Validate document frontmatter and content')
  .action((file: string) => {
    const ok = cmdValidate(file);
    if (!ok) process.exit(1);
  });

program
  .command('submit <file>')
  .description('Submit document via Fork → Branch → PR')
  .action(cmdSubmit);

program
  .command('logout')
  .description('Clear saved GitHub authentication')
  .action(async () => {
    const { clearAuth } = await import('./lib/auth.js');
    clearAuth();
    console.log('Logged out successfully');
  });

// Platform commands
program
  .command('login')
  .description('Authenticate with pmptwiki platform')
  .action(cmdLogin);

program
  .command('publish [path]')
  .description('Publish project to pmptwiki platform')
  .action(cmdPublish);

program
  .command('clone <slug>')
  .description('Clone a project from pmptwiki platform')
  .action(cmdClone);

program
  .command('browse')
  .description('Browse and search published projects')
  .action(cmdBrowse);

program.parse();
