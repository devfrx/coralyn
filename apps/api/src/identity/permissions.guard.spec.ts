import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@coralyn/contracts';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { Permission } from './permission';
import { StaffPermissionsService } from './staff-permissions.service';
import type { PrismaService } from '../prisma/prisma.service';

function ctx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

/** Reflector fedele: risponde per CHIAVE, così i due metadati non si confondono fra loro. */
const reflectorWith = (meta: { permission?: Permission; isPublic?: boolean }) =>
  ({
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? meta.isPublic : key === PERMISSION_KEY ? meta.permission : undefined,
  }) as unknown as Reflector;

/**
 * Il service **vero** su un Prisma finto: il guard va provato contro la risoluzione che userà in
 * produzione, non contro un doppio della risoluzione. Un fake del service avrebbe lasciato passare
 * un guard che chiama il metodo sbagliato.
 */
function permissionsWith(
  rows: Array<{ permission: string; granted: boolean }> = [],
  opts: { throws?: boolean } = {},
): StaffPermissionsService {
  const prisma = {
    staffPermissionOverride: {
      findMany: () =>
        opts.throws
          ? Promise.reject(new Error('connessione al database caduta'))
          : Promise.resolve(rows),
    },
  } as unknown as PrismaService;
  return new StaffPermissionsService(prisma);
}

const guardWith = (
  meta: { permission?: Permission; isPublic?: boolean },
  rows?: Array<{ permission: string; granted: boolean }>,
  opts?: { throws?: boolean },
): PermissionsGuard => new PermissionsGuard(reflectorWith(meta), permissionsWith(rows, opts));

describe('PermissionsGuard', () => {
  it('NEGA se la rotta non dichiara alcun permesso (fail-closed)', async () => {
    const guard = guardWith({});
    await expect(guard.canActivate(ctx({ role: Role.Admin }))).rejects.toThrow(ForbiddenException);
  });

  it('passa le rotte @Public senza guardare l’utente', async () => {
    const guard = guardWith({ isPublic: true });
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
  });

  it('passa se il ruolo detiene il permesso', async () => {
    const guard = guardWith({ permission: Permission.PricingManage });
    await expect(guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }))).resolves.toBe(true);
  });

  it('403 se il ruolo non detiene il permesso', async () => {
    const guard = guardWith({ permission: Permission.TeamManage });
    await expect(guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('403 se manca del tutto lo user (difesa: JwtAuthGuard non ha popolato req.user)', async () => {
    const guard = guardWith({ permission: Permission.MapRead });
    await expect(guard.canActivate(ctx(undefined))).rejects.toThrow(ForbiddenException);
  });

  it('il superuser non ha i permessi tenant-scoped, e ha il suo (ADR-0039)', async () => {
    const tenant = guardWith({ permission: Permission.BookingsManage });
    await expect(tenant.canActivate(ctx({ id: 'u-s', role: Role.Superuser }))).rejects.toThrow(
      ForbiddenException,
    );
    const platform = guardWith({ permission: Permission.PlatformAdminister });
    await expect(platform.canActivate(ctx({ id: 'u-s', role: Role.Superuser }))).resolves.toBe(true);
  });

  it('admin e staff NON hanno il permesso di piattaforma', async () => {
    const guard = guardWith({ permission: Permission.PlatformAdminister });
    await expect(guard.canActivate(ctx({ id: 'u-a', role: Role.Admin }))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  // --- ADR-0063: la risoluzione consulta gli override configurati dall'admin del lido ----------

  it('403 su un permesso che il default concede ma l’admin ha REVOCATO', async () => {
    const guard = guardWith({ permission: Permission.PricingManage }, [
      { permission: Permission.PricingManage, granted: false },
    ]);
    await expect(guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('passa su un permesso che il default nega ma l’admin ha CONCESSO', async () => {
    const guard = guardWith({ permission: Permission.StructureManage }, [
      { permission: Permission.StructureManage, granted: true },
    ]);
    await expect(guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }))).resolves.toBe(true);
  });

  it('l’override di un altro operatore non tocca l’admin, che non viene nemmeno letto', async () => {
    // Rete contro una risoluzione che ignorasse il ruolo e applicasse gli override a chiunque.
    const guard = guardWith({ permission: Permission.TeamManage }, [
      { permission: Permission.TeamManage, granted: false },
    ]);
    await expect(guard.canActivate(ctx({ id: 'u-a', role: Role.Admin }))).resolves.toBe(true);
  });

  it('un guasto della lettura NON diventa 403: si propaga', async () => {
    // Un 403 direbbe all'operatore che gli manca un permesso che invece ha, e manderebbe a
    // diagnosticare la configurazione invece del database.
    const guard = guardWith({ permission: Permission.MapRead }, [], { throws: true });
    const promessa = guard.canActivate(ctx({ id: 'u-1', role: Role.Staff }));
    await expect(promessa).rejects.toThrow('connessione al database caduta');
    await expect(promessa).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
