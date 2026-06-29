import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clienti (e2e) isolamento per tenant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // allineato a main.ts
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.stabilimento.create({ data: { nome: 'E2E A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'E2E B' } })).id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.cliente.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.cliente.deleteMany({}));
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('crea un cliente per s1 e non lo mostra a s2', async () => {
    await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Mario', cognome: 'Rossi' })
      .expect(201);

    const resS1 = await request(app.getHttpServer())
      .get('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .expect(200);
    expect(resS1.body).toHaveLength(1);

    const resS2 = await request(app.getHttpServer())
      .get('/api/clienti')
      .set('X-Stabilimento-Id', s2)
      .expect(200);
    expect(resS2.body).toHaveLength(0);
  });

  it('crea un cliente coi contatti e li ritorna nel DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({
        nome: 'Anna',
        cognome: 'Bianchi',
        telefono: '+39 333 1234567',
        email: 'anna.bianchi@email.it',
        note: 'Cliente storica',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      nome: 'Anna',
      cognome: 'Bianchi',
      telefono: '+39 333 1234567',
      email: 'anna.bianchi@email.it',
      note: 'Cliente storica',
    });
    expect(res.body.id).toBeDefined();
  });

  it('GET /:id ritorna il cliente al proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Carlo', cognome: 'Verdi' })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/clienti/${id}`)
      .set('X-Stabilimento-Id', s1)
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ id, nome: 'Carlo', cognome: 'Verdi' }));

    await request(app.getHttpServer())
      .get(`/api/clienti/${id}`)
      .set('X-Stabilimento-Id', s2)
      .expect(404);
  });

  it('PATCH /:id aggiorna i contatti del proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Dora', cognome: 'Neri' })
      .expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${id}`)
      .set('X-Stabilimento-Id', s1)
      .send({ telefono: '+39 340 0000000', note: 'preferisce prima fila' })
      .expect(200);
    expect(patched.body).toMatchObject({
      id,
      telefono: '+39 340 0000000',
      note: 'preferisce prima fila',
    });

    await request(app.getHttpServer())
      .patch(`/api/clienti/${id}`)
      .set('X-Stabilimento-Id', s2)
      .send({ telefono: '+39 111' })
      .expect(404);
  });

  it('rifiuta email malformata con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Eva', cognome: 'Gialli', email: 'non-una-email' })
      .expect(400);
  });

  it('tratta i contatti vuoti come assenti (come fa il form della scheda)', async () => {
    // Un cliente senza email: il form invia comunque email:'' al salvataggio.
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Senza', cognome: 'Contatti', telefono: '', email: '', note: '' })
      .expect(201);
    // stringhe vuote → campi assenti nel DTO (null in DB → undefined nel DTO)
    expect(created.body.telefono).toBeUndefined();
    expect(created.body.email).toBeUndefined();
    expect(created.body.note).toBeUndefined();

    // PATCH con email vuota NON deve dare 400 (il @IsEmail non scatta su valore assente)
    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${created.body.id}`)
      .set('X-Stabilimento-Id', s1)
      .send({ telefono: '  +39 333 1212121  ', email: '', note: '' })
      .expect(200);
    expect(patched.body.telefono).toBe('+39 333 1212121'); // trim applicato
    expect(patched.body.email).toBeUndefined();
  });

  it('cancella un contatto esistente svuotando il campo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Aveva', cognome: 'Email', email: 'aveva@email.it' })
      .expect(201);
    expect(created.body.email).toBe('aveva@email.it');

    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${created.body.id}`)
      .set('X-Stabilimento-Id', s1)
      .send({ email: '' })
      .expect(200);
    expect(patched.body.email).toBeUndefined(); // svuotare = cancellare (→ null in DB)
  });
});
