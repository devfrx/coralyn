import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerTokenService } from './customer-token.service';
import { CustomerJwtGuard } from './customer-jwt.guard';

function ctxWith(header?: string) {
  const req: Record<string, unknown> = { header: (_: string) => header };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as unknown as ExecutionContext & { _req: Record<string, unknown> };
}

describe('CustomerJwtGuard', () => {
  const jwt = new JwtService({ secret: 's', signOptions: { expiresIn: '30m' } });
  const tokens = new CustomerTokenService(jwt);
  const guard = new CustomerJwtGuard(tokens);

  it('popola req.customer e req.tenantId da un token cliente valido', () => {
    const token = tokens.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    const ctx = ctxWith(`Bearer ${token}`);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx._req.customer).toEqual({ id: 'cust-1', establishmentId: 'est-1' });
    expect(ctx._req.tenantId).toBe('est-1');
  });

  it('rifiuta header mancante', () => {
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(UnauthorizedException);
  });

  it('rifiuta un token staff (senza kind=customer)', () => {
    const staff = jwt.sign({ sub: 'u1', establishmentId: 'est-1', role: 'admin' });
    expect(() => guard.canActivate(ctxWith(`Bearer ${staff}`))).toThrow(UnauthorizedException);
  });
});
