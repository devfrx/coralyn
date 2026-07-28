import type { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Crea un User con password hashata (accesso diretto: User non ha RLS) e ne ritorna l'**id**.
 *
 * L'id serve a chi esercita gli endpoint che prendono un `:id` di operatore — i permessi
 * configurabili (ADR-0063) — e restituirlo qui evita una `findUnique` per email in ogni suite.
 * I chiamanti che lo ignorano restano validi: la firma passa da `void` a `string`.
 */
export async function createUser(
  prisma: PrismaService,
  params: { email: string; password: string; role: Role; establishmentId: string | null },
): Promise<string> {
  const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      role: params.role,
      establishmentId: params.establishmentId,
    },
    select: { id: true },
  });
  return user.id;
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
