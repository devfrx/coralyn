import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Permission } from '@coralyn/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';
import { createEstablishment } from './helpers/create-establishment';

/**
 * Permessi dello staff configurabili dall'admin del lido (D-063, ADR-0063).
 *
 * Due lidi **nella stessa suite**, e non è cerimonia: il titolo della slice dice «configurabile
 * **invece che** uguale per tutti», quindi il fixture deve contenere l'alternativa. Con un lido
 * solo, una risoluzione che ignorasse il tenant passerebbe tutti i test.
 *
 * Ambito dichiarato: si asserisce la **risoluzione** e la sua amministrazione, non il dominio.
 * Sulle superfici concesse basta «non 403»; su quelle negate si asserisce 403 esatto.
 */
describe('Permessi configurabili dello staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lidoA: TenantId;
  let lidoB: TenantId;
  let staffA: string; // id
  let staffB: string; // id
  let adminAT: string; // token
  let adminBT: string;
  let staffAT: string;
  let staffBT: string;
  let adminAId: string;

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
  const EMAILS = [
    'perm.admin.a@e2e.test', 'perm.staff.a@e2e.test',
    'perm.admin.b@e2e.test', 'perm.staff.b@e2e.test',
  ];

  /** Il default di fabbrica dello staff, meno i due non configurabili. Punto di partenza. */
  const DEFAULT_STAFF = [
    Permission.MapRead, Permission.BookingsManage, Permission.CustomersManage,
    Permission.RentalsOperate, Permission.RentalCatalogManage, Permission.PricingManage,
    Permission.RenewalsManage, Permission.ReportsRead, Permission.EstablishmentRead,
    Permission.StructureRead,
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    lidoA = await createEstablishment(prisma, 'PERM A');
    lidoB = await createEstablishment(prisma, 'PERM B');
    adminAId = await createUser(prisma, { email: EMAILS[0], password: 'pw-a-adm', role: Role.admin, establishmentId: lidoA });
    staffA = await createUser(prisma, { email: EMAILS[1], password: 'pw-a-stf', role: Role.staff, establishmentId: lidoA });
    await createUser(prisma, { email: EMAILS[2], password: 'pw-b-adm', role: Role.admin, establishmentId: lidoB });
    staffB = await createUser(prisma, { email: EMAILS[3], password: 'pw-b-stf', role: Role.staff, establishmentId: lidoB });

    adminAT = await login(app, EMAILS[0], 'pw-a-adm');
    staffAT = await login(app, EMAILS[1], 'pw-a-stf');
    adminBT = await login(app, EMAILS[2], 'pw-b-adm');
    staffBT = await login(app, EMAILS[3], 'pw-b-stf');
  });

  afterEach(async () => {
    // Ogni test riparte dal default di fabbrica: senza, l'ordine dei test diventa significativo
    // e un fallimento ne trascinerebbe altri per contagio invece che per causa.
    await prisma.staffPermissionOverride.deleteMany({ where: { userId: { in: [staffA, staffB] } } });
  });

  afterAll(async () => {
    await prisma.staffPermissionOverride.deleteMany({ where: { userId: { in: [staffA, staffB] } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [lidoA, lidoB] } } });
    await app.close();
  });

  const setPermissions = (token: string, id: string, permissions: Permission[]) =>
    request(app.getHttpServer()).put(`/api/establishment/users/${id}/permissions`).set(...bearer(token)).send({ permissions });

  describe('la configurazione discrimina davvero', () => {
    it('di fabbrica lo staff ha pricing.manage, e /seasons non gli è negata', async () => {
      // Il presupposto del test che segue. Senza, «revocare funziona» sarebbe indistinguibile da
      // «non l'ha mai avuto».
      const res = await request(app.getHttpServer()).get(`/api/establishment/users/${staffA}/permissions`).set(...bearer(adminAT)).expect(200);
      expect(res.body.permissions).toContain(Permission.PricingManage);
      const seasons = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT));
      expect(seasons.status).not.toBe(403);
    });

    it('REVOCATO pricing.manage, lo stesso staff riceve 403 su /seasons', async () => {
      await setPermissions(adminAT, staffA, DEFAULT_STAFF.filter((p) => p !== Permission.PricingManage)).expect(200);
      await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT)).expect(403);
    });

    it('CONCESSO structure.manage — che il default nega — lo staff non è più bloccato', async () => {
      await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(staffAT)).expect(403);
      await setPermissions(adminAT, staffA, [...DEFAULT_STAFF, Permission.StructureManage]).expect(200);
      const dopo = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(staffAT));
      expect(dopo.status).not.toBe(403);
    });

    it('l’effetto è immediato: nessun nuovo login fra la revoca e il 403', async () => {
      // È la proprietà per cui i permessi NON viaggiano nel token (ADR-0063): con il JWT staff
      // che dura 8h e non ha revoca (D-026), qui servirebbe un nuovo accesso.
      const prima = await request(app.getHttpServer()).get('/api/reports/summary').set(...bearer(staffAT));
      expect(prima.status).not.toBe(403);
      await setPermissions(adminAT, staffA, DEFAULT_STAFF.filter((p) => p !== Permission.ReportsRead)).expect(200);
      await request(app.getHttpServer()).get('/api/reports/summary').set(...bearer(staffAT)).expect(403);
    });

    it('la revoca è reversibile: riconcedendo, la superficie torna accessibile', async () => {
      await setPermissions(adminAT, staffA, []).expect(200);
      await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT)).expect(403);
      await setPermissions(adminAT, staffA, DEFAULT_STAFF).expect(200);
      const dopo = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT));
      expect(dopo.status).not.toBe(403);
    });
  });

  describe('isolamento fra lidi', () => {
    it('il lido A che revoca non tocca lo staff del lido B', async () => {
      await setPermissions(adminAT, staffA, []).expect(200);
      await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT)).expect(403);
      const b = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffBT));
      expect(b.status).not.toBe(403);
    });

    it('l’admin del lido A non può leggere i permessi di un operatore del lido B → 404', async () => {
      await request(app.getHttpServer()).get(`/api/establishment/users/${staffB}/permissions`).set(...bearer(adminAT)).expect(404);
    });

    it('l’admin del lido A non può configurare un operatore del lido B → 404, e nulla viene scritto', async () => {
      await setPermissions(adminAT, staffB, []).expect(404);
      const righe = await prisma.staffPermissionOverride.count({ where: { userId: staffB } });
      expect(righe).toBe(0);
      // …e il lido B resta operativo.
      const b = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffBT));
      expect(b.status).not.toBe(403);
    });

    it('l’admin del lido B configura il PROPRIO staff senza toccare quello del lido A', async () => {
      await setPermissions(adminBT, staffB, []).expect(200);
      await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffBT)).expect(403);
      const a = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(staffAT));
      expect(a.status).not.toBe(403);
    });
  });

  describe('l’invariante di tenant è nel DATABASE, non nel service', () => {
    it('un INSERT diretto con l’establishmentId dell’altro lido è respinto dalla FK composita', async () => {
      // SQL grezzo di proposito: passare dal service proverebbe il service. Qui si prova che anche
      // un difetto applicativo futuro — o una query scritta a mano — non può creare la riga
      // cross-tenant che RLS avrebbe impedito su una tabella tenant-scoped (ADR-0063).
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "StaffPermissionOverride" ("userId","establishmentId","permission","granted","updatedAt")
           VALUES ($1::uuid, $2::uuid, 'pricing.manage', false, now())`,
          staffA,
          lidoB,
        ),
      ).rejects.toThrow();
      const righe = await prisma.staffPermissionOverride.count({ where: { userId: staffA } });
      expect(righe).toBe(0);
    });

    it('lo stesso INSERT col tenant CORRETTO passa: il vincolo discrimina, non blocca tutto', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "StaffPermissionOverride" ("userId","establishmentId","permission","granted","updatedAt")
         VALUES ($1::uuid, $2::uuid, 'pricing.manage', false, now())`,
        staffA,
        lidoA,
      );
      expect(await prisma.staffPermissionOverride.count({ where: { userId: staffA } })).toBe(1);
    });
  });

  describe('cosa non è configurabile', () => {
    it('session.read nel body → 400: rifiutato, non ignorato in silenzio', async () => {
      await setPermissions(adminAT, staffA, [...DEFAULT_STAFF, Permission.SessionRead]).expect(400);
    });

    it('platform.administer nel body → 400', async () => {
      await setPermissions(adminAT, staffA, [...DEFAULT_STAFF, Permission.PlatformAdminister]).expect(400);
    });

    it('un valore che non è un permesso → 400', async () => {
      await request(app.getHttpServer()).put(`/api/establishment/users/${staffA}/permissions`)
        .set(...bearer(adminAT)).send({ permissions: ['inventato.a.mano'] }).expect(400);
    });

    it('revocare TUTTO non toglie session.read: lo staff continua a leggere la propria sessione', async () => {
      await setPermissions(adminAT, staffA, []).expect(200);
      await request(app.getHttpServer()).get('/api/auth/me').set(...bearer(staffAT)).expect(200);
    });

    it('l’admin non è configurabile → 422', async () => {
      await setPermissions(adminAT, adminAId, []).expect(422);
    });
  });

  describe('chi può configurare', () => {
    it('lo staff non può leggere i permessi di nessuno → 403 (team.manage)', async () => {
      await request(app.getHttpServer()).get(`/api/establishment/users/${staffA}/permissions`).set(...bearer(staffAT)).expect(403);
    });

    it('lo staff non può configurare nemmeno se stesso → 403', async () => {
      await setPermissions(staffAT, staffA, [...DEFAULT_STAFF, Permission.StructureManage]).expect(403);
    });

    it('uno staff a cui è stato CONCESSO team.manage può configurare — è il senso della slice', async () => {
      await setPermissions(adminAT, staffA, [...DEFAULT_STAFF, Permission.TeamManage]).expect(200);
      const res = await request(app.getHttpServer()).get(`/api/establishment/users/${staffA}/permissions`).set(...bearer(staffAT));
      expect(res.status).toBe(200);
    });
  });

  describe('/auth/me porta i permessi effettivi', () => {
    it('riflette la revoca, così il frontend può nascondere ciò che il backend nega', async () => {
      await setPermissions(adminAT, staffA, DEFAULT_STAFF.filter((p) => p !== Permission.PricingManage)).expect(200);
      const me = await request(app.getHttpServer()).get('/api/auth/me').set(...bearer(staffAT)).expect(200);
      expect(me.body.permissions).not.toContain(Permission.PricingManage);
      expect(me.body.permissions).toContain(Permission.MapRead);
    });

    it('per l’admin porta i permessi admin-only, non configurabili', async () => {
      const me = await request(app.getHttpServer()).get('/api/auth/me').set(...bearer(adminAT)).expect(200);
      expect(me.body.permissions).toContain(Permission.TeamManage);
      expect(me.body.permissions).not.toContain(Permission.PlatformAdminister);
    });
  });
});
