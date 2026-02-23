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
  s.start('Preparing GitHub authentication...');

  let device: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
  try {
    device = await requestDeviceCode();
    s.stop('Verification code issued.');
  } catch (err) {
    s.stop('Failed to issue verification code');
    p.log.error(err instanceof Error ? err.message : 'Failed to prepare authentication.');
    process.exit(1);
  }

  // Step 2: Show code and open browser
  p.log.info(
    `Enter this code on GitHub:\n\n` +
    `  Code: ${device.userCode}\n` +
    `  URL:  ${device.verificationUri}`
  );

  const shouldOpen = await p.confirm({
    message: 'Open browser?',
    initialValue: true,
  });

  if (p.isCancel(shouldOpen)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  if (shouldOpen) {
    await open(device.verificationUri);
  }

  // Step 3: Poll for token
  s.start('Waiting for GitHub authorization... (enter the code in your browser)');

  let interval = device.interval * 1000; // seconds → ms
  const deadline = Date.now() + device.expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);

    try {
      const result = await pollDeviceToken(device.deviceCode);

      if (result.status === 'complete') {
        saveAuth({ token: result.token!, username: result.username! });
        s.stop(`Authenticated — @${result.username}`);
        p.outro('Login complete! Build projects with AI using pmpt and share your vibe coding journey on pmptwiki.');
        return;
      }

      if (result.status === 'slow_down') {
        interval = (result.interval ?? 10) * 1000;
      }

      // status === 'pending' → keep polling
    } catch (err) {
      s.stop('Authentication failed');
      p.log.error(err instanceof Error ? err.message : 'Authentication failed.');
      process.exit(1);
    }
  }

  s.stop('Verification code expired.');
  p.log.error('Please run pmpt login again.');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
