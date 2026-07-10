import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Claim del JWT cliente (oltre iat/exp). Distinto dal token staff: kind='customer'. */
export interface CustomerTokenClaims {
  sub: string;             // customerId
  establishmentId: string; // tenant (dal token di enrollment)
  kind: 'customer';
}

/** Firma/verifica del JWT d'accesso cliente (D-035 S3). Breve (CUSTOMER_JWT_EXPIRES_IN). */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(claims: CustomerTokenClaims): string {
    return this.jwt.sign(claims);
  }

  verify(token: string): CustomerTokenClaims {
    const p = this.jwt.verify<CustomerTokenClaims & { iat: number; exp: number }>(token);
    if (p.kind !== 'customer') throw new UnauthorizedException('Token non valido');
    return { sub: p.sub, establishmentId: p.establishmentId, kind: 'customer' };
  }
}
