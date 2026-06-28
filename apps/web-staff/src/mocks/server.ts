import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import type { ClienteDTO } from '@driftly/contracts';

const INITIAL_CLIENTI: ClienteDTO[] = [{ id: 'c-1', nome: 'Mario', cognome: 'Rossi' }];
let clienti: ClienteDTO[] = [...INITIAL_CLIENTI];
export function resetClientiSeed() { clienti = [...INITIAL_CLIENTI]; }

export const server = setupServer(
  ...handlers,
  http.get('/api/clienti', () => HttpResponse.json(clienti)),
  http.post('/api/clienti', async ({ request }) => {
    const body = (await request.json()) as { nome: string; cognome: string };
    const nuovo: ClienteDTO = { id: `c-${clienti.length + 1}`, ...body };
    clienti.push(nuovo);
    return HttpResponse.json(nuovo, { status: 201 });
  }),
);
