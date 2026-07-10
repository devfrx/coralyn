import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CustomerAccessStatusDTO, CustomerProvisionResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../identity/password-hasher';
import { generateRawToken, hashToken } from '../credential/token-hash';
import { generatePin } from './pin';

@Injectable()
export class CustomerAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  private ttlHours(): number {
    return Number(this.config.get<string>('CUSTOMER_ENROLLMENT_TTL_HOURS') || '2160');
  }

  /** Provisiona l'accesso del cliente titolare della booking. Invalida enrollment/sessioni vivi
   *  precedenti (rotazione pulita) e crea un nuovo enrollment one-time. admin-only (controller). */
  async provisionAccess(bookingId: string, createdByUserId: string): Promise<CustomerProvisionResponse> {
    const tenantId = this.tenant.require();
    // 1. Risolvi il customer titolare, tenant-scoped (RLS).
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');

    const raw = generateRawToken();
    const pin = generatePin();
    const [tokenHash, pinHash] = [hashToken(raw), await this.hasher.hash(pin)];
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);

    // 2. Tabelle fuori-RLS → prisma diretto (no forTenant). establishmentId denorm = tenantId.
    await this.prisma.$transaction(async (tx) => {
      await tx.customerEnrollmentToken.updateMany({
        where: { customerId: booking.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.customerSession.updateMany({
        where: { customerId: booking.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.customerEnrollmentToken.create({
        data: { customerId: booking.customerId, establishmentId: tenantId, tokenHash, pinHash, expiresAt, createdByUserId },
      });
    });

    const base = (this.config.get<string>('CUSTOMER_APP_URL') || '').replace(/\/$/, '');
    return { activationUrl: `${base}/attiva?token=${raw}`, pin, expiresAt: expiresAt.toISOString() };
  }

  /** Revoca l'accesso del cliente titolare della booking (enrollment + sessioni). admin-only. */
  async revokeAccess(bookingId: string): Promise<void> {
    const tenantId = this.tenant.require();
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.customerEnrollmentToken.updateMany({ where: { customerId: booking.customerId, revokedAt: null }, data: { revokedAt: now } });
      await tx.customerSession.updateMany({ where: { customerId: booking.customerId, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  /** Stato accesso per la Scheda cliente (nessun segreto). */
  async accessStatus(customerId: string): Promise<CustomerAccessStatusDTO> {
    const latest = await this.prisma.customerEnrollmentToken.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { state: 'none', lastActivatedAt: null };
    const state = latest.revokedAt ? 'revoked' : latest.activatedAt ? 'active' : 'issued';
    return { state, lastActivatedAt: latest.activatedAt ? latest.activatedAt.toISOString() : null };
  }
}
