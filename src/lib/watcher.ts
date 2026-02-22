import chokidar from 'chokidar';
import { loadConfig, getWatchPaths } from './config.js';
import { createFullSnapshot, type SnapshotEntry } from './history.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export function startWatching(
  projectPath: string,
  onSnapshot?: (version: number, files: string[], git?: SnapshotEntry['git']) => void
): chokidar.FSWatcher {
  const config = loadConfig(projectPath);
  if (!config) {
    throw new Error('Project not initialized. Run `pmpt init` first.');
  }

  const watchPaths = getWatchPaths(projectPath);

  // Build watch patterns for all paths
  const watchPatterns = watchPaths.map(p => join(p, '**/*.md'));

  // Watch all MD files in all watch paths
  const watcher = chokidar.watch(watchPatterns, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const fileContents = new Map<string, string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const saveSnapshot = () => {
    const entry = createFullSnapshot(projectPath);
    if (onSnapshot) {
      onSnapshot(entry.version, entry.files, entry.git);
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
        debouncedSave();
      }
    } catch {
      // Ignore file read errors
    }
  });

  return watcher;
}
