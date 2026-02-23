import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';
const CONTENT_OWNER = 'pmptwiki';
const CONTENT_REPO = 'content';
export function createClient(token) {
    return new Octokit({ auth: token });
}
export async function getAuthUser(octokit) {
    const { data } = await octokit.rest.users.getAuthenticated();
    return data.login;
}
/** Create fork if not exists, otherwise return existing */
export async function ensureFork(octokit, username) {
    try {
        await octokit.rest.repos.get({ owner: username, repo: CONTENT_REPO });
    }
    catch {
        await octokit.rest.repos.createFork({
            owner: CONTENT_OWNER,
            repo: CONTENT_REPO,
        });
        // Fork creation is async - wait briefly
        await new Promise((r) => setTimeout(r, 3000));
    }
}
/** Create branch (based on upstream main) */
export async function createBranch(octokit, username, branchName) {
    // Get sha of upstream main
    const { data: ref } = await octokit.rest.git.getRef({
        owner: CONTENT_OWNER,
        repo: CONTENT_REPO,
        ref: 'heads/main',
    });
    const sha = ref.object.sha;
    await octokit.rest.git.createRef({
        owner: username,
        repo: CONTENT_REPO,
        ref: `refs/heads/${branchName}`,
        sha,
    });
}
/** Commit file to fork branch */
export async function pushFile(octokit, username, branchName, filePath, localFilePath, commitMessage) {
    const content = Buffer.from(readFileSync(localFilePath, 'utf-8')).toString('base64');
    // Check existing file sha (for update)
    let sha;
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: username,
            repo: CONTENT_REPO,
            path: filePath,
            ref: branchName,
        });
        if (!Array.isArray(data) && 'sha' in data)
            sha = data.sha;
    }
    catch {
        // New file
    }
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: username,
        repo: CONTENT_REPO,
        path: filePath,
        message: commitMessage,
        content,
        branch: branchName,
        ...(sha ? { sha } : {}),
    });
}
/** Create PR to upstream */
export async function createPR(octokit, username, branchName, title, body) {
    const { data } = await octokit.rest.pulls.create({
        owner: CONTENT_OWNER,
        repo: CONTENT_REPO,
        title,
        body,
        head: `${username}:${branchName}`,
        base: 'main',
    });
    return data.html_url;
}
