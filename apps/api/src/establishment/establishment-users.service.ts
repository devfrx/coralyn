import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  CONFIGURABLE_PERMISSIONS,
  Role as ContractRole,
  type CreateStaffUserInput,
  type EstablishmentMemberDTO,
  type Permission,
  type ResetStaffPasswordResponse,
  type StaffPermissionsDTO,
  type UpdateStaffPermissionsInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../crypto/password-hasher';
import { CredentialSetupService } from '../credential/credential-setup.service';
import { StaffPermissionsService } from '../identity/staff-permissions.service';
import { roleHasPermission } from '../identity/permission';

type UserRow = { id: string; email: string; role: string; disabledAt: Date | null };
const MEMBER_SELECT = { id: true, email: true, role: true, disabledAt: true } as const;
const ROLE_RANK: Record<'admin' | 'staff', number> = { admin: 0, staff: 1 };

@Injectable()
export class EstablishmentUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
    private readonly credentials: CredentialSetupService,
    private readonly permissions: StaffPermissionsService,
  ) {}

  private toMember(u: UserRow): EstablishmentMemberDTO {
    return { id: u.id, email: u.email, role: u.role as 'admin' | 'staff', disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null };
  }

  /** Team del lido: admin-first, poi email crescente. Il superuser è già fuori per costruzione
   *  (`establishmentId` null, ADR-0026); il filtro sul ruolo è difesa in profondità e allinea la
   *  query al tipo del DTO. L'ordinamento resta in JS (`localeCompare`) e non in SQL: la collation
   *  di Postgres non ordina come il confronto locale-aware, e questo è l'ordine che la UI mostrava
   *  quando la lista viveva nell'overview. */
  async list(): Promise<EstablishmentMemberDTO[]> {
    const tenantId = this.tenant.require();
    const users = await this.prisma.user.findMany({
      where: { establishmentId: tenantId, role: { in: [Role.admin, Role.staff] } },
      select: MEMBER_SELECT,
    });
    return users
      .map((u) => this.toMember(u))
      .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.email.localeCompare(b.email));
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

  /**
   * Il bersaglio di una configurazione di permessi: **dello stesso lido** e di ruolo `staff`.
   *
   * Il `findFirst` col tenant è lo stesso idioma di `resetPassword` e `setDisabled`: è ciò che
   * rende impossibile all'admin del lido A toccare un operatore del lido B — e, su questa tabella
   * che sta fuori da RLS, è la prima delle due difese (la seconda è la FK composita, ADR-0063).
   */
  private async requireConfigurableTarget(id: string): Promise<{ tenantId: string; targetId: string }> {
    const tenantId = this.tenant.require();
    const target = await this.prisma.user.findFirst({
      where: { id, establishmentId: tenantId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Utente non trovato');
    if (target.role !== Role.staff) {
      // ADR-0063, Decision 2: l'admin non è configurabile. Un admin che si revocasse `team.manage`
      // chiuderebbe il lido fuori dalla gestione dei permessi, senza recupero dentro il tenant.
      throw new UnprocessableEntityException('I permessi si configurano solo per gli operatori staff');
    }
    return { tenantId, targetId: target.id };
  }

  /** I permessi **effettivi** dell'operatore: default di fabbrica corretto dagli override. */
  async permissionsOf(id: string): Promise<StaffPermissionsDTO> {
    const { targetId } = await this.requireConfigurableTarget(id);
    return {
      userId: targetId,
      permissions: await this.permissions.effectiveFor({ id: targetId, role: ContractRole.Staff }),
    };
  }

  /**
   * Sostituisce l'insieme dei permessi configurabili dell'operatore.
   *
   * L'input è l'insieme **completo desiderato**, non un delta: è idempotente e rispecchia lo stato
   * degli interruttori. Il DB però conserva **solo lo scarto** dal default di fabbrica, così un
   * permesso aggiunto in futuro all'enum segue il default invece di nascere negato per chi è già
   * configurato — che è il senso di «`PERMISSION_ROLES` resta il default» (ADR-0057/0063).
   */
  async setPermissions(id: string, input: UpdateStaffPermissionsInput): Promise<StaffPermissionsDTO> {
    const { tenantId, targetId } = await this.requireConfigurableTarget(id);
    const desired = new Set<Permission>(input.permissions);
    const rows = CONFIGURABLE_PERMISSIONS.filter(
      (p) => desired.has(p) !== roleHasPermission(ContractRole.Staff, p),
    ).map((p) => ({ userId: targetId, establishmentId: tenantId, permission: p, granted: desired.has(p) }));

    // Sostituzione atomica: senza la transazione una richiesta concorrente potrebbe leggere lo
    // stato intermedio in cui l'operatore non ha alcun override, cioè i permessi di fabbrica.
    // `createMany` e non un loop di `create`: al più 17 righe, ma è la lezione di ADR-0062.
    await this.prisma.$transaction([
      this.prisma.staffPermissionOverride.deleteMany({ where: { userId: targetId } }),
      this.prisma.staffPermissionOverride.createMany({ data: rows }),
    ]);

    return {
      userId: targetId,
      permissions: await this.permissions.effectiveFor({ id: targetId, role: ContractRole.Staff }),
    };
  }
}
