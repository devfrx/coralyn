import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  // Tipizzata come NestExpressApplication: serve `app.set('trust proxy', …)` in configureApp.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // ⚠️ Questa riga è cercata dal Passo 7 di docs/deploy/README.md: nei log del container è l'unico
  // segnale che l'API ha finito di partire (`ps` dice "running" da prima). Finché non esisteva, la
  // guida faceva cercare una stringa che nessuno stampava (P8-011) — il fix era aggiungere il log,
  // non correggere la guida. Il presidio che le tiene insieme è `deploy-guide.spec.ts`.
  new Logger('Bootstrap').log(`avvio API su :${port}`);
}
void bootstrap();
