import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Utente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';
import { LoginInput, LoginResponse, Ruolo, UtenteDTO } from '@coralyn/contracts';

@Injectable()
export class IdentitaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /** Proietta una riga Utente nel DTO condiviso (mai passwordHash). */
  private toDTO(u: Utente): UtenteDTO {
    // I valori dell'enum Ruolo del DB coincidono con quelli dei contracts.
    return { id: u.id, email: u.email, ruolo: u.ruolo as Ruolo, stabilimentoId: u.stabilimentoId };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    // Nota sicurezza: hasher.verify viene eseguito solo se l'utente esiste, quindi
    // i tempi di risposta possono distinguere un'email registrata da una no (oracolo
    // di timing → enumerazione). Mitigazione (verify a tempo costante + rate-limiting)
    // rinviata e tracciata: vedi deferred D-029 e D-027.
    // Lookup fuori da forTenant: Utente non ha RLS (login pre-tenant). ADR-0026.
    const utente = await this.prisma.utente.findUnique({ where: { email: input.email } });
    if (!utente || !(await this.hasher.verify(utente.passwordHash, input.password))) {
      // 401 generico identico: niente user-enumeration.
      throw new UnauthorizedException('Credenziali non valide');
    }
    const dto = this.toDTO(utente);
    const accessToken = this.tokens.sign({
      sub: dto.id,
      stabilimentoId: dto.stabilimentoId,
      ruolo: dto.ruolo,
    });
    return { accessToken, utente: dto };
  }

  async me(userId: string): Promise<UtenteDTO> {
    const utente = await this.prisma.utente.findUnique({ where: { id: userId } });
    if (!utente) throw new UnauthorizedException('Sessione non valida');
    return this.toDTO(utente);
  }
}
