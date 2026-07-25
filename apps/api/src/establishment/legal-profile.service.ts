import { Injectable } from '@nestjs/common';
import type {
  EstablishmentLegalProfileDTO,
  PublicTitolareDTO,
  UpdateEstablishmentLegalProfileInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { tenantIdOf } from '../tenant/tenant-id';

const EMPTY: EstablishmentLegalProfileDTO = {
  legalName: null, registeredAddress: null, vatOrTaxId: null, contactEmail: null, pec: null,
  legalRepresentative: null, dataRightsContact: null, dpoNominated: false, dpoContact: null,
  updatedAt: null,
};

type Row = {
  legalName: string | null; registeredAddress: string | null; vatOrTaxId: string | null;
  contactEmail: string | null; pec: string | null; legalRepresentative: string | null;
  dataRightsContact: string | null; dpoNominated: boolean; dpoContact: string | null;
  updatedAt: Date;
};

function toDTO(row: Row): EstablishmentLegalProfileDTO {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class LegalProfileService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  async getForTenant(): Promise<EstablishmentLegalProfileDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const row = (await tx.establishmentLegalProfile.findUnique({
        where: { establishmentId: tenantId },
      })) as Row | null;
      return row ? toDTO(row) : { ...EMPTY };
    });
  }

  async upsert(input: UpdateEstablishmentLegalProfileInput): Promise<EstablishmentLegalProfileDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const data = { ...input };
      const row = (await tx.establishmentLegalProfile.upsert({
        where: { establishmentId: tenantId },
        create: { establishmentId: tenantId, ...data },
        update: data,
      })) as Row;
      return toDTO(row);
    });
  }

  async getTitolare(establishmentId: string): Promise<PublicTitolareDTO> {
    // Deroga dichiarata: qui il tenant NON è quello della richiesta ed è preso dall'URL, perché
    // l'informativa del titolare è pubblica per obbligo (art. 13/14 GDPR) e la si legge prima di
    // avere una sessione. Il payload è già ristretto ai soli campi pubblici. Vedi tenant-id.ts.
    return this.prisma.forTenant(tenantIdOf(establishmentId), async (tx) => {
      const [est, row] = await Promise.all([
        tx.establishment.findUniqueOrThrow({ where: { id: establishmentId }, select: { name: true } }),
        tx.establishmentLegalProfile.findUnique({ where: { establishmentId } }) as Promise<Row | null>,
      ]);
      return {
        establishmentName: est.name,
        legalName: row?.legalName ?? null,
        registeredAddress: row?.registeredAddress ?? null,
        vatOrTaxId: row?.vatOrTaxId ?? null,
        contactEmail: row?.contactEmail ?? null,
        pec: row?.pec ?? null,
        legalRepresentative: row?.legalRepresentative ?? null,
        dataRightsContact: row?.dataRightsContact ?? null,
        dpoNominated: row?.dpoNominated ?? false,
        dpoContact: row?.dpoContact ?? null,
      };
    });
  }
}
