/** Il backend monta tutto sotto `/api` (ADR-0022) e tutte e tre le app FE lo chiamano da lì:
 *  in dev via proxy Vite, in produzione direttamente. Non è parametrico perché non varia. */
export const API_BASE = '/api';

/** Errore HTTP con lo status, così i chiamanti possono reagire (es. 401 → logout).
 *  `message` è quello del server quando il body NestJS lo fornisce, altrimenti il sintetico.
 *
 *  ⚠️ Questa classe è UNA SOLA per tutto il monorepo, e il motivo è `instanceof`: finché ogni app
 *  dichiarava la sua, un `error instanceof ApiError` non poteva attraversare il confine fra app e
 *  modulo condiviso — ed è esattamente ciò che impediva a `handleUnauthorized` di essere condiviso
 *  (ADR-0058 §1). Chi ha bisogno di un ApiError lo importa da qui: non ridichiararlo. */
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
export async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const { message } = JSON.parse(await res.text()) as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  } catch {
    /* fallback sintetico */
  }
  return undefined;
}

/** NestJS serializza un ritorno `null` come body VUOTO (non il literal JSON "null"), es.
 *  GET /renewal-campaigns senza campagna aperta. `res.json()` lancerebbe su un body vuoto:
 *  trattiamo 204/no-content e body-testo-vuoto come `null` tipizzato T. */
export async function readJsonBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;
  const text = await res.text();
  return text.length === 0 ? (null as T) : (JSON.parse(text) as T);
}

export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * `apiFetch` per le app a **sessione semplice** (`web-staff`, `web-platform`): allega il Bearer e
 * basta. Il tenant non viaggia in un header, è dedotto dal JWT lato backend (ADR-0026).
 *
 * `web-customer` NON usa questa factory: il suo canale ha refresh token con rotazione silenziosa
 * single-flight (ADR-0049), che è logica diversa e non duplicata. Compone il proprio `apiFetch`
 * riusando `ApiError`, `readErrorMessage` e `readJsonBody`, che sono invece identici — è il confine
 * di fattorizzazione dichiarato in ADR-0058 §1.
 *
 * `getToken` è invocato **a ogni chiamata**, non alla creazione: catturarne il valore una volta
 * sola lascerebbe l'app con il token che c'era all'avvio, cioè `null` fino al primo login.
 */
export function createApiFetch(getToken: () => string | null): ApiFetch {
  return async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));
    return readJsonBody<T>(res);
  };
}
