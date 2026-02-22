import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { initializeProject, isInitialized } from '../lib/config.js';
import { isGitRepo, getGitInfo, formatGitInfo } from '../lib/git.js';
import { cmdPlan } from './plan.js';

interface InitOptions {
  repo?: string;
  guide?: boolean;
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

  // Git 저장소인데 repoUrl이 없으면 추천 안내
  if (isGit && !repoUrl) {
    p.log.info(`💡 Tip: --repo 옵션으로 GitHub 저장소를 연결하면 더 강력합니다!`);
    p.log.message(`   • 버전별 commit hash가 자동 기록됩니다`);
    p.log.message(`   • 나중에 pmpt submit으로 PR을 바로 생성할 수 있습니다`);
    p.log.message(`   • 다른 사람이 정확한 코드 시점을 재현할 수 있습니다`);
    p.log.message('');

    const repoChoice = await p.select({
      message: 'GitHub 저장소를 연결하시겠습니까?',
      options: [
        { value: 'now', label: '지금 연결', hint: '저장소 URL 입력' },
        { value: 'later', label: '나중에 연결', hint: 'pmpt init --repo <url> 로 재실행' },
        { value: 'skip', label: '연결 안 함', hint: 'Git 추적만 사용' },
      ],
    });

    if (p.isCancel(repoChoice)) {
      p.cancel('취소되었습니다');
      process.exit(0);
    }

    if (repoChoice === 'now') {
      const inputRepo = await p.text({
        message: 'GitHub 저장소 URL을 입력하세요',
        placeholder: 'https://github.com/username/repo',
        validate: (value) => {
          if (!value) return '저장소 URL을 입력하세요';
          if (!value.includes('github.com')) return 'GitHub URL을 입력하세요';
          return undefined;
        },
      });

      if (!p.isCancel(inputRepo) && inputRepo) {
        repoUrl = inputRepo;
      }
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
    notes.push('  pmpt plan     # 제품 개발 플랜 모드 시작');
    notes.push('  pmpt watch    # 파일 변경 자동 추적 시작');
    notes.push('  pmpt status   # 추적 중인 파일 확인');
    notes.push('  pmpt history  # 버전 히스토리 보기');

    p.note(notes.join('\n'), '프로젝트 정보');

    // 플랜 모드 시작 여부 확인
    const startPlan = await p.confirm({
      message: '플랜 모드를 시작하시겠습니까? (처음이라면 추천!)',
      initialValue: true,
    });

    if (!p.isCancel(startPlan) && startPlan) {
      p.log.message('');
      await cmdPlan(projectPath);
    } else {
      p.outro('PromptWiki 프로젝트가 초기화되었습니다');
    }
  } catch (error) {
    s.stop('초기화 실패');
    p.log.error((error as Error).message);
    process.exit(1);
  }
}
