import { Injectable, NotFoundException } from '@nestjs/common';
import type { Cliente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ClienteDTO, CreaClienteInput, ModificaClienteInput } from '@coralyn/contracts';

@Injectable()
export class ClientiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Proietta una riga Cliente nel DTO condiviso, mappando null → undefined. */
  private toDTO(c: Cliente): ClienteDTO {
    return {
      id: c.id,
      nome: c.nome,
      cognome: c.cognome,
      telefono: c.telefono ?? undefined,
      email: c.email ?? undefined,
      note: c.note ?? undefined,
    };
  }

  async list(): Promise<ClienteDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.findMany());
    return rows.map((c) => this.toDTO(c));
  }

  async getById(id: string): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cliente.findFirst({ where: { id } }),
    );
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }

  async create(input: CreaClienteInput): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: tenantId, ...input } }),
    );
    return this.toDTO(c);
  }

  async update(id: string, input: ModificaClienteInput): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.cliente.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.cliente.update({ where: { id }, data: input });
    });
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }
}
