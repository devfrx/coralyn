import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { Permission } from './permission';
import { StaffPermissionsService } from './staff-permissions.service';
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
 *
 * ⚠️ **Asincrono da ADR-0063**: per il ruolo `staff` la risposta non è più una lettura di tabella
 * ma una risoluzione che consulta gli override configurati dall'admin del lido. Il costo è una
 * query indicizzata (1,54 ms misurati) e si paga **solo** sul ruolo configurabile.
 *
 * ⚠️ **Non può iniettare `TenantContext`**, che è `Scope.REQUEST`: renderebbe request-scoped il
 * guard e con lui la catena di risoluzione. Legge `req.user`, che porta già `id` e `role` dal
 * token verificato — la stessa sorgente da cui `JwtAuthGuard` ricava `req.tenantId`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly staffPermissions: StaffPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const user = req.user;
    // ⚠️ Un guasto della lettura NON viene catturato qui: si propaga come 500. Trasformarlo in 403
    // direbbe all'operatore che non ha un permesso che invece ha, e manderebbe a diagnosticare la
    // configurazione invece del database. Fail-closed è «non procedere», non «rispondi 403».
    if (!user?.role || !(await this.staffPermissions.has(user, required))) {
      throw new ForbiddenException('Permesso non concesso');
    }
    return true;
  }
}
