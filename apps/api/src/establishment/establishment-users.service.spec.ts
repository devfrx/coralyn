import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EstablishmentUsersService } from './establishment-users.service';

const TENANT = 't-1';

function makeService(overrides: {
  user?: Partial<{ create: jest.Mock; findFirst: jest.Mock; count: jest.Mock; update: jest.Mock }>;
} = {}) {
  const user = { create: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), ...overrides.user };
  const prisma = { user } as any;
  const tenant = { require: () => TENANT } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('HASH') } as any;
  const credentials = { issueAndSend: jest.fn().mockResolvedValue({ expiresAt: new Date('2026-07-08T10:00:00Z') }) } as any;
  return { service: new EstablishmentUsersService(prisma, tenant, hasher, credentials), user, hasher, credentials };
}

describe('EstablishmentUsersService', () => {
  describe('create', () => {
    it('crea con hash inutilizzabile ed emette un invito (issueAndSend invite)', async () => {
      const { service, user, hasher, credentials } = makeService();
      user.create.mockResolvedValue({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
      const res = await service.create({ email: 'a@x.it', role: 'staff' }, 'admin-1');
      expect(hasher.hash).toHaveBeenCalledTimes(1);
      expect(user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ establishmentId: TENANT, email: 'a@x.it', passwordHash: 'HASH', role: 'staff' }) }),
      );
      expect(credentials.issueAndSend).toHaveBeenCalledWith('u-1', 'a@x.it', 'invite', 'admin-1');
      expect(res).toEqual({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
    });

    it('mappa la violazione di unicità email (P2002) in 409 e NON invita', async () => {
      const { service, user, credentials } = makeService();
      user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.create({ email: 'dup@x.it', role: 'staff' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });
  });

  describe('setDisabled', () => {
    it('404 se l’utente non è nel tenant', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(null);
      await expect(service.setDisabled('u-x', true, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('422 sul self-disable', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-1', email: 'a@x.it', role: 'admin', disabledAt: null });
      await expect(service.setDisabled('admin-1', true, 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('422 se disabilita l’ultimo admin attivo', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: null });
      user.count.mockResolvedValue(1);
      await expect(service.setDisabled('admin-2', true, 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('disabilita un admin non-ultimo → update con disabledAt valorizzato', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: null });
      user.count.mockResolvedValue(2);
      user.update.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: new Date('2026-07-04T10:00:00Z') });
      const res = await service.setDisabled('admin-2', true, 'admin-1');
      expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'admin-2' }, data: { disabledAt: expect.any(Date) } }));
      expect(res.disabledAt).toBe('2026-07-04T10:00:00.000Z');
    });

    it('riabilita (disabled=false) senza invarianti → disabledAt null', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', role: 'staff', disabledAt: new Date() });
      user.update.mockResolvedValue({ id: 'u-9', email: 's@x.it', role: 'staff', disabledAt: null });
      const res = await service.setDisabled('u-9', false, 'admin-1');
      expect(user.count).not.toHaveBeenCalled();
      expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { disabledAt: null } }));
      expect(res.disabledAt).toBeNull();
    });
  });

  describe('resetPassword', () => {
    it('404 se il target non è nel tenant', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('u-x', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });

    it('422 se il target è disabilitato', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', disabledAt: new Date() });
      await expect(service.resetPassword('u-9', 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });

    it('emette un reset (issueAndSend reset) e ritorna email+expiresAt', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', disabledAt: null });
      const res = await service.resetPassword('u-9', 'admin-1');
      expect(credentials.issueAndSend).toHaveBeenCalledWith('u-9', 's@x.it', 'reset', 'admin-1');
      expect(res).toEqual({ email: 's@x.it', expiresAt: '2026-07-08T10:00:00.000Z' });
    });
  });
});
