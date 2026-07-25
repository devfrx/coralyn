import type { TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '../../src/configure-app';

/**
 * Bootstrap e2e: **la stessa** `configureApp` di `main.ts`, non una copia allineata a mano.
 * Il PrismaExceptionFilter arriva da APP_FILTER in AppModule, quindi è già attivo in ogni test
 * che importa il modulo (zero drift test-vs-prod per costruzione).
 */
export async function createTestApp(moduleRef: TestingModule): Promise<NestExpressApplication> {
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
