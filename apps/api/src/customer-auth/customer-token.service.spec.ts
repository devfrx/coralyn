import { JwtService } from '@nestjs/jwt';
import { CustomerTokenService } from './customer-token.service';

describe('CustomerTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '30m' } });
  const service = new CustomerTokenService(jwt);

  it('firma e verifica un token cliente con kind=customer', () => {
    const token = service.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    expect(service.verify(token)).toEqual({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
  });

  it('rifiuta un token privo di kind=customer (es. token staff)', () => {
    const staffish = jwt.sign({ sub: 'u1', establishmentId: 'est-1', role: 'admin' });
    expect(() => service.verify(staffish)).toThrow();
  });
});
