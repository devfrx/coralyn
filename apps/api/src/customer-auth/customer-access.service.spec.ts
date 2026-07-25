import { NotFoundException } from '@nestjs/common';
import { CustomerAccessService } from './customer-access.service';
import { fakeTenantPrisma, fakeTenantContext, TEST_TENANT } from '../test/tenant-prisma';

/**
 * `CustomerAccessService` (91 LOC) non aveva alcuno spec unit, e la sua invariante più costosa non
 * era verificata da nessun livello (AUD-024 / P6-002): **revocare l'accesso deve spegnere le
 * sessioni VIVE**, non solo l'enrollment.
 *
 * Misurato prima di scrivere questo file: cancellando le due `tx.customerSession.updateMany` di
 * `provisionAccess` e `revokeAccess`, la e2e `customer-access` resta **20/20 verde** — perché
 * guarda solo `customerEnrollmentToken`, e `accessStatus` calcola lo stato dall'ultimo enrollment.
 * L'operatore vede «revocato» mentre il cliente continua a usare access+refresh **fino a 120
 * giorni** (`CUSTOMER_REFRESH_TTL_DAYS`).
 */
type Riga = { id: string; customerId: string; revokedAt: Date | null; [k: string]: unknown };

function makePrisma(bookings: Array<{ id: string; customerId: string }> = [{ id: 'b-1', customerId: 'c-1' }]) {
  const enrollments: Riga[] = [];
  const sessions: Riga[] = [];

  // `updateMany` che rispetta il predicato invece di limitarsi ad accettarlo: senza, il fake
  // direbbe «fatto» anche a una query che non matcha nulla (radice R2 dell'audit).
  const updateMany = (store: Riga[]) => jest.fn(({ where, data }: any) => {
    const match = store.filter(
      (r) => r.customerId === where.customerId && (where.revokedAt === null ? r.revokedAt === null : true),
    );
    match.forEach((r) => Object.assign(r, data));
    return Promise.resolve({ count: match.length });
  });

  const tx = {
    booking: { findFirst: jest.fn(({ where }: any) => Promise.resolve(bookings.find((b) => b.id === where.id) ?? null)) },
    customerEnrollmentToken: {
      updateMany: updateMany(enrollments),
      create: jest.fn(({ data }: any) => {
        const row = { id: `e${enrollments.length + 1}`, revokedAt: null, activatedAt: null, createdAt: new Date(), ...data };
        enrollments.push(row);
        return Promise.resolve(row);
      }),
    },
    customerSession: { updateMany: updateMany(sessions) },
  };

  const prisma = {
    ...fakeTenantPrisma(tx),
    $transaction: (fn: any) => fn(tx),
    customerEnrollmentToken: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          [...enrollments].reverse().find((e) => e.customerId === where.customerId) ?? null,
        ),
      ),
    },
  } as any;

  return { prisma, tx, enrollments, sessions };
}

const hasher = { hash: (p: string) => Promise.resolve(`hash(${p})`), verify: () => Promise.resolve(true) } as any;
const config = { get: (k: string) => (k === 'CUSTOMER_APP_URL' ? 'https://app.coralyn.test' : '2160') } as any;

function makeService(over: Partial<{ bookings: Array<{ id: string; customerId: string }> }> = {}) {
  const { prisma, tx, enrollments, sessions } = makePrisma(over.bookings);
  const service = new CustomerAccessService(prisma, fakeTenantContext() as any, hasher, config);
  return { service, prisma, tx, enrollments, sessions };
}

/** Una sessione viva del cliente `customerId`, cioè lo stato che i test precedenti non avevano. */
function sessioneViva(sessions: Riga[], customerId: string, id = 's-viva') {
  sessions.push({ id, customerId, revokedAt: null });
  return sessions[sessions.length - 1];
}

describe('CustomerAccessService.revokeAccess', () => {
  it('revoca l’enrollment E le sessioni vive del cliente', async () => {
    const { service, enrollments, sessions } = makeService();
    enrollments.push({ id: 'e-1', customerId: 'c-1', revokedAt: null });
    const viva = sessioneViva(sessions, 'c-1');

    await service.revokeAccess('b-1');

    expect(enrollments[0].revokedAt).not.toBeNull();
    expect(viva.revokedAt).not.toBeNull();
  });

  it('non tocca le sessioni di un ALTRO cliente', async () => {
    // L'altro verso: una revoca che spegne tutto supererebbe comunque il test sopra.
    const { service, sessions } = makeService();
    const mia = sessioneViva(sessions, 'c-1', 's-mia');
    const altrui = sessioneViva(sessions, 'c-2', 's-altrui');

    await service.revokeAccess('b-1');

    expect(mia.revokedAt).not.toBeNull();
    expect(altrui.revokedAt).toBeNull();
  });

  it('non ri-revoca una sessione già revocata (il predicato revokedAt:null è vincolato)', async () => {
    const { service, sessions } = makeService();
    const gia = { id: 's-gia', customerId: 'c-1', revokedAt: new Date('2026-01-01T00:00:00Z') };
    sessions.push(gia);

    await service.revokeAccess('b-1');

    expect(gia.revokedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('404 se la booking non è nel tenant corrente', async () => {
    const { service } = makeService({ bookings: [] });
    await expect(service.revokeAccess('b-altrui')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomerAccessService.provisionAccess', () => {
  it('spegne le sessioni vive prima di emettere il nuovo enrollment (rotazione pulita)', async () => {
    const { service, enrollments, sessions } = makeService();
    enrollments.push({ id: 'e-vecchio', customerId: 'c-1', revokedAt: null });
    const viva = sessioneViva(sessions, 'c-1');

    await service.provisionAccess('b-1', 'admin-1');

    expect(enrollments.find((e) => e.id === 'e-vecchio')!.revokedAt).not.toBeNull();
    expect(viva.revokedAt).not.toBeNull();
    const nuovo = enrollments.find((e) => e.id !== 'e-vecchio')!;
    expect(nuovo.revokedAt).toBeNull();
  });

  it('il nuovo enrollment è tenant-scoped e conserva solo gli hash, mai il raw', async () => {
    const { service, enrollments } = makeService();
    const res = await service.provisionAccess('b-1', 'admin-1');

    const nuovo = enrollments[0];
    expect(nuovo.establishmentId).toBe(TEST_TENANT);
    expect(nuovo.createdByUserId).toBe('admin-1');
    expect(nuovo.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(String(nuovo.tokenHash)).not.toContain(res.activationUrl.split('token=')[1]);
    expect(nuovo.pinHash).toBe(`hash(${res.pin})`);
  });

  it('activationUrl è assoluto: un CUSTOMER_APP_URL mancante brucerebbe il token monouso', async () => {
    // AUD-016: con la base vuota l'URL degrada in relativo, il QR consegnato al cliente è
    // inutilizzabile e il token one-time risulta comunque emesso.
    const { service } = makeService();
    const res = await service.provisionAccess('b-1', 'admin-1');
    expect(res.activationUrl).toMatch(/^https:\/\/app\.coralyn\.test\/attiva\?token=.+/);
  });

  it('404 se la booking non è nel tenant corrente', async () => {
    const { service } = makeService({ bookings: [] });
    await expect(service.provisionAccess('b-altrui', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomerAccessService.accessStatusForBooking', () => {
  it('none / issued / active / revoked dall’ultimo enrollment', async () => {
    const { service, enrollments } = makeService();
    expect(await service.accessStatusForBooking('b-1')).toEqual({ state: 'none', lastActivatedAt: null });

    enrollments.push({ id: 'e-1', customerId: 'c-1', revokedAt: null, activatedAt: null });
    expect((await service.accessStatusForBooking('b-1')).state).toBe('issued');

    const attivato = new Date('2026-07-01T08:00:00Z');
    enrollments.push({ id: 'e-2', customerId: 'c-1', revokedAt: null, activatedAt: attivato });
    expect(await service.accessStatusForBooking('b-1')).toEqual({
      state: 'active',
      lastActivatedAt: attivato.toISOString(),
    });

    enrollments.push({ id: 'e-3', customerId: 'c-1', revokedAt: new Date(), activatedAt: null });
    expect((await service.accessStatusForBooking('b-1')).state).toBe('revoked');
  });
});
