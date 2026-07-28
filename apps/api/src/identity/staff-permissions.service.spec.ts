import { Permission, Role } from '@coralyn/contracts';
import { StaffPermissionsService } from './staff-permissions.service';
import { PERMISSION_ROLES, roleHasPermission } from './permission';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * La risoluzione dei permessi (ADR-0063).
 *
 * Il fake **conta le letture**: senza contatore, «solo lo staff legge il database» sarebbe una
 * frase nell'ADR e non un requisito verificato. È lo stesso motivo per cui AUD-026 chiedeva un
 * fake di `forTenant` che *asserisce* il tenant invece di scartarlo.
 */
function fakePrisma(rows: Array<{ permission: string; granted: boolean }>, opts: { throws?: boolean } = {}) {
  const stato = { letture: 0, ultimoWhere: undefined as unknown };
  const prisma = {
    staffPermissionOverride: {
      findMany: (args: { where: { userId: string } }) => {
        stato.letture += 1;
        stato.ultimoWhere = args.where;
        return opts.throws
          ? Promise.reject(new Error('connessione al database caduta'))
          : Promise.resolve(rows);
      },
    },
  } as unknown as PrismaService;
  return { prisma, stato };
}

const STAFF = { id: 'u-staff', role: Role.Staff };
const ADMIN = { id: 'u-admin', role: Role.Admin };
const SUPER = { id: 'u-super', role: Role.Superuser };

describe('StaffPermissionsService', () => {
  describe('has()', () => {
    it('per l’admin risponde dalla tabella di fabbrica e NON legge il database', async () => {
      const { prisma, stato } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.has(ADMIN, Permission.TeamManage)).resolves.toBe(true);
      await expect(svc.has(ADMIN, Permission.PlatformAdminister)).resolves.toBe(false);
      // Il numero, non «è stato chiamato»: è ciò che rende il requisito falsificabile.
      expect(stato.letture).toBe(0);
    });

    it('per il superuser risponde dalla tabella di fabbrica e NON legge il database', async () => {
      const { prisma, stato } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.has(SUPER, Permission.PlatformAdminister)).resolves.toBe(true);
      await expect(svc.has(SUPER, Permission.BookingsManage)).resolves.toBe(false);
      expect(stato.letture).toBe(0);
    });

    it('per lo staff senza override vale il default di fabbrica', async () => {
      const { prisma, stato } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.has(STAFF, Permission.PricingManage)).resolves.toBe(true);
      await expect(svc.has(STAFF, Permission.TeamManage)).resolves.toBe(false);
      expect(stato.letture).toBe(2);
    });

    it('un override REVOCA un permesso che il default concede', async () => {
      const { prisma } = fakePrisma([{ permission: Permission.PricingManage, granted: false }]);
      const svc = new StaffPermissionsService(prisma);
      // Il default lo concede: è il presupposto del test, e va asserito o il test non prova nulla.
      expect(roleHasPermission(Role.Staff, Permission.PricingManage)).toBe(true);
      await expect(svc.has(STAFF, Permission.PricingManage)).resolves.toBe(false);
    });

    it('un override CONCEDE un permesso che il default nega', async () => {
      const { prisma } = fakePrisma([{ permission: Permission.StructureManage, granted: true }]);
      const svc = new StaffPermissionsService(prisma);
      expect(roleHasPermission(Role.Staff, Permission.StructureManage)).toBe(false);
      await expect(svc.has(STAFF, Permission.StructureManage)).resolves.toBe(true);
    });

    it('l’override di un permesso non tocca gli altri', async () => {
      const { prisma } = fakePrisma([{ permission: Permission.PricingManage, granted: false }]);
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.has(STAFF, Permission.BookingsManage)).resolves.toBe(true);
    });

    it('legge gli override del proprio utente, non di un altro', async () => {
      const { prisma, stato } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      await svc.has(STAFF, Permission.MapRead);
      expect(stato.ultimoWhere).toEqual({ userId: 'u-staff' });
    });

    it('se la lettura fallisce l’eccezione si PROPAGA, non degrada in true né in false', async () => {
      // Fail-closed vuol dire «non procedere». Rispondere `false` darebbe un 403 che attribuisce
      // all'utente una mancanza che non ha, e manderebbe a diagnosticare i permessi invece del DB.
      const { prisma } = fakePrisma([], { throws: true });
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.has(STAFF, Permission.MapRead)).rejects.toThrow('connessione al database caduta');
    });
  });

  describe('effectiveFor()', () => {
    it('per lo staff senza override riproduce esattamente la tabella di fabbrica', async () => {
      const { prisma } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      const atteso = (Object.keys(PERMISSION_ROLES) as Permission[]).filter((p) =>
        roleHasPermission(Role.Staff, p),
      );
      await expect(svc.effectiveFor(STAFF)).resolves.toEqual(atteso);
    });

    it('riflette gli override nei due versi, in una sola lettura', async () => {
      const { prisma, stato } = fakePrisma([
        { permission: Permission.PricingManage, granted: false },
        { permission: Permission.StructureManage, granted: true },
      ]);
      const svc = new StaffPermissionsService(prisma);
      const effettivi = await svc.effectiveFor(STAFF);
      expect(effettivi).not.toContain(Permission.PricingManage);
      expect(effettivi).toContain(Permission.StructureManage);
      // Una sola query per l'intero insieme, non una per permesso (lezione di ADR-0062).
      expect(stato.letture).toBe(1);
    });

    it('per l’admin NON legge, e include i permessi admin-only', async () => {
      const { prisma, stato } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      const effettivi = await svc.effectiveFor(ADMIN);
      expect(effettivi).toContain(Permission.TeamManage);
      expect(effettivi).not.toContain(Permission.PlatformAdminister);
      expect(stato.letture).toBe(0);
    });

    it('include sempre i permessi non configurabili secondo il default, anche per lo staff', async () => {
      // `session.read` non è fra i configurabili: nessun override potrà mai toglierlo, e la
      // schermata di amministrazione non lo mostra. Qui si asserisce che resta comunque incluso.
      const { prisma } = fakePrisma([]);
      const svc = new StaffPermissionsService(prisma);
      await expect(svc.effectiveFor(STAFF)).resolves.toContain(Permission.SessionRead);
    });
  });
});
