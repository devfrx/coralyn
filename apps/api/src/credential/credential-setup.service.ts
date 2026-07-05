import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CredentialSetupContext, CredentialTokenPurpose } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { MailerService } from '../mail/mailer.service';
import { generateRawToken, hashToken } from './token-hash';

const INVALID = 'Link non valido o scaduto';

@Injectable()
export class CredentialSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private ttlHours(): number {
    return Number(this.config.get<string>('CREDENTIAL_TOKEN_TTL_HOURS') || '72');
  }

  /** Emette un token (invalidando i precedenti dello stesso utente) e invia l'email. Il raw
   *  non lascia mai il service se non verso il mailer. Ritorna la scadenza per la UI. */
  async issueAndSend(
    userId: string,
    email: string,
    purpose: CredentialTokenPurpose,
    createdByUserId: string,
  ): Promise<{ expiresAt: Date }> {
    const raw = generateRawToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.credentialSetupToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.credentialSetupToken.create({ data: { userId, tokenHash, purpose, expiresAt, createdByUserId } });
    });
    // Contratto: persist-then-best-effort-send. Se l'invio fallisce il token è già persistito;
    // la gestione del fallimento (resend/report) è del chiamante (provisioning/reset).
    await this.mailer.sendCredentialSetup({ to: email, rawToken: raw, purpose, expiresAt });
    return { expiresAt };
  }

  /** Valida un token e ne ritorna il contesto per la pagina. Errore generico se non valido. */
  async getContext(rawToken: string): Promise<CredentialSetupContext> {
    const token = await this.prisma.credentialSetupToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) throw new NotFoundException(INVALID);
    return { email: token.user.email, purpose: token.purpose as CredentialTokenPurpose };
  }

  /** Imposta la password dell'utente e consuma il token (monouso), invalidando i fratelli. */
  async redeem(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.prisma.credentialSetupToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) throw new NotFoundException(INVALID);
    const passwordHash = await this.hasher.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Claim atomico di QUESTO token: la updateMany con id+consumedAt:null è race-safe
      // (row-lock Postgres). Sotto concorrenza, il primo redeem ottiene count=1; il secondo,
      // ri-valutando il predicato dopo il lock, ottiene count=0 → stesso errore generico.
      const claim = await tx.credentialSetupToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (claim.count !== 1) throw new NotFoundException(INVALID);
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      // invalida eventuali altri token vivi dello stesso utente
      await tx.credentialSetupToken.updateMany({ where: { userId: token.userId, consumedAt: null }, data: { consumedAt: new Date() } });
    });
  }
}
