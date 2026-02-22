import * as p from '@clack/prompts';
import { resolve, join, basename } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { isInitialized, getConfigDir, getHistoryDir, getDocsDir, initializeProject } from '../lib/config.js';

interface ImportOptions {
  force?: boolean;
}

/**
 * Extract zip file
 * Uses native unzip command on macOS/Linux, PowerShell on Windows
 */
function extractZip(zipPath: string, destDir: string): boolean {
  try {
    const platform = process.platform;
    mkdirSync(destDir, { recursive: true });

    if (platform === 'win32') {
      // PowerShell Expand-Archive
      execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
        stdio: 'pipe',
      });
    } else {
      // Unix unzip command
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
        stdio: 'pipe',
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function cmdImport(zipFile: string, options?: ImportOptions): Promise<void> {
  if (!zipFile) {
    p.log.error('Please provide a zip file path.');
    p.log.info('Usage: pmpt import <file.zip>');
    process.exit(1);
  }

  const zipPath = resolve(zipFile);

  if (!existsSync(zipPath)) {
    p.log.error(`File not found: ${zipPath}`);
    process.exit(1);
  }

  if (!zipPath.endsWith('.zip')) {
    p.log.error('Please provide a .zip file.');
    process.exit(1);
  }

  p.intro('pmpt import');

  const projectPath = process.cwd();

  // Check if already initialized
  if (isInitialized(projectPath) && !options?.force) {
    const overwrite = await p.confirm({
      message: 'Project already initialized. Merge imported history?',
      initialValue: true,
    });

    if (p.isCancel(overwrite)) {
      p.cancel('Import cancelled.');
      process.exit(0);
    }

    if (!overwrite) {
      p.log.info('Use --force to overwrite existing project.');
      p.outro('');
      return;
    }
  }

  const s = p.spinner();
  s.start('Extracting archive...');

  // Create temp directory for extraction
  const tempDir = join(projectPath, '.pmpt-import-temp');
  rmSync(tempDir, { recursive: true, force: true });

  const extracted = extractZip(zipPath, tempDir);

  if (!extracted) {
    rmSync(tempDir, { recursive: true, force: true });
    s.stop('Extraction failed');
    p.log.error('Failed to extract zip file.');
    p.log.info('Make sure `unzip` command is available on your system.');
    process.exit(1);
  }

  s.message('Importing project...');

  // Read imported data
  let importedPlan: any = null;
  let importedConfig: any = null;
  let projectName = 'imported-project';

  // Read plan.json if exists
  const planPath = join(tempDir, 'plan.json');
  if (existsSync(planPath)) {
    try {
      importedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));
      if (importedPlan.answers?.projectName) {
        projectName = importedPlan.answers.projectName;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Read config.json if exists
  const configPath = join(tempDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      importedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  // Initialize project if not exists
  if (!isInitialized(projectPath)) {
    initializeProject(projectPath, {
      trackGit: importedConfig?.trackGit ?? true,
    });
  }

  const pmptDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  // Import history
  const importedHistoryDir = join(tempDir, 'history');
  if (existsSync(importedHistoryDir)) {
    // Copy all version folders
    cpSync(importedHistoryDir, historyDir, { recursive: true, force: true });
  }

  // Import docs
  const importedDocsDir = join(tempDir, 'docs');
  if (existsSync(importedDocsDir)) {
    cpSync(importedDocsDir, docsDir, { recursive: true, force: true });
  }

  // Import plan progress
  if (importedPlan) {
    const planProgressPath = join(pmptDir, 'plan-progress.json');
    writeFileSync(planProgressPath, JSON.stringify(importedPlan, null, 2), 'utf-8');
  }

  // Count imported versions
  let versionCount = 0;
  if (existsSync(historyDir)) {
    const { readdirSync } = await import('fs');
    versionCount = readdirSync(historyDir).filter(d => d.startsWith('v')).length;
  }

  // Cleanup temp directory
  rmSync(tempDir, { recursive: true, force: true });

  s.stop('Import complete!');

  // Summary
  const summary = [
    `Project: ${projectName}`,
    `Versions imported: ${versionCount}`,
    `Location: ${pmptDir}`,
  ];

  p.note(summary.join('\n'), 'Import Summary');

  p.log.info('Next steps:');
  p.log.message('  pmpt history    — View imported versions');
  p.log.message('  pmpt plan       — View or copy AI prompt');
  p.log.message('  pmpt save       — Save a new snapshot');

  p.outro('Ready to continue the journey!');
}
