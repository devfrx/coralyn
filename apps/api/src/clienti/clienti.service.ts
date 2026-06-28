import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ClienteDTO } from '@driftly/contracts';

@Injectable()
export class ClientiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<ClienteDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.findMany());
    return rows.map((c) => ({ id: c.id, nome: c.nome, cognome: c.cognome }));
  }

  async create(input: { nome: string; cognome: string }): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: tenantId, ...input } }),
    );
    return { id: c.id, nome: c.nome, cognome: c.cognome };
  }
}
