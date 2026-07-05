import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformProvisioningService } from './platform-provisioning.service';

const DTO = { id: 'e-new', name: 'Lido X' }; // parziale: metrics.getOne è mockato
const EXPIRES = new Date('2026-07-08T00:00:00.000Z');

function makeService(txOverrides: any = {}) {
  const tx = {
    establishment: { create: jest.fn().mockResolvedValue({ id: 'e-new' }), update: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({ id: 'u-new' }) },
    platformAuditLog: { create: jest.fn().mockResolvedValue({}) },
    ...txOverrides,
  };
  const prisma = {
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
    establishment: { findUnique: jest.fn().mockResolvedValue({ id: 'e-new' }) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', email: 'admin@lidox.it' }]) },
    platformAuditLog: { create: jest.fn().mockResolvedValue({}) },
  } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('hashed') } as any;
  const metrics = { getOne: jest.fn().mockResolvedValue(DTO) } as any;
  const credentials = { issueAndSend: jest.fn().mockResolvedValue({ expiresAt: EXPIRES }) } as any;
  return { service: new PlatformProvisioningService(prisma, hasher, metrics, credentials), tx, prisma, hasher, metrics, credentials };
}

describe('PlatformProvisioningService', () => {
  it('create: crea lido + admin + audit e ritorna esito invito (nessuna password in chiaro)', async () => {
    const { service, tx, hasher, credentials } = makeService();
    const res = await service.create({ name: 'Lido X', adminEmail: 'admin@lidox.it' }, 'su-1');

    expect(hasher.hash).toHaveBeenCalledWith(expect.any(String));
    expect(tx.establishment.create).toHaveBeenCalledWith({ data: { name: 'Lido X' } });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ establishmentId: 'e-new', email: 'admin@lidox.it', role: 'admin', passwordHash: 'hashed' }),
    }));
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: 'su-1', action: 'create_establishment', targetEstablishmentId: 'e-new' }),
    }));
    expect(credentials.issueAndSend).toHaveBeenCalledWith('u-new', 'admin@lidox.it', 'invite', 'su-1');
    expect(res.adminEmail).toBe('admin@lidox.it');
    expect((res as any).temporaryPassword).toBeUndefined();
    expect(res.expiresAt).toBe(EXPIRES.toISOString());
    expect(res.establishment).toEqual(DTO);
  });

  it('create: email duplicata (P2002) → 409', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { service } = makeService({ user: { create: jest.fn().mockRejectedValue(err) } });
    await expect(service.create({ name: 'Lido X', adminEmail: 'dup@lidox.it' }, 'su-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('resetAdminPassword: emette invito reset e scrive audit quando c’è un unico admin attivo', async () => {
    const { service, prisma, credentials } = makeService();
    const res = await service.resetAdminPassword('e-new', 'su-1');
    expect(credentials.issueAndSend).toHaveBeenCalledWith('admin-1', 'admin@lidox.it', 'reset', 'su-1');
    expect(prisma.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: 'su-1', action: 'reset_admin_password', targetEstablishmentId: 'e-new' }),
    }));
    expect(res).toEqual({ adminEmail: 'admin@lidox.it', expiresAt: EXPIRES.toISOString() });
  });

  it('resetAdminPassword: 404 se il lido non esiste', async () => {
    const { service, prisma } = makeService();
    prisma.establishment.findUnique.mockResolvedValue(null);
    await expect(service.resetAdminPassword('nope', 'su-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resetAdminPassword: 409 se il lido non ha esattamente un admin attivo', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.resetAdminPassword('e-new', 'su-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('suspend: 404 se il lido non esiste', async () => {
    const { service, prisma } = makeService();
    prisma.establishment.findUnique.mockResolvedValue(null);
    await expect(service.suspend('nope', 'su-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suspend: valorizza suspendedAt e scrive audit', async () => {
    const { service, tx } = makeService();
    await service.suspend('e-new', 'su-1');
    expect(tx.establishment.update).toHaveBeenCalledWith({ where: { id: 'e-new' }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'suspend_establishment', targetEstablishmentId: 'e-new' }),
    }));
  });

  it('reactivate: azzera suspendedAt e scrive audit reactivate', async () => {
    const { service, tx } = makeService();
    await service.reactivate('e-new', 'su-1');
    expect(tx.establishment.update).toHaveBeenCalledWith({ where: { id: 'e-new' }, data: { suspendedAt: null } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'reactivate_establishment' }),
    }));
  });
});
