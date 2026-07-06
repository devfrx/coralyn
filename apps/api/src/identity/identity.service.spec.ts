import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

function makeService(user: any) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as any;
  const hasher = { verify: jest.fn().mockResolvedValue(true) } as any;
  const tokens = { sign: jest.fn().mockReturnValue('signed-token') } as any;
  return { service: new IdentityService(prisma, hasher, tokens), prisma, tokens };
}

const ADMIN = {
  id: 'u-1', email: 'a@lido.it', passwordHash: 'h', role: 'admin', disabledAt: null,
  establishmentId: 'e-1', establishment: { name: 'Lido Test', suspendedAt: null },
};

describe('IdentityService.login', () => {
  it('lido sospeso → 401 generico, nessun token', async () => {
    const { service, tokens } = makeService({ ...ADMIN, establishment: { name: 'Lido Test', suspendedAt: new Date() } });
    await expect(service.login({ email: 'a@lido.it', password: 'pw' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('lido attivo → login ok, dto con establishmentName', async () => {
    const { service } = makeService(ADMIN);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(res.user.establishmentName).toBe('Lido Test');
  });

  it('superuser (establishment null) → nessun controllo sospensione, login ok, establishmentName null', async () => {
    const su = { ...ADMIN, id: 'su-1', role: 'superuser', establishmentId: null, establishment: null };
    const { service } = makeService(su);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(res.user.establishmentName).toBeNull();
  });
});
