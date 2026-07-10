import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateSectorInput, StructureSectorDTO, UpdateSectorInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { SECTOR_SELECT } from './establishment-structure.select';
import { toStructureSector } from './establishment-structure.projection';

@Injectable()
export class SectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private normalizeName(name: string): string {
    return name.trim();
  }

  private async nextSortOrder(tx: Prisma.TransactionClient): Promise<number> {
    const last = await tx.sector.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateSectorInput): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const name = this.normalizeName(input.name);
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.sector.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new ConflictException('Esiste già un settore con questo nome.');
      const sortOrder = await this.nextSortOrder(tx);
      return tx.sector.create({
        data: { establishmentId: tenantId, name, kind: input.kind, sortOrder },
        select: SECTOR_SELECT,
      });
    });
    return toStructureSector(created);
  }

  async update(id: string, input: UpdateSectorInput): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.sector.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.SectorUncheckedUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.normalizeName(input.name);
        const clash = await tx.sector.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un settore con questo nome.');
        data.name = name;
      }
      if (input.kind !== undefined) data.kind = input.kind;
      return tx.sector.update({ where: { id }, data, select: SECTOR_SELECT });
    });
    if (!result) throw new NotFoundException('Settore non trovato');
    return toStructureSector(result);
  }

  async remove(id: string): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.sector.findUnique({ where: { id }, select: SECTOR_SELECT });
      if (!existing) return null;
      const [rowCount, rateCount] = await Promise.all([
        tx.row.count({ where: { sectorId: id } }),
        tx.rate.count({ where: { sectorId: id } }),
      ]);
      if (rowCount > 0 && rateCount > 0) {
        throw new ConflictException('Il settore contiene file ed è usato da tariffe: elimina le file e rimuovi le tariffe prima.');
      }
      if (rowCount > 0) {
        throw new ConflictException('Il settore contiene delle file: eliminale prima.');
      }
      if (rateCount > 0) {
        throw new ConflictException('Il settore è usato da tariffe: rimuovile prima.');
      }
      await tx.sector.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Settore non trovato');
    return toStructureSector(removed);
  }
}
