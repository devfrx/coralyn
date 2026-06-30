import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

describe('Customers (e2e) isolamento per tenant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // allineato a main.ts
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'E2E A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'E2E B' } })).id;
    await createUser(prisma, {
      email: 'admin.s1@e2e.test',
      password: 'pw-s1',
      role: Role.admin,
      establishmentId: s1,
    });
    await createUser(prisma, {
      email: 'admin.s2@e2e.test',
      password: 'pw-s2',
      role: Role.admin,
      establishmentId: s2,
    });
    token1 = await login(app, 'admin.s1@e2e.test', 'pw-s1');
    token2 = await login(app, 'admin.s2@e2e.test', 'pw-s2');
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
    await prisma.user.deleteMany({
      where: { email: { in: ['admin.s1@e2e.test', 'admin.s2@e2e.test'] } },
    });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  it('richiede autenticazione: senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/customers').expect(401);
  });

  it('crea un cliente per s1 e non lo mostra a s2', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Mario', lastName: 'Rossi' })
      .expect(201);

    const resS1 = await request(app.getHttpServer())
      .get('/api/customers')
      .set(...bearer(token1))
      .expect(200);
    expect(resS1.body).toHaveLength(1);

    const resS2 = await request(app.getHttpServer())
      .get('/api/customers')
      .set(...bearer(token2))
      .expect(200);
    expect(resS2.body).toHaveLength(0);
  });

  it('crea un cliente coi contatti e li ritorna nel DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({
        firstName: 'Anna',
        lastName: 'Bianchi',
        phone: '+39 333 1234567',
        email: 'anna.bianchi@email.it',
        notes: 'Cliente storica',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      firstName: 'Anna',
      lastName: 'Bianchi',
      phone: '+39 333 1234567',
      email: 'anna.bianchi@email.it',
      notes: 'Cliente storica',
    });
    expect(res.body.id).toBeDefined();
  });

  it('GET /:id ritorna il cliente al proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Carlo', lastName: 'Verdi' })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/customers/${id}`)
      .set(...bearer(token1))
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ id, firstName: 'Carlo', lastName: 'Verdi' }));

    await request(app.getHttpServer())
      .get(`/api/customers/${id}`)
      .set(...bearer(token2))
      .expect(404);
  });

  it('PATCH /:id aggiorna i contatti del proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Dora', lastName: 'Neri' })
      .expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .set(...bearer(token1))
      .send({ phone: '+39 340 0000000', notes: 'preferisce prima fila' })
      .expect(200);
    expect(patched.body).toMatchObject({
      id,
      phone: '+39 340 0000000',
      notes: 'preferisce prima fila',
    });

    await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .set(...bearer(token2))
      .send({ phone: '+39 111' })
      .expect(404);
  });

  it('rifiuta email malformata con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Eva', lastName: 'Gialli', email: 'non-una-email' })
      .expect(400);
  });

  it('tratta i contatti vuoti come assenti (come fa il form della scheda)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Senza', lastName: 'Contatti', phone: '', email: '', notes: '' })
      .expect(201);
    expect(created.body.phone).toBeUndefined();
    expect(created.body.email).toBeUndefined();
    expect(created.body.notes).toBeUndefined();

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.id}`)
      .set(...bearer(token1))
      .send({ phone: '  +39 333 1212121  ', email: '', notes: '' })
      .expect(200);
    expect(patched.body.phone).toBe('+39 333 1212121');
    expect(patched.body.email).toBeUndefined();
  });

  it('cancella un contatto esistente svuotando il campo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Aveva', lastName: 'Email', email: 'aveva@email.it' })
      .expect(201);
    expect(created.body.email).toBe('aveva@email.it');

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.id}`)
      .set(...bearer(token1))
      .send({ email: '' })
      .expect(200);
    expect(patched.body.email).toBeUndefined();
  });
});
