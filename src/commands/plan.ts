import * as p from '@clack/prompts';
import { resolve } from 'path';
import { isInitialized } from '../lib/config.js';
import { cmdWatch } from './watch.js';
import {
  PHASES,
  getPlanProgress,
  initPlanProgress,
  savePlanProgress,
  savePhaseDocument,
  getCompletionSummary,
  type PlanPhase,
  type PlanProgress,
} from '../lib/plan.js';

interface PlanOptions {
  phase?: string;
  reset?: boolean;
}

export async function cmdPlan(path?: string, options?: PlanOptions): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  // 초기화 확인
  if (!isInitialized(projectPath)) {
    p.intro('PromptWiki Plan');
    p.log.error('프로젝트가 초기화되지 않았습니다.');
    p.log.info('먼저 `pmpt init` 명령어로 프로젝트를 초기화하세요.');
    p.outro('');
    process.exit(1);
  }

  // 리셋 옵션
  if (options?.reset) {
    const confirm = await p.confirm({
      message: '플랜 진행 상태를 초기화하시겠습니까? (기존 문서는 유지됩니다)',
      initialValue: false,
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('취소되었습니다');
      process.exit(0);
    }
    initPlanProgress(projectPath);
    p.log.success('플랜 진행 상태가 초기화되었습니다.');
  }

  // 진행 상태 로드 또는 생성
  let progress = getPlanProgress(projectPath);
  if (!progress) {
    progress = initPlanProgress(projectPath);
  }

  // 특정 phase로 점프
  if (options?.phase) {
    const phaseNum = parseInt(options.phase, 10);
    if (phaseNum >= 1 && phaseNum <= PHASES.length) {
      progress.currentPhase = phaseNum;
      savePlanProgress(projectPath, progress);
    } else {
      p.log.error(`유효하지 않은 phase 번호입니다. (1-${PHASES.length})`);
      process.exit(1);
    }
  }

  p.intro('PromptWiki Plan — 제품 개발 플랜 모드');

  // 진행 상황 표시
  p.log.info(getCompletionSummary(progress));
  p.log.message('');

  // 메뉴 표시
  const menuOptions = [
    { value: 'continue', label: '계속하기', hint: `Phase ${progress.currentPhase}: ${PHASES[progress.currentPhase - 1].name}` },
    { value: 'select', label: 'Phase 선택', hint: '특정 단계로 이동' },
    { value: 'status', label: '진행 현황', hint: '완료된 단계 확인' },
    { value: 'exit', label: '나가기' },
  ];

  const action = await p.select({
    message: '무엇을 하시겠습니까?',
    options: menuOptions,
  });

  if (p.isCancel(action) || action === 'exit') {
    p.outro('다음에 또 만나요!');
    process.exit(0);
  }

  if (action === 'status') {
    showStatus(progress);
    p.outro('');
    process.exit(0);
  }

  if (action === 'select') {
    const phaseOptions = PHASES.map((phase) => ({
      value: phase.id,
      label: `Phase ${phase.id}: ${phase.name}`,
      hint: progress.completedPhases.includes(phase.id) ? '완료됨' : undefined,
    }));

    const selectedPhase = await p.select({
      message: '이동할 Phase를 선택하세요',
      options: phaseOptions,
    });

    if (p.isCancel(selectedPhase)) {
      p.cancel('취소되었습니다');
      process.exit(0);
    }

    progress.currentPhase = selectedPhase as number;
    savePlanProgress(projectPath, progress);
  }

  // Phase 실행
  await runPhase(projectPath, progress, PHASES[progress.currentPhase - 1]);
}

function showStatus(progress: PlanProgress): void {
  p.log.message('');
  p.log.info('=== 진행 현황 ===');
  p.log.message('');

  for (const phase of PHASES) {
    const isCompleted = progress.completedPhases.includes(phase.id);
    const isCurrent = progress.currentPhase === phase.id;
    const icon = isCompleted ? '✅' : isCurrent ? '👉' : '⬜';
    const status = isCompleted ? '(완료)' : isCurrent ? '(현재)' : '';

    p.log.message(`${icon} Phase ${phase.id}: ${phase.name} ${status}`);
  }

  p.log.message('');
  p.log.info(getCompletionSummary(progress));
}

async function runPhase(projectPath: string, progress: PlanProgress, phase: PlanPhase): Promise<void> {
  p.log.message('');
  p.log.step(`Phase ${phase.id}: ${phase.name}`);
  p.log.info(phase.description);
  p.log.message('');

  const answers: Record<string, string> = {};

  // 질문 진행
  for (const question of phase.questions) {
    if (question.multiline) {
      // 멀티라인은 일반 텍스트로 처리 (여러 줄 힌트 제공)
      const answer = await p.text({
        message: question.question,
        placeholder: question.placeholder || '(여러 줄은 줄바꿈으로 구분)',
        validate: question.required
          ? (value) => (!value ? '필수 항목입니다' : undefined)
          : undefined,
      });

      if (p.isCancel(answer)) {
        // 진행 상태 저장 후 종료
        savePlanProgress(projectPath, progress);
        p.cancel('나중에 계속할 수 있습니다');
        process.exit(0);
      }

      answers[question.key] = answer as string;
    } else {
      const answer = await p.text({
        message: question.question,
        placeholder: question.placeholder,
        validate: question.required
          ? (value) => (!value ? '필수 항목입니다' : undefined)
          : undefined,
      });

      if (p.isCancel(answer)) {
        savePlanProgress(projectPath, progress);
        p.cancel('나중에 계속할 수 있습니다');
        process.exit(0);
      }

      answers[question.key] = answer as string;
    }
  }

  // Phase 1에서 프로젝트 이름 저장
  if (phase.id === 1 && answers.projectName) {
    progress.projectName = answers.projectName;
  }

  // 문서 저장
  const s = p.spinner();
  s.start('문서 생성 중...');

  const filePath = savePhaseDocument(projectPath, phase, answers);

  s.stop('문서 생성 완료');

  // 진행 상태 업데이트
  if (!progress.completedPhases.includes(phase.id)) {
    progress.completedPhases.push(phase.id);
  }

  // 다음 phase로 이동
  if (phase.id < PHASES.length) {
    progress.currentPhase = phase.id + 1;
  }

  savePlanProgress(projectPath, progress);

  // 결과 표시
  p.log.success(`문서가 저장되었습니다: ${filePath}`);
  p.log.message('');
  p.log.info(getCompletionSummary(progress));

  // 다음 단계 안내
  if (phase.id < PHASES.length) {
    const nextPhase = PHASES[phase.id];
    p.log.message('');

    const continueNext = await p.confirm({
      message: `다음 단계로 진행하시겠습니까? (Phase ${nextPhase.id}: ${nextPhase.name})`,
      initialValue: true,
    });

    if (p.isCancel(continueNext)) {
      p.outro('다음에 `pmpt plan`으로 계속하세요!');
      process.exit(0);
    }

    if (continueNext) {
      await runPhase(projectPath, progress, nextPhase);
    } else {
      p.outro('다음에 `pmpt plan`으로 계속하세요!');
    }
  } else {
    // 모든 phase 완료
    p.log.message('');
    p.log.success('🎉 모든 단계를 완료했습니다!');
    p.log.message('');
    p.log.info('이제 AI와 함께 각 문서를 발전시켜 나가세요.');

    const startWatch = await p.confirm({
      message: '파일 변경 추적을 시작할까요? (pmpt watch)',
      initialValue: true,
    });

    if (!p.isCancel(startWatch) && startWatch) {
      p.log.message('');
      await cmdWatch(projectPath);
    } else {
      p.log.info('나중에 `pmpt watch`로 추적을 시작할 수 있습니다.');
      p.outro('행운을 빕니다!');
    }
  }
}
