import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateUmbrellaTypeInput, UmbrellaTypeDTO, UpdateUmbrellaTypeInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

const SELECT = { id: true, name: true, sortOrder: true, icon: true } as const;
type Row = { id: string; name: string; sortOrder: number; icon: string | null };

@Injectable()
export class UmbrellaTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private toDTO(t: Row): UmbrellaTypeDTO {
    return { id: t.id, name: t.name, sortOrder: t.sortOrder, ...(t.icon ? { icon: t.icon } : {}) };
  }

  private normalizeName(name: string): string {
    return name.trim();
  }

  private async nextSortOrder(tx: Prisma.TransactionClient): Promise<number> {
    const last = await tx.umbrellaType.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateUmbrellaTypeInput): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const name = this.normalizeName(input.name);
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.umbrellaType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new ConflictException('Esiste già una tipologia con questo nome.');
      const sortOrder = await this.nextSortOrder(tx);
      return tx.umbrellaType.create({
        data: { establishmentId: tenantId, name, icon: input.icon, sortOrder },
        select: SELECT,
      });
    });
    return this.toDTO(created);
  }

  async update(id: string, input: UpdateUmbrellaTypeInput): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrellaType.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.UmbrellaTypeUncheckedUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.normalizeName(input.name);
        const clash = await tx.umbrellaType.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già una tipologia con questo nome.');
        data.name = name;
      }
      if (input.icon !== undefined) data.icon = input.icon;
      return tx.umbrellaType.update({ where: { id }, data, select: SELECT });
    });
    if (!result) throw new NotFoundException('Tipologia non trovata');
    return this.toDTO(result);
  }

  async remove(id: string): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrellaType.findUnique({ where: { id }, select: SELECT });
      if (!existing) return null;
      // Conta ANCHE i ritirati (D-055): una tipologia referenziata dallo storico non si elimina.
      const refs = await tx.umbrella.count({ where: { umbrellaTypeId: id } });
      if (refs > 0) throw new ConflictException('Tipologia in uso da ombrelloni: riassegnali prima di eliminarla.');
      await tx.umbrellaType.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Tipologia non trovata');
    return this.toDTO(removed);
  }
}
