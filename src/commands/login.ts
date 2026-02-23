import * as p from '@clack/prompts';
import { loadAuth, saveAuth } from '../lib/auth.js';
import { registerAuth } from '../lib/api.js';

export async function cmdLogin(): Promise<void> {
  p.intro('pmpt login');

  const existing = loadAuth();
  if (existing?.token && existing?.username) {
    p.log.info(`Currently logged in as @${existing.username}`);
    const reauth = await p.confirm({
      message: 'Re-authenticate?',
      initialValue: false,
    });
    if (p.isCancel(reauth) || !reauth) {
      p.outro('');
      return;
    }
  }

  p.log.info(
    'GitHub Personal Access Token이 필요합니다.\n' +
    '  https://github.com/settings/tokens/new\n' +
    '  필요 권한: read:user'
  );

  const pat = await p.password({
    message: 'GitHub PAT를 입력하세요:',
    validate: (v) => (v.trim().length < 10 ? '올바른 토큰을 입력하세요' : undefined),
  });

  if (p.isCancel(pat)) {
    p.cancel('취소됨');
    process.exit(0);
  }

  const s = p.spinner();
  s.start('인증 중...');

  try {
    const result = await registerAuth(pat as string);
    saveAuth({
      token: result.token,
      githubToken: pat as string,
      username: result.username,
    });
    s.stop(`인증 완료 — @${result.username}`);
  } catch (err) {
    s.stop('인증 실패');
    p.log.error(err instanceof Error ? err.message : '인증에 실패했습니다.');
    process.exit(1);
  }

  p.outro('로그인 완료! pmpt publish로 프로젝트를 공유하세요.');
}
