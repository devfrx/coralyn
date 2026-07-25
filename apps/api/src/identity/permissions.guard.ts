import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { Permission, roleHasPermission } from './permission';
import type { AuthUser } from './auth-user';

/**
 * Guard globale dei permessi: gira DOPO JwtAuthGuard (che popola req.user).
 *
 * **Fail-closed** (ADR-0057, emenda ADR-0039): una rotta senza `@RequiresPermission` viene
 * NEGATA. Il predecessore `RolesGuard` passava in assenza di metadato, e per quattro mesi la
 * copertura dell'autorizzazione è stata funzione della storia dei commit invece che del rischio:
 * l'unico endpoint di `establishment` che espone PII era l'unico senza guardia.
 *
 * Le rotte `@Public()` sono esenti: non hanno un'identità su cui valutare un permesso, e il
 * canale cliente ha la propria autenticazione (`CustomerJwtGuard`). Senza questa esenzione
 * l'inversione avrebbe chiuso login, health, informativa pubblica e l'intero canale cliente.
 *
 * La rete di sicurezza contro la dimenticanza non è questo 403 — è `authorization-coverage.spec.ts`,
 * che enumera meccanicamente ogni handler e fallisce in CI prima che la rotta esista davvero.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      throw new ForbiddenException('Endpoint senza permesso dichiarato');
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const role = req.user?.role;
    if (!role || !roleHasPermission(role, required)) {
      throw new ForbiddenException('Permesso non concesso');
    }
    return true;
  }
}
