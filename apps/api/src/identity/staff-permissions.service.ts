import { Injectable } from '@nestjs/common';
import { Permission, Role } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { roleHasPermission } from './permission';

/** L'identità su cui si valuta un permesso: ciò che `req.user` porta dal token verificato. */
export interface PermissionPrincipal {
  id: string;
  role: Role;
}

/**
 * L'unica risoluzione «questa identità detiene questo permesso?» (ADR-0063).
 *
 * `PERMISSION_ROLES` resta il **default di fabbrica**; sopra ci vanno gli override che l'admin del
 * lido configura per il singolo operatore. Assenza di override = default, quindi un lido che non
 * ha configurato nulla si comporta esattamente come prima della slice.
 *
 * ⚠️ **Legge solo per lo `staff`.** `admin` e `superuser` non sono configurabili (ADR-0063 §2.2),
 * quindi per loro la risposta è la tabella statica e il database non viene toccato: la lettura non
 * è «su ogni richiesta», è «su ogni richiesta di un operatore configurabile».
 *
 * ⚠️ **Un guasto della lettura NON degrada in «concedi», e nemmeno in un 403.** L'eccezione si
 * propaga: fail-closed vuol dire «non procedere», mentre rispondere 403 attribuirebbe all'utente
 * una mancanza che non ha e manderebbe a diagnosticare i permessi invece del database.
 *
 * ⚠️ Provveduto **una volta sola** da `IdentityModule` e da lì esportato. Non ri-provvederlo nei
 * moduli che lo consumano: è l'errore che `crypto.module.ts` ha dovuto correggere per
 * `PasswordHasher`, che cinque moduli istanziavano per conto proprio.
 */
@Injectable()
export class StaffPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Il singolo permesso — ciò che serve al guard. Zero letture se il ruolo non è configurabile. */
  async has(user: PermissionPrincipal, permission: Permission): Promise<boolean> {
    if (user.role !== Role.Staff) return roleHasPermission(user.role, permission);
    const overrides = await this.overridesOf(user.id);
    // `??` e non `||`: un override a `false` è una revoca esplicita e deve vincere sul default,
    // mentre `||` la scambierebbe per «assente» e riconcederebbe il permesso.
    // ⚠️ Provato per mutazione (ADR-0063): togliere questa consultazione fa cadere 4 test in 2
    // suite; togliere la guardia sul ruolo qui sopra ne fa cadere 3.
    return overrides.get(permission) ?? roleHasPermission(user.role, permission);
  }

  /** L'insieme effettivo — per `UserDTO` e per la schermata di amministrazione. */
  async effectiveFor(user: PermissionPrincipal): Promise<Permission[]> {
    const overrides =
      user.role === Role.Staff ? await this.overridesOf(user.id) : new Map<string, boolean>();
    return Object.values(Permission).filter(
      (p) => overrides.get(p) ?? roleHasPermission(user.role, p),
    );
  }

  /**
   * Tutti gli override dell'operatore in **un** round trip. Sono al più 17 righe (i permessi
   * configurabili), quindi non c'è paginazione da fare: leggerli uno per uno sarebbe la stessa
   * classe di difetto che ADR-0062 ha appena chiuso sul generatore di ombrelloni.
   */
  private async overridesOf(userId: string): Promise<Map<string, boolean>> {
    const rows = await this.prisma.staffPermissionOverride.findMany({
      where: { userId },
      select: { permission: true, granted: true },
    });
    return new Map(rows.map((r) => [r.permission, r.granted]));
  }
}
