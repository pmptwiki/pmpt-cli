import * as p from '@clack/prompts';
import { loadAuth } from '../lib/auth.js';
import { fetchProjects, editProject } from '../lib/api.js';

export async function cmdEdit(): Promise<void> {
  const auth = loadAuth();
  if (!auth?.token || !auth?.username) {
    p.log.error('Login required. Run `pmpt login` first.');
    process.exit(1);
  }

  p.intro('pmpt edit');

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
    p.log.warn('No published projects found. Run `pmpt publish` first.');
    p.outro('');
    return;
  }

  const slug = await p.select({
    message: 'Select a project to edit:',
    options: myProjects.map((proj) => ({
      value: proj.slug,
      label: proj.slug,
      hint: proj.description?.slice(0, 50) || '',
    })),
  });
  if (p.isCancel(slug)) { p.cancel('Cancelled'); process.exit(0); }

  const project = myProjects.find((proj) => proj.slug === slug)!;

  const description = await p.text({
    message: 'Description:',
    defaultValue: project.description,
    placeholder: project.description,
  });
  if (p.isCancel(description)) { p.cancel('Cancelled'); process.exit(0); }

  const tagsInput = await p.text({
    message: 'Tags (comma-separated):',
    defaultValue: project.tags.join(', '),
    placeholder: project.tags.join(', '),
  });
  if (p.isCancel(tagsInput)) { p.cancel('Cancelled'); process.exit(0); }

  const tags = (tagsInput as string)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const category = await p.select({
    message: 'Category:',
    initialValue: project.category || 'other',
    options: [
      { value: 'web-app',     label: 'Web App' },
      { value: 'mobile-app',  label: 'Mobile App' },
      { value: 'cli-tool',    label: 'CLI Tool' },
      { value: 'api-backend', label: 'API/Backend' },
      { value: 'ai-ml',       label: 'AI/ML' },
      { value: 'game',        label: 'Game' },
      { value: 'library',     label: 'Library' },
      { value: 'other',       label: 'Other' },
    ],
  });
  if (p.isCancel(category)) { p.cancel('Cancelled'); process.exit(0); }

  // Product link (optional)
  const linkTypeInput = await p.select({
    message: 'Product link (optional):',
    initialValue: project.productUrlType || 'none',
    options: [
      { value: 'none', label: 'No link' },
      { value: 'git',  label: 'Git Repository' },
      { value: 'url',  label: 'Website / URL' },
    ] as { value: string; label: string }[],
  });
  if (p.isCancel(linkTypeInput)) { p.cancel('Cancelled'); process.exit(0); }

  let productUrl = '';
  let productUrlType = '';

  if (linkTypeInput !== 'none') {
    productUrlType = linkTypeInput as string;
    const productUrlInput = await p.text({
      message: 'Product URL:',
      placeholder: linkTypeInput === 'git'
        ? `https://github.com/${auth.username}/${slug}`
        : 'https://...',
      defaultValue: project.productUrl || '',
      validate: (v) => {
        if (!v.trim()) return 'URL is required when link type is selected.';
        try { new URL(v); } catch { return 'Invalid URL format.'; }
      },
    });
    if (p.isCancel(productUrlInput)) { p.cancel('Cancelled'); process.exit(0); }
    productUrl = productUrlInput as string;
  }

  const s2 = p.spinner();
  s2.start('Updating...');

  try {
    await editProject(auth.token, slug as string, {
      description: description as string,
      tags,
      category: category as string,
      productUrl,
      productUrlType,
    });
    s2.stop('Updated!');
    p.log.success(`Project "${slug}" has been updated.`);
  } catch (err) {
    s2.stop('Update failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to update project.');
    process.exit(1);
  }

  p.outro('');
}
