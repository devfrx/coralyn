import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import type { ClienteDTO } from '@driftly/contracts';

const INITIAL_CLIENTI: ClienteDTO[] = [
  { id: 'c-1', nome: 'Mario', cognome: 'Rossi', telefono: '+39 333 1111111', email: 'mario.rossi@email.it', note: '' },
];
let clienti: ClienteDTO[] = [...INITIAL_CLIENTI];
export function resetClientiSeed() { clienti = [...INITIAL_CLIENTI]; }

export const server = setupServer(
  ...handlers,
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
