import * as p from '@clack/prompts';
import { loadAuth } from '../lib/auth.js';
import { fetchProjects, graduateProject } from '../lib/api.js';

export async function cmdGraduate(): Promise<void> {
  const auth = loadAuth();
  if (!auth?.token || !auth?.username) {
    p.log.error('Login required. Run `pmpt login` first.');
    process.exit(1);
  }

  p.intro('pmpt graduate');

  const s = p.spinner();
  s.start('Loading your projects...');

  let myProjects;
  try {
    const index = await fetchProjects();
    myProjects = index.projects
      .filter((proj) => proj.author === auth.username)
      .filter((proj) => !proj.graduated);
  } catch (err) {
    s.stop('Failed to load projects');
    p.log.error(err instanceof Error ? err.message : 'Failed to fetch projects.');
    process.exit(1);
  }

  s.stop('Projects loaded');

  if (myProjects.length === 0) {
    p.log.warn('No eligible projects found. All projects may already be graduated.');
    p.outro('');
    return;
  }

  const slug = await p.select({
    message: 'Select a project to graduate:',
    options: myProjects.map((proj) => ({
      value: proj.slug,
      label: proj.slug,
      hint: proj.description?.slice(0, 50) || '',
    })),
  });
  if (p.isCancel(slug)) { p.cancel('Cancelled'); process.exit(0); }

  p.note(
    [
      'Graduating a project means:',
      '  - The project is archived (no more updates)',
      '  - A graduation badge (🎓) is displayed',
      '  - It appears in the Hall of Fame',
      '  - The .pmpt file remains downloadable',
      '',
      'This action is intentionally hard to reverse.',
    ].join('\n'),
    'What is graduation?',
  );

  const confirm = await p.confirm({
    message: `Graduate "${slug}"? This will archive the project permanently.`,
    initialValue: false,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const note = await p.text({
    message: 'Graduation note (optional):',
    placeholder: 'e.g., "Reached 1000 users!" or "Acquired by company"',
  });
  if (p.isCancel(note)) { p.cancel('Cancelled'); process.exit(0); }

  const s2 = p.spinner();
  s2.start('Graduating...');

  try {
    await graduateProject(auth.token, slug as string, (note as string) || undefined);
    s2.stop('Graduated!');
    p.log.success(`Project "${slug}" has graduated! 🎓`);
    p.log.info('View in Hall of Fame: https://pmptwiki.com/hall-of-fame');
  } catch (err) {
    s2.stop('Graduation failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to graduate project.');
    process.exit(1);
  }

  p.outro('');
}
