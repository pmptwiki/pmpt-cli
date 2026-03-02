import * as p from '@clack/prompts';
import { loadAuth } from '../lib/auth.js';
import { fetchProjects, editProject, type EditRequest } from '../lib/api.js';

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

  // Show current settings
  const categoryLabel = [
    { value: 'web-app', label: 'Web App' },
    { value: 'mobile-app', label: 'Mobile App' },
    { value: 'cli-tool', label: 'CLI Tool' },
    { value: 'api-backend', label: 'API/Backend' },
    { value: 'ai-ml', label: 'AI/ML' },
    { value: 'game', label: 'Game' },
    { value: 'library', label: 'Library' },
    { value: 'other', label: 'Other' },
  ].find((o) => o.value === project.category)?.label ?? project.category ?? 'Other';

  p.note(
    [
      `Description: ${project.description || '(none)'}`,
      `Tags: ${project.tags?.length ? project.tags.join(', ') : '(none)'}`,
      `Category: ${categoryLabel}`,
      project.productUrl ? `Product: ${project.productUrl}` : 'Product: (none)',
      `Visibility: ${project.unlisted ? 'Unlisted' : 'Listed'}`,
      `Related: ${project.related?.length ? project.related.join(', ') : '(none)'}`,
    ].join('\n'),
    'Current Settings',
  );

  // Pick fields to edit
  const fields = await p.multiselect({
    message: 'What do you want to edit?',
    options: [
      { value: 'description', label: 'Description' },
      { value: 'tags', label: 'Tags' },
      { value: 'category', label: 'Category' },
      { value: 'productUrl', label: 'Product Link' },
      { value: 'unlisted', label: 'Visibility (listed/unlisted)' },
      { value: 'related', label: 'Related Projects' },
    ],
  });
  if (p.isCancel(fields)) { p.cancel('Cancelled'); process.exit(0); }

  const updates: EditRequest = {};
  const selected = new Set(fields as string[]);

  if (selected.has('description')) {
    const v = await p.text({
      message: 'Description:',
      defaultValue: project.description,
      placeholder: project.description,
    });
    if (p.isCancel(v)) { p.cancel('Cancelled'); process.exit(0); }
    updates.description = v as string;
  }

  if (selected.has('tags')) {
    const v = await p.text({
      message: 'Tags (comma-separated):',
      defaultValue: project.tags.join(', '),
      placeholder: project.tags.join(', '),
    });
    if (p.isCancel(v)) { p.cancel('Cancelled'); process.exit(0); }
    updates.tags = (v as string).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  if (selected.has('category')) {
    const v = await p.select({
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
    if (p.isCancel(v)) { p.cancel('Cancelled'); process.exit(0); }
    updates.category = v as string;
  }

  if (selected.has('productUrl')) {
    const linkType = await p.select({
      message: 'Product link:',
      initialValue: project.productUrlType || 'none',
      options: [
        { value: 'none', label: 'No link' },
        { value: 'git',  label: 'Git Repository' },
        { value: 'url',  label: 'Website / URL' },
      ] as { value: string; label: string }[],
    });
    if (p.isCancel(linkType)) { p.cancel('Cancelled'); process.exit(0); }

    if (linkType === 'none') {
      updates.productUrl = '';
      updates.productUrlType = '';
    } else {
      updates.productUrlType = linkType as string;
      const urlInput = await p.text({
        message: 'Product URL:',
        placeholder: linkType === 'git'
          ? `https://github.com/${auth.username}/${slug}`
          : 'https://...',
        defaultValue: project.productUrl || '',
        validate: (v) => {
          if (!v.trim()) return 'URL is required when link type is selected.';
          try { new URL(v); } catch { return 'Invalid URL format.'; }
        },
      });
      if (p.isCancel(urlInput)) { p.cancel('Cancelled'); process.exit(0); }
      updates.productUrl = urlInput as string;
    }
  }

  if (selected.has('unlisted')) {
    const v = await p.confirm({
      message: 'Unlisted? (hidden from explore, accessible via direct URL)',
      initialValue: project.unlisted ?? false,
    });
    if (p.isCancel(v)) { p.cancel('Cancelled'); process.exit(0); }
    updates.unlisted = !!v;
  }

  if (selected.has('related')) {
    const v = await p.text({
      message: 'Related project slugs (comma-separated):',
      defaultValue: project.related?.join(', ') || '',
      placeholder: 'e.g., my-api, my-cli, my-docs',
    });
    if (p.isCancel(v)) { p.cancel('Cancelled'); process.exit(0); }
    const slugs = (v as string).split(',').map((s) => s.trim()).filter(Boolean);
    updates.related = slugs;
  }

  const s2 = p.spinner();
  s2.start('Updating...');

  try {
    await editProject(auth.token, slug as string, updates);
    s2.stop('Updated!');
    p.log.success(`Project "${slug}" has been updated.`);
  } catch (err) {
    s2.stop('Update failed');
    p.log.error(err instanceof Error ? err.message : 'Failed to update project.');
    process.exit(1);
  }

  p.outro('');
}
