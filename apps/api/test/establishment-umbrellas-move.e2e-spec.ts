import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';
import { createEstablishment } from './helpers/create-establishment';

// Collaudo integrato dello spostamento ombrellone (D-038): riordino dentro la fila nei due versi,
// spostamento fra file dello stesso settore, fra settori dello stesso kind, e i cinque rifiuti.
//
// Le asserzioni sui VALORI di logicalOrder leggono Prisma e non l'API, e non e' pignoleria: nessun
// DTO espone logicalOrder — le tre proiezioni lo scartano — quindi via HTTP si vedrebbe solo la
// sequenza, indistinguibile fra 1,2,3 e 5,9,40. La differenza conta, perche' il buco che lo
// spostamento lascia nella fila d'origine e' una scelta e va provata come tale.
//
// Fixture inline, come nelle cinque spec sorelle della struttura (umbrellas, -bulk, -retire,
// sectors-rows, structure): seedMapTenant serve alle suite in cui la struttura e' incidentale.

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const EMAILS = ['move.admin@e2e.test', 'move.staff@e2e.test'];

describe('Establishment umbrellas move (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: TenantId;
  let s2: TenantId;
  let adminT: string;
  let staffT: string;
  let f1: string; // settore «Griglia» (grid), fila F1: ordini densi 1,2,3
  let f2: string; // settore «Griglia» (grid), fila F2: ordini SPARSI 10,20
  let lev: string; // settore «Levante» (grid): destinazione legittima fuori dal settore d'origine
  let pal: string; // settore «Palme» (special): destinazione che dev'essere rifiutata
  let foreignRow: string; // fila di un ALTRO lido
  let m1: string;
  let m2: string;
  let retired: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = await createEstablishment(prisma, 'MOVE A');
    s2 = await createEstablishment(prisma, 'MOVE B');
    await createUser(prisma, { email: 'move.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'move.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'move.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'move.staff@e2e.test', 'pw-staff-1');

    await prisma.forTenant(s1, async (tx) => {
      const umb = (rowId: string, label: string, logicalOrder: number) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId, label, logicalOrder } });

      const griglia = await tx.sector.create({ data: { establishmentId: s1, name: 'Griglia', sortOrder: 1, kind: 'grid' } });
      f1 = (await tx.row.create({ data: { establishmentId: s1, sectorId: griglia.id, label: 'F1', sortOrder: 1 } })).id;
      f2 = (await tx.row.create({ data: { establishmentId: s1, sectorId: griglia.id, label: 'F2', sortOrder: 2 } })).id;
      m1 = (await umb(f1, 'MV-1', 1)).id;
      m2 = (await umb(f1, 'MV-2', 2)).id;
      await umb(f1, 'MV-3', 3);
      // F2 nasce con ordini SPARSI: e' lo stato in cui una fila finisce dopo il primo spostamento,
      // perche' il buco non si richiude. Con ordini densi ovunque si proverebbe il solo caso di
      // laboratorio, e un piano che sbaglia sui salti passerebbe.
      await umb(f2, 'MV-4', 10);
      await umb(f2, 'MV-5', 20);

      const levante = await tx.sector.create({ data: { establishmentId: s1, name: 'Levante', sortOrder: 2, kind: 'grid' } });
      lev = (await tx.row.create({ data: { establishmentId: s1, sectorId: levante.id, label: 'L1', sortOrder: 1 } })).id;
      await umb(lev, 'MV-L1', 1);
      await umb(lev, 'MV-L2', 2);

      const palme = await tx.sector.create({ data: { establishmentId: s1, name: 'Palme', sortOrder: 3, kind: 'special' } });
      pal = (await tx.row.create({ data: { establishmentId: s1, sectorId: palme.id, label: 'P1', sortOrder: 1 } })).id;
      await umb(pal, 'MV-P1', 1);

      // Una tariffa che nomina «Griglia»: e' cio' che rende `hasDedicatedRates` vero per quel
      // settore e falso per gli altri. Senza, il presidio sotto passerebbe con tutti `false` e non
      // proverebbe che la bandiera legge dati veri.
      const season = await tx.season.create({
        data: { establishmentId: s1, name: 'Estate 2026', startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') },
      });
      const pricing = await tx.pricing.create({ data: { establishmentId: s1, seasonId: season.id } });
      await tx.rate.create({ data: { establishmentId: s1, pricingId: pricing.id, sectorId: griglia.id, price: 35 } });

      retired = (await tx.umbrella.create({
        data: {
          establishmentId: s1, rowId: null, label: 'MV-R', logicalOrder: 4,
          retiredAt: new Date('2026-07-01T00:00:00Z'), retiredFrom: 'Griglia · F1',
        },
      })).id;
    });

    await prisma.forTenant(s2, async (tx) => {
      const estranea = await tx.sector.create({ data: { establishmentId: s2, name: 'Estranea', sortOrder: 1, kind: 'grid' } });
      foreignRow = (await tx.row.create({ data: { establishmentId: s2, sectorId: estranea.id, label: 'X1', sortOrder: 1 } })).id;
    });
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.umbrella.deleteMany({ where: { establishmentId: s } });
        // Prima dei settori: `Rate.sector` e' `onDelete: Restrict` (D-058), quindi una tariffa viva
        // impedisce di cancellare il settore che nomina.
        await tx.rate.deleteMany({ where: { establishmentId: s } });
        await tx.pricing.deleteMany({ where: { establishmentId: s } });
        await tx.season.deleteMany({ where: { establishmentId: s } });
        await tx.row.deleteMany({ where: { establishmentId: s } });
        await tx.sector.deleteMany({ where: { establishmentId: s } });
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  /** Coppie (label, logicalOrder) di una fila, in ordine. Legge Prisma: l'API non espone il valore. */
  const ordersOf = (rowId: string): Promise<Array<[string, number]>> =>
    prisma.forTenant(s1, async (tx) => {
      const rows = await tx.umbrella.findMany({
        where: { rowId }, orderBy: { logicalOrder: 'asc' }, select: { label: true, logicalOrder: true },
      });
      return rows.map((u) => [u.label, u.logicalOrder] as [string, number]);
    });

  // L'editor deve poter dichiarare, PRIMA di spostare fuori dal settore, che il prezzo dei rinnovi
  // cambiera' base. L'informazione viaggia con la struttura invece che da `GET /rates` perche' li'
  // servirebbe `pricing.manage`, che chi gestisce la struttura puo' non avere (D-063), e perche'
  // le tariffe sono per stagione mentre la conseguenza e' su una stagione futura.
  it('la struttura dichiara quali settori hanno tariffe dedicate', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const flags = (res.body.sectors as { name: string; hasDedicatedRates: boolean }[])
      .map((s) => [s.name, s.hasDedicatedRates] as const);
    expect(Object.fromEntries(flags)).toEqual({ Griglia: true, Levante: false, Palme: false });
  });

  it('403 per staff', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(staffT))
      .send({ rowId: f1, position: 0 }).expect(403);
  });

  it('404 se l’ombrellone non esiste', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${MISSING}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 0 }).expect(404);
  });

  it('dentro la fila, in avanti: MV-1 va in coda e gli scavalcati arretrano', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 2 }).expect(200);
    expect(res.body).toEqual({ id: m1, label: 'MV-1', umbrellaTypeId: null });
    expect(await ordersOf(f1)).toEqual([['MV-2', 1], ['MV-3', 2], ['MV-1', 3]]);
  });

  it('dentro la fila, indietro: MV-1 torna in testa e la fila torna com’era', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 0 }).expect(200);
    expect(await ordersOf(f1)).toEqual([['MV-1', 1], ['MV-2', 2], ['MV-3', 3]]);
  });

  it('posizione già occupata: 200 e nessun valore cambia (no-op calcolato)', async () => {
    const before = await ordersOf(f1);
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 0 }).expect(200);
    expect(await ordersOf(f1)).toEqual(before);
  });

  it('fra file dello stesso settore: arriva fra ordini sparsi, e la fila d’origine resta col buco', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(adminT))
      .send({ rowId: f2, position: 1 }).expect(200);
    // MV-4 NON si muove: la traslazione parte da destOrders[position] = 20, non dalla testa della
    // fila. È il caso che giustifica la regola di §7.1 — se partisse da 10 la sequenza sarebbe la
    // stessa (MV-4, MV-1, MV-5) e solo i valori la smaschererebbero.
    expect(await ordersOf(f2)).toEqual([['MV-4', 10], ['MV-1', 20], ['MV-5', 21]]);
    // Il buco a 1 e' deliberato: compattare la fila d'origine sarebbe una terza scrittura per
    // riallineare un valore che nessun consumatore legge.
    expect(await ordersOf(f1)).toEqual([['MV-2', 2], ['MV-3', 3]]);
  });

  it('fra settori dello stesso kind: MV-1 passa a Levante e la struttura lo mostra lì', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m1}/move`).set(...bearer(adminT))
      .send({ rowId: lev, position: 0 }).expect(200);
    expect(await ordersOf(lev)).toEqual([['MV-1', 1], ['MV-L1', 2], ['MV-L2', 3]]);

    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const levante = (struct.body.sectors as { name: string; rows: { umbrellas: { label: string }[] }[] }[])
      .find((s) => s.name === 'Levante')!;
    expect(levante.rows[0].umbrellas.map((u) => u.label)).toEqual(['MV-1', 'MV-L1', 'MV-L2']);
  });

  it('grid → special: 422 e la fila di partenza non si muove', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m2}/move`).set(...bearer(adminT))
      .send({ rowId: pal, position: 0 }).expect(422);
    expect(res.body.message).toBe('Un ombrellone può spostarsi solo in un settore della stessa tipologia.');
    expect(await ordersOf(f1)).toEqual([['MV-2', 2], ['MV-3', 3]]);
  });

  it('un ritirato non è spostabile: 409, resta sganciato e fuori dalla struttura', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${retired}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 0 }).expect(409);
    expect(res.body.message).toBe('Ombrellone ritirato: ripristinalo prima di spostarlo.');
    // Senza la guardia il move gli riaggancerebbe una fila e lo rimetterebbe in scena, prenotabile:
    // nessuna query di mappa o struttura filtra retiredAt, l'esclusione dipende solo dal rowId.
    const after = await prisma.forTenant(s1, (tx) =>
      tx.umbrella.findUniqueOrThrow({ where: { id: retired }, select: { rowId: true, retiredAt: true } }));
    expect(after.rowId).toBeNull();
    expect(after.retiredAt).not.toBeNull();

    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(JSON.stringify(struct.body)).not.toContain(retired);
  });

  it('fila di un altro lido: 404, la tenancy si asserisce e non si eredita dalla sola RLS', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m2}/move`).set(...bearer(adminT))
      .send({ rowId: foreignRow, position: 0 }).expect(404);
    const after = await prisma.forTenant(s1, (tx) =>
      tx.umbrella.findUniqueOrThrow({ where: { id: m2 }, select: { rowId: true } }));
    expect(after.rowId).toBe(f1);
  });

  it('position oltre la coda della fila di destinazione: 422', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m2}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: 5 }).expect(422);
    expect(res.body.message).toBe('Posizione fuori dalla fila di destinazione.');
  });

  it('position negativa: 400 dal DTO, senza arrivare al service', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${m2}/move`).set(...bearer(adminT))
      .send({ rowId: f1, position: -1 }).expect(400);
  });
});
