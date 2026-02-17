import * as p from '@clack/prompts';
import matter from 'gray-matter';
import { readFileSync } from 'fs';
import { loadAuth, saveAuth } from '../lib/auth.js';
import {
  createClient,
  createBranch,
  createPR,
  ensureFork,
  getAuthUser,
  pushFile,
} from '../lib/github.js';
import { validate } from '../lib/schema.js';
import { today } from '../lib/template.js';

export async function cmdSubmit(filePath: string): Promise<void> {
  p.intro(`PromptWiki — 제출: ${filePath}`);

  // 1. 검증
  const s1 = p.spinner();
  s1.start('파일 검증 중...');
  const result = validate(filePath);
  if (!result.valid) {
    s1.stop('검증 실패');
    for (const err of result.errors) p.log.error(err);
    p.outro('오류를 수정한 후 다시 시도하세요: promptwiki validate ' + filePath);
    process.exit(1);
  }
  s1.stop(`검증 통과${result.warnings.length ? ` (경고 ${result.warnings.length}개)` : ''}`);
  for (const warn of result.warnings) p.log.warn(warn);

  // 2. 인증
  let auth = loadAuth();
  if (!auth) {
    p.log.info('GitHub 인증이 필요합니다.');
    p.log.info(
      'Personal Access Token을 발급하세요:\n  https://github.com/settings/tokens/new\n  필요 권한: repo (전체)'
    );

    const token = await p.password({
      message: 'GitHub PAT를 입력하세요:',
      validate: (v) => (v.trim().length < 10 ? '올바른 토큰을 입력하세요' : undefined),
    });
    if (p.isCancel(token)) { p.cancel('취소됨'); process.exit(0); }

    const s2 = p.spinner();
    s2.start('인증 확인 중...');
    try {
      const octokit = createClient(token as string);
      const username = await getAuthUser(octokit);
      saveAuth({ token: token as string, username });
      auth = { token: token as string, username };
      s2.stop(`인증 완료 — @${username}`);
    } catch {
      s2.stop('인증 실패');
      p.outro('토큰이 올바르지 않습니다. 다시 시도하세요');
      process.exit(1);
    }
  }

  const octokit = createClient(auth.token);

  // 3. 브랜치명 생성
  const { data: fm } = matter(readFileSync(filePath, 'utf-8'));
  const slug = filePath
    .replace(/^.*?(?=ko\/|en\/)/, '')
    .replace(/\.mdx?$/, '')
    .replace(/\//g, '-');
  const branchName = `content/${slug}-${today()}`;

  // 4. fork 확인 / 생성
  const s3 = p.spinner();
  s3.start('Fork 확인 중...');
  await ensureFork(octokit, auth.username);
  s3.stop('Fork 준비 완료');

  // 5. 브랜치 생성
  const s4 = p.spinner();
  s4.start(`브랜치 생성 중: ${branchName}`);
  await createBranch(octokit, auth.username, branchName);
  s4.stop('브랜치 생성 완료');

  // 6. 파일 push
  const repoPath = filePath.replace(/^.*?(?=ko\/|en\/)/, '');
  const s5 = p.spinner();
  s5.start('파일 업로드 중...');
  await pushFile(
    octokit,
    auth.username,
    branchName,
    repoPath,
    filePath,
    `docs: add ${repoPath}`
  );
  s5.stop('파일 업로드 완료');

  // 7. PR 생성
  const prTitle = fm.purpose
    ? `[${fm.purpose}] ${fm.title}`
    : fm.title;

  const prBody = [
    `## 문서 정보`,
    `- **제목**: ${fm.title}`,
    `- **유형**: ${fm.purpose ?? '-'}`,
    `- **난이도**: ${fm.level ?? '-'}`,
    `- **언어**: ${fm.lang ?? '-'}`,
    fm.tags?.length ? `- **태그**: ${fm.tags.map((t: string) => `\`${t}\``).join(' ')}` : null,
    ``,
    `## 체크리스트`,
    `- [ ] 본문이 명확하고 실용적인가?`,
    `- [ ] 예시가 포함되어 있는가?`,
    `- [ ] 제목과 내용이 일치하는가?`,
    ``,
    `---`,
    `_promptwiki-cli로 제출됨_`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const s6 = p.spinner();
  s6.start('PR 생성 중...');
  const prUrl = await createPR(octokit, auth.username, branchName, prTitle, prBody);
  s6.stop('PR 생성 완료');

  p.outro(`제출 완료!\n\n  PR: ${prUrl}\n\n리뷰 후 머지되면 pmptwiki.com에 자동으로 반영됩니다.`);
}
