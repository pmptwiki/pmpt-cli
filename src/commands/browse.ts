import * as p from '@clack/prompts';
import { fetchProjects, type ProjectEntry } from '../lib/api.js';

export async function cmdBrowse(): Promise<void> {
  p.intro('pmpt browse');

  const s = p.spinner();
  s.start('프로젝트 목록 불러오는 중...');

  let projects: ProjectEntry[];
  try {
    const index = await fetchProjects();
    projects = index.projects;
  } catch (err) {
    s.stop('불러오기 실패');
    p.log.error(err instanceof Error ? err.message : '프로젝트 목록을 불러올 수 없습니다.');
    process.exit(1);
  }

  s.stop(`${projects.length}개 프로젝트`);

  if (projects.length === 0) {
    p.log.info('아직 공개된 프로젝트가 없습니다.');
    p.log.message('  pmpt publish  — 첫 번째 프로젝트를 공유해보세요!');
    p.outro('');
    return;
  }

  // Select project
  const selected = await p.select({
    message: '프로젝트를 선택하세요:',
    options: projects.map((proj) => ({
      value: proj.slug,
      label: proj.projectName,
      hint: `v${proj.versionCount} · @${proj.author}${proj.description ? ` — ${proj.description.slice(0, 40)}` : ''}`,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel('');
    process.exit(0);
  }

  const project = projects.find((p) => p.slug === selected)!;

  // Show details
  p.note(
    [
      `Project: ${project.projectName}`,
      `Author: @${project.author}`,
      `Versions: ${project.versionCount}`,
      project.description ? `Description: ${project.description}` : '',
      project.tags.length ? `Tags: ${project.tags.join(', ')}` : '',
      `Published: ${project.publishedAt.slice(0, 10)}`,
      `Size: ${(project.fileSize / 1024).toFixed(1)} KB`,
    ].filter(Boolean).join('\n'),
    'Project Details'
  );

  // Action
  const action = await p.select({
    message: '어떻게 할까요?',
    options: [
      { value: 'clone', label: '이 프로젝트 복제', hint: 'pmpt clone' },
      { value: 'url', label: 'URL 표시', hint: '브라우저에서 보기' },
      { value: 'back', label: '돌아가기' },
    ],
  });

  if (p.isCancel(action) || action === 'back') {
    p.outro('');
    return;
  }

  if (action === 'clone') {
    const { cmdClone } = await import('./clone.js');
    await cmdClone(project.slug);
    return;
  }

  if (action === 'url') {
    const url = `https://pmptwiki.com/ko/p/${project.slug}`;
    p.log.info(`URL: ${url}`);
    p.log.message(`Download: ${project.downloadUrl}`);
    p.log.message(`\npmpt clone ${project.slug}  — 터미널에서 복제`);
    p.outro('');
  }
}
