import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateRateInput, RateDTO, UpdateRateInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbDate } from '../common/dates';
import { toRateDTO } from './rate.projection';

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Traduce la violazione di Rate_signature_key (23505 → Prisma P2002) in 409; rilancia il resto. */
  private mapConflict(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Esiste già una tariffa con queste dimensioni per questa stagione.');
    }
    throw e;
  }

  async list(seasonId: string): Promise<RateDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, async (tx) => {
      const pricing = await tx.pricing.findFirst({ where: { seasonId } });
      if (!pricing) return [];
      return tx.rate.findMany({ where: { pricingId: pricing.id } });
    });
    return rows.map((r) => toRateDTO(r, seasonId));
  }

  async create(input: CreateRateInput): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    try {
      const rate = await this.prisma.forTenant(tenantId, async (tx) => {
        const pricing = await tx.pricing.findFirst({ where: { seasonId: input.seasonId } });
        if (!pricing) throw new NotFoundException('Stagione non trovata');
        return tx.rate.create({
          data: {
            establishmentId: tenantId,
            pricingId: pricing.id,
            type: input.type ?? null,
            sectorId: input.sectorId ?? null,
            rowId: input.rowId ?? null,
            packageId: input.packageId ?? null,
            timeSlotId: input.timeSlotId ?? null,
            periodStart: input.periodStart ? toDbDate(input.periodStart) : null,
            periodEnd: input.periodEnd ? toDbDate(input.periodEnd) : null,
            price: input.price,
            unit: input.unit,
          },
        });
      });
      return toRateDTO(rate, input.seasonId);
    } catch (e) {
      this.mapConflict(e); // rilancia NotFound/altri invariati; P2002 → 409
    }
  }

  async update(id: string, input: UpdateRateInput): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    try {
      const result = await this.prisma.forTenant(tenantId, async (tx) => {
        const existing = await tx.rate.findFirst({ where: { id }, include: { pricing: true } });
        if (!existing) return null;
        // NB: `input` è un'istanza class-transformer (ValidationPipe transform:true), NON un plain
        // object: i campi dichiarati sulla classe esistono come proprietà proprie (valore `undefined`)
        // anche se assenti dal body → l'operatore `in` li vedrebbe SEMPRE presenti. Guardia `!== undefined`.
        const data: Prisma.RateUncheckedUpdateInput = {};
        if (input.type !== undefined) data.type = input.type ?? null;
        if (input.sectorId !== undefined) data.sectorId = input.sectorId ?? null;
        if (input.rowId !== undefined) data.rowId = input.rowId ?? null;
        if (input.packageId !== undefined) data.packageId = input.packageId ?? null;
        if (input.timeSlotId !== undefined) data.timeSlotId = input.timeSlotId ?? null;
        if (input.periodStart !== undefined) data.periodStart = input.periodStart ? toDbDate(input.periodStart) : null;
        if (input.periodEnd !== undefined) data.periodEnd = input.periodEnd ? toDbDate(input.periodEnd) : null;
        if (input.price !== undefined) data.price = input.price;
        if (input.unit !== undefined) data.unit = input.unit;
        const updated = await tx.rate.update({ where: { id }, data });
        return { updated, seasonId: existing.pricing.seasonId };
      });
      if (!result) throw new NotFoundException('Tariffa non trovata');
      return toRateDTO(result.updated, result.seasonId);
    } catch (e) {
      this.mapConflict(e);
    }
  }

  async remove(id: string): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.rate.findFirst({ where: { id }, include: { pricing: true } });
      if (!existing) return null;
      await tx.rate.delete({ where: { id } });
      return existing;
    });
    if (!result) throw new NotFoundException('Tariffa non trovata');
    return toRateDTO(result, result.pricing.seasonId);
  }
}
