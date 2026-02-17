#!/usr/bin/env node
import { Command } from 'commander';
import { cmdNew } from './commands/new.js';
import { cmdValidate } from './commands/validate.js';
import { cmdSubmit } from './commands/submit.js';

const program = new Command();

program
  .name('promptwiki')
  .description('PromptWiki 기여 CLI 도구')
  .version('0.1.0');

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
