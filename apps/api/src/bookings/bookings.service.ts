import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingDTO, CreateBookingInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toBookingDTO } from './booking.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { toDbDate } from '../common/dates';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Prenotazioni confermate del giorno. */
  async listByDate(date: string): Promise<BookingDTO[]> {
    const tenantId = this.tenant.require();
    const dayDate = toDbDate(date);
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map(toBookingDTO);
  }

  /** Crea una prenotazione GIORNALIERA (type=daily, status=confirmed). */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = toDbDate(input.date);

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // FK nel tenant (RLS: fuori tenant → null → 422)
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }

      // Anti-overlap (ADR-0013): confermate stesso ombrellone, date intersecanti, fascia sovrapposta.
      const sameUmbrella = await tx.booking.findMany({
        where: { umbrellaId: input.umbrellaId, status: 'confirmed' },
        include: { timeSlot: true },
      });
      const conflict = sameUmbrella.some(
        (b) =>
          dateRangesOverlap(b.startDate, b.endDate, day, day) &&
          slotsOverlap(b.timeSlot, slot),
      );
      if (conflict) {
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      }

      return tx.booking.create({
        data: {
          establishmentId: tenantId,
          customerId: input.customerId,
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate: day,
          endDate: day,
          type: 'daily',
          status: 'confirmed',
          totalPrice: input.totalPrice,
        },
      });
    });
    return toBookingDTO(created);
  }

  /** Annulla (soft, status=cancelled). Idempotente sul già annullato. */
  async cancel(id: string): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.status === 'cancelled') return existing;
      return tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
    });
    if (!updated) throw new NotFoundException('Prenotazione non trovata');
    return toBookingDTO(updated);
  }
}
