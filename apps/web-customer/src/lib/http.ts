import { getAccessToken } from './authToken';

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

// La store (D-037) registra qui il refresh (evita import circolare store↔http).
interface RefreshHandler { refresh: () => Promise<boolean>; onAuthFailure: () => void; }
let handler: RefreshHandler | null = null;
export function setRefreshHandler(h: RefreshHandler): void { handler = h; }

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

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

// Il tenant non viaggia più in un header: è dedotto dal JWT lato backend (ADR-0026).
// apiFetch allega il Bearer dal token di sessione (se presente); su 401 innesca UNA rotazione
// silenziosa via l'handler registrato dalla store (D-037) e ritenta una sola volta.
// `retryOn401: false` (default true) esclude questa logica: usato dalle chiamate pubbliche/che
// GESTISCONO i token stessi (/customer/refresh, /customer/activate) — un 401 lì è terminale e NON
// deve rientrare nell'interceptor, altrimenti un refresh-token scaduto/revocato causa una
// ricorsione infinita (refresh() → apiFetch('/customer/refresh') → 401 → refresh() → ...).
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: { retryOn401?: boolean } = {},
): Promise<T> {
  const { retryOn401 = true } = opts;
  let res = await rawFetch(path, init);
  if (res.status === 401 && handler && retryOn401) {
    const ok = await handler.refresh();               // rotazione silenziosa (una volta)
    if (ok) {
      res = await rawFetch(path, init);                // ritenta con il nuovo access token
      // Il refresh è riuscito ma il retry è COMUNQUE 401 (es. token revocato tra refresh e
      // retry): non c'è recupero possibile, l'utente resta altrimenti "appeso". Logout esplicito.
      if (res.status === 401) handler.onAuthFailure();
    } else {
      handler.onAuthFailure();                         // refresh morto → logout + redirect attivazione
    }
  }
  if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));
  // NestJS serializza un ritorno `null` come body VUOTO (non il literal JSON "null").
  // res.json() lancerebbe su un body vuoto: trattiamo 204/no-content e body-testo-vuoto come `null`.
  if (res.status === 204) return null as T;
  const text = await res.text();
  return text.length === 0 ? (null as T) : (JSON.parse(text) as T);
}
