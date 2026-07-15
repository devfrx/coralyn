import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@coralyn/contracts';

/** Claim applicativi del JWT (oltre a iat/exp standard). */
export interface TokenClaims {
  sub: string; // id dell'utente
  establishmentId: string | null; // null = superuser
  role: Role;
}

/** Firma/verifica del JWT di accesso (ADR-0024). */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(claims: TokenClaims): string {
    return this.jwt.sign(claims);
  }

  verify(token: string): TokenClaims {
    const payload = this.jwt.verify<TokenClaims & { kind?: string; iat: number; exp: number }>(token);
    if (payload.kind === 'customer') {
      // Difesa-in-profondità: staff e cliente condividono JWT_SECRET, quindi un token
      // cliente verifica correttamente la firma. Va rifiutato esplicitamente qui
      // (mirror di CustomerTokenService, che accetta solo kind='customer'). Vedi ADR-0049.
      throw new UnauthorizedException('Token non valido per questo canale');
    }
    return { sub: payload.sub, establishmentId: payload.establishmentId, role: payload.role };
  }
}
