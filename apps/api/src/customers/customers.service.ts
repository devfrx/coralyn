import { Injectable, NotFoundException } from '@nestjs/common';
import type { Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CustomerDTO, CreateCustomerInput, UpdateCustomerInput } from '@coralyn/contracts';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Proietta una riga Customer nel DTO condiviso, mappando null → undefined. */
  private toDTO(c: Customer): CustomerDTO {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      notes: c.notes ?? undefined,
    };
  }

  async list(): Promise<CustomerDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.customer.findMany());
    return rows.map((c) => this.toDTO(c));
  }

  async getById(id: string): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findFirst({ where: { id } }),
    );
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }

  async create(input: CreateCustomerInput): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.create({ data: { establishmentId: tenantId, ...input } }),
    );
    return this.toDTO(c);
  }

  async update(id: string, input: UpdateCustomerInput): Promise<CustomerDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.customer.update({ where: { id }, data: input });
    });
    if (!c) throw new NotFoundException('Cliente non trovato');
    return this.toDTO(c);
  }
}
