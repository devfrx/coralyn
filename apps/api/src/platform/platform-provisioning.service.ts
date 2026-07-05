import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { PlatformMetricsService } from './platform-metrics.service';
import { CredentialSetupService } from '../credential/credential-setup.service';

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly metrics: PlatformMetricsService,
    private readonly credentials: CredentialSetupService,
  ) {}

  async create(input: CreateEstablishmentInput, actorUserId: string): Promise<CreateEstablishmentResponse> {
    // Hash INUTILIZZABILE: l'admin non conosce alcuna password finché non la imposta via invito.
    const unusableHash = await this.hasher.hash(randomBytes(32).toString('base64url'));
    let establishmentId: string;
    let adminUserId: string;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const est = await tx.establishment.create({ data: { name: input.name } });
        const user = await tx.user.create({
          data: { establishmentId: est.id, email: input.adminEmail, passwordHash: unusableHash, role: 'admin' },
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId,
            action: 'create_establishment',
            targetEstablishmentId: est.id,
            metadata: { name: input.name, adminEmail: input.adminEmail, invited: true },
          },
        });
        return { estId: est.id, userId: user.id };
      });
      establishmentId = created.estId;
      adminUserId = created.userId;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    const { expiresAt } = await this.credentials.issueAndSend(adminUserId, input.adminEmail, 'invite', actorUserId);
    const establishment = await this.metrics.getOne(establishmentId);
    return { establishment, adminEmail: input.adminEmail, expiresAt: expiresAt.toISOString() };
  }

  /** Reset password dell'admin del lido: emette un invito `reset` via email. 409 se ≠1 admin attivo. */
  async resetAdminPassword(establishmentId: string, actorUserId: string): Promise<ResetAdminPasswordResponse> {
    const est = await this.prisma.establishment.findUnique({ where: { id: establishmentId }, select: { id: true } });
    if (!est) throw new NotFoundException('Stabilimento non trovato');
    const admins = await this.prisma.user.findMany({
      where: { establishmentId, role: 'admin', disabledAt: null },
      select: { id: true, email: true },
    });
    if (admins.length !== 1) {
      throw new ConflictException('Il lido non ha un unico admin attivo: reset non disponibile da qui');
    }
    const admin = admins[0];
    const { expiresAt } = await this.credentials.issueAndSend(admin.id, admin.email, 'reset', actorUserId);
    await this.prisma.platformAuditLog.create({
      data: { actorUserId, action: 'reset_admin_password', targetEstablishmentId: establishmentId, metadata: { adminEmail: admin.email } },
    });
    return { adminEmail: admin.email, expiresAt: expiresAt.toISOString() };
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
