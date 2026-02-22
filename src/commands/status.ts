import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized, loadConfig } from '../lib/config.js';
import { getTrackedFiles } from '../lib/history.js';

export function cmdStatus(path?: string): void {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('프로젝트가 초기화되지 않았습니다. `promptwiki init`을 먼저 실행하세요.');
    process.exit(1);
  }

  const config = loadConfig(projectPath);
  const tracked = getTrackedFiles(projectPath);

  p.intro('PromptWiki — 프로젝트 상태');

  p.note(
    [
      `경로: ${projectPath}`,
      `생성일: ${new Date(config!.createdAt).toLocaleString('ko-KR')}`,
      config!.lastPublished
        ? `마지막 발행: ${new Date(config!.lastPublished).toLocaleString('ko-KR')}`
        : '',
      '',
      `추적 중인 파일: ${tracked.length}개`,
      ...tracked.map((f) => `  - ${f}`),
    ]
      .filter(Boolean)
      .join('\n'),
    '프로젝트 정보'
  );

  p.outro('');
}
