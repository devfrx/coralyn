import type { PrismaService } from '../../src/prisma/prisma.service';
import { tenantIdOf, type TenantId } from '../../src/tenant/tenant-id';

/**
 * Crea uno stabilimento e ne ritorna l'id come `TenantId`. Gli Establishment NON sono
 * tenant-scoped (sono il registro dei tenant): la create è diretta, senza `forTenant`.
 *
 * È il produttore di `TenantId` per le e2e — il gemello, lato test, di `TenantContext.require()`:
 * lì il tenant viene dal token, qui lo decide il test. Dirlo una volta sola invece che in 62 punti
 * è anche il motivo per cui questo helper esiste.
 */
export async function createEstablishment(prisma: PrismaService, name: string): Promise<TenantId> {
  const est = await prisma.establishment.create({ data: { name } });
  return tenantIdOf(est.id);
}
