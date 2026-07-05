import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { PlatformMetricsService } from './platform-metrics.service';

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly metrics: PlatformMetricsService,
  ) {}

  async create(input: CreateEstablishmentInput, actorUserId: string): Promise<CreateEstablishmentResponse> {
    // Password temporanea generata SEMPRE server-side (mai scelta dal client), ~12 char url-safe.
    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await this.hasher.hash(temporaryPassword);
    let establishmentId: string;
    try {
      // Establishment + User + audit sono RLS-free → transazione interattiva senza GUC.
      establishmentId = await this.prisma.$transaction(async (tx) => {
        const est = await tx.establishment.create({ data: { name: input.name } });
        await tx.user.create({
          data: { establishmentId: est.id, email: input.adminEmail, passwordHash, role: 'admin' },
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId,
            action: 'create_establishment',
            targetEstablishmentId: est.id,
            metadata: { name: input.name, adminEmail: input.adminEmail },
          },
        });
        return est.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    const establishment = await this.metrics.getOne(establishmentId);
    return { establishment, adminEmail: input.adminEmail, temporaryPassword };
  }

  async suspend(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, true);
  }

  async reactivate(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, false);
  }

  private async setSuspended(id: string, actorUserId: string, suspended: boolean): Promise<PlatformEstablishmentDTO> {
    const existing = await this.prisma.establishment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Stabilimento non trovato');
    await this.prisma.$transaction(async (tx) => {
      await tx.establishment.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } });
      await tx.platformAuditLog.create({
        data: {
          actorUserId,
          action: suspended ? 'suspend_establishment' : 'reactivate_establishment',
          targetEstablishmentId: id,
        },
      });
    });
    return this.metrics.getOne(id);
  }
}
