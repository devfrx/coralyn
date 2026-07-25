import { Test } from '@nestjs/testing';
import { LegalProfileService } from './legal-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { TEST_TENANT as TENANT, fakeTenantPrisma, fakeTenantContext } from '../test/tenant-prisma';

function makeTx() {
  return {
    establishment: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Lido Test' }) },
    establishmentLegalProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        legalName: 'Acme Srl', registeredAddress: null, vatOrTaxId: null, contactEmail: null,
        pec: null, legalRepresentative: null, dataRightsContact: null, dpoNominated: false,
        dpoContact: null, updatedAt: new Date('2026-07-24T10:00:00Z'),
      }),
    },
  };
}

describe('LegalProfileService', () => {
  let service: LegalProfileService;
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    const prisma = fakeTenantPrisma(tx);
    const tenant = fakeTenantContext();
    const mod = await Test.createTestingModule({
      providers: [
        LegalProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
      ],
    }).compile();
    service = mod.get(LegalProfileService);
  });

  it('getForTenant ritorna un DTO a campi vuoti se il profilo non esiste', async () => {
    const dto = await service.getForTenant();
    expect(dto.legalName).toBeNull();
    expect(dto.dpoNominated).toBe(false);
    expect(dto.updatedAt).toBeNull();
  });

  it('upsert scrive establishmentId=tenant e ritorna il DTO', async () => {
    const dto = await service.upsert({ legalName: 'Acme Srl' });
    expect(tx.establishmentLegalProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { establishmentId: TENANT } }),
    );
    expect(dto.legalName).toBe('Acme Srl');
    expect(dto.updatedAt).toBe('2026-07-24T10:00:00.000Z');
  });

  it('getTitolare proietta nome lido + campi null quando manca il profilo', async () => {
    const dto = await service.getTitolare(TENANT);
    expect(dto.establishmentName).toBe('Lido Test');
    expect(dto.legalName).toBeNull();
    expect(dto.dpoNominated).toBe(false);
  });
});
