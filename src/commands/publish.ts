import * as p from '@clack/prompts';
import { resolve, basename } from 'path';
import { readFileSync, existsSync } from 'fs';
import { isInitialized, loadConfig, saveConfig, getDocsDir } from '../lib/config.js';
import { getAllSnapshots } from '../lib/history.js';
import { getPlanProgress } from '../lib/plan.js';
import { createPmptFile, SCHEMA_VERSION, type Version, type ProjectMeta, type PlanAnswers } from '../lib/pmptFile.js';
import { loadAuth } from '../lib/auth.js';
import { publishProject } from '../lib/api.js';
import glob from 'fast-glob';
import { join } from 'path';

function readSnapshotFiles(snapshotDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(snapshotDir)) return files;
  const mdFiles = glob.sync('**/*.md', { cwd: snapshotDir });
  for (const file of mdFiles) {
    try {
      files[file] = readFileSync(join(snapshotDir, file), 'utf-8');
    } catch { /* skip */ }
  }
  return files;
}

function readDocsFolder(docsDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(docsDir)) return files;
  const mdFiles = glob.sync('**/*.md', { cwd: docsDir });
  for (const file of mdFiles) {
    try {
      files[file] = readFileSync(join(docsDir, file), 'utf-8');
    } catch { /* skip */ }
  }
  return files;
}

export async function cmdPublish(path?: string): Promise<void> {
  const projectPath = path ? resolve(path) : process.cwd();

  if (!isInitialized(projectPath)) {
    p.log.error('프로젝트가 초기화되지 않았습니다. `pmpt init`을 먼저 실행하세요.');
    process.exit(1);
  }

  const auth = loadAuth();
  if (!auth?.token || !auth?.username) {
    p.log.error('로그인이 필요합니다. `pmpt login`을 먼저 실행하세요.');
    process.exit(1);
  }

  p.intro('pmpt publish');

  const config = loadConfig(projectPath);
  const snapshots = getAllSnapshots(projectPath);
  const planProgress = getPlanProgress(projectPath);

  if (snapshots.length === 0) {
    p.log.warn('스냅샷이 없습니다. `pmpt save` 또는 `pmpt plan`을 먼저 실행하세요.');
    p.outro('');
    return;
  }

  const projectName = planProgress?.answers?.projectName || basename(projectPath);

  // Collect publish info
  const slug = await p.text({
    message: '프로젝트 slug (URL에 사용될 이름):',
    placeholder: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
    validate: (v) => {
      if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(v)) {
        return '3~50자, 소문자/숫자/하이픈만 사용 가능합니다.';
      }
    },
  });
  if (p.isCancel(slug)) { p.cancel('취소됨'); process.exit(0); }

  const description = await p.text({
    message: '프로젝트 설명 (짧게):',
    placeholder: planProgress?.answers?.productIdea?.slice(0, 100) || '',
    defaultValue: planProgress?.answers?.productIdea?.slice(0, 200) || '',
  });
  if (p.isCancel(description)) { p.cancel('취소됨'); process.exit(0); }

  const tagsInput = await p.text({
    message: '태그 (쉼표로 구분):',
    placeholder: 'react, saas, mvp',
    defaultValue: '',
  });
  if (p.isCancel(tagsInput)) { p.cancel('취소됨'); process.exit(0); }

  const tags = (tagsInput as string)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Build .pmpt content (reuse export logic)
  const history: Version[] = snapshots.map((snapshot) => ({
    version: snapshot.version,
    timestamp: snapshot.timestamp,
    files: readSnapshotFiles(snapshot.snapshotDir),
    git: snapshot.git,
  }));

  const docsDir = getDocsDir(projectPath);
  const docs = readDocsFolder(docsDir);

  const meta: ProjectMeta = {
    projectName,
    author: auth.username,
    description: description as string,
    createdAt: config?.createdAt || new Date().toISOString(),
    exportedAt: new Date().toISOString(),
  };

  const planAnswers: PlanAnswers | undefined = planProgress?.answers
    ? {
        projectName: planProgress.answers.projectName,
        productIdea: planProgress.answers.productIdea,
        additionalContext: planProgress.answers.additionalContext,
        coreFeatures: planProgress.answers.coreFeatures,
        techStack: planProgress.answers.techStack,
      }
    : undefined;

  const pmptContent = createPmptFile(meta, planAnswers, docs, history);

  // Confirm
  p.note(
    [
      `Project: ${projectName}`,
      `Slug: ${slug}`,
      `Versions: ${snapshots.length}`,
      `Size: ${(pmptContent.length / 1024).toFixed(1)} KB`,
      `Author: @${auth.username}`,
      tags.length ? `Tags: ${tags.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
    'Publish Preview'
  );

  const confirm = await p.confirm({
    message: '게시하시겠습니까?',
    initialValue: true,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소됨');
    process.exit(0);
  }

  // Upload
  const s = p.spinner();
  s.start('업로드 중...');

  try {
    const result = await publishProject(auth.token, {
      slug: slug as string,
      pmptContent,
      description: description as string,
      tags,
    });

    s.stop('게시 완료!');

    // Update config
    if (config) {
      config.lastPublished = new Date().toISOString();
      saveConfig(projectPath, config);
    }

    p.note(
      [
        `URL: ${result.url}`,
        `Download: ${result.downloadUrl}`,
        '',
        `pmpt clone ${slug}  — 다른 사람이 이 프로젝트를 복제할 수 있습니다`,
      ].join('\n'),
      'Published!'
    );
  } catch (err) {
    s.stop('게시 실패');
    p.log.error(err instanceof Error ? err.message : '게시에 실패했습니다.');
    process.exit(1);
  }

  p.outro('');
}
