import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from './token.service';
import type { AuthUser } from './auth-user';

type AuthedRequest = Request & { user?: AuthUser; tenantId?: string };

/**
 * Guard globale: lascia passare le rotte @Public(); altrimenti valida il Bearer
 * JWT e popola req.user + req.tenantId (= stabilimentoId del token). Sostituisce
 * il TenantMiddleware del Plan 1. Vedi ADR-0024.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization');
    if (!header) {
      throw new UnauthorizedException('Token mancante');
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Token non valido');
    }

    try {
      const claims = this.tokens.verify(token);
      req.user = { id: claims.sub, role: claims.role, establishmentId: claims.establishmentId };
      // null → undefined: TenantContext distingue "tenant assente" da presente.
      req.tenantId = claims.establishmentId ?? undefined;
      return true;
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
  }
}
