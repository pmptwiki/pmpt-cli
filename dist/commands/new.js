import * as p from '@clack/prompts';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { generateContent, generateFilePath } from '../lib/template.js';
export async function cmdNew() {
    p.intro('pmptwiki — create new document');
    const answers = await p.group({
        lang: () => p.select({
            message: 'Select language',
            options: [
                { value: 'ko', label: 'Korean (ko)' },
                { value: 'en', label: 'English (en)' },
            ],
        }),
        purpose: () => p.select({
            message: 'Select document type',
            options: [
                { value: 'guide', label: 'Guide', hint: 'Concept explanation + how-to' },
                { value: 'rule', label: 'Rule', hint: 'Do / Don\'t' },
                { value: 'template', label: 'Template', hint: 'Copy-paste prompt' },
                { value: 'example', label: 'Example', hint: 'Real-world use case' },
                { value: 'reference', label: 'Reference', hint: 'Resource collection' },
            ],
        }),
        level: () => p.select({
            message: 'Select difficulty',
            options: [
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
            ],
        }),
        title: () => p.text({
            message: 'Enter a title',
            placeholder: 'Providing enough context to AI changes the response',
            validate: (v) => (v.trim().length < 5 ? 'At least 5 characters required' : undefined),
        }),
        tags: () => p.text({
            message: 'Enter tags (comma-separated, optional)',
            placeholder: 'context, beginner, prompt',
        }),
        persona: () => p.multiselect({
            message: 'Select target audience (optional)',
            options: [
                { value: 'general', label: 'General' },
                { value: 'power-user', label: 'Power User' },
                { value: 'developer', label: 'Developer' },
                { value: 'organization', label: 'Organization' },
            ],
            required: false,
        }),
    }, {
        onCancel: () => {
            p.cancel('Cancelled');
            process.exit(0);
        },
    });
    const fm = {
        title: answers.title,
        purpose: answers.purpose,
        level: answers.level,
        lang: answers.lang,
        tags: answers.tags
            ? answers.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : [],
        persona: answers.persona.length ? answers.persona : undefined,
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
