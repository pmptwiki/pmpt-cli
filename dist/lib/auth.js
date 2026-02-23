import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
const CONFIG_DIR = join(homedir(), '.config', 'pmptwiki');
const TOKEN_FILE = join(CONFIG_DIR, 'auth.json');
export function loadAuth() {
    try {
        if (!existsSync(TOKEN_FILE))
            return null;
        return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function saveAuth(config) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
export function clearAuth() {
    if (existsSync(TOKEN_FILE)) {
        writeFileSync(TOKEN_FILE, '{}');
    }
}
