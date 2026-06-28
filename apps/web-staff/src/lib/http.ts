const BASE = '/api';

export interface ApiOptions extends RequestInit {
  tenantId: string;
}

export async function apiFetch<T>(path: string, { tenantId, headers, ...init }: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Stabilimento-Id': tenantId, ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
  return (await res.json()) as T;
}
