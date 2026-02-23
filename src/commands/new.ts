import * as p from '@clack/prompts';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { generateContent, generateFilePath } from '../lib/template.js';
import type { DocFrontmatter, Lang, Level, Persona, Purpose } from '../types.js';

export async function cmdNew(): Promise<void> {
  p.intro('pmptwiki — create new document');

  const answers = await p.group(
    {
      lang: () =>
        p.select<{ value: Lang; label: string }[], Lang>({
          message: 'Select language',
          options: [
            { value: 'ko', label: 'Korean (ko)' },
            { value: 'en', label: 'English (en)' },
          ],
        }),
      purpose: () =>
        p.select<{ value: Purpose; label: string; hint: string }[], Purpose>({
          message: 'Select document type',
          options: [
            { value: 'guide', label: 'Guide', hint: 'Concept explanation + how-to' },
            { value: 'rule', label: 'Rule', hint: 'Do / Don\'t' },
            { value: 'template', label: 'Template', hint: 'Copy-paste prompt' },
            { value: 'example', label: 'Example', hint: 'Real-world use case' },
            { value: 'reference', label: 'Reference', hint: 'Resource collection' },
          ],
        }),
      level: () =>
        p.select<{ value: Level; label: string }[], Level>({
          message: 'Select difficulty',
          options: [
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ],
        }),
      title: () =>
        p.text({
          message: 'Enter a title',
          placeholder: 'Providing enough context to AI changes the response',
          validate: (v) => (v.trim().length < 5 ? 'At least 5 characters required' : undefined),
        }),
      tags: () =>
        p.text({
          message: 'Enter tags (comma-separated, optional)',
          placeholder: 'context, beginner, prompt',
        }),
      persona: () =>
        p.multiselect<{ value: Persona; label: string }[], Persona>({
          message: 'Select target audience (optional)',
          options: [
            { value: 'general', label: 'General' },
            { value: 'power-user', label: 'Power User' },
            { value: 'developer', label: 'Developer' },
            { value: 'organization', label: 'Organization' },
          ],
          required: false,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Cancelled');
        process.exit(0);
      },
    }
  );

  const fm: DocFrontmatter = {
    title: answers.title as string,
    purpose: answers.purpose as Purpose,
    level: answers.level as Level,
    lang: answers.lang as Lang,
    tags: (answers.tags as string)
      ? (answers.tags as string).split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    persona: (answers.persona as Persona[]).length ? (answers.persona as Persona[]) : undefined,
  };

  const filePath = generateFilePath(fm);
  const content = generateContent(fm);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');

  p.outro(`File created: ${filePath}

Next steps:
  1. Open the file and write the content
  2. pmpt validate ${filePath}
  3. pmpt submit ${filePath}`);
}
