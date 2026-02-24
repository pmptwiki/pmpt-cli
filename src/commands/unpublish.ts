import * as p from '@clack/prompts';
import { loadAuth } from '../lib/auth.js';
import { fetchProjects, unpublishProject } from '../lib/api.js';

export async function cmdUnpublish(): Promise<void> {
  const auth = loadAuth();
  if (!auth?.token || !auth?.username) {
    p.log.error('Login required. Run `pmpt login` first.');
    process.exit(1);
  }

  p.intro('pmpt unpublish');

  const s = p.spinner();
  s.start('Loading your projects...');

  let myProjects;
  try {
    const index = await fetchProjects();
    myProjects = index.projects.filter((proj) => proj.author === auth.username);
  } catch (err) {
    s.stop('Failed to load projects');
    p.log.error(err instanceof Error ? err.message : 'Failed to fetch projects.');
    process.exit(1);
  }

  s.stop('Projects loaded');

  if (myProjects.length === 0) {
    p.log.warn('No published projects found.');
    p.outro('');
    return;
  }

  const slug = await p.select({
    message: 'Select a project to remove:',
    options: myProjects.map((proj) => ({
      value: proj.slug,
      label: proj.slug,
      hint: proj.description?.slice(0, 50) || '',
    })),
  });
  if (p.isCancel(slug)) { p.cancel('Cancelled'); process.exit(0); }

  const confirm = await p.confirm({
    message: `Delete "${slug}" from pmptwiki? This cannot be undone.`,
    initialValue: false,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const s2 = p.spinner();
  s2.start('Removing...');

  try {
    await unpublishProject(auth.token, slug as string);
    s2.stop('Removed!');
    p.log.success(`Project "${slug}" has been removed from pmptwiki.`);
  } catch (err) {
    s2.stop('Remove failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to remove project.');
    process.exit(1);
  }

  p.outro('');
}
