import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized } from '../lib/config.js';
import { getAllHistory } from '../lib/history.js';

export function cmdHistory(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('프로젝트가 초기화되지 않았습니다. `promptwiki init`을 먼저 실행하세요.');
    process.exit(1);
  }

  const history = getAllHistory(projectPath);

  if (history.length === 0) {
    p.outro('아직 저장된 히스토리가 없습니다.');
    return;
  }

  p.intro(`PromptWiki — 버전 히스토리 (총 ${history.length}개)`);

  // Group by file
  const byFile = new Map<string, typeof history>();
  for (const entry of history) {
    const existing = byFile.get(entry.filePath) || [];
    existing.push(entry);
    byFile.set(entry.filePath, existing);
  }

  for (const [file, entries] of byFile) {
    p.note(
      entries
        .map(
          (e) =>
            `  v${e.version} — ${new Date(e.timestamp).toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}`
        )
        .join('\n'),
      file
    );
  }

  p.outro('');
}
