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
});
