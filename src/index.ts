#!/usr/bin/env node
import { Command } from 'commander';
import { cmdNew } from './commands/new.js';
import { cmdValidate } from './commands/validate.js';
import { cmdSubmit } from './commands/submit.js';
import { cmdInit } from './commands/init.js';
import { cmdStatus } from './commands/status.js';
import { cmdHistory } from './commands/hist.js';
import { cmdWatch } from './commands/watch.js';

const program = new Command();

program
  .name('promptwiki')
  .description('PromptWiki — AI 대화 히스토리 추적 & 기여 도구')
  .version('0.1.0');

// Project tracking commands
program
  .command('init [path]')
  .description('프로젝트 폴더를 초기화하고 히스토리 추적을 시작합니다')
  .action(cmdInit);

program
  .command('watch [path]')
  .description('파일 변경을 실시간으로 감지하고 자동으로 버전을 저장합니다')
  .action(cmdWatch);

program
  .command('status [path]')
  .description('프로젝트 상태와 추적 중인 파일을 확인합니다')
  .action(cmdStatus);

program
  .command('history [path]')
  .description('저장된 버전 히스토리를 확인합니다')
  .action(cmdHistory);

// Contribution commands
program
  .command('new')
  .description('새 문서를 대화형으로 생성합니다')
  .action(cmdNew);

program
  .command('validate <file>')
  .description('문서의 frontmatter와 내용을 검증합니다')
  .action((file: string) => {
    const ok = cmdValidate(file);
    if (!ok) process.exit(1);
  });

program
  .command('submit <file>')
  .description('문서를 Fork → 브랜치 → PR로 제출합니다')
  .action(cmdSubmit);

program
  .command('logout')
  .description('저장된 GitHub 인증 정보를 삭제합니다')
  .action(async () => {
    const { clearAuth } = await import('./lib/auth.js');
    clearAuth();
    console.log('로그아웃 완료');
  });

program.parse();
