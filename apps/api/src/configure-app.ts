import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Configurazione dell'istanza Nest, condivisa fra `main.ts` e il bootstrap delle e2e.
 *
 * Esisteva già in due copie (prefisso + ValidationPipe): finché erano due righe la duplicazione
 * era innocua, ma `trust proxy` è la terza e cambia il comportamento di una difesa. Con due copie
 * le e2e girerebbero su un'app configurata diversamente dalla produzione, e un test sul
 * rate-limiting verificherebbe qualcosa che in produzione non esiste.
 *
 * Il `PrismaExceptionFilter` NON è qui: è registrato via `APP_FILTER` dentro `AppModule`, quindi
 * è già attivo ovunque si monti il modulo — zero drift per costruzione, che è la forma migliore.
 */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Quanti reverse proxy stanno DAVANTI all'API. In produzione la catena è
  // browser → Caddy → nginx del container web → api, quindi 2 (deploy/Caddyfile + i tre
  // nginx.conf, che impostano X-Forwarded-For).
  //
  // Il default è 0 — non fidarsi di alcun XFF — perché in dev e nelle e2e non c'è proxy e un
  // valore fidato di troppo renderebbe `req.ip` falsificabile da un header del client. Il numero,
  // non `true`: `true` accetta l'intera catena XFF, quindi chiunque può dichiararsi qualunque IP.
  //
  // Senza questo, `req.ip` è lo stesso identico valore per ogni richiesta che passa dal proxy:
  // il rate-limit del canale cliente diventa un bucket GLOBALE per tutti i bagnanti di tutti i
  // lidi, e superate le soglie in aggregato il refresh riceve 429, l'interceptor lo legge come
  // sessione morta e slogga. Il canale si autodistrugge a due cifre di utenti (AUD-002).
  const hops = Number(app.get(ConfigService).get<string>('TRUST_PROXY_HOPS') ?? '0');
  app.set('trust proxy', hops);
}
