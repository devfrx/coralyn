import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { StaffPermissionsService } from './staff-permissions.service';

function makeService(user: any, verifyResult = true) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    // Nessun override configurato: il DTO porta il default di fabbrica del ruolo (ADR-0063).
    staffPermissionOverride: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const hasher = {
    verify: jest.fn().mockResolvedValue(verifyResult),
    verifyDecoy: jest.fn().mockResolvedValue(false),
  } as any;
  const tokens = { sign: jest.fn().mockReturnValue('signed-token') } as any;
  // Il service VERO su un Prisma finto: proiettare `permissions` con un doppio della risoluzione
  // proverebbe il doppio, non la proiezione.
  const permissions = new StaffPermissionsService(prisma);
  return { service: new IdentityService(prisma, hasher, tokens, permissions), prisma, hasher, tokens };
}

const ADMIN = {
  id: 'u-1', email: 'a@lido.it', passwordHash: 'h', role: 'admin', disabledAt: null,
  establishmentId: 'e-1', establishment: { name: 'Lido Test', suspendedAt: null },
};

describe('IdentityService.login', () => {
  // Le due asserzioni che rendono il ramo «email inesistente» indistinguibile dall'esterno:
  // stesso esito E stesso costo. La seconda è quella che protegge dall'oracolo di timing —
  // togliere `verifyDecoy` da login lascerebbe verde solo la prima.
  it('email inesistente → 401 generico, e paga comunque una verifica (anti-enumerazione, D-029)', async () => {
    const { service, hasher, tokens } = makeService(null);
    await expect(service.login({ email: 'ignota@lido.it', password: 'pw' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hasher.verifyDecoy).toHaveBeenCalledWith('pw');
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('password errata → 401 generico, nessun token', async () => {
    const { service, hasher, tokens } = makeService(ADMIN, false);
    await expect(service.login({ email: 'a@lido.it', password: 'sbagliata' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hasher.verify).toHaveBeenCalled();
    expect(hasher.verifyDecoy).not.toHaveBeenCalled(); // l'utente esiste: la civetta non serve
    expect(tokens.sign).not.toHaveBeenCalled();
  });

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
