import type { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

/** Crea un User con password hashata (accesso diretto: User non ha RLS). */
export async function createUser(
  prisma: PrismaService,
  params: { email: string; password: string; role: Role; establishmentId: string | null },
): Promise<void> {
  const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      role: params.role,
      establishmentId: params.establishmentId,
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
