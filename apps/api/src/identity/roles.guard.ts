import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@coralyn/contracts';
import { ROLES_KEY } from './roles.decorator';
import type { AuthUser } from './auth-user';

/**
 * Guard globale dei ruoli: gira DOPO JwtAuthGuard (che popola req.user). Se la rotta
 * non ha @Roles → passa (endpoint solo-auth invariati). Altrimenti richiede che
 * req.user.role sia tra quelli indicati, altrimenti 403. Vedi ADR-0039.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Ruolo non autorizzato');
    }
    return true;
  }
}
