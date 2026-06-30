import { getToken } from './authToken';

const BASE = '/api';

/** Errore HTTP con lo status, così i chiamanti possono reagire (es. 401 → logout). */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`HTTP ${status} su ${path}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Il tenant non viaggia più in un header: è dedotto dal JWT lato backend (ADR-0026).
// apiFetch allega il Bearer dal token di sessione (se presente).
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}
