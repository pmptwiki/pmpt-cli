import * as p from '@clack/prompts';
import { join, dirname, resolve, relative, sep } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { isInitialized, getConfigDir, getHistoryDir, getDocsDir, initializeProject } from '../lib/config.js';
import { validatePmptFile, isSafeFilename, type PmptFile } from '../lib/pmptFile.js';
import { fetchPmptFile, trackClone } from '../lib/api.js';

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
      if (!isSafeFilename(filename)) continue; // skip unsafe filenames
      const filePath = join(snapshotDir, filename);
      // Double-check resolved path stays within snapshot dir
      if (!resolve(filePath).startsWith(resolve(snapshotDir) + sep)) continue;
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
    if (!isSafeFilename(filename)) continue; // skip unsafe filenames
    const filePath = join(docsDir, filename);
    if (!resolve(filePath).startsWith(resolve(docsDir) + sep)) continue;
    const fileDir = dirname(filePath);
    if (fileDir !== docsDir) {
      mkdirSync(fileDir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
  }
}

export async function cmdClone(slug: string): Promise<void> {
  if (!slug) {
    p.log.error('Please provide a slug.');
    p.log.info('Usage: pmpt clone <slug>');
    process.exit(1);
  }

  p.intro(`pmpt clone — ${slug}`);

  const s = p.spinner();
  s.start('Downloading project...');

  let fileContent: string;
  try {
    fileContent = await fetchPmptFile(slug);
  } catch (err) {
    s.stop('Download failed');
    p.log.error(err instanceof Error ? err.message : 'Project not found.');
    process.exit(1);
  }

  s.message('Validating...');
  const validation = validatePmptFile(fileContent);
  if (!validation.success || !validation.data) {
    s.stop('Validation failed');
    p.log.error(validation.error || 'Invalid .pmpt file.');
    process.exit(1);
  }

  const pmptData = validation.data;
  s.stop('Download complete');

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
      message: 'Project already initialized. Merge history?',
      initialValue: true,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  const importSpinner = p.spinner();
  importSpinner.start('Restoring project...');

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

  // Prepend clone context to pmpt.md (AI-facing, top of file)
  const pmptMdPath = join(docsDir, 'pmpt.md');
  if (existsSync(pmptMdPath)) {
    const original = readFileSync(pmptMdPath, 'utf-8');
    const author = pmptData.meta.author || 'unknown';
    const projectName = pmptData.meta.projectName;
    const versionCount = pmptData.history.length;

    // Detect primary language (Korean if ≥ 20% Korean characters)
    const koreanChars = (original.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
    const totalChars = original.replace(/\s/g, '').length || 1;
    const isKorean = koreanChars / totalChars > 0.2;

    const versionGuide = pmptData.history.map((v) => {
      const summary = v.summary || Object.keys(v.files).join(', ');
      return `- v${v.version}: ${summary}`;
    }).join('\n');

    const cloneContext = isKorean ? [
      `# ⚠️ 클론된 프로젝트 — 새로 시작하는 프로젝트입니다`,
      '',
      `이 문서는 **@${author}**의 프로젝트 **"${projectName}"**에서 클론되었습니다.`,
      `아래 내용은 원본 저자의 프롬프트이며, **참고용**입니다. 그대로 실행하지 마세요.`,
      '',
      `## 이 프로젝트의 맥락`,
      '',
      `- 이것은 새로운 프로젝트입니다. 원본을 참고하되, 독립적인 제품을 만들어야 합니다.`,
      `- 아래 원본 프롬프트에 체크박스(✅/☑️)가 있다면, 그것은 **원본 저자의 진행 상황**입니다. 이 프로젝트에서는 모두 미완료 상태입니다.`,
      `- 원본은 ${versionCount}개 버전에 걸쳐 점진적으로 발전했습니다:`,
      versionGuide,
      '',
      `## AI에게 요청사항`,
      '',
      `1. 아래 원본 프롬프트를 읽고, 프로젝트의 구조와 접근 방식을 이해하세요.`,
      `2. 원본의 버전 히스토리(v1→v${versionCount})를 참고하여, 비슷한 단계별 진화 패턴으로 구현하세요.`,
      `3. v1처럼 핵심 기능부터 시작하고, 점진적으로 기능을 추가하세요.`,
      `4. 이 프로젝트만의 새로운 pmpt.md를 작성해주세요. 원본 내용을 그대로 복사하지 마세요.`,
      '',
      '---',
      '',
    ].join('\n') : [
      `# ⚠️ Cloned Project — This is a fresh start`,
      '',
      `This document was cloned from **@${author}**'s project **"${projectName}"**.`,
      `The content below is the original author's prompt — it is for **reference only**. Do not execute it as-is.`,
      '',
      `## Context for this project`,
      '',
      `- This is a new project. Use the original as inspiration, but build an independent product.`,
      `- If the original prompt below contains checkboxes (✅/☑️), those reflect the **original author's progress**, not this project's. Everything here starts from scratch.`,
      `- The original evolved over ${versionCount} versions:`,
      versionGuide,
      '',
      `## Instructions for AI`,
      '',
      `1. Read the original prompt below to understand the project's structure and approach.`,
      `2. Reference the version history (v1→v${versionCount}) to follow a similar step-by-step evolution pattern.`,
      `3. Start with core features (like v1) and incrementally add functionality.`,
      `4. Write a new pmpt.md for this project. Do not copy the original content verbatim.`,
      '',
      '---',
      '',
    ].join('\n');

    writeFileSync(pmptMdPath, cloneContext + original, 'utf-8');
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

  importSpinner.stop('Restore complete!');

  // Track clone event (fire-and-forget)
  trackClone(slug);

  p.note(
    [
      `Project: ${pmptData.meta.projectName}`,
      `Versions: ${versionCount}`,
      `Location: ${pmptDir}`,
    ].join('\n'),
    'Clone Summary'
  );

  p.log.info('Next steps:');
  p.log.message('  pmpt history    — view version history');
  p.log.message('  pmpt plan       — view AI prompt');
  p.log.message('  pmpt save       — save a new snapshot');

  p.outro('Project cloned!');
}
