import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import { Ruolo, type ClienteDTO, type UtenteDTO } from '@driftly/contracts';

const INITIAL_CLIENTI: ClienteDTO[] = [
  { id: 'c-1', nome: 'Mario', cognome: 'Rossi', telefono: '+39 333 1111111', email: 'mario.rossi@email.it', note: '' },
];
let clienti: ClienteDTO[] = [...INITIAL_CLIENTI];
export function resetClientiSeed() { clienti = [...INITIAL_CLIENTI]; }

// Auth mockata SOLO per i test (in dev il login colpisce il backend reale).
export const MOCK_TOKEN = 'valid-token';
export const MOCK_ADMIN: UtenteDTO = {
  id: 'u-1',
  email: 'admin@driftly.dev',
  ruolo: Ruolo.Admin,
  stabilimentoId: '00000000-0000-0000-0000-000000000001',
};

export const server = setupServer(
  ...handlers,
  http.post('/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (email === MOCK_ADMIN.email && password === 'driftly-admin') {
      return HttpResponse.json({ accessToken: MOCK_TOKEN, utente: MOCK_ADMIN });
    }
    return HttpResponse.json({ message: 'Credenziali non valide' }, { status: 401 });
  }),
  http.get('/api/auth/me', ({ request }) => {
    if (request.headers.get('Authorization') === `Bearer ${MOCK_TOKEN}`) {
      return HttpResponse.json(MOCK_ADMIN);
    }
    return new HttpResponse(null, { status: 401 });
  }),
  http.get('/api/clienti', () => HttpResponse.json(clienti)),
  http.get('/api/clienti/:id', ({ params }) => {
    const c = clienti.find((x) => x.id === params.id);
    return c ? HttpResponse.json(c) : new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/clienti', async ({ request }) => {
    const body = (await request.json()) as Omit<ClienteDTO, 'id'>;
    const nuovo: ClienteDTO = { id: `c-${clienti.length + 1}`, ...body };
    clienti.push(nuovo);
    return HttpResponse.json(nuovo, { status: 201 });
  }),
  http.patch('/api/clienti/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<ClienteDTO>;
    const i = clienti.findIndex((x) => x.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    clienti[i] = { ...clienti[i], ...patch };
    return HttpResponse.json(clienti[i]);
  }),
);
