import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Ruolo } from '@driftly/contracts';

/** Claim applicativi del JWT (oltre a iat/exp standard). */
export interface TokenClaims {
  sub: string; // id dell'utente
  stabilimentoId: string | null; // null = superuser
  ruolo: Ruolo;
}

/** Firma/verifica del JWT di accesso (ADR-0024). */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(claims: TokenClaims): string {
    return this.jwt.sign(claims);
  }

  verify(token: string): TokenClaims {
    const payload = this.jwt.verify<TokenClaims & { iat: number; exp: number }>(token);
    return { sub: payload.sub, stabilimentoId: payload.stabilimentoId, ruolo: payload.ruolo };
  }
}
