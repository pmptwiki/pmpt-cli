#!/usr/bin/env node

// Node.js version check (must run before any imports that use modern syntax)
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(
    `\n  pmpt requires Node.js 18 or higher.\n` +
    `  Current version: ${process.version}\n\n` +
    `  Update Node.js: https://nodejs.org\n`
  );
  process.exit(1);
}

// Global error handlers — show friendly message instead of stack trace
process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${msg}\n`);
  console.error(`  If this keeps happening, please report at:`);
  console.error(`  https://github.com/pmptwiki/pmpt-cli/issues\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`\n  Error: ${msg}\n`);
  console.error(`  If this keeps happening, please report at:`);
  console.error(`  https://github.com/pmptwiki/pmpt-cli/issues\n`);
  process.exit(1);
});

import { Command } from 'commander';
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
import { cmdUpdate } from './commands/update.js';
import { cmdEdit } from './commands/edit.js';
import { cmdUnpublish } from './commands/unpublish.js';
import { cmdClone } from './commands/clone.js';
import { cmdExplore } from './commands/browse.js';
import { cmdRecover } from './commands/recover.js';
import { cmdDiff } from './commands/diff.js';
import { cmdInternalSeed } from './commands/internal-seed.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('pmpt')
  .description('pmpt — Record and share your AI-driven product development journey')
  .version(version, '-v, --version')
  .addHelpText('after', `
Examples:
  $ pmpt init                    Initialize project
  $ pmpt plan                    Start product planning (5 questions → AI prompt)
  $ pmpt save                    Save snapshot of docs folder
  $ pmpt watch                   Auto-detect file changes
  $ pmpt history                 View version history
  $ pmpt diff v1 v2              Compare two versions
  $ pmpt diff v3                 Compare v3 to working copy
  $ pmpt squash v2 v5            Merge versions v2-v5 into v2
  $ pmpt export                  Export as .pmpt file (single JSON)
  $ pmpt import <file.pmpt>      Import from .pmpt file
  $ pmpt login                   Authenticate with pmptwiki
  $ pmpt publish                 Publish project to pmptwiki
  $ pmpt update                  Quick re-publish (content only)
  $ pmpt clone <slug>            Clone a project from pmptwiki
  $ pmpt explore                  Explore projects on pmptwiki.com
  $ pmpt recover                 Recover damaged pmpt.md via AI

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
  .command('diff <v1> [v2] [path]')
  .description('Compare two versions (or version vs working copy)')
  .option('-f, --file <name>', 'Compare specific file only')
  .action(cmdDiff);

program
  .command('squash <from> <to> [path]')
  .description('Squash multiple versions into one (e.g., pmpt squash v2 v5)')
  .action(cmdSquash);

program
  .command('export [path]')
  .description('Export project history as a shareable .pmpt file')
  .option('-o, --output <file>', 'Output file path')
  .action(cmdExport);

program
  .command('import <file>')
  .description('Import project from .pmpt file')
  .option('-f, --force', 'Overwrite existing project')
  .action(cmdImport);

program
  .command('plan [path]')
  .description('Quick product planning with 5 questions — auto-generate AI prompt')
  .option('--reset', 'Restart plan from scratch')
  .option('--answers-file <file>', 'Load plan answers from JSON file (non-interactive)')
  .action(cmdPlan);

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
  .option('--non-interactive', 'Run without interactive prompts')
  .option('--meta-file <file>', 'JSON file with slug, description, tags, category')
  .option('--slug <slug>', 'Project slug')
  .option('--description <text>', 'Project description')
  .option('--tags <csv>', 'Comma-separated tags')
  .option('--category <id>', 'Project category')
  .option('--product-url <url>', 'Product link URL')
  .option('--product-url-type <type>', 'Product link type: git or url')
  .option('--yes', 'Skip confirmation prompt')
  .action(cmdPublish);

program
  .command('update [path]')
  .description('Quick re-publish: update content without changing metadata')
  .action(cmdUpdate);

program
  .command('edit')
  .description('Edit published project metadata (description, tags, category)')
  .action(cmdEdit);

program
  .command('unpublish')
  .description('Remove a published project from pmptwiki')
  .action(cmdUnpublish);

program
  .command('clone <slug>')
  .description('Clone a project from pmptwiki platform')
  .action(cmdClone);

program
  .command('explore')
  .description('Open pmptwiki.com to explore and search projects')
  .action(cmdExplore);

program
  .command('recover [path]')
  .description('Generate a recovery prompt to regenerate pmpt.md via AI')
  .action(cmdRecover);

// Internal automation command (hidden from help)
program
  .command('internal-seed', { hidden: true })
  .requiredOption('--spec <file>', 'Seed spec JSON file')
  .action(cmdInternalSeed);

program.parse();
