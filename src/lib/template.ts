import type { DocFrontmatter } from '../types.js';

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateFilePath(fm: DocFrontmatter): string {
  const slug = toSlug(fm.title);
  return `${fm.lang}/${fm.purpose}/${fm.level}/${slug}.md`;
}

export function generateContent(fm: DocFrontmatter): string {
  const frontmatter = [
    '---',
    `title: "${fm.title}"`,
    `purpose: ${fm.purpose}`,
    `level: ${fm.level}`,
    `lang: ${fm.lang}`,
    fm.persona?.length ? `persona: [${fm.persona.map((p) => `"${p}"`).join(', ')}]` : null,
    `status: draft`,
    fm.tags?.length ? `tags: [${fm.tags.map((t) => `"${t}"`).join(', ')}]` : null,
    `created: "${today()}"`,
    `updated: "${today()}"`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const body = fm.lang === 'ko'
    ? `\n## 왜 중요한가\n\n<!-- 이 문서가 필요한 이유를 설명하세요 -->\n\n## 방법\n\n<!-- 단계별로 설명하세요 -->\n\n## 예시\n\n<!-- 실제 예시를 추가하세요 -->\n`
    : `\n## Why it matters\n\n<!-- Explain why this document is needed -->\n\n## How to\n\n<!-- Explain step by step -->\n\n## Example\n\n<!-- Add a real example -->\n`;

  return frontmatter + body;
}
