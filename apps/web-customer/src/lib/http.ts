import { ApiError, readErrorMessage, readJsonBody, API_BASE } from '@coralyn/data-layer';
import { getAccessToken } from './authToken';

// `ApiError`, la lettura del messaggio d'errore NestJS e la decodifica del body sono IDENTICHE a
// quelle delle altre due app e vengono da @coralyn/data-layer. Resta qui, e solo qui, ciò che
// davvero distingue questo canale: la rotazione silenziosa single-flight del refresh token
// (ADR-0049). Accorpare anche quella sarebbe una falsa fattorizzazione (ADR-0058 §1).
// Chi ha bisogno di `ApiError` lo importa da @coralyn/data-layer come nelle altre due app: questo
// modulo non lo ri-esporta, così esiste UN solo posto da cui viene e nessuno può crederlo locale.

// La store (D-037) registra qui il refresh (evita import circolare store↔http).
interface RefreshHandler { refresh: () => Promise<boolean>; onAuthFailure: () => void; }
let handler: RefreshHandler | null = null;
export function setRefreshHandler(h: RefreshHandler): void { handler = h; }

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${API_BASE}${path}`, {
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
// silenziosa via l'handler registrato dalla store (D-037) e ritenta una sola volta. Il ritorno
// all'attivazione dopo un fallimento terminale NON avviene qui: lo fa CustomerShell osservando
// `authenticated`, cosi' l'interceptor resta ignaro del router.
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
      handler.onAuthFailure();                         // refresh morto → sessione azzerata
    }
  }
  if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));
  return readJsonBody<T>(res);
}
