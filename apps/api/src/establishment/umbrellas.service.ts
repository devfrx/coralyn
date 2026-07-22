import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  BulkDeleteUmbrellasInput, BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeInput, BulkAssignUmbrellaTypeResultDTO, CreateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, RestoreUmbrellaInput, RetiredUmbrellaDTO, StructureUmbrellaDTO, UpdateUmbrellaInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { todayInRome, toDbDate } from '../common/dates';
import { UMBRELLA_SELECT } from './establishment-structure.select';
import { toStructureUmbrella, toRetiredUmbrella } from './establishment-structure.projection';

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

  async bulkDelete(input: BulkDeleteUmbrellasInput): Promise<BulkDeleteUmbrellasResultDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const found = await tx.umbrella.findMany({ where: { id: { in: input.ids } }, select: { id: true } });
      const foundIds = found.map((u) => u.id);
      const withBookings = await tx.booking.groupBy({ by: ['umbrellaId'], where: { umbrellaId: { in: foundIds } } });
      const protectedSet = new Set(withBookings.map((b) => b.umbrellaId));
      const deletable = foundIds.filter((id) => !protectedSet.has(id));
      let deleted = 0;
      if (deletable.length > 0) {
        const res = await tx.umbrella.deleteMany({ where: { id: { in: deletable } } });
        deleted = res.count;
      }
      return { deleted, skipped: input.ids.length - deleted };
    });
  }

  async bulkAssignType(input: BulkAssignUmbrellaTypeInput): Promise<BulkAssignUmbrellaTypeResultDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      await this.assertType(tx, input.umbrellaTypeId);
      const res = await tx.umbrella.updateMany({
        where: { id: { in: input.ids } }, data: { umbrellaTypeId: input.umbrellaTypeId },
      });
      return { updated: res.count };
    });
  }

  /** Guardia: prenotazioni confermate non ancora concluse bloccano il ritiro (spec §4, D-055). */
  async retire(id: string): Promise<RetiredUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const retired = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({
        where: { id },
        include: { row: { select: { label: true, sector: { select: { name: true } } } } },
      });
      if (!existing) return null;
      if (existing.retiredAt != null) {
        // idempotente, come l'archive dei pacchetti: retiredAt è già valorizzato, narrow esplicito per il DTO.
        return { id: existing.id, label: existing.label, umbrellaTypeId: existing.umbrellaTypeId, retiredAt: existing.retiredAt, retiredFrom: existing.retiredFrom };
      }
      const active = await tx.booking.count({
        where: { umbrellaId: id, status: 'confirmed', endDate: { gte: toDbDate(todayInRome()) } },
      });
      if (active > 0) throw new ConflictException('Ombrellone con prenotazioni attive o future: disdici prima di ritirare.');
      const retiredFrom = existing.row ? `${existing.row.sector.name} · ${existing.row.label}` : null;
      const updated = await tx.umbrella.update({ where: { id }, data: { retiredAt: new Date(), rowId: null, retiredFrom } });
      // Appena valorizzato in questa stessa transazione: mai null a runtime.
      return { id: updated.id, label: updated.label, umbrellaTypeId: updated.umbrellaTypeId, retiredAt: updated.retiredAt!, retiredFrom: updated.retiredFrom };
    });
    if (!retired) throw new NotFoundException('Ombrellone non trovato');
    return toRetiredUmbrella(retired);
  }

  /** Ripristina un ombrellone ritirato riagganciandolo a una fila; 409 se la label collide con un attivo. */
  async restore(id: string, input: RestoreUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({ where: { id } });
      if (!existing) return null;
      if (existing.retiredAt == null) {
        return tx.umbrella.findUniqueOrThrow({ where: { id }, select: UMBRELLA_SELECT }); // già attivo: idempotente
      }
      await this.assertRow(tx, input.rowId);
      const clash = await tx.umbrella.findFirst({ where: { label: existing.label, retiredAt: null } });
      if (clash) throw new ConflictException('Esiste già un ombrellone attivo con questa etichetta: rinominalo prima di ripristinare.');
      const logicalOrder = await this.nextLogicalOrder(tx, input.rowId);
      return tx.umbrella.update({
        where: { id },
        data: { retiredAt: null, retiredFrom: null, rowId: input.rowId, logicalOrder },
        select: UMBRELLA_SELECT,
      });
    });
    if (!result) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(result);
  }

  /** Elenco ombrelloni ritirati (storico), più recenti prima. */
  async listRetired(): Promise<RetiredUmbrellaDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.umbrella.findMany({ where: { retiredAt: { not: null } }, orderBy: { retiredAt: 'desc' } }),
    );
    // Il filtro where garantisce retiredAt non-null: Prisma non propaga il vincolo al tipo.
    return rows.map((u) => toRetiredUmbrella({ ...u, retiredAt: u.retiredAt! }));
  }
}
