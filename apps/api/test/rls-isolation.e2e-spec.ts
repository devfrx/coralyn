import { PrismaService } from '../src/prisma/prisma.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { createEstablishment } from './helpers/create-establishment';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';

/**
 * RLS era testata su **1 tabella su 22, in sola lettura**, e il `WITH CHECK` non era **mai**
 * esercitato (P6-009). Misurato: `ALTER TABLE "Booking" DISABLE ROW LEVEL SECURITY` non faceva
 * cadere nulla al di fuori di `customer-access`, benché `customer-access.service.ts` risolva la
 * booking affidandosi **esclusivamente** a RLS.
 *
 * Questo file non elenca le tabelle: le **deriva dal catalogo di Postgres**. Una tabella nuova
 * senza policy, o una policy rimossa, o un `FORCE` tolto, fanno fallire il test **nominando la
 * tabella** — che è la sola forma di copertura che non invecchia.
 *
 * Il `WITH CHECK` è esercitato su **tutte** le tabelle con una `UPDATE` che sposta
 * `establishmentId` su un altro tenant: è l'unica prova generica possibile, perché un `INSERT`
 * richiederebbe di conoscere le colonne obbligatorie di ognuna. Su otto tabelle — quelle senza FK
 * verso dati tenant-scoped — l'`INSERT` è esercitato anche esplicitamente.
 *
 * ⚠️ **Misurato scrivendo questo file, e corregge la lettura del finding.** «Il `WITH CHECK` non è
 * mai esercitato» era vero dei *test*, non del database: togliendo la clausola esplicita dalla
 * policy di `Season` il comportamento **non cambia**, perché per una policy `FOR ALL` Postgres usa
 * l'espressione `USING` anche come check sulle righe nuove. La scrittura cross-tenant è quindi
 * sempre stata respinta; ciò che mancava era qualcosa che lo dimostrasse. La clausola esplicita
 * resta pinnata dal test sul catalogo, perché è documentazione eseguibile dell'intenzione.
 *
 * ⚠️ **`FORCE ROW LEVEL SECURITY` è il cardine vero, e nessun test lo guardava.** Le tabelle sono
 * di proprietà di `coralyn_app`, che è anche il ruolo con cui gira l'API, e Postgres **esenta il
 * proprietario** da RLS a meno di `FORCE`. Provato per mutazione: `DISABLE ROW LEVEL SECURITY` su
 * una tabella fa fallire 1 test (e la nomina); **`NO FORCE` su una sola tabella ne fa fallire 6**.
 */
describe('RLS — isolamento per tenant su tutte le tabelle tenant-scoped (P6-009)', () => {
  const prisma = new PrismaService();
  let sA: TenantId;
  let sB: TenantId;

  /** Il predicato che ogni policy deve avere, in entrambe le direzioni. */
  const PREDICATO =
    '((NULLIF(current_setting(\'app.current_tenant\'::text, true), \'\'::text))::uuid = "establishmentId")';

  /**
   * I modelli deliberatamente FUORI da RLS, ognuno col perché: questa lista **è** la specifica.
   * Se una tabella nuova non compare né qui né fra quelle con policy, il test fallisce.
   */
  const SENZA_RLS: Record<string, string> = {
    Establishment: 'registro dei tenant: chi lo legge sta scegliendo un tenant, non operandoci dentro',
    User: 'lo staff è filtrato per establishmentId in query esplicite, e il superuser non ha tenant',
    CustomerSession: 'canale cliente: la sessione si risolve per hash del refresh, prima che un tenant esista',
    CustomerEnrollmentToken: 'idem: one-time + PIN si risolvono prima di avere un tenant',
    CredentialSetupToken: 'link di set-password dello staff: risolto per hash, fuori da una sessione',
    StaffPermissionOverride:
      'attributo di User, che è già fuori: il guard lo legge PRIMA che la richiesta abbia una ' +
      'transazione, e metterlo sotto RLS costerebbe 4 round trip invece di 1 su ogni richiesta ' +
      'staff. La riga cross-tenant è impedita dalla FK composita (userId, establishmentId) → ' +
      'User(id, establishmentId), che la rende non rappresentabile invece che improbabile — ADR-0063',
    PlatformAuditLog: 'registro di piattaforma: trasversale ai tenant per definizione',
    _prisma_migrations: 'tabella di servizio di Prisma',
  };

  /** Tabelle senza FK verso dati tenant-scoped: su queste l'INSERT cross-tenant è scrivibile a mano. */
  const INSERT_DIRETTO: Record<string, string> = {
    Customer: `("id","establishmentId","firstName","lastName") VALUES (gen_random_uuid(), $1, 'X', 'Y')`,
    Season: `("id","establishmentId","name","startDate","endDate") VALUES (gen_random_uuid(), $1, 'S', DATE '2026-05-01', DATE '2026-09-30')`,
    Sector: `("id","establishmentId","name","sortOrder") VALUES (gen_random_uuid(), $1, 'S', 1)`,
    UmbrellaType: `("id","establishmentId","name","sortOrder") VALUES (gen_random_uuid(), $1, 'T', 1)`,
    EquipmentType: `("id","establishmentId","name") VALUES (gen_random_uuid(), $1, 'E')`,
    Package: `("id","establishmentId","name") VALUES (gen_random_uuid(), $1, 'P')`,
    RentalItem: `("id","establishmentId","name") VALUES (gen_random_uuid(), $1, 'R')`,
    TimeSlot: `("id","establishmentId","name","startTime","endTime","sortOrder") VALUES (gen_random_uuid(), $1, 'F', TIME '08:00', TIME '13:00', 1)`,
  };

  /** Le tabelle con policy, lette dal catalogo (non da una lista scritta a mano). */
  let conRls: Array<{ relname: string; forced: boolean; qual: string; withCheck: string | null }>;

  beforeAll(async () => {
    await prisma.$connect();

    conRls = (
      await prisma.$queryRaw<Array<{ relname: string; forced: boolean; qual: string; withcheck: string | null }>>`
        SELECT c.relname,
               c.relforcerowsecurity AS forced,
               p.qual,
               p.with_check AS withcheck
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        ORDER BY c.relname`
    ).map((r) => ({ relname: r.relname, forced: r.forced, qual: r.qual, withCheck: r.withcheck }));

    sA = await createEstablishment(prisma, 'RLS A');
    sB = await createEstablishment(prisma, 'RLS B');
    await seedOgniTabella(sA);
  });

  afterAll(async () => {
    for (const t of [sA, sB]) {
      // Ordine FK-safe: si cancella dalle foglie alla radice, tenant per tenant.
      await prisma.forTenant(t, async (tx) => {
        for (const tabella of [
          'Rental', 'RentalTariff', 'RentalItem', 'BookingTransfer', 'AbsenceRelease',
          'BookingSuspension', 'BookingCoverage', 'Booking', 'RenewalCampaign', 'Rate', 'Pricing',
          'PackageEquipment', 'Package', 'EquipmentType', 'Umbrella', 'Row', 'Sector',
          'UmbrellaType', 'TimeSlot', 'Customer', 'Season', 'EstablishmentLegalProfile',
        ]) {
          await tx.$executeRawUnsafe(`DELETE FROM "${tabella}"`);
        }
      });
    }
    await prisma.establishment.deleteMany({ where: { id: { in: [sA, sB] } } });
    await prisma.$disconnect();
  });

  /** Popola UNA riga per ciascuna delle 22 tabelle tenant-scoped del tenant `t`. */
  async function seedOgniTabella(t: TenantId): Promise<void> {
    const { seasonId, seasonId2, umbrellaId, timeSlotId, customerId, customerId2, itemId, tariffId, packageId, equipmentTypeId } =
      await prisma.forTenant(t, async (tx) => {
        const season = await tx.season.create({ data: { establishmentId: t, name: 'S26', startDate: new Date('2026-05-01'), endDate: new Date('2026-09-30') } });
        const season2 = await tx.season.create({ data: { establishmentId: t, name: 'S27', startDate: new Date('2027-05-01'), endDate: new Date('2027-09-30') } });
        const sector = await tx.sector.create({ data: { establishmentId: t, name: 'Centro', sortOrder: 1 } });
        const row = await tx.row.create({ data: { establishmentId: t, sectorId: sector.id, label: 'A', sortOrder: 1 } });
        const type = await tx.umbrellaType.create({ data: { establishmentId: t, name: 'Palma', sortOrder: 1 } });
        const umbrella = await tx.umbrella.create({ data: { establishmentId: t, rowId: row.id, umbrellaTypeId: type.id, label: '1', logicalOrder: 1 } });
        const slot = await tx.timeSlot.create({ data: { establishmentId: t, name: 'Mattina', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T13:00:00Z'), sortOrder: 1 } });
        const c1 = await tx.customer.create({ data: { establishmentId: t, firstName: 'Mario', lastName: 'Rossi' } });
        const c2 = await tx.customer.create({ data: { establishmentId: t, firstName: 'Anna', lastName: 'Verdi' } });
        const equipment = await tx.equipmentType.create({ data: { establishmentId: t, name: 'Lettino' } });
        const pkg = await tx.package.create({ data: { establishmentId: t, name: 'Standard' } });
        await tx.packageEquipment.create({ data: { establishmentId: t, packageId: pkg.id, equipmentTypeId: equipment.id, quantity: 2 } });
        const pricing = await tx.pricing.create({ data: { establishmentId: t, seasonId: season.id } });
        await tx.rate.create({ data: { establishmentId: t, pricingId: pricing.id, price: 28 } });
        await tx.renewalCampaign.create({ data: { establishmentId: t, originSeasonId: season.id, destinationSeasonId: season2.id, deadline: new Date('2026-12-31') } });
        const item = await tx.rentalItem.create({ data: { establishmentId: t, name: 'Pedalò' } });
        const tariff = await tx.rentalTariff.create({ data: { establishmentId: t, rentalItemId: item.id, seasonId: season.id, label: 'Ora', price: 15, sortOrder: 1 } });
        await tx.rental.create({ data: { establishmentId: t, rentalItemId: item.id, rentalTariffId: tariff.id, totalPrice: 15 } });
        await tx.establishmentLegalProfile.create({ data: { establishmentId: t, legalName: 'Acme Srl' } });
        return {
          seasonId: season.id, seasonId2: season2.id, umbrellaId: umbrella.id, timeSlotId: slot.id,
          customerId: c1.id, customerId2: c2.id, itemId: item.id, tariffId: tariff.id,
          packageId: pkg.id, equipmentTypeId: equipment.id,
        };
      });

    // Booking + BookingCoverage passano dall'helper condiviso: la coverage ha un trigger che
    // eredita minuti e umbrellaId dal Booking madre, e ricostruirlo qui lo farebbe divergere.
    const booking = await insertBookingWithCoverage(prisma, t, {
      establishmentId: t, customerId, umbrellaId, timeSlotId,
      startDate: new Date('2026-07-15'), endDate: new Date('2026-07-15'),
    });

    await prisma.forTenant(t, async (tx) => {
      await tx.bookingSuspension.create({ data: { establishmentId: t, bookingId: booking.id, startDate: new Date('2026-07-15') } });
      await tx.absenceRelease.create({ data: { establishmentId: t, bookingId: booking.id, date: new Date('2026-07-15') } });
      await tx.bookingTransfer.create({ data: { establishmentId: t, bookingId: booking.id, previousCustomerId: customerId, newCustomerId: customerId2, effectiveDate: new Date('2026-07-15') } });
    });

    void seasonId; void seasonId2; void itemId; void tariffId; void packageId; void equipmentTypeId;
  }

  const conta = async (t: TenantId, tabella: string): Promise<number> => {
    const r = await prisma.forTenant(t, (tx) =>
      tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "${tabella}"`),
    );
    return r[0].n;
  };

  // --- 1. Il catalogo È la lista: nessuna tabella sfugge alla classificazione -------------------

  it('ogni tabella del database è o tenant-scoped con policy, o dichiarata fuori da RLS con un perché', async () => {
    const tutte = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`;

    const classificate = new Set([...conRls.map((r) => r.relname), ...Object.keys(SENZA_RLS)]);
    const orfane = tutte.map((t) => t.relname).filter((t) => !classificate.has(t));

    expect(orfane).toEqual([]);
    expect(conRls).toHaveLength(22);
  });

  it('ogni tabella tenant-scoped ha FORCE ROW LEVEL SECURITY', () => {
    // Load-bearing e invisibile: le tabelle sono di proprietà di `coralyn_app`, che è anche il
    // ruolo dell'applicazione. Senza FORCE, Postgres esenta il proprietario e RLS non si applica
    // a NESSUNA query dell'API — restando «abilitata» nel catalogo.
    expect(conRls.filter((r) => !r.forced).map((r) => r.relname)).toEqual([]);
  });

  it('ogni policy confronta app.current_tenant con establishmentId, in lettura E in scrittura', () => {
    const divergenti = conRls
      .filter((r) => r.qual !== PREDICATO || r.withCheck !== PREDICATO)
      .map((r) => ({ tabella: r.relname, qual: r.qual, withCheck: r.withCheck }));
    expect(divergenti).toEqual([]);
  });

  // --- 2. Comportamento: lettura, scrittura e il WITH CHECK, su tutte e 22 ----------------------

  it('il seed copre tutte e 22 le tabelle (il test guarda dove crede di guardare)', async () => {
    const vuote: string[] = [];
    for (const { relname } of conRls) {
      if ((await conta(sA, relname)) === 0) vuote.push(relname);
    }
    expect(vuote).toEqual([]);
  });

  it.each([['senza tenant impostato', null], ['con il tenant sbagliato', 'B'] as const])(
    'nessuna riga del tenant A è visibile %s',
    async (_caso, chi) => {
      const invisibili: string[] = [];
      for (const { relname } of conRls) {
        const n = chi === null
          ? Number((await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "${relname}"`))[0].n)
          : await conta(sB, relname);
        if (n !== 0) invisibili.push(`${relname} (${n} righe)`);
      }
      expect(invisibili).toEqual([]);
    },
  );

  it('WITH CHECK: il tenant A non può spostare una propria riga sul tenant B — su tutte e 22', async () => {
    // È la metà del contratto che nessun test aveva mai esercitato. Senza WITH CHECK un tenant
    // potrebbe *regalare* le proprie righe a un altro, o peggio scriverne di nuove a suo nome:
    // la policy USING da sola impedisce di LEGGERE, non di SCRIVERE.
    const passate: string[] = [];
    for (const { relname } of conRls) {
      let respinta = false;
      try {
        await prisma.forTenant(sA, (tx) =>
          tx.$executeRawUnsafe(`UPDATE "${relname}" SET "establishmentId" = '${sB}'`),
        );
      } catch (e) {
        respinta = /row-level security|42501/i.test(e instanceof Error ? e.message : String(e));
      }
      if (!respinta) passate.push(relname);
    }
    expect(passate).toEqual([]);
  });

  it('WITH CHECK: il tenant A non può INSERIRE una riga intestata al tenant B', async () => {
    const passate: string[] = [];
    for (const [tabella, colonne] of Object.entries(INSERT_DIRETTO)) {
      let respinta = false;
      try {
        await prisma.forTenant(sA, (tx) =>
          tx.$executeRawUnsafe(`INSERT INTO "${tabella}" ${colonne.replace('$1', `'${sB}'`)}`),
        );
      } catch (e) {
        respinta = /row-level security|42501/i.test(e instanceof Error ? e.message : String(e));
      }
      if (!respinta) passate.push(tabella);
    }
    expect(passate).toEqual([]);
  });

  it('USING: il tenant B non cancella né modifica le righe di A (zero righe toccate, non un errore)', async () => {
    // Il verso opposto del test precedente: qui non c'è violazione da segnalare, le righe
    // semplicemente non esistono per B. Un `DELETE` che riporta 0 è la prova che il filtro c'è.
    const toccate: string[] = [];
    for (const { relname } of conRls) {
      const n = await prisma.forTenant(sB, (tx) => tx.$executeRawUnsafe(`DELETE FROM "${relname}"`));
      if (n !== 0) toccate.push(`${relname} (${n})`);
    }
    expect(toccate).toEqual([]);

    // E le righe di A sono ancora tutte lì.
    for (const { relname } of conRls) {
      expect({ [relname]: await conta(sA, relname) }).toEqual({ [relname]: expect.any(Number) });
      expect(await conta(sA, relname)).toBeGreaterThan(0);
    }
  });
});
