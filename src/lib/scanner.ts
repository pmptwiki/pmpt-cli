import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { isGitRepo } from './git.js';

// ── Interfaces ──

export interface PackageInfo {
  name: string;
  description: string | null;
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
}

export interface GitSummary {
  totalCommits: number;
  recentCommits: string[];
  firstCommitDate: string | null;
  contributors: number;
}

export interface ScanResult {
  isExistingProject: boolean;
  packageInfo: PackageInfo | null;
  readmeDescription: string | null;
  detectedFramework: string | null;
  directoryStructure: string[];
  gitSummary: GitSummary | null;
}

// ── Scanner Functions ──

function git(path: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd: path,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function scanPackageJson(projectPath: string): PackageInfo | null {
  const pkgPath = join(projectPath, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return {
      name: raw.name || basename(projectPath),
      description: raw.description || null,
      dependencies: Object.keys(raw.dependencies || {}),
      devDependencies: Object.keys(raw.devDependencies || {}),
      scripts: Object.keys(raw.scripts || {}),
    };
  } catch {
    return null;
  }
}

function scanReadme(projectPath: string): string | null {
  const candidates = ['README.md', 'readme.md', 'Readme.md'];
  let content: string | null = null;

  for (const name of candidates) {
    const filePath = join(projectPath, name);
    if (existsSync(filePath)) {
      try {
        content = readFileSync(filePath, 'utf-8');
        break;
      } catch {
        continue;
      }
    }
  }

  if (!content) return null;

  // Split by paragraph and find the first meaningful one
  const paragraphs = content.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    // Skip headings, badges, images, empty lines, HTML tags
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[') || trimmed.startsWith('!')) continue;
    if (trimmed.startsWith('<')) continue;
    if (trimmed.startsWith('```')) continue;
    // Found a text paragraph
    const cleaned = trimmed.replace(/\n/g, ' ').trim();
    return cleaned.length > 500 ? cleaned.slice(0, 500) + '...' : cleaned;
  }

  return null;
}

const FRAMEWORK_CONFIGS: [string, string][] = [
  ['astro.config.*', 'Astro'],
  ['next.config.*', 'Next.js'],
  ['nuxt.config.*', 'Nuxt'],
  ['svelte.config.*', 'SvelteKit'],
  ['remix.config.*', 'Remix'],
  ['gatsby-config.*', 'Gatsby'],
  ['angular.json', 'Angular'],
  ['vite.config.*', 'Vite'],
];

const DEP_FRAMEWORKS: [string, string][] = [
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['@angular/core', 'Angular'],
  ['svelte', 'Svelte'],
  ['vue', 'Vue'],
  ['react', 'React'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['@nestjs/core', 'NestJS'],
  ['hono', 'Hono'],
  ['django', 'Django'],
  ['flask', 'Flask'],
];

function detectFramework(projectPath: string, packageInfo: PackageInfo | null): string | null {
  // Check config files first
  for (const [pattern, name] of FRAMEWORK_CONFIGS) {
    if (pattern.includes('*')) {
      const base = pattern.replace('.*', '');
      try {
        const files = readdirSync(projectPath);
        if (files.some((f) => f.startsWith(base))) return name;
      } catch {
        // ignore
      }
    } else {
      if (existsSync(join(projectPath, pattern))) return name;
    }
  }

  // Fall back to dependencies
  if (packageInfo) {
    const allDeps = [...packageInfo.dependencies, ...packageInfo.devDependencies];
    for (const [dep, name] of DEP_FRAMEWORKS) {
      if (allDeps.includes(dep)) return name;
    }
  }

  return null;
}

const MEANINGFUL_DIRS = new Set([
  'src', 'app', 'pages', 'components', 'routes', 'views',
  'lib', 'utils', 'helpers', 'hooks', 'stores', 'store',
  'api', 'server', 'services', 'middleware',
  'public', 'static', 'assets', 'styles', 'css',
  'tests', '__tests__', 'test', 'spec',
  'scripts', 'config', 'database', 'db', 'models',
  'layouts', 'templates',
]);

function scanDirectoryStructure(projectPath: string): string[] {
  try {
    const entries = readdirSync(projectPath);
    return entries
      .filter((name) => {
        if (name.startsWith('.')) return false;
        if (name === 'node_modules' || name === 'dist' || name === 'build') return false;
        try {
          return statSync(join(projectPath, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .filter((name) => MEANINGFUL_DIRS.has(name))
      .sort();
  } catch {
    return [];
  }
}

function scanGitHistory(projectPath: string): GitSummary | null {
  if (!isGitRepo(projectPath)) return null;

  const countStr = git(projectPath, 'rev-list --count HEAD');
  if (!countStr) return null;

  const totalCommits = parseInt(countStr, 10);
  if (isNaN(totalCommits) || totalCommits === 0) return null;

  const recentRaw = git(projectPath, 'log --oneline -5 --format=%s');
  const recentCommits = recentRaw
    ? recentRaw.split('\n').filter(Boolean)
    : [];

  const firstCommitDate = git(projectPath, 'log --reverse --format=%cI -1') || null;

  let contributors = 1;
  const shortlogRaw = git(projectPath, 'shortlog -sn HEAD');
  if (shortlogRaw) {
    contributors = shortlogRaw.split('\n').filter(Boolean).length;
  }

  return { totalCommits, recentCommits, firstCommitDate, contributors };
}

// ── Main Functions ──

export function scanProject(projectPath: string): ScanResult {
  const packageInfo = scanPackageJson(projectPath);
  const readmeDescription = scanReadme(projectPath);
  const detectedFramework = detectFramework(projectPath, packageInfo);
  const directoryStructure = scanDirectoryStructure(projectPath);
  const gitSummary = scanGitHistory(projectPath);

  const isExistingProject =
    packageInfo !== null ||
    readmeDescription !== null ||
    directoryStructure.length > 0 ||
    (gitSummary !== null && gitSummary.totalCommits > 0);

  return {
    isExistingProject,
    packageInfo,
    readmeDescription,
    detectedFramework,
    directoryStructure,
    gitSummary,
  };
}

export function scanResultToAnswers(
  result: ScanResult,
  userDescription: string,
): Record<string, string> {
  // projectName
  const projectName = result.packageInfo?.name || basename(process.cwd());

  // productIdea — user's own description
  const productIdea = userDescription;

  // additionalContext — scanned technical info
  const contextParts: string[] = [];
  contextParts.push('Existing project with established codebase.');

  if (result.detectedFramework) {
    contextParts.push(`- Framework: ${result.detectedFramework}`);
  }
  if (result.directoryStructure.length > 0) {
    contextParts.push(`- Project structure: ${result.directoryStructure.map((d) => d + '/').join(', ')}`);
  }
  if (result.gitSummary) {
    const gs = result.gitSummary;
    let gitLine = `- Git history: ${gs.totalCommits} commits`;
    if (gs.firstCommitDate) {
      gitLine += ` since ${gs.firstCommitDate.split('T')[0]}`;
    }
    gitLine += `, ${gs.contributors} contributor(s)`;
    contextParts.push(gitLine);

    if (gs.recentCommits.length > 0) {
      contextParts.push(`- Recent work: ${gs.recentCommits.map((c) => `"${c}"`).join(', ')}`);
    }
  }

  const additionalContext = contextParts.join('\n');

  // coreFeatures — from scripts and directory structure
  const featureParts: string[] = [];
  if (result.packageInfo?.scripts.length) {
    for (const script of result.packageInfo.scripts) {
      featureParts.push(`${script} (npm script)`);
    }
  }
  if (result.directoryStructure.length > 0) {
    const dirHints: Record<string, string> = {
      pages: 'Page routing',
      routes: 'Route handling',
      components: 'Component library',
      api: 'API layer',
      server: 'Server-side logic',
      tests: 'Test suite',
      __tests__: 'Test suite',
      test: 'Test suite',
      models: 'Data models',
      database: 'Database layer',
      db: 'Database layer',
      middleware: 'Middleware',
      layouts: 'Layout system',
    };
    for (const dir of result.directoryStructure) {
      if (dirHints[dir]) {
        featureParts.push(`${dirHints[dir]} (${dir}/ directory)`);
      }
    }
  }

  const coreFeatures = featureParts.length > 0
    ? featureParts.join('; ')
    : 'Existing project features';

  // techStack — from framework + dependencies
  const stackParts: string[] = [];
  if (result.detectedFramework) {
    stackParts.push(result.detectedFramework);
  }
  if (result.packageInfo) {
    // Add top production dependencies (exclude framework already listed)
    const frameworkLower = result.detectedFramework?.toLowerCase() || '';
    const topDeps = result.packageInfo.dependencies
      .filter((d) => !d.startsWith('@types/') && !d.toLowerCase().includes(frameworkLower))
      .slice(0, 8);
    stackParts.push(...topDeps);

    // Add notable dev deps
    const notableDevDeps = ['typescript', 'eslint', 'prettier', 'jest', 'vitest', 'mocha', 'tailwindcss'];
    for (const d of result.packageInfo.devDependencies) {
      if (notableDevDeps.includes(d) && !stackParts.includes(d)) {
        stackParts.push(d);
      }
    }
  }

  const techStack = stackParts.length > 0
    ? stackParts.join(', ')
    : '';

  return {
    projectName,
    productIdea,
    additionalContext,
    coreFeatures,
    techStack,
  };
}
