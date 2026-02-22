import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized } from '../lib/config.js';
import { startWatching } from '../lib/watcher.js';

export function cmdWatch(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('프로젝트가 초기화되지 않았습니다. `promptwiki init`을 먼저 실행하세요.');
    process.exit(1);
  }

  p.intro('PromptWiki — 파일 감지 시작');
  p.log.info(`경로: ${projectPath}`);
  p.log.info('Markdown 파일 변경을 감지합니다...');
  p.log.info('종료하려면 Ctrl+C를 누르세요.');

  const watcher = startWatching(projectPath, (file, version, git) => {
    let msg = `${file} → v${version} 저장됨`;
    if (git) {
      msg += ` · ${git.commit}`;
      if (git.dirty) msg += ' (uncommitted changes)';
    }
    p.log.success(msg);
  });

  process.on('SIGINT', () => {
    p.log.info('\n감지 중지 중...');
    watcher.close();
    p.outro('PromptWiki 감지가 중지되었습니다');
    process.exit(0);
  });
}
