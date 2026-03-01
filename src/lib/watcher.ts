import chokidar from 'chokidar';
import { loadConfig, getDocsDir } from './config.js';
import { createFullSnapshot, type SnapshotEntry } from './history.js';
import { readFileSync } from 'fs';
import { join, relative } from 'path';

export function startWatching(
  projectPath: string,
  onSnapshot?: (version: number, files: string[], git?: SnapshotEntry['git'], note?: string) => void
): chokidar.FSWatcher {
  const config = loadConfig(projectPath);
  if (!config) {
    throw new Error('Project not initialized. Run `pmpt init` first.');
  }

  const docsDir = getDocsDir(projectPath);

  // Watch all MD files in docs folder
  const watcher = chokidar.watch(join(docsDir, '**/*.md'), {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const fileContents = new Map<string, string>();
  const pendingChanges = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const saveSnapshot = () => {
    // Build auto-note from changed file names
    const changedNames = [...pendingChanges].map(p => relative(docsDir, p));
    const note = changedNames.length > 0
      ? `Updated ${changedNames.join(', ')}`
      : undefined;
    pendingChanges.clear();

    const entry = createFullSnapshot(projectPath, { note });
    if (onSnapshot) {
      onSnapshot(entry.version, entry.files, entry.git, note);
    }
  };

  // Debounced snapshot save (1 second)
  const debouncedSave = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(saveSnapshot, 1000);
  };

  watcher.on('add', (path: string) => {
    try {
      const content = readFileSync(path, 'utf-8');
      fileContents.set(path, content);
      pendingChanges.add(path);
      debouncedSave();
    } catch {
      // Ignore file read errors
    }
  });

  watcher.on('change', (path: string) => {
    try {
      const newContent = readFileSync(path, 'utf-8');
      const oldContent = fileContents.get(path);

      // Only snapshot if content actually changed
      if (oldContent !== newContent) {
        fileContents.set(path, newContent);
        pendingChanges.add(path);
        debouncedSave();
      }
    } catch {
      // Ignore file read errors
    }
  });

  return watcher;
}
