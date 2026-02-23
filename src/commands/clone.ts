import * as p from '@clack/prompts';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { isInitialized, getConfigDir, getHistoryDir, getDocsDir, initializeProject } from '../lib/config.js';
import { validatePmptFile, type PmptFile } from '../lib/pmptFile.js';
import { fetchPmptFile } from '../lib/api.js';

/**
 * Restore history from .pmpt data (shared with import command)
 */
export function restoreHistory(historyDir: string, history: PmptFile['history']): void {
  mkdirSync(historyDir, { recursive: true });

  for (const version of history) {
    const timestamp = version.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const snapshotName = `v${version.version}-${timestamp}`;
    const snapshotDir = join(historyDir, snapshotName);

    mkdirSync(snapshotDir, { recursive: true });

    for (const [filename, content] of Object.entries(version.files)) {
      const filePath = join(snapshotDir, filename);
      const fileDir = dirname(filePath);
      if (fileDir !== snapshotDir) {
        mkdirSync(fileDir, { recursive: true });
      }
      writeFileSync(filePath, content, 'utf-8');
    }

    writeFileSync(
      join(snapshotDir, '.meta.json'),
      JSON.stringify({
        version: version.version,
        timestamp: version.timestamp,
        files: Object.keys(version.files),
        git: version.git,
      }, null, 2),
      'utf-8'
    );
  }
}

/**
 * Restore docs from .pmpt data (shared with import command)
 */
export function restoreDocs(docsDir: string, docs: Record<string, string>): void {
  mkdirSync(docsDir, { recursive: true });

  for (const [filename, content] of Object.entries(docs)) {
    const filePath = join(docsDir, filename);
    const fileDir = dirname(filePath);
    if (fileDir !== docsDir) {
      mkdirSync(fileDir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
  }
}

export async function cmdClone(slug: string): Promise<void> {
  if (!slug) {
    p.log.error('slug를 입력하세요.');
    p.log.info('사용법: pmpt clone <slug>');
    process.exit(1);
  }

  p.intro(`pmpt clone — ${slug}`);

  const s = p.spinner();
  s.start('프로젝트 다운로드 중...');

  let fileContent: string;
  try {
    fileContent = await fetchPmptFile(slug);
  } catch (err) {
    s.stop('다운로드 실패');
    p.log.error(err instanceof Error ? err.message : '프로젝트를 찾을 수 없습니다.');
    process.exit(1);
  }

  s.message('검증 중...');
  const validation = validatePmptFile(fileContent);
  if (!validation.success || !validation.data) {
    s.stop('검증 실패');
    p.log.error(validation.error || '잘못된 .pmpt 파일입니다.');
    process.exit(1);
  }

  const pmptData = validation.data;
  s.stop('다운로드 완료');

  // Show summary
  p.note(
    [
      `Project: ${pmptData.meta.projectName}`,
      `Versions: ${pmptData.history.length}`,
      pmptData.meta.author ? `Author: @${pmptData.meta.author}` : '',
      pmptData.meta.description ? `Description: ${pmptData.meta.description.slice(0, 80)}` : '',
    ].filter(Boolean).join('\n'),
    'Project Info'
  );

  const projectPath = process.cwd();

  if (isInitialized(projectPath)) {
    const overwrite = await p.confirm({
      message: '이미 초기화된 프로젝트입니다. 히스토리를 병합하시겠습니까?',
      initialValue: true,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('취소됨');
      process.exit(0);
    }
  }

  const importSpinner = p.spinner();
  importSpinner.start('프로젝트 복원 중...');

  if (!isInitialized(projectPath)) {
    initializeProject(projectPath, { trackGit: true });
  }

  const pmptDir = getConfigDir(projectPath);
  const historyDir = getHistoryDir(projectPath);
  const docsDir = getDocsDir(projectPath);

  restoreHistory(historyDir, pmptData.history);

  if (pmptData.docs) {
    restoreDocs(docsDir, pmptData.docs);
  }

  if (pmptData.plan) {
    writeFileSync(
      join(pmptDir, 'plan-progress.json'),
      JSON.stringify({
        completed: true,
        startedAt: pmptData.meta.createdAt,
        updatedAt: pmptData.meta.exportedAt,
        answers: pmptData.plan,
      }, null, 2),
      'utf-8'
    );
  }

  let versionCount = 0;
  if (existsSync(historyDir)) {
    versionCount = readdirSync(historyDir).filter((d) => d.startsWith('v')).length;
  }

  importSpinner.stop('복원 완료!');

  p.note(
    [
      `Project: ${pmptData.meta.projectName}`,
      `Versions: ${versionCount}`,
      `Location: ${pmptDir}`,
    ].join('\n'),
    'Clone Summary'
  );

  p.log.info('다음 단계:');
  p.log.message('  pmpt history    — 버전 히스토리 보기');
  p.log.message('  pmpt plan       — AI 프롬프트 보기');
  p.log.message('  pmpt save       — 새 스냅샷 저장');

  p.outro('프로젝트가 복제되었습니다!');
}
