import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@coralyn/contracts';
import { RolesGuard } from './roles.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}
const reflectorWith = (roles: Role[] | undefined) =>
  ({ getAllAndOverride: () => roles }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('passa se nessun @Roles è definito', () => {
    const guard = new RolesGuard(reflectorWith(undefined));
    expect(guard.canActivate(ctx({ role: Role.Staff }))).toBe(true);
  });

  it('passa se il ruolo utente è tra quelli richiesti', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(guard.canActivate(ctx({ role: Role.Admin }))).toBe(true);
  });

  it('403 se il ruolo non è tra quelli richiesti', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(() => guard.canActivate(ctx({ role: Role.Staff }))).toThrow(ForbiddenException);
  });

  it('403 se manca del tutto lo user (difesa)', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
