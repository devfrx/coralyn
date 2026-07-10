import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateRowInput, StructureRowDTO, UpdateRowInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ROW_SELECT } from './establishment-structure.select';
import { toStructureRow } from './establishment-structure.projection';

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private async nextSortOrder(tx: Prisma.TransactionClient, sectorId: string): Promise<number> {
    const last = await tx.row.findFirst({ where: { sectorId }, orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateRowInput): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const label = input.label.trim();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const sector = await tx.sector.findUnique({ where: { id: input.sectorId } });
      if (!sector) throw new NotFoundException('Settore non trovato');
      const sortOrder = await this.nextSortOrder(tx, input.sectorId);
      return tx.row.create({
        data: { establishmentId: tenantId, sectorId: input.sectorId, label, sortOrder },
        select: ROW_SELECT,
      });
    });
    return toStructureRow(created);
  }

  async update(id: string, input: UpdateRowInput): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.row.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.RowUncheckedUpdateInput = {};
      if (input.label !== undefined) data.label = input.label.trim();
      return tx.row.update({ where: { id }, data, select: ROW_SELECT });
    });
    if (!result) throw new NotFoundException('Fila non trovata');
    return toStructureRow(result);
  }

  async remove(id: string): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.row.findUnique({ where: { id }, select: ROW_SELECT });
      if (!existing) return null;
      const [umbrellaCount, rateCount] = await Promise.all([
        tx.umbrella.count({ where: { rowId: id } }),
        tx.rate.count({ where: { rowId: id } }),
      ]);
      if (umbrellaCount > 0 && rateCount > 0) {
        throw new ConflictException('La fila contiene ombrelloni ed è usata da tariffe: elimina gli ombrelloni e rimuovi le tariffe prima.');
      }
      if (umbrellaCount > 0) {
        throw new ConflictException('La fila contiene ombrelloni: eliminali prima.');
      }
      if (rateCount > 0) {
        throw new ConflictException('La fila è usata da tariffe: rimuovile prima.');
      }
      await tx.row.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Fila non trovata');
    return toStructureRow(removed);
  }
}
