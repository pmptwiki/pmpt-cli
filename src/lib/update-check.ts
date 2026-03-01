import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';

const CACHE_DIR = join(homedir(), '.pmpt');
const CACHE_FILE = join(CACHE_DIR, 'update-check.json');
const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours

interface Cache {
  latest: string;
  checkedAt: number;
}

function readCache(): Cache | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(data: Cache): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {}
}

function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      'https://registry.npmjs.org/pmpt-cli/latest',
      { headers: { Accept: 'application/json' }, timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body).version || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

/**
 * Check for updates and print a notification if a newer version is available.
 * Non-blocking, silent on failure.
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const cache = readCache();
    let latest: string | null = null;

    if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL) {
      latest = cache.latest;
    } else {
      latest = await fetchLatestVersion();
      if (latest) writeCache({ latest, checkedAt: Date.now() });
    }

    if (latest && compareVersions(currentVersion, latest)) {
      const msg = [
        '',
        `  \x1b[33m┌──────────────────────────────────────────┐\x1b[0m`,
        `  \x1b[33m│\x1b[0m  Update available: \x1b[90m${currentVersion}\x1b[0m → \x1b[32m${latest}\x1b[0m${' '.repeat(Math.max(0, 14 - currentVersion.length - latest.length))}\x1b[33m│\x1b[0m`,
        `  \x1b[33m│\x1b[0m  Run \x1b[36mnpm install -g pmpt-cli\x1b[0m to update  \x1b[33m│\x1b[0m`,
        `  \x1b[33m└──────────────────────────────────────────┘\x1b[0m`,
        '',
      ].join('\n');
      console.error(msg);
    }
  } catch {}
}
