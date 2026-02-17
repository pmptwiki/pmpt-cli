import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'promptwiki');
const TOKEN_FILE = join(CONFIG_DIR, 'auth.json');

interface AuthConfig {
  token: string;
  username: string;
}

export function loadAuth(): AuthConfig | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveAuth(config: AuthConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function clearAuth(): void {
  if (existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, '{}');
  }
}
