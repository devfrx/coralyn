import { http, HttpResponse } from 'msw';
import { Role, type PlatformEstablishmentDTO, type UserDTO } from '@coralyn/contracts';

export const MOCK_TOKEN = 'valid-super-token';
export const MOCK_SUPERUSER: UserDTO = { id: 'su-1', email: 'super@coralyn.test', role: Role.Superuser, establishmentId: null, establishmentName: null };

function baseDto(over: Partial<PlatformEstablishmentDTO> & { id: string; name: string }): PlatformEstablishmentDTO {
  return {
    createdAt: '2026-01-01T00:00:00.000Z', suspendedAt: null,
    sectors: 0, rows: 0, umbrellas: 0, staffUsersActive: 1, lastActivityAt: null,
    revenueSeasonTotal: 0, activeSubscriptions: 0, bookingsThisSeason: 0, occupancyPctToday: 0,
    ...over,
  };
}

let seed: PlatformEstablishmentDTO[] = [];
export function resetPlatformSeed(): void {
  seed = [
    baseDto({ id: 'e-1', name: 'Lido Alpha', umbrellas: 40, revenueSeasonTotal: 12000, occupancyPctToday: 55, staffUsersActive: 3 }),
    baseDto({ id: 'e-2', name: 'Lido Beta (sospeso)', suspendedAt: '2026-06-01T00:00:00.000Z', umbrellas: 10 }),
  ];
}
resetPlatformSeed();

export const handlers = [
  http.post('/api/auth/login', () => HttpResponse.json({ accessToken: MOCK_TOKEN, user: MOCK_SUPERUSER })),
  http.get('/api/auth/me', () => HttpResponse.json(MOCK_SUPERUSER)),

  http.get('/api/platform/establishments', () => HttpResponse.json(seed)),
  http.get('/api/platform/establishments/:id', ({ params }) => {
    const found = seed.find((e) => e.id === params.id);
    return found ? HttpResponse.json(found) : new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/platform/establishments', async ({ request }) => {
    const body = (await request.json()) as { name: string; adminEmail: string };
    const dto = baseDto({ id: `e-${seed.length + 1}`, name: body.name });
    seed.push(dto);
    return HttpResponse.json({ establishment: dto, adminEmail: body.adminEmail, expiresAt: '2026-07-08T10:00:00.000Z' }, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/reset-admin-password', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ adminEmail: 'admin@lido.test', expiresAt: '2026-07-08T10:00:00.000Z' }, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/suspend', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    e.suspendedAt = '2026-07-05T00:00:00.000Z';
    return HttpResponse.json(e, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/reactivate', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    e.suspendedAt = null;
    return HttpResponse.json(e, { status: 201 });
  }),
];
