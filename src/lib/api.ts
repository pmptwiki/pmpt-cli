/**
 * pmptwiki API client
 */

const API_BASE = 'https://pmptwiki-api.sin2da.workers.dev';
const R2_PUBLIC_URL = 'https://pub-ce73b2410943490d80b60ddad9243d31.r2.dev';

export interface PublishRequest {
  slug: string;
  pmptContent: string;
  description: string;
  tags: string[];
}

export interface PublishResponse {
  success: boolean;
  slug: string;
  url: string;
  downloadUrl: string;
}

export interface ProjectEntry {
  slug: string;
  projectName: string;
  description: string;
  author: string;
  tags: string[];
  versionCount: number;
  fileSize: number;
  createdAt: string;
  publishedAt: string;
  downloadUrl: string;
}

export interface ProjectIndex {
  projects: ProjectEntry[];
  total: number;
  updatedAt: string;
}

export async function registerAuth(githubToken: string): Promise<{ token: string; username: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Auth failed' }));
    throw new Error((err as { error: string }).error);
  }

  return res.json() as Promise<{ token: string; username: string }>;
}

export async function publishProject(token: string, data: PublishRequest): Promise<PublishResponse> {
  const res = await fetch(`${API_BASE}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Publish failed' }));
    throw new Error((err as { error: string }).error);
  }

  return res.json() as Promise<PublishResponse>;
}

export async function fetchProjects(): Promise<ProjectIndex> {
  const res = await fetch(`${API_BASE}/projects`);

  if (!res.ok) {
    throw new Error('Failed to fetch projects');
  }

  return res.json() as Promise<ProjectIndex>;
}

export async function fetchPmptFile(slug: string): Promise<string> {
  const res = await fetch(`${R2_PUBLIC_URL}/projects/${slug}.pmpt`);

  if (!res.ok) {
    throw new Error(`Project not found: ${slug}`);
  }

  return res.text();
}
