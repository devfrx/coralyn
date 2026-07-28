import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission } from '@coralyn/contracts';
import { EstablishmentUsersService } from './establishment-users.service';
import { StaffPermissionsService } from '../identity/staff-permissions.service';

const TENANT = 't-1';

function makeService(overrides: {
  user?: Partial<{ create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock; update: jest.Mock }>;
  permissionRows?: Array<{ permission: string; granted: boolean }>;
} = {}) {
  const user = { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), ...overrides.user };
  const staffPermissionOverride = {
    findMany: jest.fn().mockResolvedValue(overrides.permissionRows ?? []),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const prisma = { user, staffPermissionOverride, $transaction: jest.fn().mockResolvedValue([]) } as any;
  const tenant = { require: () => TENANT } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('HASH') } as any;
  const credentials = { issueAndSend: jest.fn().mockResolvedValue({ expiresAt: new Date('2026-07-08T10:00:00Z') }) } as any;
  // Il service VERO della risoluzione: un doppio avrebbe lasciato passare un calcolo del delta
  // che non corrisponde a ciò che il guard poi legge.
  const permissions = new StaffPermissionsService(prisma);
  return {
    service: new EstablishmentUsersService(prisma, tenant, hasher, credentials, permissions),
    user, hasher, credentials, prisma, staffPermissionOverride,
  };
}

describe('EstablishmentUsersService', () => {
  // D-064: la lista è arrivata qui dall'overview, che resta leggibile da tutto lo staff.
  // L'ordine è quello che la UI mostrava prima dello spostamento, non uno nuovo.
  describe('list', () => {
    it('ordina admin-first poi email asc, e mappa disabledAt in ISO', async () => {
      const { service, user } = makeService();
      user.findMany.mockResolvedValue([
        { id: 'u3', email: 'sara@lido.it', role: 'staff', disabledAt: new Date('2026-07-01T00:00:00Z') },
        { id: 'u1', email: 'giulia@lido.it', role: 'admin', disabledAt: null },
        { id: 'u2', email: 'marco@lido.it', role: 'staff', disabledAt: null },
      ]);
      const res = await service.list();
      expect(res.map((m) => m.email)).toEqual(['giulia@lido.it', 'marco@lido.it', 'sara@lido.it']);
      expect(res.map((m) => m.disabledAt)).toEqual([null, null, '2026-07-01T00:00:00.000Z']);
    });

    it('interroga solo il proprio tenant e solo i ruoli del lido', async () => {
      const { service, user } = makeService();
      user.findMany.mockResolvedValue([]);
      await service.list();
      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { establishmentId: TENANT, role: { in: ['admin', 'staff'] } } }),
      );
    });
  });

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

  // ADR-0063: i permessi dell'operatore. Il DB conserva solo lo SCARTO dal default di fabbrica,
  // mentre l'API parla di insiemi completi: è qui che le due rappresentazioni si incontrano.
  describe('setPermissions', () => {
    const staffTarget = { id: 'u-9', role: 'staff' };

    /** Le righe passate a `createMany`, cioè ciò che finisce davvero nel database. */
    const righeScritte = (staffPermissionOverride: { createMany: jest.Mock }) =>
      (staffPermissionOverride.createMany.mock.calls[0]?.[0]?.data ?? []) as Array<{
        permission: string; granted: boolean; establishmentId: string; userId: string;
      }>;

    it('non scrive NULLA se l’insieme richiesto coincide col default di fabbrica', async () => {
      const { service, user, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue(staffTarget);
      // Il default dello staff, chiesto tale e quale: zero scarto, zero righe.
      const defaults = [
        Permission.MapRead, Permission.BookingsManage, Permission.CustomersManage,
        Permission.RentalsOperate, Permission.RentalCatalogManage, Permission.PricingManage,
        Permission.RenewalsManage, Permission.ReportsRead, Permission.EstablishmentRead,
        Permission.StructureRead,
      ];
      await service.setPermissions('u-9', { permissions: defaults });
      expect(righeScritte(staffPermissionOverride)).toEqual([]);
    });

    it('scrive UNA riga granted:false per il permesso revocato rispetto al default', async () => {
      const { service, user, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue(staffTarget);
      await service.setPermissions('u-9', { permissions: [Permission.MapRead] });
      const righe = righeScritte(staffPermissionOverride);
      const revocate = righe.filter((r) => !r.granted).map((r) => r.permission);
      expect(revocate).toContain(Permission.PricingManage);
      expect(righe.map((r) => r.permission)).not.toContain(Permission.MapRead); // resta al default
      expect(righe.every((r) => r.establishmentId === TENANT && r.userId === 'u-9')).toBe(true);
    });

    it('scrive UNA riga granted:true per il permesso concesso oltre il default', async () => {
      const { service, user, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue(staffTarget);
      await service.setPermissions('u-9', { permissions: [Permission.StructureManage] });
      const concesse = righeScritte(staffPermissionOverride).filter((r) => r.granted).map((r) => r.permission);
      expect(concesse).toEqual([Permission.StructureManage]);
    });

    it('non scrive mai i permessi non configurabili, nemmeno per differenza', async () => {
      // `session.read` è nel default dello staff ma non è configurabile: non comparendo nel body
      // sembrerebbe «revocato», e senza il filtro su CONFIGURABLE_PERMISSIONS finirebbe scritto.
      const { service, user, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue(staffTarget);
      await service.setPermissions('u-9', { permissions: [] });
      const scritti = righeScritte(staffPermissionOverride).map((r) => r.permission);
      expect(scritti).not.toContain(Permission.SessionRead);
      expect(scritti).not.toContain(Permission.PlatformAdminister);
    });

    it('cancella e riscrive in UNA transazione (nessuno stato intermedio senza override)', async () => {
      const { service, user, prisma, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue(staffTarget);
      await service.setPermissions('u-9', { permissions: [] });
      expect(staffPermissionOverride.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-9' } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    });

    it('404 se il target è di un altro lido (il findFirst porta il tenant)', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(null);
      await expect(service.setPermissions('u-altrove', { permissions: [] })).rejects.toBeInstanceOf(NotFoundException);
      expect(user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u-altrove', establishmentId: TENANT } }),
      );
    });

    it('422 se il target è un admin: l’admin non è configurabile (ADR-0063 §2.2)', async () => {
      const { service, user, staffPermissionOverride } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-adm', role: 'admin' });
      await expect(service.setPermissions('u-adm', { permissions: [] })).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(staffPermissionOverride.createMany).not.toHaveBeenCalled();
    });
  });

  describe('permissionsOf', () => {
    it('riflette gli override configurati', async () => {
      const { service, user } = makeService({
        permissionRows: [{ permission: Permission.PricingManage, granted: false }],
      });
      user.findFirst.mockResolvedValue({ id: 'u-9', role: 'staff' });
      const res = await service.permissionsOf('u-9');
      expect(res.userId).toBe('u-9');
      expect(res.permissions).not.toContain(Permission.PricingManage);
      expect(res.permissions).toContain(Permission.MapRead);
    });

    it('422 su un admin, come la scrittura', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-adm', role: 'admin' });
      await expect(service.permissionsOf('u-adm')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
