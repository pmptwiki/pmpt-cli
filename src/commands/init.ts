import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized } from '../lib/config.js';
import { isGitRepo, getGitInfo, formatGitInfo } from '../lib/git.js';

interface InitOptions {
  repo?: string;
}

export async function cmdInit(path?: string, options?: InitOptions): Promise<void> {
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

  // Git 저장소 감지
  const isGit = isGitRepo(projectPath);
  let repoUrl = options?.repo;
  let gitInfo = null;

  if (isGit) {
    gitInfo = getGitInfo(projectPath, repoUrl);
    if (gitInfo?.repo && !repoUrl) {
      repoUrl = gitInfo.repo;
    }
  }

  // 확인 메시지 구성
  const confirmMessage = [
    `이 폴더에서 AI 대화 히스토리를 추적하시겠습니까?`,
    `  경로: ${projectPath}`,
  ];

  if (isGit && gitInfo) {
    confirmMessage.push(`  Git: ${formatGitInfo(gitInfo)}`);
    if (repoUrl) {
      confirmMessage.push(`  저장소: ${repoUrl}`);
    }
  }

  const confirm = await p.confirm({
    message: confirmMessage.join('\n'),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소되었습니다');
    process.exit(0);
  }

  // Git 저장소인데 repoUrl이 없으면 물어보기
  if (isGit && !repoUrl) {
    const inputRepo = await p.text({
      message: 'GitHub 저장소 URL을 입력하세요 (선택, Enter로 건너뛰기)',
      placeholder: 'https://github.com/username/repo',
    });

    if (!p.isCancel(inputRepo) && inputRepo) {
      repoUrl = inputRepo;
    }
  }

  const s = p.spinner();
  s.start('프로젝트 초기화 중...');

  try {
    const config = initializeProject(projectPath, {
      repo: repoUrl,
      trackGit: isGit,
    });
    s.stop('초기화 완료');

    const notes = [
      `경로: ${config.projectPath}`,
      `추적 패턴: ${config.watchPatterns.join(', ')}`,
      `무시 패턴: ${config.ignorePatterns.join(', ')}`,
    ];

    if (config.repo) {
      notes.push(`Git 저장소: ${config.repo}`);
    }

    if (config.trackGit) {
      notes.push(`Git 추적: 활성화 (각 버전에 commit hash 기록)`);
    }

    notes.push('', '다음 명령어로 시작하세요:');
    notes.push('  promptwiki watch    # 파일 변경 자동 추적 시작');
    notes.push('  promptwiki status   # 추적 중인 파일 확인');
    notes.push('  promptwiki history  # 버전 히스토리 보기');

    p.note(notes.join('\n'), '프로젝트 정보');

    p.outro('PromptWiki 프로젝트가 초기화되었습니다');
  } catch (error) {
    s.stop('초기화 실패');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
