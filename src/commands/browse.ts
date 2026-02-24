import * as p from '@clack/prompts';
import { fetchProjects, type ProjectEntry } from '../lib/api.js';

export async function cmdBrowse(): Promise<void> {
  p.intro('pmpt browse');

  const s = p.spinner();
  s.start('Loading projects...');

  let projects: ProjectEntry[];
  try {
    const index = await fetchProjects();
    projects = index.projects;
  } catch (err) {
    s.stop('Failed to load');
    p.log.error(err instanceof Error ? err.message : 'Could not load project list.');
    process.exit(1);
  }

  s.stop(`${projects.length} projects`);

  if (projects.length === 0) {
    p.log.info('No published projects yet.');
    p.log.message('  pmpt publish  — share your first project!');
    p.outro('');
    return;
  }

  // Select project
  const selected = await p.select({
    message: 'Select a project:',
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
    message: 'What would you like to do?',
    options: [
      { value: 'clone', label: 'Clone this project', hint: 'pmpt clone' },
      { value: 'url', label: 'Show URL', hint: 'View in browser' },
      { value: 'back', label: 'Go back' },
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
    const url = `https://pmptwiki.com/p/${project.slug}`;
    p.log.info(`URL: ${url}`);
    p.log.message(`Download: ${project.downloadUrl}`);
    p.log.message(`\npmpt clone ${project.slug}  — clone via terminal`);
    p.outro('');
  }
}
