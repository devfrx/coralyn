import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

/**
 * Bootstrap e2e allineato a main.ts: prefix `api` + ValidationPipe(whitelist,transform) + init.
 * Il PrismaExceptionFilter NON va applicato qui: è registrato via APP_FILTER in AppModule, quindi
 * è già attivo in ogni test che importa AppModule (zero drift test-vs-prod per costruzione).
 */
export async function createTestApp(moduleRef: TestingModule): Promise<INestApplication> {
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}
