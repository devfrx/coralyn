import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, type Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, DeleteCustomerResult } from '@coralyn/contracts';
import { todayInRome, toDbDate, formatDbDate } from '../common/dates';
import { computeRenewalWindowState } from '../bookings/renewal-window.projection';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Proietta una riga Customer nel DTO condiviso, mappando null → undefined. */
  private toDTO(c: Customer): CustomerDTO {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      notes: c.notes ?? undefined,
      anonymizedAt: c.anonymizedAt?.toISOString() ?? undefined,
    };
  }

  async list(): Promise<CustomerDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findMany({ where: { anonymizedAt: null } }),
    );
    return rows.map((c) => this.toDTO(c));
  }

  async getById(id: string): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findFirst({ where: { id } }),
    );
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }

  async create(input: CreateCustomerInput): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.create({ data: { establishmentId: tenantId, ...input } }),
    );
    return this.toDTO(c);
  }

  async update(id: string, input: UpdateCustomerInput): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.customer.update({ where: { id }, data: input });
    });
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }

  /** Diritto all'oblio (GDPR D-024): 0 prenotazioni → delete; con storico passato → anonimizza;
   *  con prenotazione attiva/futura → 409. */
  async remove(id: string, actorUserId: string): Promise<DeleteCustomerResult> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Cliente non trovato');

      const total = await tx.booking.count({ where: { customerId: id } });
      if (total === 0) {
        await tx.customer.delete({ where: { id } });
        return { outcome: 'deleted' as const };
      }

      const active = await tx.booking.count({
        where: { customerId: id, status: BookingStatus.confirmed, endDate: { gte: toDbDate(todayInRome()) } },
      });
      if (active > 0) {
        throw new ConflictException(
          'Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.',
        );
      }

      // Blocco su prelazione di rinnovo aperta (review finale D-024): un'origine SCADUTA non è
      // catturata dal controllo `active` sopra, ma una campagna ancora attiva può offrire al
      // cliente priorità di rinnovo per una stagione futura — è una relazione attiva. Stato
      // derivato con la fonte UNICA condivisa `computeRenewalWindowState` (no duplicazione).
      const activeCampaigns = await tx.renewalCampaign.findMany({
        where: { deadline: { gte: toDbDate(todayInRome()) } },
      });
      for (const campaign of activeCampaigns) {
        const origin = await tx.season.findFirst({ where: { id: campaign.originSeasonId } });
        const dest = await tx.season.findFirst({ where: { id: campaign.destinationSeasonId } });
        if (!origin || !dest) continue;

        const eligibleSubs = await tx.booking.findMany({
          where: {
            customerId: id,
            type: 'subscription',
            status: BookingStatus.confirmed,
            startDate: { lte: origin.endDate },
            endDate: { gte: origin.startDate },
          },
          include: { renewals: true },
        });

        const deadlineIso = formatDbDate(campaign.deadline);
        const todayIso = todayInRome();
        const hasOpenWindow = eligibleSubs.some(
          (b) => computeRenewalWindowState(b.renewals, dest.startDate, dest.endDate, deadlineIso, todayIso) === 'open',
        );
        if (hasOpenWindow) {
          throw new ConflictException(
            'Il cliente ha una prelazione di rinnovo aperta: chiudi la campagna o attendine la scadenza prima di rimuovere i dati.',
          );
        }
      }

      await tx.customer.update({
        where: { id },
        data: {
          firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null,
          anonymizedAt: new Date(), anonymizedBy: actorUserId,
        },
      });
      return { outcome: 'anonymized' as const };
    });
  }
}
