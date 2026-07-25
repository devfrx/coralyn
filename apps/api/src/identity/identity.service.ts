import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../crypto/password-hasher';
import { TokenService } from './token.service';
import { LoginInput, LoginResponse, Role, UserDTO } from '@coralyn/contracts';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /** Proietta una riga User (con establishment incluso) nel DTO condiviso (mai passwordHash). */
  private toDTO(u: User & { establishment: { name: string } | null }): UserDTO {
    // I valori dell'enum Role del DB coincidono con quelli dei contracts.
    return {
      id: u.id,
      email: u.email,
      role: u.role as Role,
      establishmentId: u.establishmentId,
      establishmentName: u.establishment?.name ?? null,
    };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    // Lookup fuori da forTenant: User non ha RLS (login pre-tenant). ADR-0026.
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { establishment: { select: { name: true, suspendedAt: true } } },
    });
    if (!user) {
      // Verifica civetta: senza, argon2 girerebbe solo per le email esistenti e il tempo di
      // risposta direbbe all'esterno quali indirizzi sono registrati (D-029). Il ramo costa
      // quanto quello della password errata, ed è per questo che c'è. Il rate-limit sul login
      // (D-027) impedisce che questo costo diventi a sua volta un vettore di esaurimento CPU.
      await this.hasher.verifyDecoy(input.password);
      throw new UnauthorizedException('Credenziali non valide');
    }
    if (!(await this.hasher.verify(user.passwordHash, input.password))) {
      // 401 generico identico: niente user-enumeration.
      throw new UnauthorizedException('Credenziali non valide');
    }
    if (user.disabledAt) {
      // Utente disabilitato (soft-disable, D-025): stesso 401 generico, nessuna enumerazione.
      // La revoca immediata di un token già emesso resta a D-026 (il token scade a 8h).
      throw new UnauthorizedException('Credenziali non valide');
    }
    // Sospensione a livello tenant, dalla stessa query (nessun round-trip extra).
    // Superuser (establishmentId null) → establishment null → nessun controllo (invariato).
    if (user.establishment?.suspendedAt) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    const dto = this.toDTO(user);
    const accessToken = this.tokens.sign({
      sub: dto.id,
      establishmentId: dto.establishmentId,
      role: dto.role,
    });
    return { accessToken, user: dto };
  }

  async me(userId: string): Promise<UserDTO> {
    // Solo `name`: la sospensione NON viene ri-controllata qui di proposito. È verificata al login;
    // la revoca a sessione in corso (token già emesso) è rinviata a D-026, non compito di /me.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { establishment: { select: { name: true } } },
    });
    if (!user) throw new UnauthorizedException('Sessione non valida');
    return this.toDTO(user);
  }
}
