import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CheckoutRentalInput, RentalDTO, RentalsDayDTO, SettlePaymentInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { resolvePayment } from '../bookings/booking.payment';
import { todayInRome, toDbDate } from '../common/dates';
import { RENTAL_INCLUDE, computeAvailability, toRentalDTO } from './rental.projection';

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  async checkout(input: CheckoutRentalInput): Promise<RentalDTO> {
    const t = this.tenant.require();
    const units = input.units ?? 1;
    const row = await this.prisma.forTenant(t, async (tx) => {
      const season = await this.catalog.resolveSeasonWithin(tx, todayInRome());
      if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      const tariff = await tx.rentalTariff.findFirst({ where: { id: input.rentalTariffId } });
      if (!tariff || tariff.archivedAt != null || tariff.rentalItemId !== input.rentalItemId || tariff.seasonId !== season.id)
        throw new UnprocessableEntityException('Tariffa non valida per l’articolo o la stagione');
      if (input.customerId != null) {
        const c = await tx.customer.findFirst({ where: { id: input.customerId } });
        if (!c) throw new UnprocessableEntityException('Cliente non valido');
      }
      const created = await tx.rental.create({ data: {
        establishmentId: t, rentalItemId: input.rentalItemId, rentalTariffId: input.rentalTariffId,
        customerId: input.customerId ?? null, units, totalPrice: Number(tariff.price) * units,
      } });
      return tx.rental.findUniqueOrThrow({ where: { id: created.id }, include: RENTAL_INCLUDE });
    });
    return toRentalDTO(row);
  }

  async returnRental(id: string): Promise<RentalDTO> {
    return this.mutate(id, (r) => {
      if (r.cancelledAt != null) throw new ConflictException('Noleggio annullato: impossibile registrare il rientro');
      return r.returnedAt != null ? {} : { returnedAt: new Date() }; // idempotente
    });
  }

  async cancelRental(id: string): Promise<RentalDTO> {
    return this.mutate(id, (r) => {
      if (r.cancelledAt != null) return {}; // idempotente
      if (Number(r.amountCollected) > 0)
        throw new ConflictException('Storna l’incasso prima di annullare il noleggio');
      return { cancelledAt: new Date() };
    });
  }

  async settlePayment(id: string, input: SettlePaymentInput): Promise<RentalDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const r = await tx.rental.findFirst({ where: { id } });
      if (!r) return null;
      if (r.cancelledAt != null) throw new ConflictException('Noleggio annullato: impossibile registrare l’incasso');
      const res = resolvePayment(input, Number(r.totalPrice), todayInRome());
      if (!res.ok) {
        if (res.reason === 'OVER_TOTAL') throw new UnprocessableEntityException('Importo superiore al totale');
        throw new UnprocessableEntityException('Metodo di pagamento richiesto');
      }
      await tx.rental.update({ where: { id }, data: {
        amountCollected: res.fields.amountCollected, paymentStatus: res.fields.paymentStatus,
        paymentMethod: res.fields.paymentMethod, collectionDate: res.fields.collectionDate ? toDbDate(res.fields.collectionDate) : null,
      } });
      return tx.rental.findUniqueOrThrow({ where: { id }, include: RENTAL_INCLUDE });
    });
    if (!row) throw new NotFoundException('Noleggio non trovato');
    return toRentalDTO(row);
  }

  async listByDate(date?: string): Promise<RentalsDayDTO> {
    const t = this.tenant.require();
    const day = date ?? todayInRome();
    return this.prisma.forTenant(t, async (tx) => {
      const start = new Date(`${day}T00:00:00.000Z`); const end = new Date(`${day}T23:59:59.999Z`);
      const rentals = await tx.rental.findMany({
        where: { startAt: { gte: start, lte: end } }, include: RENTAL_INCLUDE, orderBy: { startAt: 'desc' } });
      const items = await tx.rentalItem.findMany({ where: { archivedAt: null } });
      const out = new Map<string, number>();
      const active = await tx.rental.findMany({ where: { cancelledAt: null, returnedAt: null } });
      for (const a of active) out.set(a.rentalItemId, (out.get(a.rentalItemId) ?? 0) + a.units);
      return {
        rentals: rentals.map(toRentalDTO),
        availability: items.map((i) => computeAvailability(i, out.get(i.id) ?? 0)),
      };
    });
  }

  private async mutate(id: string, patch: (r: { cancelledAt: Date | null; returnedAt: Date | null; amountCollected: unknown }) => object): Promise<RentalDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const r = await tx.rental.findFirst({ where: { id } });
      if (!r) return null;
      const data = patch(r);
      if (Object.keys(data).length > 0) await tx.rental.update({ where: { id }, data });
      return tx.rental.findUniqueOrThrow({ where: { id }, include: RENTAL_INCLUDE });
    });
    if (!row) throw new NotFoundException('Noleggio non trovato');
    return toRentalDTO(row);
  }
}
