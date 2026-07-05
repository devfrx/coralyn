import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

function makeService(user: any, establishment: any = null) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    establishment: { findUnique: jest.fn().mockResolvedValue(establishment) },
  } as any;
  const hasher = { verify: jest.fn().mockResolvedValue(true) } as any;
  const tokens = { sign: jest.fn().mockReturnValue('signed-token') } as any;
  return { service: new IdentityService(prisma, hasher, tokens), prisma, tokens };
}

const ADMIN = { id: 'u-1', email: 'a@lido.it', passwordHash: 'h', role: 'admin', disabledAt: null, establishmentId: 'e-1' };

describe('IdentityService.login', () => {
  it('lido sospeso → 401 generico, nessun token', async () => {
    const { service, tokens } = makeService(ADMIN, { suspendedAt: new Date() });
    await expect(service.login({ email: 'a@lido.it', password: 'pw' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('lido attivo → login ok', async () => {
    const { service } = makeService(ADMIN, { suspendedAt: null });
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
  });

  it('superuser (establishmentId null) → non controlla la sospensione, login ok', async () => {
    const su = { ...ADMIN, id: 'su-1', role: 'superuser', establishmentId: null };
    const { service, prisma } = makeService(su);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(prisma.establishment.findUnique).not.toHaveBeenCalled();
  });
});
