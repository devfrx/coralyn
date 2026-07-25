import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTestApp } from './helpers/create-test-app';

/**
 * Irrobustimento dell'auth staff ora che è esposta su Internet (AUD-002/003).
 *
 * Le deroghe D-026/027/029 erano state accettate con la premessa «il login staff non è esposto
 * pubblicamente». La slice deploy del 17/07 lo ha messo dietro Caddy con TLS due giorni dopo, e
 * nessuna delle tre è stata rivalutata: la precondizione viveva nella prosa di una tabella, non
 * in un posto che potesse fallire. Questo file la rende verificabile.
 *
 * File dedicato con limite basso e deterministico, stesso schema di `customer-throttle`.
 */
describe('Hardening auth staff (D-026/027/029)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // Prima di costruire l'app: il limite è risolto per richiesta, ma la topologia no.
    process.env.STAFF_AUTH_THROTTLE_LIMIT = '3';
    process.env.TRUST_PROXY_HOPS = '2';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    delete process.env.STAFF_AUTH_THROTTLE_LIMIT;
    delete process.env.TRUST_PROXY_HOPS;
    await app.close();
  });

  describe('rate-limit del login', () => {
    it('oltre soglia su POST /auth/login → 429', async () => {
      let got429 = false;
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'ignoto@e2e.test', password: 'qualsiasi' });
        if (res.status === 429) {
          got429 = true;
          break;
        }
        expect(res.status).toBe(401); // prima della soglia: 401 generico, mai un ramo osservabile
      }
      expect(got429).toBe(true);
    });

    it('il bucket è PER-HANDLER: /auth/me resta raggiungibile con /auth/login esaurito', async () => {
      // Se il throttler fosse di classe, /auth/me — chiamata a ogni caricamento dell'app —
      // condividerebbe il bucket del login e diventerebbe il primo 429 della giornata.
      // 401 = la richiesta ha raggiunto la JwtAuthGuard, cioè non è stata bloccata dal limite.
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('il canale cliente ha il PROPRIO limite, non quello del login staff', async () => {
      // Con una seconda definizione nominata il guard le valuterebbe tutte e questa rotta
      // erediterebbe anche il limite 3 dello staff. La sovrascrittura per-rotta lo impedisce:
      // 4 richieste (> 3) devono passare il throttler e fermarsi sull'autenticazione.
      for (let i = 0; i < 4; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/customer/refresh')
          .send({ refreshToken: 'nope' });
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('trust proxy', () => {
    it('è impostato al numero di hop dichiarato, non a `true`', () => {
      const express = app.getHttpAdapter().getInstance();
      expect(express.get('trust proxy')).toBe(2);
    });

    it('si fida esattamente dei 2 hop davanti, e non oltre', () => {
      // Express compila l'impostazione in un predicato (indirizzo, distanza-dal-socket).
      // Il valore numerico da solo non basta: `true` produrrebbe un predicato sempre vero,
      // cioè `X-Forwarded-For` falsificabile da chiunque — ed è il difetto da evitare.
      const trust = app.getHttpAdapter().getInstance().get('trust proxy fn') as (
        addr: string,
        hop: number,
      ) => boolean;
      expect(trust('10.0.0.1', 0)).toBe(true); // nginx del container web
      expect(trust('10.0.0.1', 1)).toBe(true); // Caddy
      expect(trust('10.0.0.1', 2)).toBe(false); // oltre: è il client, non ci si fida
    });
  });
});
