import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import { mapSeed } from './data/seed';
import { Role, type CustomerDTO, type UserDTO } from '@coralyn/contracts';

const INITIAL_CUSTOMERS: CustomerDTO[] = [
  { id: 'c-1', firstName: 'Mario', lastName: 'Rossi', phone: '+39 333 1111111', email: 'mario.rossi@email.it', notes: '' },
];
let customers: CustomerDTO[] = [...INITIAL_CUSTOMERS];
export function resetCustomersSeed() { customers = [...INITIAL_CUSTOMERS]; }

// Auth mockata SOLO per i test (in dev il login colpisce il backend reale).
export const MOCK_TOKEN = 'valid-token';
export const MOCK_ADMIN: UserDTO = {
  id: 'u-1',
  email: 'admin@coralyn.dev',
  role: Role.Admin,
  establishmentId: '00000000-0000-0000-0000-000000000001',
};

export const server = setupServer(
  ...handlers,
  // Mock della mappa SOLO nei test (in dev il FE usa il backend reale). Fixture = mapSeed.
  http.get('/api/map', () => HttpResponse.json(mapSeed)),
  http.post('/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (email === MOCK_ADMIN.email && password === 'coralyn-admin') {
      return HttpResponse.json({ accessToken: MOCK_TOKEN, user: MOCK_ADMIN });
    }
    return HttpResponse.json({ message: 'Credenziali non valide' }, { status: 401 });
  }),
  http.get('/api/auth/me', ({ request }) => {
    if (request.headers.get('Authorization') === `Bearer ${MOCK_TOKEN}`) {
      return HttpResponse.json(MOCK_ADMIN);
    }
    return new HttpResponse(null, { status: 401 });
  }),
  http.get('/api/customers', () => HttpResponse.json(customers)),
  http.get('/api/customers/:id', ({ params }) => {
    const c = customers.find((x) => x.id === params.id);
    return c ? HttpResponse.json(c) : new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/customers', async ({ request }) => {
    const body = (await request.json()) as Omit<CustomerDTO, 'id'>;
    const created: CustomerDTO = { id: `c-${customers.length + 1}`, ...body };
    customers.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/customers/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<CustomerDTO>;
    const i = customers.findIndex((x) => x.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    customers[i] = { ...customers[i], ...patch };
    return HttpResponse.json(customers[i]);
  }),
  http.get('/api/packages', () =>
    HttpResponse.json([{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }]),
  ),
  http.get('/api/bookings', () => HttpResponse.json([])),
  http.get('/api/bookings/quote', ({ request }) => {
    const p = new URL(request.url).searchParams;
    if (p.get('type') === 'subscription') return HttpResponse.json({ totalPrice: 800 });
    return HttpResponse.json({ totalPrice: p.has('packageId') ? 35 : 28 });
  }),
  http.post('/api/bookings', async ({ request }) => {
    const b = (await request.json()) as { customerId: string; umbrellaId: string; timeSlotId: string; type: string; startDate: string; endDate?: string; packageId?: string };
    return HttpResponse.json(
      { id: 'bk-1', customerId: b.customerId, umbrellaId: b.umbrellaId, timeSlotId: b.timeSlotId, startDate: b.startDate, endDate: b.endDate ?? b.startDate, type: b.type, status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0, packageId: b.packageId },
      { status: 201 },
    );
  }),
  http.delete('/api/bookings/:id', () => new HttpResponse(null, { status: 200 })),
  http.patch('/api/bookings/:id/payment', async ({ params, request }) => {
    const b = (await request.json()) as { amountCollected: number; paymentMethod?: string; collectionDate?: string };
    const paid = b.amountCollected > 0;
    return HttpResponse.json(
      {
        id: params.id, customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
        startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
        totalPrice: b.amountCollected, paymentStatus: paid ? 'paid' : 'unpaid', amountCollected: b.amountCollected,
        paymentMethod: paid ? (b.paymentMethod ?? 'cash') : undefined,
        collectionDate: paid ? (b.collectionDate ?? '2026-07-15') : undefined,
      },
      { status: 200 },
    );
  }),
);
