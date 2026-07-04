import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, StructureUmbrellaDTO, UpdateUmbrellaInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { UMBRELLA_SELECT } from './establishment-structure.select';
import { toStructureUmbrella } from './establishment-structure.projection';

@Injectable()
export class UmbrellasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private async assertRow(tx: Prisma.TransactionClient, rowId: string): Promise<void> {
    const row = await tx.row.findUnique({ where: { id: rowId } });
    if (!row) throw new NotFoundException('Fila non trovata');
  }

  private async assertType(tx: Prisma.TransactionClient, umbrellaTypeId: string | null): Promise<void> {
    if (umbrellaTypeId === null) return;
    const type = await tx.umbrellaType.findUnique({ where: { id: umbrellaTypeId } });
    if (!type) throw new UnprocessableEntityException('Tipologia non valida per questo stabilimento.');
  }

  private async nextLogicalOrder(tx: Prisma.TransactionClient, rowId: string): Promise<number> {
    const last = await tx.umbrella.findFirst({ where: { rowId }, orderBy: { logicalOrder: 'desc' } });
    return (last?.logicalOrder ?? 0) + 1;
  }

  async create(input: CreateUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const label = input.label.trim();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      await this.assertRow(tx, input.rowId);
      await this.assertType(tx, input.umbrellaTypeId);
      const clash = await tx.umbrella.findFirst({ where: { label } });
      if (clash) throw new ConflictException('Esiste già un ombrellone con questa etichetta.');
      const logicalOrder = await this.nextLogicalOrder(tx, input.rowId);
      return tx.umbrella.create({
        data: { establishmentId: tenantId, rowId: input.rowId, umbrellaTypeId: input.umbrellaTypeId, label, logicalOrder },
        select: UMBRELLA_SELECT,
      });
    });
    return toStructureUmbrella(created);
  }

  async update(id: string, input: UpdateUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.UmbrellaUncheckedUpdateInput = {};
      if (input.label !== undefined) {
        const label = input.label.trim();
        const clash = await tx.umbrella.findFirst({ where: { label, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un ombrellone con questa etichetta.');
        data.label = label;
      }
      if (input.umbrellaTypeId !== undefined) {
        await this.assertType(tx, input.umbrellaTypeId);
        data.umbrellaTypeId = input.umbrellaTypeId;
      }
      return tx.umbrella.update({ where: { id }, data, select: UMBRELLA_SELECT });
    });
    if (!result) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(result);
  }

  async remove(id: string): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({ where: { id }, select: UMBRELLA_SELECT });
      if (!existing) return null;
      const bookings = await tx.booking.count({ where: { umbrellaId: id } });
      if (bookings > 0) throw new ConflictException('Ombrellone con prenotazioni: non eliminabile.');
      await tx.umbrella.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(removed);
  }

  async generate(input: GenerateUmbrellasInput): Promise<GenerateUmbrellasResultDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      await this.assertRow(tx, input.rowId);
      await this.assertType(tx, input.umbrellaTypeId);
      const candidates: string[] = [];
      for (let i = 0; i < input.count; i++) candidates.push(`${input.prefix}${input.start + i}`);
      const existing = await tx.umbrella.findMany({ where: { label: { in: candidates } }, select: { label: true } });
      const existingSet = new Set(existing.map((e) => e.label));
      const toCreate = candidates.filter((label) => !existingSet.has(label));
      let order = await this.nextLogicalOrder(tx, input.rowId);
      const umbrellas: StructureUmbrellaDTO[] = [];
      for (const label of toCreate) {
        const u = await tx.umbrella.create({
          data: { establishmentId: tenantId, rowId: input.rowId, umbrellaTypeId: input.umbrellaTypeId, label, logicalOrder: order },
          select: UMBRELLA_SELECT,
        });
        umbrellas.push(toStructureUmbrella(u));
        order += 1;
      }
      return { created: umbrellas.length, skipped: candidates.length - toCreate.length, umbrellas };
    });
  }
}
