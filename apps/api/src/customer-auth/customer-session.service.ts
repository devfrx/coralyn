import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CustomerActivateInput,
  CustomerAuthResponse,
  CustomerRefreshInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { generateRawToken, hashToken } from '../credential/token-hash';
import { CustomerTokenService } from './customer-token.service';

/** Messaggio unico per ogni fallimento auth: no enumeration (D-029). */
const INVALID = 'Credenziali non valide';

/** Sessione self-service del cliente (D-035 S3): attivazione one-time+PIN, refresh rotante. */
@Injectable()
export class CustomerSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: CustomerTokenService,
    private readonly config: ConfigService,
  ) {}

  private refreshTtlMs(): number {
    return Number(this.config.get<string>('CUSTOMER_REFRESH_TTL_DAYS') || '120') * 86_400_000;
  }

  private maxPinAttempts(): number {
    return Number(this.config.get<string>('CUSTOMER_PIN_MAX_ATTEMPTS') || '5');
  }

  /** Attivazione one-time + PIN. Consuma l'enrollment, crea la sessione device-bound, emette
   *  access JWT + refresh. Ogni fallimento = 401 generico (no enumeration, D-029). */
  async activate(input: CustomerActivateInput): Promise<CustomerAuthResponse> {
    const token = await this.prisma.customerEnrollmentToken.findUnique({
      where: { tokenHash: hashToken(input.enrollmentToken) },
    });
    if (!token || token.revokedAt || token.activatedAt || token.expiresAt <= new Date()) {
      throw new UnauthorizedException(INVALID);
    }

    const pinOk = await this.hasher.verify(token.pinHash, input.pin);
    if (!pinOk) {
      const attempts = token.pinAttempts + 1;
      const lock = attempts >= this.maxPinAttempts();
      await this.prisma.customerEnrollmentToken.update({
        where: { id: token.id },
        data: { pinAttempts: attempts, revokedAt: lock ? new Date() : null },
      });
      throw new UnauthorizedException(INVALID);
    }

    const refreshRaw = generateRawToken();
    return this.prisma.$transaction(async (tx) => {
      // Claim atomico del one-time: la updateMany con activatedAt:null è race-safe (row-lock).
      const claim = await tx.customerEnrollmentToken.updateMany({
        where: { id: token.id, activatedAt: null, revokedAt: null },
        data: { activatedAt: new Date() },
      });
      if (claim.count !== 1) throw new UnauthorizedException(INVALID);
      await tx.customerSession.create({
        data: {
          customerId: token.customerId,
          establishmentId: token.establishmentId,
          enrollmentTokenId: token.id,
          refreshTokenHash: hashToken(refreshRaw),
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      });
      const accessToken = this.tokens.sign({
        sub: token.customerId,
        establishmentId: token.establishmentId,
        kind: 'customer',
      });
      return { accessToken, refreshToken: refreshRaw };
    });
  }

  /** Rotazione del refresh (D-026). Theft-detection: se il refresh presentato risulta GIÀ ruotato
   *  (revokedAt!=null ma ancora presente), è un riuso sospetto → revoca l'intera catena della
   *  sessione (enrollmentTokenId) e 401. */
  async refresh(input: CustomerRefreshInput): Promise<CustomerAuthResponse> {
    const presentedHash = hashToken(input.refreshToken);
    const session = await this.prisma.customerSession.findUnique({
      where: { refreshTokenHash: presentedHash },
    });
    if (!session) throw new UnauthorizedException(INVALID);

    // Riuso di un refresh già ruotato/revocato → furto: brucia tutta la catena della sessione.
    if (session.revokedAt) {
      await this.prisma.customerSession.updateMany({
        where: { enrollmentTokenId: session.enrollmentTokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(INVALID);
    }
    if (session.expiresAt <= new Date()) throw new UnauthorizedException(INVALID);

    const refreshRaw = generateRawToken();
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.customerSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (claim.count !== 1) throw new UnauthorizedException(INVALID);
      await tx.customerSession.create({
        data: {
          customerId: session.customerId,
          establishmentId: session.establishmentId,
          enrollmentTokenId: session.enrollmentTokenId,
          refreshTokenHash: hashToken(refreshRaw),
          rotatedFromId: session.id,
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      });
      const accessToken = this.tokens.sign({
        sub: session.customerId,
        establishmentId: session.establishmentId,
        kind: 'customer',
      });
      return { accessToken, refreshToken: refreshRaw };
    });
  }
}
