import * as p from '@clack/prompts';
import matter from 'gray-matter';
import { readFileSync } from 'fs';
import { loadAuth, saveAuth } from '../lib/auth.js';
import { createClient, createBranch, createPR, ensureFork, getAuthUser, pushFile, } from '../lib/github.js';
import { validate } from '../lib/schema.js';
import { today } from '../lib/template.js';
export async function cmdSubmit(filePath) {
    p.intro(`pmptwiki — submit: ${filePath}`);
    // 1. Validate
    const s1 = p.spinner();
    s1.start('Validating file...');
    const result = validate(filePath);
    if (!result.valid) {
        s1.stop('Validation failed');
        for (const err of result.errors)
            p.log.error(err);
        p.outro('Fix errors and retry: pmpt validate ' + filePath);
        process.exit(1);
    }
    s1.stop(`Validation passed${result.warnings.length ? ` (${result.warnings.length} warnings)` : ''}`);
    for (const warn of result.warnings)
        p.log.warn(warn);
    // 2. Auth
    let auth = loadAuth();
    if (!auth) {
        p.log.info('GitHub authentication required.');
        p.log.info('Create a Personal Access Token:\n  https://github.com/settings/tokens/new\n  Required scope: repo (full)');
        const token = await p.password({
            message: 'Enter your GitHub PAT:',
            validate: (v) => (v.trim().length < 10 ? 'Please enter a valid token' : undefined),
        });
        if (p.isCancel(token)) {
            p.cancel('Cancelled');
            process.exit(0);
        }
        const s2 = p.spinner();
        s2.start('Verifying authentication...');
        try {
            const octokit = createClient(token);
            const username = await getAuthUser(octokit);
            saveAuth({ token: token, username });
            auth = { token: token, username };
            s2.stop(`Authenticated — @${username}`);
        }
        catch {
            s2.stop('Authentication failed');
            p.outro('Invalid token. Please try again');
            process.exit(1);
        }
    }
    const octokit = createClient(auth.token);
    // 3. Generate branch name
    const { data: fm } = matter(readFileSync(filePath, 'utf-8'));
    const slug = filePath
        .replace(/^.*?(?=ko\/|en\/)/, '')
        .replace(/\.mdx?$/, '')
        .replace(/\//g, '-');
    const branchName = `content/${slug}-${today()}`;
    // 4. Check / create fork
    const s3 = p.spinner();
    s3.start('Checking fork...');
    await ensureFork(octokit, auth.username);
    s3.stop('Fork ready');
    // 5. Create branch
    const s4 = p.spinner();
    s4.start(`Creating branch: ${branchName}`);
    await createBranch(octokit, auth.username, branchName);
    s4.stop('Branch created');
    // 6. Push file
    const repoPath = filePath.replace(/^.*?(?=ko\/|en\/)/, '');
    const s5 = p.spinner();
    s5.start('Uploading file...');
    await pushFile(octokit, auth.username, branchName, repoPath, filePath, `docs: add ${repoPath}`);
    s5.stop('File uploaded');
    // 7. Create PR
    const prTitle = fm.purpose
        ? `[${fm.purpose}] ${fm.title}`
        : fm.title;
    const prBody = [
        `## Document Info`,
        `- **Title**: ${fm.title}`,
        `- **Type**: ${fm.purpose ?? '-'}`,
        `- **Level**: ${fm.level ?? '-'}`,
        `- **Language**: ${fm.lang ?? '-'}`,
        fm.tags?.length ? `- **Tags**: ${fm.tags.map((t) => `\`${t}\``).join(' ')}` : null,
        ``,
        `## Checklist`,
        `- [ ] Is the content clear and practical?`,
        `- [ ] Are examples included?`,
        `- [ ] Does the title match the content?`,
        ``,
        `---`,
        `_Submitted via pmpt-cli_`,
    ]
        .filter((l) => l !== null)
        .join('\n');
    const s6 = p.spinner();
    s6.start('Creating PR...');
    const prUrl = await createPR(octokit, auth.username, branchName, prTitle, prBody);
    s6.stop('PR created');
    p.outro(`Submitted!\n\n  PR: ${prUrl}\n\nOnce reviewed and merged, it will be published on pmptwiki.com.`);
}
