import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@coralyn/contracts';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { Permission } from './permission';

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

describe('PermissionsGuard', () => {
  it('NEGA se la rotta non dichiara alcun permesso (fail-closed)', () => {
    const guard = new PermissionsGuard(reflectorWith({}));
    expect(() => guard.canActivate(ctx({ role: Role.Admin }))).toThrow(ForbiddenException);
  });

  it('passa le rotte @Public senza guardare l’utente', () => {
    const guard = new PermissionsGuard(reflectorWith({ isPublic: true }));
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('passa se il ruolo detiene il permesso', () => {
    const guard = new PermissionsGuard(reflectorWith({ permission: Permission.PricingManage }));
    expect(guard.canActivate(ctx({ role: Role.Staff }))).toBe(true);
  });

  it('403 se il ruolo non detiene il permesso', () => {
    const guard = new PermissionsGuard(reflectorWith({ permission: Permission.TeamManage }));
    expect(() => guard.canActivate(ctx({ role: Role.Staff }))).toThrow(ForbiddenException);
  });

  it('403 se manca del tutto lo user (difesa: JwtAuthGuard non ha popolato req.user)', () => {
    const guard = new PermissionsGuard(reflectorWith({ permission: Permission.MapRead }));
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('il superuser non ha i permessi tenant-scoped, e ha il suo (ADR-0039)', () => {
    const tenant = new PermissionsGuard(reflectorWith({ permission: Permission.BookingsManage }));
    expect(() => tenant.canActivate(ctx({ role: Role.Superuser }))).toThrow(ForbiddenException);
    const platform = new PermissionsGuard(reflectorWith({ permission: Permission.PlatformAdminister }));
    expect(platform.canActivate(ctx({ role: Role.Superuser }))).toBe(true);
  });

  it('admin e staff NON hanno il permesso di piattaforma', () => {
    const guard = new PermissionsGuard(reflectorWith({ permission: Permission.PlatformAdminister }));
    expect(() => guard.canActivate(ctx({ role: Role.Admin }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ role: Role.Staff }))).toThrow(ForbiddenException);
  });
});
