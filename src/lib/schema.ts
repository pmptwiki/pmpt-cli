import { z } from 'zod';
import matter from 'gray-matter';
import { readFileSync } from 'fs';
import type { ValidationResult } from '../types.js';

const frontmatterSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  purpose: z.enum(['guide', 'rule', 'template', 'example', 'reference']),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  lang: z.enum(['ko', 'en']),
  persona: z.array(z.enum(['general', 'power-user', 'developer', 'organization'])).optional(),
  status: z.enum(['draft', 'review', 'stable', 'recommended', 'deprecated']).optional(),
  translationKey: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  contributors: z.array(z.string()).optional(),
});

const FILE_PATH_RE = /^(ko|en)\/(guide|rule|template|example|reference)\/(beginner|intermediate|advanced)\/.+\.mdx?$/;

export function validate(filePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. File path rules
  const relative = filePath.replace(/^.*?(?=ko\/|en\/)/, '');
  if (!FILE_PATH_RE.test(relative)) {
    errors.push(`File path does not match: {lang}/{purpose}/{level}/filename.md`);
  }

  // 2. Read file
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    errors.push('Cannot read file');
    return { valid: false, errors, warnings };
  }

  // 3. Parse frontmatter
  const { data, content } = matter(raw);
  const result = frontmatterSchema.safeParse(data);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      errors.push(`[${field}] ${issue.message}`);
    }
  }

  // 4. Body length
  const bodyLength = content.trim().length;
  if (bodyLength < 200) {
    errors.push(`Content too short (${bodyLength} chars, minimum 200)`);
  }

  // 5. Warnings
  if (!data.tags || data.tags.length === 0) {
    warnings.push('Adding tags helps with search and related document links');
  }
  if (!data.persona) {
    warnings.push('Specifying a persona clarifies the target audience');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
