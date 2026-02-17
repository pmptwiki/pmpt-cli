import * as p from '@clack/prompts';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { generateContent, generateFilePath } from '../lib/template.js';
import type { DocFrontmatter, Lang, Level, Persona, Purpose } from '../types.js';

export async function cmdNew(): Promise<void> {
  p.intro('PromptWiki — 새 문서 만들기');

  const answers = await p.group(
    {
      lang: () =>
        p.select<{ value: Lang; label: string }[], Lang>({
          message: '언어를 선택하세요',
          options: [
            { value: 'ko', label: '한국어 (ko)' },
            { value: 'en', label: 'English (en)' },
          ],
        }),
      purpose: () =>
        p.select<{ value: Purpose; label: string; hint: string }[], Purpose>({
          message: '문서 유형을 선택하세요',
          options: [
            { value: 'guide', label: '가이드', hint: '개념 설명 + 방법' },
            { value: 'rule', label: '규칙', hint: '해야 할 것 / 하지 말 것' },
            { value: 'template', label: '템플릿', hint: '복사해서 쓰는 프롬프트' },
            { value: 'example', label: '사례', hint: '실제 사용 사례' },
            { value: 'reference', label: '레퍼런스', hint: '참고 자료 모음' },
          ],
        }),
      level: () =>
        p.select<{ value: Level; label: string }[], Level>({
          message: '난이도를 선택하세요',
          options: [
            { value: 'beginner', label: '입문' },
            { value: 'intermediate', label: '중급' },
            { value: 'advanced', label: '고급' },
          ],
        }),
      title: () =>
        p.text({
          message: '제목을 입력하세요',
          placeholder: 'AI에게 충분한 배경을 주면 답변이 달라진다',
          validate: (v) => (v.trim().length < 5 ? '5자 이상 입력해주세요' : undefined),
        }),
      tags: () =>
        p.text({
          message: '태그를 입력하세요 (쉼표 구분, 선택)',
          placeholder: 'context, beginner, prompt',
        }),
      persona: () =>
        p.multiselect<{ value: Persona; label: string }[], Persona>({
          message: '대상 독자를 선택하세요 (선택)',
          options: [
            { value: 'general', label: '일반' },
            { value: 'power-user', label: '파워유저' },
            { value: 'developer', label: '개발자' },
            { value: 'organization', label: '조직' },
          ],
          required: false,
        }),
    },
    {
      onCancel: () => {
        p.cancel('취소되었습니다');
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

  p.outro(`파일이 생성되었습니다: ${filePath}

다음 단계:
  1. 파일을 열어 본문을 작성하세요
  2. promptwiki validate ${filePath}
  3. promptwiki submit ${filePath}`);
}
