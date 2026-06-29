import { JwtService } from '@nestjs/jwt';
import { Ruolo } from '@driftly/contracts';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '8h' } });
  const service = new TokenService(jwt);

  it('firma e riverifica i claim (round-trip)', () => {
    const token = service.sign({ sub: 'u1', stabilimentoId: 's1', ruolo: Ruolo.Admin });
    const claims = service.verify(token);
    expect(claims).toMatchObject({ sub: 'u1', stabilimentoId: 's1', ruolo: 'admin' });
  });

  it('preserva stabilimentoId null (superuser)', () => {
    const token = service.sign({ sub: 'u2', stabilimentoId: null, ruolo: Ruolo.Superuser });
    expect(service.verify(token).stabilimentoId).toBeNull();
  });

  it('rifiuta un token manomesso/non valido', () => {
    expect(() => service.verify('non.un.token')).toThrow();
  });
});
