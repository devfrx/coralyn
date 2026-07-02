import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateTimeSlotInput, TimeSlotDTO, UpdateTimeSlotInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbTime, formatDbTime } from '../common/time';
import { toTimeSlotDTO } from './time-slot.projection';

@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<TimeSlotDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' } }),
    );
    return rows.map(toTimeSlotDTO);
  }

  async create(input: CreateTimeSlotInput): Promise<TimeSlotDTO> {
    // "HH:MM" lessicografico == cronologico; semiaperto [start,end) → start < end.
    if (input.startTime >= input.endTime) {
      throw new BadRequestException("L'orario di inizio deve precedere quello di fine.");
    }
    const tenantId = this.tenant.require();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const sortOrder = input.sortOrder ?? (await this.nextSortOrder(tx));
      return tx.timeSlot.create({
        data: {
          establishmentId: tenantId,
          name: input.name,
          startTime: toDbTime(input.startTime),
          endTime: toDbTime(input.endTime),
          sortOrder,
        },
      });
    });
    return toTimeSlotDTO(created);
  }

  async update(id: string, input: UpdateTimeSlotInput): Promise<TimeSlotDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.timeSlot.findFirst({ where: { id } });
      if (!existing) return null;
      // Orario effettivo dopo il patch (input.* è instanza class-transformer: guardia !== undefined).
      const startStr = input.startTime !== undefined ? input.startTime : formatDbTime(existing.startTime);
      const endStr = input.endTime !== undefined ? input.endTime : formatDbTime(existing.endTime);
      if (startStr >= endStr) {
        throw new BadRequestException("L'orario di inizio deve precedere quello di fine.");
      }
      const data: Prisma.TimeSlotUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.startTime !== undefined) data.startTime = toDbTime(input.startTime);
      if (input.endTime !== undefined) data.endTime = toDbTime(input.endTime);
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      return tx.timeSlot.update({ where: { id }, data });
    });
    if (!result) throw new NotFoundException('Fascia non trovata');
    return toTimeSlotDTO(result);
  }

  /**
   * Elimina una fascia del tenant e la ritorna. 409 se referenziata da tariffe/prenotazioni
   * (Rate_timeSlotId_fkey è SET NULL → senza guardia azzererebbe silenziosamente il timeSlotId
   * di tariffe autoritative; Booking_timeSlotId_fkey è RESTRICT). 409 se è l'ultima fascia del
   * tenant (una prenotazione richiede sempre una fascia). Specchio di deletePackage.
   */
  async remove(id: string): Promise<TimeSlotDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.timeSlot.findFirst({ where: { id } });
      if (!existing) return null;
      const [rateCount, bookingCount, total] = await Promise.all([
        tx.rate.count({ where: { timeSlotId: id } }),
        tx.booking.count({ where: { timeSlotId: id } }),
        tx.timeSlot.count({}),
      ]);
      if (rateCount > 0 || bookingCount > 0) {
        throw new ConflictException('Fascia in uso da tariffe o prenotazioni: non eliminabile.');
      }
      if (total <= 1) {
        throw new ConflictException('Deve esistere almeno una fascia.');
      }
      await tx.timeSlot.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Fascia non trovata');
    return toTimeSlotDTO(removed);
  }

  private async nextSortOrder(tx: Prisma.TransactionClient): Promise<number> {
    const last = await tx.timeSlot.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }
}
