import type { INestApplication } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

/** Crea un Utente con password hashata (accesso diretto: Utente non ha RLS). */
export async function createUtente(
  prisma: PrismaService,
  params: { email: string; password: string; ruolo: Ruolo; stabilimentoId: string | null },
): Promise<void> {
  const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
  await prisma.utente.create({
    data: {
      email: params.email,
      passwordHash,
      ruolo: params.ruolo,
      stabilimentoId: params.stabilimentoId,
    },
  });
}

/** Fa login via API e ritorna l'accessToken. */
export async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}
