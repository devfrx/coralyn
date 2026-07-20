import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput,
  CreateRentalTariffInput, RentalTariffDTO, UpdateRentalTariffInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { todayInRome } from '../common/dates';
import { toRentalItemDTO } from './rental-item.projection';
import { toRentalTariffDTO } from './rental-tariff.projection';

@Injectable()
export class RentalCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  private normalizeName(n: string): string { return n.trim(); }

  async listRentalItems(includeArchived = false): Promise<RentalItemDTO[]> {
    const t = this.tenant.require();
    const rows = await this.prisma.forTenant(t, (tx) =>
      tx.rentalItem.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: { name: 'asc' } }));
    return rows.map(toRentalItemDTO);
  }

  async createRentalItem(input: CreateRentalItemInput): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const name = this.normalizeName(input.name);
    const row = await this.prisma.forTenant(t, async (tx) => {
      const clash = await tx.rentalItem.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new ConflictException('Esiste già un articolo con questo nome.');
      return tx.rentalItem.create({ data: { establishmentId: t, name, stock: input.stock ?? null } });
    });
    return toRentalItemDTO(row);
  }

  async updateRentalItem(id: string, input: UpdateRentalItemInput): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      const data: { name?: string; stock?: number | null } = {};
      if (input.name !== undefined) {
        const name = this.normalizeName(input.name);
        const clash = await tx.rentalItem.findFirst({
          where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un articolo con questo nome.');
        data.name = name;
      }
      if (input.stock !== undefined) data.stock = input.stock;
      return tx.rentalItem.update({ where: { id }, data });
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }

  async archiveRentalItem(id: string): Promise<RentalItemDTO> { return this.setArchived(id, true); }
  async restoreRentalItem(id: string): Promise<RentalItemDTO> { return this.setArchived(id, false); }

  private async setArchived(id: string, archived: boolean): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      if ((existing.archivedAt != null) === archived) return existing;
      return tx.rentalItem.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }

  async deleteRentalItem(id: string): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null)
        throw new ConflictException('Archivia l’articolo prima di eliminarlo definitivamente.');
      const refs = await tx.rental.count({ where: { rentalItemId: id } });
      if (refs > 0)
        throw new ConflictException('Articolo con noleggi registrati: non eliminabile.');
      await tx.rentalItem.delete({ where: { id } }); // le tariffe seguono in cascade
      return existing;
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }

  async listRentalTariffs(itemId: string, seasonId: string | undefined, includeArchived = false): Promise<RentalTariffDTO[]> {
    const t = this.tenant.require();
    const rows = await this.prisma.forTenant(t, async (tx) => {
      const sid = seasonId ?? (await this.resolveActiveSeasonId(tx));
      if (!sid) return [];
      return tx.rentalTariff.findMany({
        where: { rentalItemId: itemId, seasonId: sid, ...(includeArchived ? {} : { archivedAt: null }) },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      });
    });
    return rows.map(toRentalTariffDTO);
  }

  async createRentalTariff(itemId: string, input: CreateRentalTariffInput, seasonId?: string): Promise<RentalTariffDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const item = await tx.rentalItem.findFirst({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Articolo non trovato');
      const sid = seasonId ?? (await this.resolveActiveSeasonId(tx));
      if (!sid) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      const season = await tx.season.findFirst({ where: { id: sid } });
      if (!season) throw new UnprocessableEntityException('Stagione non valida');
      return tx.rentalTariff.create({ data: {
        establishmentId: t, rentalItemId: itemId, seasonId: sid, label: input.label.trim(),
        price: input.price, durationMinutes: input.durationMinutes ?? null, sortOrder: input.sortOrder ?? 0,
      } });
    });
    return toRentalTariffDTO(row);
  }

  async updateRentalTariff(id: string, input: UpdateRentalTariffInput): Promise<RentalTariffDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalTariff.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.rentalTariff.update({ where: { id }, data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      } }); // seasonId/rentalItemId volutamente NON toccati (immutabili)
    });
    if (!row) throw new NotFoundException('Tariffa non trovata');
    return toRentalTariffDTO(row);
  }

  async archiveRentalTariff(id: string): Promise<RentalTariffDTO> { return this.setTariffArchived(id, true); }
  async restoreRentalTariff(id: string): Promise<RentalTariffDTO> { return this.setTariffArchived(id, false); }

  private async setTariffArchived(id: string, archived: boolean): Promise<RentalTariffDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalTariff.findFirst({ where: { id } });
      if (!existing) return null;
      if ((existing.archivedAt != null) === archived) return existing;
      return tx.rentalTariff.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    });
    if (!row) throw new NotFoundException('Tariffa non trovata');
    return toRentalTariffDTO(row);
  }

  async deleteRentalTariff(id: string): Promise<RentalTariffDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalTariff.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null)
        throw new ConflictException('Archivia la tariffa prima di eliminarla definitivamente.');
      const refs = await tx.rental.count({ where: { rentalTariffId: id } });
      if (refs > 0) throw new ConflictException('Tariffa con noleggi registrati: non eliminabile.');
      await tx.rentalTariff.delete({ where: { id } });
      return existing;
    });
    if (!row) throw new NotFoundException('Tariffa non trovata');
    return toRentalTariffDTO(row);
  }

  /** Id della stagione che contiene oggi (Roma), o null. Riusa il resolver del catalogo ombrelloni. */
  private async resolveActiveSeasonId(tx: Parameters<Parameters<PrismaService['forTenant']>[1]>[0]): Promise<string | null> {
    const s = await this.catalog.resolveSeasonWithin(tx, todayInRome());
    return s.ok ? s.id : null;
  }
}
