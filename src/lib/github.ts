import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';

const CONTENT_OWNER = 'promptwiki';
const CONTENT_REPO = 'content';

export function createClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

export async function getAuthUser(octokit: Octokit): Promise<string> {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

/** fork가 없으면 생성, 있으면 그대로 반환 */
export async function ensureFork(octokit: Octokit, username: string): Promise<void> {
  try {
    await octokit.rest.repos.get({ owner: username, repo: CONTENT_REPO });
  } catch {
    await octokit.rest.repos.createFork({
      owner: CONTENT_OWNER,
      repo: CONTENT_REPO,
    });
    // fork 생성은 비동기 - 잠시 대기
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** 브랜치 생성 (upstream main 기준) */
export async function createBranch(
  octokit: Octokit,
  username: string,
  branchName: string
): Promise<void> {
  // upstream main의 sha 가져오기
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

/** 파일을 fork의 브랜치에 커밋 */
export async function pushFile(
  octokit: Octokit,
  username: string,
  branchName: string,
  filePath: string,
  localFilePath: string,
  commitMessage: string
): Promise<void> {
  const content = Buffer.from(readFileSync(localFilePath, 'utf-8')).toString('base64');

  // 기존 파일 sha 확인 (update용)
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: username,
      repo: CONTENT_REPO,
      path: filePath,
      ref: branchName,
    });
    if (!Array.isArray(data) && 'sha' in data) sha = data.sha;
  } catch {
    // 신규 파일
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

/** upstream으로 PR 생성 */
export async function createPR(
  octokit: Octokit,
  username: string,
  branchName: string,
  title: string,
  body: string
): Promise<string> {
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
