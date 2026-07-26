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

/**
 * Il ruolo `staff` esercitato sulle superfici che lo riguardano (ADR-0057).
 *
 * Perché esiste: prima dell'inversione fail-closed, 9 controller di dominio non dichiaravano
 * alcuna autorizzazione, e **nessuno dei loro file e2e creava un utente `staff`** — fanno tutti
 * login come `admin`. Conseguenza: restringere quei controller ad admin-only avrebbe lasciato la
 * suite **verde** rompendo Listino, Listino noleggi, Rinnovi e il banco Noleggi per lo staff.
 * Questo file chiude quel punto cieco: da qui in poi una stretta involontaria fallisce.
 *
 * Ambito dichiarato: si asserisce il **guard**, non il dominio. Per le superfici concesse si
 * verifica che la richiesta non venga né negata (403) né persa per un path sbagliato (404); il
 * corpo della risposta è materia degli e2e specifici. Per quelle negate si asserisce 403 esatto.
 */
describe('Autorizzazione del ruolo staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: TenantId;
  let staffT: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
  const EMAILS = ['authz.staff@e2e.test'];
  const D = '2026-07-15'; // calendario e2e congelato
  const UUID = '00000000-0000-4000-8000-0000000000ff'; // inesistente: il guard scatta prima

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    s1 = await createEstablishment(prisma, 'AUTHZ STAFF');
    await createUser(prisma, { email: EMAILS[0], password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    staffT = await login(app, EMAILS[0], 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  describe('superfici operative: lo staff NON deve essere bloccato', () => {
    const concesse: [string, string][] = [
      ['GET', `/api/map?date=${D}`],
      ['GET', `/api/bookings?date=${D}`],
      ['GET', '/api/seasons'],
      ['GET', '/api/rates'],
      ['GET', '/api/packages'],
      ['GET', '/api/equipment-types'],
      ['GET', '/api/time-slots'],
      ['GET', `/api/rentals?date=${D}`],
      ['GET', '/api/rental-items'],
      ['GET', '/api/reports/summary'],
      ['GET', '/api/establishment/overview'],
      ['GET', '/api/establishment/umbrellas/retired'],
      ['GET', '/api/auth/me'],
    ];

    it.each(concesse)('%s %s → né 403 né 404', async (method, path) => {
      const agent = request(app.getHttpServer());
      const res = await agent[method.toLowerCase() as 'get'](path).set(...bearer(staffT));
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    // Scrittura, non solo lettura: il body vuoto viene rifiutato dal ValidationPipe, che gira DOPO
    // i guard. Un 400 prova quindi che il permesso è stato concesso, senza creare dati da ripulire.
    it.each([
      ['/api/seasons'],
      ['/api/packages'],
      ['/api/equipment-types'],
      ['/api/time-slots'],
      ['/api/rental-items'],
    ])('POST %s con body vuoto → 400 (validazione), non 403', async (path) => {
      await request(app.getHttpServer()).post(path).set(...bearer(staffT)).send({}).expect(400);
    });
  });

  describe('superfici di amministrazione: 403 per lo staff', () => {
    it('PATCH /establishment (rinomina)', async () => {
      await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(staffT)).send({ name: 'X' }).expect(403);
    });
    it('GET /establishment/setup-status', async () => {
      await request(app.getHttpServer()).get('/api/establishment/setup-status').set(...bearer(staffT)).expect(403);
    });
    it('GET /establishment/structure', async () => {
      await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(staffT)).expect(403);
    });
    it('GET /establishment/legal-profile', async () => {
      await request(app.getHttpServer()).get('/api/establishment/legal-profile').set(...bearer(staffT)).expect(403);
    });
    // D-064: le email degli operatori sono PII che lo staff non ha ragione di leggere. Stanno qui
    // e non nell'overview, che invece resta concessa (lista sopra) perché la usa l'app-shell.
    it('GET /establishment/users (email degli operatori)', async () => {
      await request(app.getHttpServer()).get('/api/establishment/users').set(...bearer(staffT)).expect(403);
    });
    it('POST /establishment/sectors', async () => {
      await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(staffT)).send({ name: 'S' }).expect(403);
    });
    it('DELETE /customers/:id (cancellazione GDPR)', async () => {
      await request(app.getHttpServer()).delete(`/api/customers/${UUID}`).set(...bearer(staffT)).expect(403);
    });
    it('POST /bookings/:id/suspend (ciclo di vita abbonamento)', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${UUID}/suspend`).set(...bearer(staffT)).send({}).expect(403);
    });
    it('GET /bookings/:id/customer-access (QR + PIN del bagnante)', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/${UUID}/customer-access`).set(...bearer(staffT)).expect(403);
    });
    it('GET /platform/establishments (cross-tenant)', async () => {
      await request(app.getHttpServer()).get('/api/platform/establishments').set(...bearer(staffT)).expect(403);
    });

    // Il guard gira PRIMA del ValidationPipe: un body invalido su una rotta negata dà 403, non 400.
    // Senza questo ordine un attaccante potrebbe distinguere «rotta esistente» da «rotta protetta».
    it('POST /establishment/users con body vuoto → 403, non 400', async () => {
      await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(staffT)).send({}).expect(403);
    });
  });
});
