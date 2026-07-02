import { getToken } from './authToken';

const BASE = '/api';

/** Errore HTTP con lo status, così i chiamanti possono reagire (es. 401 → logout).
 *  `message` è quello del server quando il body NestJS lo fornisce, altrimenti il sintetico. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string, serverMessage?: string) {
    super(serverMessage || `HTTP ${status} su ${path}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Estrae `message` dal body d'errore NestJS ({statusCode, message, error}); string[] → join.
 *  Body vuoto/non-JSON (proxy, 502…) → undefined, il chiamante usa il fallback sintetico. */
async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const { message } = JSON.parse(await res.text()) as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  } catch {
    /* fallback sintetico */
  }
  return undefined;
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
  if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));
  // NestJS serializza un ritorno `null` come body VUOTO (non il literal JSON "null"), es.
  // GET /renewal-campaigns senza campagna aperta. res.json() lancerebbe su un body vuoto:
  // trattiamo 204/no-content e body-testo-vuoto come `null` tipizzato T.
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (text.length === 0) return null as T;
  return JSON.parse(text) as T;
}
