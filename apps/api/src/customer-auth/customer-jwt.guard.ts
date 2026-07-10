import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerTokenService } from './customer-token.service';
import type { CustomerPrincipal } from './customer-principal';

type CustomerRequest = Request & { customer?: CustomerPrincipal; tenantId?: string };

/**
 * Guard di rotta (controller-level) del canale cliente. Le rotte cliente sono @Public() per
 * bypassare la JwtAuthGuard globale (staff); questo guard fa l'auth cliente vera: valida il
 * Bearer JWT (kind='customer') e popola req.customer + req.tenantId (= establishmentId dal
 * token). Così TenantContext/forTenant/RLS restano invariati a valle. Vedi ADR-0049.
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly tokens: CustomerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CustomerRequest>();
    const header = req.header('authorization');
    if (!header) throw new UnauthorizedException('Token mancante');
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Token non valido');
    try {
      const claims = this.tokens.verify(token);
      req.customer = { id: claims.sub, establishmentId: claims.establishmentId };
      req.tenantId = claims.establishmentId;
      return true;
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
  }
}
