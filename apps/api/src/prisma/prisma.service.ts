import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import type { TenantId } from '../tenant/tenant-id';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Esegue `fn` dentro una transazione con la GUC app.current_tenant impostata,
   * così le policy RLS filtrano per quel tenant. Vedi ADR-0010.
   *
   * Il parametro è un `TenantId`, non una `string`: una stringa qualunque — l'`establishmentId`
   * di un DTO in entrata, quello denormalizzato su una riga — non compila. Vedi tenant-id.ts.
   */
  async forTenant<T>(
    tenantId: TenantId,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
