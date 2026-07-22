import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type Rate } from '@prisma/client';
import type {
  BookingType, CreatePackageInput, PackageDTO, RateDTO, UpdatePackageInput,
  CreateEquipmentTypeInput, EquipmentTypeDTO, UpdateEquipmentTypeInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { formatDbDate, toDbDate } from '../common/dates';
import { resolvePrice, type RateRow } from './pricing.engine';
import { toPackageDTO } from './package.projection';
import { toEquipmentTypeDTO } from './equipment-type.projection';

export interface QuoteContext {
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  packageId?: string | null;
  type: BookingType;
}

export type QuoteOutcome =
  | { ok: true; totalPrice: number; matchedRate: RateDTO }
  | { ok: false; reason: 'UMBRELLA_NOT_FOUND' | 'NO_SEASON' | 'NO_RATE' };

export type SeasonRange =
  | { ok: true; id: string; startDate: string; endDate: string }
  | { ok: false; reason: 'NO_SEASON' };

function toRateRow(r: Rate): RateRow {
  return {
    id: r.id,
    type: r.type,
    sectorId: r.sectorId,
    rowId: r.rowId,
    packageId: r.packageId,
    timeSlotId: r.timeSlotId,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : null,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : null,
    price: Number(r.price),
  };
}

/** RateRow (forma piatta engine) → RateDTO (null→undefined). NON usa toRateDTO (che consuma un Rate Prisma). */
function rateRowToDTO(row: RateRow, seasonId: string): RateDTO {
  return {
    id: row.id,
    seasonId,
    type: row.type ?? undefined,
    sectorId: row.sectorId ?? undefined,
    rowId: row.rowId ?? undefined,
    packageId: row.packageId ?? undefined,
    timeSlotId: row.timeSlotId ?? undefined,
    periodStart: row.periodStart ?? undefined,
    periodEnd: row.periodEnd ?? undefined,
    price: row.price,
  };
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private static readonly PACKAGE_INCLUDE = {
    packageLinks: { include: { equipmentType: true } },
  } as const;

  /** Valida le voci (422) e scrive i link in set-assoluto (delete-all + createMany) dentro `tx`. */
  private async writePackageEquipment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    packageId: string,
    items: { equipmentTypeId: string; quantity: number }[],
  ): Promise<void> {
    const ids = items.map((i) => i.equipmentTypeId);
    if (new Set(ids).size !== ids.length) {
      throw new UnprocessableEntityException('Voce di dotazione duplicata nella composizione.');
    }
    if (ids.length > 0) {
      // Lo scope tenant è garantito da RLS (forTenant): un id di un altro tenant è invisibile qui,
      // quindi `found.length !== ids.length` → 422 (non serve filtrare per establishmentId nel where).
      const found = await tx.equipmentType.findMany({ where: { id: { in: ids }, archivedAt: null } });
      if (found.length !== ids.length) {
        throw new UnprocessableEntityException('Tipo di dotazione non valido o archiviato.');
      }
    }
    await tx.packageEquipment.deleteMany({ where: { packageId } });
    if (items.length > 0) {
      await tx.packageEquipment.createMany({
        data: items.map((i) => ({ establishmentId: tenantId, packageId, equipmentTypeId: i.equipmentTypeId, quantity: i.quantity })),
      });
    }
  }

  /** Lista dei pacchetti del tenant. Default: solo attivi; `includeArchived` include gli archiviati. */
  async listPackages(includeArchived = false): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        include: CatalogService.PACKAGE_INCLUDE,
      }),
    );
    return rows.map(toPackageDTO);
  }

  /** Risolve la stagione attiva per una data e ne ritorna l'intervallo (single source della risoluzione stagione). */
  async resolveSeasonWithin(tx: Prisma.TransactionClient, date: string): Promise<SeasonRange> {
    const day = toDbDate(date);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${date}: uso la prima (${seasons[0].id}).`);
    }
    return {
      ok: true,
      id: seasons[0].id,
      startDate: formatDbDate(seasons[0].startDate),
      endDate: formatDbDate(seasons[0].endDate),
    };
  }

  /** Risolve una stagione per id e ne ritorna l'intervallo (mirror per-id di resolveSeasonWithin). */
  async resolveSeasonById(tx: Prisma.TransactionClient, id: string): Promise<SeasonRange> {
    const season = await tx.season.findFirst({ where: { id } });
    if (!season) return { ok: false, reason: 'NO_SEASON' };
    return {
      ok: true,
      id: season.id,
      startDate: formatDbDate(season.startDate),
      endDate: formatDbDate(season.endDate),
    };
  }

  /**
   * Calcola il prezzo dentro una transazione esistente (usato da BookingsService.create:
   * niente transazione annidata). Risolve posizione + stagione + engine.
   */
  async priceWithin(tx: Prisma.TransactionClient, ctx: QuoteContext): Promise<QuoteOutcome> {
    const umbrella = await tx.umbrella.findFirst({
      where: { id: ctx.umbrellaId },
      include: { row: true },
    });
    if (!umbrella) return { ok: false, reason: 'UMBRELLA_NOT_FOUND' };
    if (!umbrella.row) return { ok: false, reason: 'UMBRELLA_NOT_FOUND' }; // ritirato (D-055): non prezzabile

    const day = toDbDate(ctx.startDate);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${ctx.startDate}: uso la prima (${seasons[0].id}).`);
    }
    const pricing = await tx.pricing.findFirst({ where: { seasonId: seasons[0].id } });
    if (!pricing) return { ok: false, reason: 'NO_SEASON' };

    const rates = await tx.rate.findMany({ where: { pricingId: pricing.id } });
    const result = resolvePrice(
      {
        type: ctx.type,
        sectorId: umbrella.row.sectorId,
        rowId: umbrella.row.id, // umbrella.rowId è nullable (D-055); qui row è già narrowed non-null sopra
        packageId: ctx.packageId ?? null,
        timeSlotId: ctx.timeSlotId,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
      },
      rates.map(toRateRow),
    );
    if (!result.ok) return { ok: false, reason: 'NO_RATE' };
    return { ok: true, totalPrice: result.totalPrice, matchedRate: rateRowToDTO(result.rate, seasons[0].id) };
  }

  /** Crea un pacchetto per il tenant corrente. */
  async createPackage(input: CreatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const created = await tx.package.create({ data: { establishmentId: tenantId, name: input.name } });
      await this.writePackageEquipment(tx, tenantId, created.id, input.equipment);
      return tx.package.findFirstOrThrow({ where: { id: created.id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    return toPackageDTO(p);
  }

  /** Aggiorna nome/equipment di un pacchetto del tenant corrente; 404 se non trovato (anche cross-tenant). */
  async updatePackage(id: string, input: UpdatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (input.name !== undefined) {
        await tx.package.update({ where: { id }, data: { name: input.name } });
      }
      if (input.equipment !== undefined) {
        await this.writePackageEquipment(tx, tenantId, id, input.equipment);
      }
      return tx.package.findFirstOrThrow({ where: { id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /** Archivia (soft-delete) un pacchetto del tenant; 404 se assente/cross-tenant. Idempotente. */
  async archivePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        await tx.package.update({ where: { id }, data: { archivedAt: new Date() } });
      }
      return tx.package.findFirstOrThrow({ where: { id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /** Ripristina un pacchetto archiviato (archivedAt → null); 404 se assente/cross-tenant. Idempotente. */
  async restorePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt != null) {
        await tx.package.update({ where: { id }, data: { archivedAt: null } });
      }
      return tx.package.findFirstOrThrow({ where: { id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /**
   * Elimina fisicamente un pacchetto del tenant e lo ritorna. Consentito SOLO su un pacchetto già
   * archiviato (409 altrimenti: flusso in due passi, niente cancellazioni accidentali) e senza
   * riferimenti (409 se rate/booking > 0 — rete di sicurezza: le FK sono ON DELETE SET NULL, senza
   * questa guardia la delete azzererebbe silenziosamente il packageId su tariffe/prenotazioni).
   */
  async deletePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id }, include: CatalogService.PACKAGE_INCLUDE });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        throw new ConflictException('Archivia il pacchetto prima di eliminarlo definitivamente.');
      }
      const [rateCount, bookingCount] = await Promise.all([
        tx.rate.count({ where: { packageId: id } }),
        tx.booking.count({ where: { packageId: id } }),
      ]);
      if (rateCount > 0 || bookingCount > 0) {
        throw new ConflictException('Pacchetto in uso da tariffe o prenotazioni: non eliminabile.');
      }
      await tx.package.delete({ where: { id } });
      return existing;
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  private normalizeName(name: string): string {
    return name.trim();
  }

  async listEquipmentTypes(includeArchived = false): Promise<EquipmentTypeDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.equipmentType.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { name: 'asc' },
      }),
    );
    return rows.map(toEquipmentTypeDTO);
  }

  async createEquipmentType(input: CreateEquipmentTypeInput): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const name = this.normalizeName(input.name);
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.equipmentType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (clash) throw new ConflictException('Esiste già un tipo di dotazione con questo nome.');
      return tx.equipmentType.create({ data: { establishmentId: tenantId, name } });
    });
    return toEquipmentTypeDTO(t);
  }

  async updateEquipmentType(id: string, input: UpdateEquipmentTypeInput): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (input.name === undefined) return existing;
      const name = this.normalizeName(input.name);
      const clash = await tx.equipmentType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
      });
      if (clash) throw new ConflictException('Esiste già un tipo di dotazione con questo nome.');
      return tx.equipmentType.update({ where: { id }, data: { name } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async archiveEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt != null) return existing;
      return tx.equipmentType.update({ where: { id }, data: { archivedAt: new Date() } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async restoreEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) return existing;
      return tx.equipmentType.update({ where: { id }, data: { archivedAt: null } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async deleteEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        throw new ConflictException('Archivia il tipo prima di eliminarlo definitivamente.');
      }
      const refs = await tx.packageEquipment.count({ where: { equipmentTypeId: id } });
      if (refs > 0) {
        throw new ConflictException('Archivia il tipo e rimuovilo dai pacchetti prima di eliminarlo definitivamente.');
      }
      await tx.equipmentType.delete({ where: { id } });
      return existing;
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }
}
