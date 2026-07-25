import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiFetch, readJsonBody, ApiError } from './http';

let token: string | null = null;
const apiFetch = createApiFetch(() => token);

afterEach(() => {
  vi.restoreAllMocks();
  token = null;
});

describe('createApiFetch', () => {
  it('aggiunge Authorization: Bearer dal token (e non X-Stabilimento-Id)', async () => {
    token = 'jwt-abc';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await apiFetch<{ ok: boolean }>('/clienti');
    expect(data).toEqual({ ok: true });
    const [, init] = spy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-abc');
    expect(headers.get('X-Stabilimento-Id')).toBeNull();
  });

  it('senza token non invia Authorization', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await apiFetch('/clienti');
    const [, init] = spy.mock.calls[0];
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
  });

  // Il getter è invocato a OGNI chiamata, non catturato alla creazione: la factory è costruita
  // all'import del modulo, cioè prima di qualunque login. Risolvere il token una volta sola
  // lascerebbe l'app a mandare `null` per sempre, e nessuno degli altri test se ne accorgerebbe
  // perché tutti impostano il token prima della prima chiamata.
  it('rilegge il token a OGNI chiamata, non alla creazione della factory', async () => {
    // `mockImplementation`, non `mockResolvedValue`: il body di una Response si legge UNA volta
    // sola, e riusare lo stesso oggetto fa fallire la seconda chiamata per il motivo sbagliato.
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    await apiFetch('/prima');                       // token ancora null: nessun login
    token = 'jwt-dopo-il-login';
    await apiFetch('/seconda');
    expect(new Headers(spy.mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
    expect(new Headers(spy.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer jwt-dopo-il-login');
  });

  it('lancia un ApiError con lo status su risposta non ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 401 }));
    await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 401 });
  });

  it('risolve a null su body vuoto 200 (es. GET /renewal-campaigns senza campagna)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await expect(apiFetch('/renewal-campaigns?destinationDate=2027-05-01')).resolves.toBeNull();
  });

  it('risolve a null su risposta 204 No Content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/qualcosa')).resolves.toBeNull();
  });

  it('continua a parsare un body JSON normale', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'camp-1' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(apiFetch('/renewal-campaigns?destinationDate=2027-05-01')).resolves.toEqual({ id: 'camp-1' });
  });

  it("l'ApiError porta il messaggio del body d'errore NestJS", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.', error: 'Conflict' }), { status: 409 }),
    );
    await expect(apiFetch('/packages/p1')).rejects.toMatchObject({
      status: 409,
      message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.',
    });
  });

  it('message array (class-validator) → messaggi uniti e leggibili', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 400, message: ['seasonId must be a UUID', 'price must not be less than 0'], error: 'Bad Request' }), { status: 400 }),
    );
    await expect(apiFetch('/rates')).rejects.toMatchObject({
      status: 400,
      message: 'seasonId must be a UUID; price must not be less than 0',
    });
  });

  it("body d'errore non-JSON → fallback al messaggio sintetico", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 502, message: 'HTTP 502 su /clienti' });
  });

  it("body d'errore vuoto → fallback al messaggio sintetico", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 500, message: 'HTTP 500 su /clienti' });
  });
});

// `readJsonBody` è esportato perche' web-customer compone il proprio apiFetch (refresh
// single-flight, ADR-0049) riusando questa decodifica: va vincolato anche fuori da createApiFetch,
// altrimenti la sola app che lo chiama direttamente e' quella che nessun test qui copre.
describe('readJsonBody', () => {
  it('204 → null senza toccare il body', async () => {
    await expect(readJsonBody(new Response(null, { status: 204 }))).resolves.toBeNull();
  });

  it('body testuale vuoto → null (NestJS serializza `null` come body VUOTO)', async () => {
    await expect(readJsonBody(new Response('', { status: 200 }))).resolves.toBeNull();
  });

  it('body JSON → oggetto tipizzato', async () => {
    await expect(readJsonBody<{ a: number }>(new Response('{"a":1}', { status: 200 }))).resolves.toEqual({ a: 1 });
  });
});

describe('ApiError', () => {
  it('senza messaggio dal server usa il sintetico e conserva lo status', () => {
    const e = new ApiError(503, '/health');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(503);
    expect(e.message).toBe('HTTP 503 su /health');
  });
});
