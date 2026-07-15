import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTestApp } from './helpers/create-test-app';

/**
 * Rate-limit del canale cliente (D-027). File dedicato con limite basso e deterministico: il
 * throttler è controller-scoped su /customer/*, quindi tocca solo questo canale. Il limite è
 * env-driven (CUSTOMER_THROTTLE_LIMIT) così la suite funzionale lo alza e resta strict in prod.
 */
describe('Customer channel rate-limit (D-027)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Prima di costruire l'app: limite basso così il 429 scatta in modo deterministico.
    process.env.CUSTOMER_THROTTLE_LIMIT = '5';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    delete process.env.CUSTOMER_THROTTLE_LIMIT;
    await app.close();
  });

  it('oltre soglia ravvicinata su /customer/activate -> 429', async () => {
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: 'nope', pin: '000000' });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true); // le prime ~5 -> 401, poi 429
  });
});
