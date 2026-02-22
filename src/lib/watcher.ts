import chokidar from 'chokidar';
import { loadConfig, getPmptDir } from './config.js';
import { createFullSnapshot, type SnapshotEntry } from './history.js';
import { readFileSync } from 'fs';

export function startWatching(
  projectPath: string,
  onSnapshot?: (version: number, files: string[], git?: SnapshotEntry['git']) => void
): chokidar.FSWatcher {
  const config = loadConfig(projectPath);
  if (!config) {
    throw new Error('Project not initialized. Run `pmpt init` first.');
  }

  const pmptDir = getPmptDir(projectPath);

  // Watch all MD files in pmpt folder
  const watcher = chokidar.watch('**/*.md', {
    cwd: pmptDir,
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
    const fullPath = `${pmptDir}/${path}`;
    try {
      const content = readFileSync(fullPath, 'utf-8');
      fileContents.set(path, content);
      debouncedSave();
    } catch {
      // Ignore file read errors
    }
  });

  watcher.on('change', (path: string) => {
    const fullPath = `${pmptDir}/${path}`;
    try {
      const newContent = readFileSync(fullPath, 'utf-8');
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
