import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateStaffUserInput, EstablishmentMemberDTO, ResetStaffPasswordResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialSetupService } from '../credential/credential-setup.service';

type UserRow = { id: string; email: string; role: string; disabledAt: Date | null };
const MEMBER_SELECT = { id: true, email: true, role: true, disabledAt: true } as const;

@Injectable()
export class EstablishmentUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
    private readonly credentials: CredentialSetupService,
  ) {}

  private toMember(u: UserRow): EstablishmentMemberDTO {
    return { id: u.id, email: u.email, role: u.role as 'admin' | 'staff', disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null };
  }

  async create(input: CreateStaffUserInput, adminId: string): Promise<EstablishmentMemberDTO> {
    const tenantId = this.tenant.require();
    // Hash INUTILIZZABILE: lo staff imposta la password via link d'invito (ADR-0042); nessuna
    // password in chiaro esiste finché non fa redeem. Speculare a platform-provisioning.create.
    const unusableHash = await this.hasher.hash(randomBytes(32).toString('base64url'));
    let user: UserRow;
    try {
      user = await this.prisma.user.create({
        data: { establishmentId: tenantId, email: input.email, passwordHash: unusableHash, role: input.role },
        select: MEMBER_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    // persist-then-best-effort-send (issueAndSend ha la propria transazione + gestione errori mail).
    await this.credentials.issueAndSend(user.id, input.email, 'invite', adminId);
    return this.toMember(user);
  }

  /** Reset password di un membro del tenant: emette un invito `reset` via email. Tenant-scoped
   *  (il target deve appartenere al lido dell'admin). issueAndSend NON tocca l'hash corrente →
   *  nessun rischio di lockout: il target mantiene la password finché non fa redeem. */
  async resetPassword(id: string, adminId: string): Promise<ResetStaffPasswordResponse> {
    const tenantId = this.tenant.require();
    const target = await this.prisma.user.findFirst({
      where: { id, establishmentId: tenantId },
      select: { id: true, email: true, disabledAt: true },
    });
    if (!target) throw new NotFoundException('Utente non trovato');
    if (target.disabledAt !== null) {
      throw new UnprocessableEntityException('Non puoi resettare la password di un utente disabilitato');
    }
    const { expiresAt } = await this.credentials.issueAndSend(target.id, target.email, 'reset', adminId);
    return { email: target.email, expiresAt: expiresAt.toISOString() };
  }

  async setDisabled(id: string, disabled: boolean, currentUserId: string): Promise<EstablishmentMemberDTO> {
    const tenantId = this.tenant.require();
    const target = await this.prisma.user.findFirst({ where: { id, establishmentId: tenantId }, select: MEMBER_SELECT });
    if (!target) throw new NotFoundException('Utente non trovato');

    if (disabled) {
      if (id === currentUserId) {
        throw new UnprocessableEntityException('Non puoi disabilitare te stesso');
      }
      if (target.role === 'admin' && target.disabledAt === null) {
        // NOTE: count+update non sono in transazione → TOCTOU teorico (due admin che
        // disabilitano due admin diversi in contemporanea potrebbero azzerare gli admin
        // attivi). Accettato allo scale attuale (pochi admin/tenant); recuperabile via
        // superuser/DB. Da irrobustire con la revoca token (D-026) se serve.
        const activeAdmins = await this.prisma.user.count({ where: { establishmentId: tenantId, role: 'admin', disabledAt: null } });
        if (activeAdmins <= 1) {
          throw new UnprocessableEntityException('Deve restare almeno un amministratore attivo');
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { disabledAt: disabled ? new Date() : null },
      select: MEMBER_SELECT,
    });
    return this.toMember(updated);
  }
}
