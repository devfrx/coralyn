import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@coralyn/contracts';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * `JwtAuthGuard` era l'unico `*.guard.ts` dell'API senza spec (AUD-028). Misurato prima di
 * scrivere questo file: invertendo `if (isPublic) return true` in `if (!isPublic) return true`
 * l'intera API diventa pubblica e **tutti i 330 unit restano verdi**. È l'unica riga del repo che
 * può far passare a tutti la porta d'ingresso.
 *
 * Il guard è globale (ADR-0024): qui il fake del Reflector decide se la rotta è `@Public()`, che è
 * l'unica cosa che il guard chiede al metadata.
 */
function ctx(header: string | undefined, isPublic = false) {
  const req: Record<string, unknown> = { header: (_: string) => header };
  return {
    ctx: {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
    req,
    reflector: { getAllAndOverride: () => isPublic } as unknown as Reflector,
  };
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '8h' } });
  const tokens = new TokenService(jwt);
  const guard = (reflector: Reflector) => new JwtAuthGuard(reflector, tokens);

  it('rotta @Public(): passa senza Authorization', () => {
    const { ctx: c, reflector } = ctx(undefined, true);
    expect(guard(reflector).canActivate(c)).toBe(true);
  });

  it('rotta NON pubblica senza Authorization: 401', () => {
    // Il caso che l'inversione della riga renderebbe verde: la difesa è che l'assenza di token
    // su una rotta non annotata NON deve passare.
    const { ctx: c, reflector } = ctx(undefined, false);
    expect(() => guard(reflector).canActivate(c)).toThrow(UnauthorizedException);
  });

  it('rotta NON pubblica con un token valido: popola req.user e req.tenantId', () => {
    const token = tokens.sign({ sub: 'u-1', establishmentId: 'est-1', role: Role.Admin });
    const { ctx: c, req, reflector } = ctx(`Bearer ${token}`, false);
    expect(guard(reflector).canActivate(c)).toBe(true);
    expect(req.user).toEqual({ id: 'u-1', role: 'admin', establishmentId: 'est-1' });
    expect(req.tenantId).toBe('est-1');
  });

  it('superuser (establishmentId null): req.tenantId è undefined, non null', () => {
    // TenantContext distingue «tenant assente» da «tenant presente»: con `null` il `!this.req.tenantId`
    // funzionerebbe per caso, ma il tipo di TenantRequest dichiara `string | undefined`.
    const token = tokens.sign({ sub: 'su-1', establishmentId: null, role: Role.Superuser });
    const { ctx: c, req, reflector } = ctx(`Bearer ${token}`, false);
    expect(guard(reflector).canActivate(c)).toBe(true);
    expect(req.tenantId).toBeUndefined();
    expect((req.user as { establishmentId: string | null }).establishmentId).toBeNull();
  });

  it('schema non Bearer: 401', () => {
    const token = tokens.sign({ sub: 'u-1', establishmentId: 'est-1', role: Role.Admin });
    const { ctx: c, reflector } = ctx(`Basic ${token}`, false);
    expect(() => guard(reflector).canActivate(c)).toThrow(UnauthorizedException);
  });

  it('Bearer senza token: 401', () => {
    const { ctx: c, reflector } = ctx('Bearer', false);
    expect(() => guard(reflector).canActivate(c)).toThrow(UnauthorizedException);
  });

  it('token manomesso: 401 e req.user resta vuoto', () => {
    const { ctx: c, req, reflector } = ctx('Bearer non.un.token', false);
    expect(() => guard(reflector).canActivate(c)).toThrow(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  it('token del canale CLIENTE su una rotta staff: 401', () => {
    // Staff e cliente condividono JWT_SECRET: la firma di un token cliente verifica correttamente.
    // L'unica separazione è il claim `kind`, che TokenService rifiuta (ADR-0049) e il guard
    // trasforma in 401. Senza, sarebbe escalation cliente → operatore.
    const customerToken = jwt.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    const { ctx: c, reflector } = ctx(`Bearer ${customerToken}`, false);
    expect(() => guard(reflector).canActivate(c)).toThrow(UnauthorizedException);
  });
});
