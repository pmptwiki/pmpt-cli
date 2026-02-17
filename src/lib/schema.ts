import { z } from 'zod';
import matter from 'gray-matter';
import { readFileSync } from 'fs';
import type { ValidationResult } from '../types.js';

const frontmatterSchema = z.object({
  title: z.string().min(5, '제목은 5자 이상이어야 합니다'),
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

  // 1. 파일 경로 규칙
  const relative = filePath.replace(/^.*?(?=ko\/|en\/)/, '');
  if (!FILE_PATH_RE.test(relative)) {
    errors.push(`파일 경로가 규칙에 맞지 않습니다: {lang}/{purpose}/{level}/파일명.md`);
  }

  // 2. 파일 읽기
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    errors.push('파일을 읽을 수 없습니다');
    return { valid: false, errors, warnings };
  }

  // 3. frontmatter 파싱
  const { data, content } = matter(raw);
  const result = frontmatterSchema.safeParse(data);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      errors.push(`[${field}] ${issue.message}`);
    }
  }

  // 4. 본문 길이
  const bodyLength = content.trim().length;
  if (bodyLength < 200) {
    errors.push(`본문이 너무 짧습니다 (현재 ${bodyLength}자, 최소 200자)`);
  }

  // 5. 경고
  if (!data.tags || data.tags.length === 0) {
    warnings.push('tags를 추가하면 검색과 관련 문서 연결에 도움이 됩니다');
  }
  if (!data.persona) {
    warnings.push('persona를 지정하면 대상 독자가 명확해집니다');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
