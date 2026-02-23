import * as p from '@clack/prompts';
import open from 'open';
import { loadAuth, saveAuth } from '../lib/auth.js';
import { requestDeviceCode, pollDeviceToken } from '../lib/api.js';

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

  // Step 1: Request device code
  const s = p.spinner();
  s.start('GitHub 인증 준비 중...');

  let device: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
  try {
    device = await requestDeviceCode();
    s.stop('인증 코드가 발급되었습니다.');
  } catch (err) {
    s.stop('인증 코드 발급 실패');
    p.log.error(err instanceof Error ? err.message : '인증 준비에 실패했습니다.');
    process.exit(1);
  }

  // Step 2: Show code and open browser
  p.log.info(
    `아래 코드를 GitHub에 입력하세요:\n\n` +
    `  코드: ${device.userCode}\n` +
    `  주소: ${device.verificationUri}`
  );

  const shouldOpen = await p.confirm({
    message: '브라우저를 열까요?',
    initialValue: true,
  });

  if (p.isCancel(shouldOpen)) {
    p.cancel('취소됨');
    process.exit(0);
  }

  if (shouldOpen) {
    await open(device.verificationUri);
  }

  // Step 3: Poll for token
  s.start('GitHub 인증 대기 중... (브라우저에서 코드를 입력하세요)');

  let interval = device.interval * 1000; // seconds → ms
  const deadline = Date.now() + device.expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);

    try {
      const result = await pollDeviceToken(device.deviceCode);

      if (result.status === 'complete') {
        saveAuth({ token: result.token!, username: result.username! });
        s.stop(`인증 완료 — @${result.username}`);
        p.outro('로그인 완료! pmpt publish로 프로젝트를 공유하세요.');
        return;
      }

      if (result.status === 'slow_down') {
        interval = (result.interval ?? 10) * 1000;
      }

      // status === 'pending' → keep polling
    } catch (err) {
      s.stop('인증 실패');
      p.log.error(err instanceof Error ? err.message : '인증에 실패했습니다.');
      process.exit(1);
    }
  }

  s.stop('인증 코드가 만료되었습니다.');
  p.log.error('다시 pmpt login을 실행해 주세요.');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
