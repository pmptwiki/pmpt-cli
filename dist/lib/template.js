export function toSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60);
}
export function today() {
    return new Date().toISOString().slice(0, 10);
}
export function generateFilePath(fm) {
    const slug = toSlug(fm.title);
    return `${fm.lang}/${fm.purpose}/${fm.level}/${slug}.md`;
}
export function generateContent(fm) {
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
        ? `\n## Why It Matters\n\n<!-- Explain why this document is needed -->\n\n## How To\n\n<!-- Explain step by step -->\n\n## Examples\n\n<!-- Add real examples -->\n`
        : `\n## Why it matters\n\n<!-- Explain why this document is needed -->\n\n## How to\n\n<!-- Explain step by step -->\n\n## Example\n\n<!-- Add a real example -->\n`;
    return frontmatter + body;
}
