import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@coralyn/contracts';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '8h' } });
  const service = new TokenService(jwt);

  it('firma e riverifica i claim (round-trip)', () => {
    const token = service.sign({ sub: 'u1', establishmentId: 's1', role: Role.Admin });
    const claims = service.verify(token);
    expect(claims).toMatchObject({ sub: 'u1', establishmentId: 's1', role: 'admin' });
  });

  it('preserva establishmentId null (superuser)', () => {
    const token = service.sign({ sub: 'u2', establishmentId: null, role: Role.Superuser });
    expect(service.verify(token).establishmentId).toBeNull();
  });

  it('rifiuta un token manomesso/non valido', () => {
    expect(() => service.verify('non.un.token')).toThrow();
  });

  it('rifiuta un token del canale CLIENTE (kind=customer) benché la firma sia valida', () => {
    // Difesa cross-canale (P6-010): staff e cliente condividono JWT_SECRET, quindi questo token
    // supera la verifica della firma. L'unica separazione è il claim `kind`, e finora esisteva
    // solo lo spec nella direzione innocua (staff rifiutato dal guard cliente).
    // Misurato: cancellando le tre righe di token.service.ts tutti i 330 unit restavano verdi,
    // mentre la conseguenza è escalation cliente → operatore.
    const customerToken = jwt.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    expect(() => service.verify(customerToken)).toThrow(UnauthorizedException);
  });

  it('accetta un token senza claim `kind` (staff): il rifiuto è mirato, non un catch-all', () => {
    // L'altro verso: se il guard rifiutasse tutto ciò che non è kind='staff', i token già emessi
    // — che il claim non ce l'hanno — smetterebbero di funzionare al deploy.
    const staffToken = jwt.sign({ sub: 'u1', establishmentId: 'est-1', role: 'admin' });
    expect(service.verify(staffToken)).toMatchObject({ sub: 'u1', role: 'admin' });
  });
});
