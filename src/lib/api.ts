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
  category?: string;
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
  category?: string;
}

export interface ProjectIndex {
  projects: ProjectEntry[];
  total: number;
  updatedAt: string;
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenResponse {
  status: 'pending' | 'slow_down' | 'complete';
  token?: string;
  username?: string;
  interval?: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(`${API_BASE}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Device code request failed' }));
    throw new Error((err as { error: string }).error);
  }

  return res.json() as Promise<DeviceCodeResponse>;
}

export async function pollDeviceToken(deviceCode: string): Promise<DeviceTokenResponse> {
  const res = await fetch(`${API_BASE}/auth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Auth failed' }));
    throw new Error((err as { error: string }).error);
  }

  return res.json() as Promise<DeviceTokenResponse>;
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

export interface EditRequest {
  description?: string;
  tags?: string[];
  category?: string;
}

export async function editProject(token: string, slug: string, data: EditRequest): Promise<void> {
  const res = await fetch(`${API_BASE}/publish/${slug}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Edit failed' }));
    throw new Error((err as { error: string }).error);
  }
}

export async function unpublishProject(token: string, slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/publish/${slug}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unpublish failed' }));
    throw new Error((err as { error: string }).error);
  }
}

export async function fetchPmptFile(slug: string): Promise<string> {
  const res = await fetch(`${R2_PUBLIC_URL}/projects/${slug}.pmpt`);

  if (!res.ok) {
    throw new Error(`Project not found: ${slug}`);
  }

  return res.text();
}
