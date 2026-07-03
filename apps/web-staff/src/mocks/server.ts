import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import { mapSeed, timeSlotsSeed } from './data/seed';
import { Role, type CustomerDTO, type EquipmentTypeDTO, type PackageDTO, type RateDTO, type RenewalCampaignDetailDTO, type SeasonDTO, type TimeSlotDTO, type CreateTimeSlotInput, type UpdateTimeSlotInput, type UserDTO } from '@coralyn/contracts';

const INITIAL_CUSTOMERS: CustomerDTO[] = [
  { id: 'c-1', firstName: 'Mario', lastName: 'Rossi', phone: '+39 333 1111111', email: 'mario.rossi@email.it', notes: '' },
];
let customers: CustomerDTO[] = [...INITIAL_CUSTOMERS];
export function resetCustomersSeed() { customers = [...INITIAL_CUSTOMERS]; }

// --- Listino (D-032): stato mutabile in-memory per i test dell'editor ---
const SEASON_1: SeasonDTO = { id: 'se-1', name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' };
const SEASON_2: SeasonDTO = { id: 'se-2', name: 'Estate 2027', startDate: '2027-05-01', endDate: '2027-09-30' };
let seasons: SeasonDTO[] = [SEASON_1, SEASON_2];
let packages: PackageDTO[] = [{ id: 'pkg-1', name: 'Standard', equipment: [{ equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 }] }];
let rates: RateDTO[] = [{ id: 'ra-1', seasonId: 'se-1', price: 28 }];
let timeSlots: TimeSlotDTO[] = timeSlotsSeed.map((s) => ({ ...s }));
let equipmentTypes: EquipmentTypeDTO[] = [{ id: 'eq-1', name: 'Lettino' }, { id: 'eq-2', name: 'Sdraio' }];
// Risolve { equipmentTypeId, quantity }[] in PackageEquipmentDTO[] cercando il nome nel catalogo
// (mirror del comportamento backend: il nome viene sempre risolto lato server, non inviato dal FE).
function resolveEquipment(equipment: { equipmentTypeId: string; quantity: number }[]) {
  return equipment
    .map((e) => ({
      equipmentTypeId: e.equipmentTypeId,
      name: equipmentTypes.find((t) => t.id === e.equipmentTypeId)?.name ?? e.equipmentTypeId,
      quantity: e.quantity,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function resetPricingSeed() {
  seasons = [SEASON_1, SEASON_2];
  packages = [{ id: 'pkg-1', name: 'Standard', equipment: [{ equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 }] }];
  rates = [{ id: 'ra-1', seasonId: 'se-1', price: 28 }];
  timeSlots = timeSlotsSeed.map((s) => ({ ...s }));
  equipmentTypes = [{ id: 'eq-1', name: 'Lettino' }, { id: 'eq-2', name: 'Sdraio' }];
}

// --- Prelazione (D-011): stato campagna in-memory per i test ---
let campaign: RenewalCampaignDetailDTO | null = null;
export function resetCampaignSeed() { campaign = null; }

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
  // Seasons
  http.get('/api/seasons', () => HttpResponse.json(seasons)),
  http.post('/api/seasons', async ({ request }) => {
    const b = (await request.json()) as Omit<SeasonDTO, 'id'>;
    const created: SeasonDTO = { id: `se-${seasons.length + 1}`, ...b };
    seasons.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete('/api/seasons/:id', ({ params }) => {
    const i = seasons.findIndex((s) => s.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = seasons.splice(i, 1);
    rates = rates.filter((r) => r.seasonId !== removed.id);
    return HttpResponse.json(removed);
  }),
  // Packages (CRUD)
  http.get('/api/packages', ({ request }) => {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    return HttpResponse.json(includeArchived ? packages : packages.filter((p) => !p.archived));
  }),
  http.post('/api/packages', async ({ request }) => {
    const b = (await request.json()) as { name: string; equipment: { equipmentTypeId: string; quantity: number }[] };
    const created: PackageDTO = { id: `pkg-${packages.length + 1}`, name: b.name, equipment: resolveEquipment(b.equipment) };
    packages.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/packages/:id', async ({ params, request }) => {
    const patch = (await request.json()) as { name?: string; equipment?: { equipmentTypeId: string; quantity: number }[] };
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    packages[i] = {
      ...packages[i],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.equipment !== undefined ? { equipment: resolveEquipment(patch.equipment) } : {}),
    };
    return HttpResponse.json(packages[i]);
  }),
  http.delete('/api/packages/:id', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = packages.splice(i, 1);
    return HttpResponse.json(removed);
  }),
  http.post('/api/packages/:id/archive', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    packages[i] = { ...packages[i], archived: true };
    return HttpResponse.json(packages[i]);
  }),
  http.post('/api/packages/:id/restore', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const { archived: _drop, ...rest } = packages[i];
    packages[i] = rest;
    return HttpResponse.json(packages[i]);
  }),
  // Equipment types / catalogo dotazione (CRUD)
  http.get('/api/equipment-types', ({ request }) => {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    return HttpResponse.json(includeArchived ? equipmentTypes : equipmentTypes.filter((t) => !t.archived));
  }),
  http.post('/api/equipment-types', async ({ request }) => {
    const b = (await request.json()) as { name: string };
    const created: EquipmentTypeDTO = { id: `eq-${equipmentTypes.length + 1}`, name: b.name };
    equipmentTypes.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/equipment-types/:id', async ({ params, request }) => {
    const patch = (await request.json()) as { name?: string };
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    equipmentTypes[i] = { ...equipmentTypes[i], ...patch };
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.post('/api/equipment-types/:id/archive', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    equipmentTypes[i] = { ...equipmentTypes[i], archived: true };
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.post('/api/equipment-types/:id/restore', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const { archived: _d, ...rest } = equipmentTypes[i];
    equipmentTypes[i] = rest;
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.delete('/api/equipment-types/:id', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = equipmentTypes.splice(i, 1);
    return HttpResponse.json(removed);
  }),
  // Rates (CRUD, filtrate per stagione)
  http.get('/api/rates', ({ request }) => {
    const seasonId = new URL(request.url).searchParams.get('seasonId') ?? '';
    return HttpResponse.json(rates.filter((r) => r.seasonId === seasonId));
  }),
  http.post('/api/rates', async ({ request }) => {
    const b = (await request.json()) as Omit<RateDTO, 'id'>;
    const created: RateDTO = { id: `ra-${rates.length + 1}`, ...b };
    rates.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/rates/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<RateDTO>;
    const i = rates.findIndex((r) => r.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    rates[i] = { ...rates[i], ...patch };
    return HttpResponse.json(rates[i]);
  }),
  http.delete('/api/rates/:id', ({ params }) => {
    const i = rates.findIndex((r) => r.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = rates.splice(i, 1);
    return HttpResponse.json(removed);
  }),
  // Time slots / fasce (CRUD)
  http.get('/api/time-slots', () => HttpResponse.json(timeSlots)),
  http.post('/api/time-slots', async ({ request }) => {
    const b = (await request.json()) as CreateTimeSlotInput;
    const created: TimeSlotDTO = { id: `ts-${timeSlots.length + 1}`, sortOrder: timeSlots.length + 1, ...b };
    timeSlots.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/time-slots/:id', async ({ params, request }) => {
    const patch = (await request.json()) as UpdateTimeSlotInput;
    const i = timeSlots.findIndex((s) => s.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    timeSlots[i] = { ...timeSlots[i], ...patch };
    return HttpResponse.json(timeSlots[i]);
  }),
  http.delete('/api/time-slots/:id', ({ params }) => {
    const i = timeSlots.findIndex((s) => s.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    // simula la delete-guard: 'f-pom' è "in uso" per testare il 409 → toast
    if (params.id === 'f-pom') {
      return HttpResponse.json({ message: 'Fascia in uso da tariffe o prenotazioni: non eliminabile.' }, { status: 409 });
    }
    const [removed] = timeSlots.splice(i, 1);
    return HttpResponse.json(removed);
  }),
  http.get('/api/bookings', () => HttpResponse.json([])),
  http.get('/api/bookings/subscriptions', ({ request }) => {
    const seasonId = new URL(request.url).searchParams.get('seasonId') ?? '';
    if (seasonId === 'se-2') {
      return HttpResponse.json([
        { id: 'sub-2027', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', totalPrice: 850, seniority: 2, renewed: false },
      ]);
    }
    return HttpResponse.json([
      { id: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, seniority: 1, renewed: false },
    ]);
  }),
  http.post('/api/bookings/:id/renew', async ({ params }) => {
    return HttpResponse.json(
      { id: 'bk-renew', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', type: 'subscription', status: 'confirmed', totalPrice: 850, paymentStatus: 'unpaid', amountCollected: 0, previousBookingId: params.id as string },
      { status: 201 },
    );
  }),
  // Prelazione (D-011)
  http.get('/api/renewal-campaigns', ({ request }) => {
    const dest = new URL(request.url).searchParams.get('destinationSeasonId') ?? '';
    return HttpResponse.json(campaign && dest === 'se-2' ? campaign : null);
  }),
  http.post('/api/renewal-campaigns', async ({ request }) => {
    const b = (await request.json()) as { originSeasonId: string; destinationSeasonId: string; deadline: string };
    campaign = {
      id: 'camp-1', originSeasonId: b.originSeasonId, destinationSeasonId: b.destinationSeasonId, deadline: b.deadline,
      windows: [
        { sourceBookingId: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 1, state: 'open' },
      ],
    };
    return HttpResponse.json({ id: campaign.id, originSeasonId: campaign.originSeasonId, destinationSeasonId: campaign.destinationSeasonId, deadline: campaign.deadline }, { status: 201 });
  }),
  http.delete('/api/renewal-campaigns/:id', () => { campaign = null; return HttpResponse.json({ ok: true }); }),
  http.get('/api/bookings/quote', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const seasonId = 'se-1';
    if (p.get('type') === 'subscription')
      return HttpResponse.json({ totalPrice: 800, matchedRate: { id: 'ra-sub', seasonId, price: 800, type: 'subscription' } });
    const pkg = p.get('packageId');
    if (pkg)
      return HttpResponse.json({ totalPrice: 35, matchedRate: { id: 'ra-pkg', seasonId, price: 35, packageId: pkg } });
    return HttpResponse.json({ totalPrice: 28, matchedRate: { id: 'ra-1', seasonId, price: 28 } }); // catch-all
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
