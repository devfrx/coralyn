import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toRentalItemDTO } from './rental-item.projection';

@Injectable()
export class RentalCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

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
}
