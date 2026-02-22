import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized } from '../lib/config.js';

export async function cmdInit(path?: string): Promise<void> {
  p.intro('PromptWiki — 프로젝트 초기화');

  const projectPath = path ? resolve(path) : process.cwd();

  if (!existsSync(projectPath)) {
    p.outro(`경로가 존재하지 않습니다: ${projectPath}`);
    process.exit(1);
  }

  if (isInitialized(projectPath)) {
    p.outro(`이미 초기화된 프로젝트입니다: ${projectPath}`);
    process.exit(0);
  }

  const confirm = await p.confirm({
    message: `이 폴더에서 AI 대화 히스토리를 추적하시겠습니까?\n  ${projectPath}`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소되었습니다');
    process.exit(0);
  }

  const s = p.spinner();
  s.start('프로젝트 초기화 중...');

  try {
    const config = initializeProject(projectPath);
    s.stop('초기화 완료');

    p.note(
      [
        `경로: ${config.projectPath}`,
        `추적 패턴: ${config.watchPatterns.join(', ')}`,
        `무시 패턴: ${config.ignorePatterns.join(', ')}`,
        '',
        '다음 명령어로 시작하세요:',
        '  promptwiki watch    # 파일 변경 자동 추적 시작',
        '  promptwiki status   # 추적 중인 파일 확인',
        '  promptwiki history  # 버전 히스토리 보기',
      ].join('\n'),
      '프로젝트 정보'
    );

    p.outro('PromptWiki 프로젝트가 초기화되었습니다');
  } catch (error) {
    s.stop('초기화 실패');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
