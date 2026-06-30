import { Injectable } from '@nestjs/common';
import type { MappaGiornoDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { proiettaMappaGiorno, risolviData, type MappaSorgente } from './mappa.projection';

@Injectable()
export class MappaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Struttura della mappa per una data (statoPerFascia=libero in questo slice). */
  async getMappaGiorno(data?: string): Promise<MappaGiornoDTO> {
    const tenantId = this.tenant.require();
    const sorgente: MappaSorgente = await this.prisma.forTenant(tenantId, async (tx) => {
      const tipologie = await tx.tipologia.findMany({ orderBy: { ordine: 'asc' } });
      const fasce = await tx.fascia.findMany({ orderBy: { ordine: 'asc' } });
      const settori = await tx.settore.findMany({
        orderBy: { ordine: 'asc' },
        include: {
          file: {
            orderBy: { ordine: 'asc' },
            include: { ombrelloni: { orderBy: { ordineLogico: 'asc' } } },
          },
        },
      });
      return { tipologie, fasce, settori };
    });
    return proiettaMappaGiorno(risolviData(data), sorgente);
  }
}
