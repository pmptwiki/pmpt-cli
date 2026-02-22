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

  // pmpt 폴더의 모든 MD 파일 감시
  const watcher = chokidar.watch('**/*.md', {
    cwd: pmptDir,
    ignoreInitial: true,
    persistent: true,
    // 짧은 시간 내 여러 변경을 하나로 묶기
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

  // 디바운스된 스냅샷 저장
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
      // 파일 읽기 실패 무시
    }
  });

  watcher.on('change', (path: string) => {
    const fullPath = `${pmptDir}/${path}`;
    try {
      const newContent = readFileSync(fullPath, 'utf-8');
      const oldContent = fileContents.get(path);

      // 내용이 실제로 변경된 경우에만 스냅샷
      if (oldContent !== newContent) {
        fileContents.set(path, newContent);
        debouncedSave();
      }
    } catch {
      // 파일 읽기 실패 무시
    }
  });

  return watcher;
}
