import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  BulkDeleteUmbrellasInput, BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeInput, BulkAssignUmbrellaTypeResultDTO, CreateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, MoveUmbrellaInput, RestoreUmbrellaInput, RetiredUmbrellaDTO, StructureUmbrellaDTO, UpdateUmbrellaInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { todayInRome, toDbDate } from '../common/dates';
import { UMBRELLA_SELECT } from './establishment-structure.select';
import { toStructureUmbrella, toRetiredUmbrella } from './establishment-structure.projection';
import { planUmbrellaMove } from './umbrella-order';

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
      const clash = await tx.umbrella.findFirst({ where: { label, retiredAt: null } });
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
        const clash = await tx.umbrella.findFirst({ where: { label, id: { not: id }, retiredAt: null } });
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
      if (bookings > 0) throw new ConflictException('Ombrellone con prenotazioni: non eliminabile. Usa «Ritira» per dismetterlo conservando lo storico.');
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
      const existing = await tx.umbrella.findMany({ where: { label: { in: candidates }, retiredAt: null }, select: { label: true } });
      const existingSet = new Set(existing.map((e) => e.label));
      const toCreate = candidates.filter((label) => !existingSet.has(label));
      const order = await this.nextLogicalOrder(tx, input.rowId);
      // UNA `INSERT ... RETURNING` invece di N `create`. Il loop sequenziale costava un round-trip
      // per ombrellone: al cap di 500 sono 506 round-trip in una sola transazione (507 se
      // `umbrellaTypeId` non è null, perché `assertType` ne aggiunge uno), e `forTenant` non passa
      // `transactionOptions` → vale il timeout di default di Prisma, 5000 ms.
      // Misurato con latenza iniettata (AUD-022, ADR-0062, `umbrellaTypeId: null`): a RTT 6 ms la
      // transazione sta dentro, a RTT 8 ms va in P2028 con rollback totale — zero ombrelloni creati.
      // Nettato l'overhead del proxy, il ginocchio si estrapola a ~7,7 ms. La soglia è molto più
      // bassa di quanto sembri: regge in dev su Docker locale (RTT ~0) e cade sul primo Postgres
      // gestito. In batch il conto scende a 7 (8 con la tipologia) ed è **costante in `count`**:
      // a RTT 30 ms la stessa transazione chiude in 458 ms.
      // L'ordine di `createManyAndReturn` segue l'ordine dei dati in ingresso (verificato), quindi
      // `umbrellas` esce ordinato per `logicalOrder` crescente come con il loop.
      const rows = toCreate.length > 0
        ? await tx.umbrella.createManyAndReturn({
            data: toCreate.map((label, i) => ({
              establishmentId: tenantId, rowId: input.rowId, umbrellaTypeId: input.umbrellaTypeId, label, logicalOrder: order + i,
            })),
            select: UMBRELLA_SELECT,
          })
        : [];
      const umbrellas: StructureUmbrellaDTO[] = rows.map(toStructureUmbrella);
      return { created: umbrellas.length, skipped: candidates.length - toCreate.length, umbrellas };
    });
  }

  async bulkDelete(input: BulkDeleteUmbrellasInput): Promise<BulkDeleteUmbrellasResultDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const found = await tx.umbrella.findMany({ where: { id: { in: input.ids }, retiredAt: null }, select: { id: true } });
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
        where: { id: { in: input.ids }, retiredAt: null }, data: { umbrellaTypeId: input.umbrellaTypeId },
      });
      return { updated: res.count };
    });
  }

  /**
   * Sposta un ombrellone attivo all'indice `position` di una fila, anche di un altro settore purché
   * dello stesso `kind`. Nessuna guardia sulle prenotazioni, a differenza di `retire`: `Booking` e
   * `BookingCoverage` puntano a `umbrellaId` e non a `rowId`, quindi la prenotazione segue
   * l'ombrellone, e `totalPrice` è uno snapshot che nessun update riscrive.
   */
  async move(id: string, input: MoveUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({
        where: { id },
        include: { row: { select: { sectorId: true, sector: { select: { kind: true } } } } },
      });
      if (!existing) return null;
      // Senza questa guardia il move RESUSCITA un ritirato: nessuna query di mappa o struttura
      // filtra `retiredAt`, l'esclusione dipende solo dal `rowId` che `retire` azzera. Riassegnare
      // una fila lo rimetterebbe in scena, prenotabile, con `retiredAt` ancora valorizzato.
      if (existing.retiredAt != null) throw new ConflictException('Ombrellone ritirato: ripristinalo prima di spostarlo.');
      // `rowId` è null solo sui ritirati (`retire` lo azzera, `restore` lo riassegna): dopo la
      // guardia sopra la fila di origine c'è sempre. Il narrow serve al tipo, non a un caso vivo.
      const fromRow = existing.row!;

      // `establishmentId` esplicito, a differenza di `assertRow` che si affida alla sola policy
      // RLS: qui si cambia il genitore di una riga, e la tenancy della destinazione si asserisce.
      const destRow = await tx.row.findFirst({
        where: { id: input.rowId, establishmentId: tenantId },
        select: { id: true, sector: { select: { kind: true } } },
      });
      if (!destRow) throw new NotFoundException('Fila non trovata');
      if (destRow.sector.kind !== fromRow.sector.kind) {
        throw new UnprocessableEntityException('Un ombrellone può spostarsi solo in un settore della stessa tipologia.');
      }

      const others = await tx.umbrella.findMany({
        where: { rowId: destRow.id, id: { not: id } },
        orderBy: { logicalOrder: 'asc' },
        select: { logicalOrder: true },
      });
      const plan = planUmbrellaMove({
        destOrders: others.map((u) => u.logicalOrder),
        position: input.position,
        currentOrder: existing.rowId === destRow.id ? existing.logicalOrder : null,
      });
      if (!plan.ok) throw new UnprocessableEntityException('Posizione fuori dalla fila di destinazione.');
      // No-op calcolato, non richiesta ignorata: la posizione chiesta è già quella occupata.
      if (plan.write === null) {
        return { id: existing.id, label: existing.label, umbrellaTypeId: existing.umbrellaTypeId, logicalOrder: existing.logicalOrder };
      }

      const { shift, targetOrder } = plan.write;
      if (shift) {
        await tx.umbrella.updateMany({
          where: { rowId: destRow.id, logicalOrder: { gte: shift.fromOrder, lte: shift.toOrder } },
          data: { logicalOrder: shift.delta === 1 ? { increment: 1 } : { decrement: 1 } },
        });
      }
      return tx.umbrella.update({
        where: { id },
        data: { rowId: destRow.id, logicalOrder: targetOrder },
        select: UMBRELLA_SELECT,
      });
    });
    if (!result) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(result);
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
