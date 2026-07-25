import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerSessionService } from './customer-session.service';
import { CustomerTokenService } from './customer-token.service';
import { hashToken } from '../credential/token-hash';
import { fakeTenantPrisma, TEST_TENANT } from '../test/tenant-prisma';

/**
 * `CustomerSessionService` (158 LOC) non aveva spec unit (AUD-024). È il servizio che decide se un
 * bagnante è dentro o fuori, e contiene la theft-detection del refresh rotante (D-026) — che la
 * matrice dell'audit classifica «logica ottima ma zero unit»: coperta solo dalle e2e, cioè solo
 * quando c'è un Postgres.
 */
type Enrollment = {
  id: string; customerId: string; establishmentId: string; tokenHash: string; pinHash: string;
  pinAttempts: number; revokedAt: Date | null; activatedAt: Date | null; expiresAt: Date;
};
type Sessione = {
  id: string; customerId: string; establishmentId: string; enrollmentTokenId: string;
  refreshTokenHash: string; revokedAt: Date | null; expiresAt: Date; rotatedFromId?: string;
};

const FRA_UN_ORA = () => new Date(Date.now() + 3600_000);

/**
 * Traduce il predicato di una `updateMany` in un filtro, e **rompe** se incontra una chiave che
 * non conosce invece di matchare zero righe in silenzio.
 *
 * È la radice R2 dell'audit («i fake modellano la firma, non il contratto») presa sul fatto: la
 * prima versione di questo fake gestiva `id` ed `enrollmentTokenId` perché erano le chiamate che
 * avevo davanti, e `logout` — che filtra per `refreshTokenHash` — non revocava nulla senza che
 * niente lo dicesse. È esattamente il modo in cui P6-001 è rimasto invisibile per mesi.
 */
const CHIAVI_NOTE = ['id', 'enrollmentTokenId', 'refreshTokenHash', 'customerId'] as const;
function selettore(where: Record<string, unknown>) {
  const chiavi = Object.keys(where).filter((k) => k !== 'revokedAt' && k !== 'activatedAt');
  const ignote = chiavi.filter((k) => !CHIAVI_NOTE.includes(k as (typeof CHIAVI_NOTE)[number]));
  if (ignote.length > 0) {
    throw new Error(`fake incompleto: predicato non modellato ${JSON.stringify(where)}`);
  }
  return (riga: Record<string, unknown>) => chiavi.every((k) => riga[k] === where[k]);
}

function makeService(opts: { pinOk?: boolean; maxAttempts?: string } = {}) {
  const enrollments: Enrollment[] = [];
  const sessions: Sessione[] = [];
  const customers = [{ id: 'c-1', firstName: 'Mario', lastName: 'Rossi', establishment: { name: 'Lido A' } }];

  const enrollmentUpdate = jest.fn(({ where, data }: any) => {
    const row = enrollments.find((e) => e.id === where.id)!;
    if (data.pinAttempts?.increment !== undefined) row.pinAttempts += data.pinAttempts.increment;
    return Promise.resolve(row);
  });

  const tx: any = {
    customerEnrollmentToken: {
      updateMany: jest.fn(({ where, data }: any) => {
        const match = enrollments.filter(
          (e) => selettore(where)(e as unknown as Record<string, unknown>)
            && (where.activatedAt === null ? e.activatedAt === null : true)
            && (where.revokedAt === null ? e.revokedAt === null : true),
        );
        match.forEach((e) => Object.assign(e, data));
        return Promise.resolve({ count: match.length });
      }),
    },
    customerSession: {
      create: jest.fn(({ data }: any) => {
        const row = { id: `s${sessions.length + 1}`, revokedAt: null, ...data };
        sessions.push(row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const match = sessions.filter((s) => selettore(where)(s) && (where.revokedAt === null ? s.revokedAt === null : true));
        match.forEach((s) => Object.assign(s, data));
        return Promise.resolve({ count: match.length });
      }),
    },
    customer: { findFirst: jest.fn(({ where }: any) => Promise.resolve(customers.find((c) => c.id === where.id) ?? null)) },
  };

  const prisma = {
    ...fakeTenantPrisma(tx),
    $transaction: (fn: any) => fn(tx),
    customerEnrollmentToken: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(enrollments.find((e) => e.tokenHash === where.tokenHash) ?? null)),
      update: enrollmentUpdate,
      updateMany: tx.customerEnrollmentToken.updateMany,
    },
    customerSession: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(sessions.find((s) => s.refreshTokenHash === where.refreshTokenHash) ?? null)),
      updateMany: tx.customerSession.updateMany,
    },
  } as any;

  const hasher = { verify: jest.fn().mockResolvedValue(opts.pinOk ?? true), hash: (p: string) => Promise.resolve(`hash(${p})`) } as any;
  const config = {
    get: (k: string) => (k === 'CUSTOMER_PIN_MAX_ATTEMPTS' ? (opts.maxAttempts ?? '5') : '120'),
  } as any;
  const tokens = new CustomerTokenService(new JwtService({ secret: 's', signOptions: { expiresIn: '30m' } }));

  const service = new CustomerSessionService(prisma, hasher, tokens, config);
  return { service, prisma, tx, enrollments, sessions, hasher, tokens };
}

function enrollmentVivo(enrollments: Enrollment[], raw: string, over: Partial<Enrollment> = {}): Enrollment {
  const row: Enrollment = {
    id: 'e-1', customerId: 'c-1', establishmentId: TEST_TENANT, tokenHash: hashToken(raw),
    pinHash: 'hash(123456)', pinAttempts: 0, revokedAt: null, activatedAt: null, expiresAt: FRA_UN_ORA(),
    ...over,
  };
  enrollments.push(row);
  return row;
}

function sessioneViva(sessions: Sessione[], raw: string, over: Partial<Sessione> = {}): Sessione {
  const row: Sessione = {
    id: `s-${sessions.length + 1}`, customerId: 'c-1', establishmentId: TEST_TENANT,
    enrollmentTokenId: 'e-1', refreshTokenHash: hashToken(raw), revokedAt: null, expiresAt: FRA_UN_ORA(),
    ...over,
  };
  sessions.push(row);
  return row;
}

describe('CustomerSessionService.activate', () => {
  it('consuma l’enrollment one-time e apre una sessione device-bound', async () => {
    const { service, enrollments, sessions } = makeService();
    const e = enrollmentVivo(enrollments, 'raw-1');

    const res = await service.activate({ enrollmentToken: 'raw-1', pin: '123456' });

    expect(e.activatedAt).not.toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].enrollmentTokenId).toBe('e-1');
    expect(sessions[0].refreshTokenHash).toBe(hashToken(res.refreshToken));
    expect(res.refreshToken).not.toBe(sessions[0].refreshTokenHash); // il raw non è ciò che si persiste
  });

  it('il token di accesso porta kind=customer e il tenant del cliente', async () => {
    const { service, enrollments, tokens } = makeService();
    enrollmentVivo(enrollments, 'raw-1');
    const res = await service.activate({ enrollmentToken: 'raw-1', pin: '123456' });
    expect(tokens.verify(res.accessToken)).toMatchObject({ sub: 'c-1', establishmentId: TEST_TENANT, kind: 'customer' });
  });

  it('PIN errato: incrementa i tentativi in modo race-safe e non apre sessione', async () => {
    // La forma dell'update È la difesa (P2-008): con un read-modify-write N tentativi concorrenti
    // leggono lo stesso valore e ne consumano UNO SOLO, e il lock a soglia non scatta mai. Un
    // fake sequenziale non può osservare la concorrenza, la forma della query sì.
    const { service, enrollments, sessions, prisma } = makeService({ pinOk: false });
    enrollmentVivo(enrollments, 'raw-1');

    await expect(service.activate({ enrollmentToken: 'raw-1', pin: '000000' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.customerEnrollmentToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pinAttempts: { increment: 1 } } }),
    );
    expect(sessions).toHaveLength(0);
  });

  it('PIN errato alla soglia: revoca l’enrollment (lockout)', async () => {
    const { service, enrollments } = makeService({ pinOk: false, maxAttempts: '3' });
    const e = enrollmentVivo(enrollments, 'raw-1', { pinAttempts: 2 });

    await expect(service.activate({ enrollmentToken: 'raw-1', pin: '000000' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(e.pinAttempts).toBe(3);
    expect(e.revokedAt).not.toBeNull();
  });

  it('sotto soglia NON revoca: il lockout è a soglia, non a ogni errore', async () => {
    const { service, enrollments } = makeService({ pinOk: false, maxAttempts: '3' });
    const e = enrollmentVivo(enrollments, 'raw-1', { pinAttempts: 0 });
    await expect(service.activate({ enrollmentToken: 'raw-1', pin: '000000' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(e.revokedAt).toBeNull();
  });

  it.each([
    ['revocato', { revokedAt: new Date() }],
    ['già attivato (one-time)', { activatedAt: new Date() }],
    ['scaduto', { expiresAt: new Date(Date.now() - 1000) }],
    ['inesistente', null],
  ])('enrollment %s → 401 generico, nessuna sessione', async (_caso, over) => {
    const { service, enrollments, sessions } = makeService();
    if (over) enrollmentVivo(enrollments, 'raw-1', over as Partial<Enrollment>);

    await expect(service.activate({ enrollmentToken: 'raw-1', pin: '123456' })).rejects.toThrow('Credenziali non valide');
    expect(sessions).toHaveLength(0);
  });
});

describe('CustomerSessionService.refresh — theft detection (D-026)', () => {
  it('ruota il refresh: la vecchia sessione è revocata, la nuova ne discende', async () => {
    const { service, sessions } = makeService();
    const vecchia = sessioneViva(sessions, 'refresh-1');

    const res = await service.refresh({ refreshToken: 'refresh-1' });

    expect(vecchia.revokedAt).not.toBeNull();
    expect(sessions).toHaveLength(2);
    expect(sessions[1].rotatedFromId).toBe(vecchia.id);
    expect(sessions[1].refreshTokenHash).toBe(hashToken(res.refreshToken));
  });

  it('riuso di un refresh GIÀ ruotato: brucia l’intera catena della sessione e 401', async () => {
    // È il cuore della theft-detection: chi presenta un refresh già speso o è un attaccante con
    // una copia vecchia, o è il legittimo dopo un furto. In entrambi i casi la catena muore.
    const { service, sessions } = makeService();
    const rubata = sessioneViva(sessions, 'refresh-vecchio', { id: 's-1', revokedAt: new Date() });
    const viva = sessioneViva(sessions, 'refresh-corrente', { id: 's-2' });

    await expect(service.refresh({ refreshToken: 'refresh-vecchio' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rubata.revokedAt).not.toBeNull();
    expect(viva.revokedAt).not.toBeNull(); // la catena intera, non solo quella presentata
  });

  it('la catena bruciata è quella dell’enrollment, non tutte le sessioni del cliente', async () => {
    // L'altro verso: un dispositivo con un enrollment diverso (ri-provisioning legittimo) non
    // deve cadere per il furto avvenuto sull'altro.
    const { service, sessions } = makeService();
    sessioneViva(sessions, 'refresh-vecchio', { id: 's-1', revokedAt: new Date() });
    const altroDispositivo = sessioneViva(sessions, 'refresh-altro', { id: 's-9', enrollmentTokenId: 'e-2' });

    await expect(service.refresh({ refreshToken: 'refresh-vecchio' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(altroDispositivo.revokedAt).toBeNull();
  });

  it('refresh scaduto o inesistente → 401 senza aprire nulla', async () => {
    const { service, sessions } = makeService();
    sessioneViva(sessions, 'refresh-scaduto', { expiresAt: new Date(Date.now() - 1000) });

    await expect(service.refresh({ refreshToken: 'refresh-scaduto' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh({ refreshToken: 'mai-esistito' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions).toHaveLength(1);
  });
});

describe('CustomerSessionService.logout / getMe', () => {
  it('logout revoca la sola sessione presentata, ed è idempotente', async () => {
    const { service, sessions } = makeService();
    const mia = sessioneViva(sessions, 'refresh-1', { id: 's-1' });
    const altra = sessioneViva(sessions, 'refresh-2', { id: 's-2' });

    await service.logout('refresh-1');
    expect(mia.revokedAt).not.toBeNull();
    expect(altra.revokedAt).toBeNull();

    const primaRevoca = mia.revokedAt;
    await expect(service.logout('refresh-1')).resolves.toBeUndefined();
    expect(mia.revokedAt).toBe(primaRevoca);
  });

  it('getMe legge il cliente dentro forTenant, col tenant del claim', async () => {
    // Il fake di forTenant asserisce il tenant: se getMe leggesse sotto un tenant diverso da
    // quello del token il test diventerebbe rosso invece di restituire dati altrui.
    const { service } = makeService();
    await expect(service.getMe('c-1', TEST_TENANT)).resolves.toEqual({
      customerId: 'c-1', firstName: 'Mario', lastName: 'Rossi', establishmentName: 'Lido A',
    });
  });

  it('getMe: cliente non visibile nel tenant → 401, non 404', async () => {
    const { service } = makeService();
    await expect(service.getMe('c-altrui', TEST_TENANT)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
