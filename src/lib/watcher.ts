import chokidar from 'chokidar';
import { loadConfig } from './config.js';
import { createSnapshot } from './history.js';
import { readFileSync } from 'fs';

export function startWatching(projectPath: string, onSnapshot?: (file: string, version: number) => void): chokidar.FSWatcher {
  const config = loadConfig(projectPath);
  if (!config) {
    throw new Error('Project not initialized. Run `promptwiki init` first.');
  }

  const watcher = chokidar.watch(config.watchPatterns, {
    cwd: projectPath,
    ignored: config.ignorePatterns,
    ignoreInitial: true,
    persistent: true,
  });

  const fileContents = new Map<string, string>();

  watcher.on('add', (path) => {
    const fullPath = `${projectPath}/${path}`;
    const content = readFileSync(fullPath, 'utf-8');
    fileContents.set(path, content);

    const entry = createSnapshot(projectPath, fullPath);
    if (onSnapshot) onSnapshot(path, entry.version);
  });

  watcher.on('change', (path) => {
    const fullPath = `${projectPath}/${path}`;
    const newContent = readFileSync(fullPath, 'utf-8');
    const oldContent = fileContents.get(path);

    // Only create snapshot if content actually changed
    if (oldContent !== newContent) {
      fileContents.set(path, newContent);
      const entry = createSnapshot(projectPath, fullPath);
      if (onSnapshot) onSnapshot(path, entry.version);
    }
  });

  return watcher;
}
