import { Permission, Role } from '@coralyn/contracts';

/**
 * ⚠️ **`Permission` non è più definito qui**: vive in `@coralyn/contracts` da ADR-0063, perché la
 * schermata di amministrazione deve enumerarlo per renderne gli interruttori e il gating del
 * frontend è su permesso. Il re-export tiene stabile il percorso d'import dei ~25 controller —
 * `import { Permission } from '../identity/permission'` — che parlano di autorizzazione, non di
 * contratti FE/BE.
 */
export { Permission };

/**
 * Quali ruoli detengono ciascun permesso **per difetto di fabbrica**.
 *
 * Tabella statica e volutamente banale: riproduce **esattamente** la copertura in vigore prima
 * dell'inversione fail-closed, così l'inversione chiude il buco strutturale senza cambiare cosa
 * un operatore può fare. Dove il repo dichiarava `@Roles(Role.Admin)` il permesso è admin-only;
 * dove non dichiarava nulla — e quindi lo staff passava — il permesso è admin+staff.
 *
 * ⚠️ Il superuser NON compare nei permessi tenant-scoped: non ha un ruolo dentro il lido
 * (ADR-0039 lo dice già esplicitamente). Prima dell'inversione le rotte non annotate gli davano
 * 400 «tenant assente» invece di 403; era un effetto del default permissivo, non una decisione.
 *
 * ⚠️ **Da ADR-0063 questa tabella è il default, non la risposta.** Per lo `staff` la risposta la
 * dà `StaffPermissionsService`, che applica sopra gli override configurati dall'admin del lido.
 * La tabella resta ciò che vale per un lido che non ha configurato nulla — e per ogni permesso
 * aggiunto in futuro all'enum, che eredita il default invece di nascere negato.
 */
export const PERMISSION_ROLES: Readonly<Record<Permission, readonly Role[]>> = {
  [Permission.MapRead]: [Role.Admin, Role.Staff],
  [Permission.BookingsManage]: [Role.Admin, Role.Staff],
  [Permission.BookingsAdminister]: [Role.Admin],
  [Permission.CustomersManage]: [Role.Admin, Role.Staff],
  [Permission.CustomersErase]: [Role.Admin],
  [Permission.CustomerAccessManage]: [Role.Admin],
  [Permission.RentalsOperate]: [Role.Admin, Role.Staff],
  [Permission.RentalCatalogManage]: [Role.Admin, Role.Staff],
  [Permission.PricingManage]: [Role.Admin, Role.Staff],
  [Permission.RenewalsManage]: [Role.Admin, Role.Staff],
  [Permission.ReportsRead]: [Role.Admin, Role.Staff],
  [Permission.EstablishmentRead]: [Role.Admin, Role.Staff],
  [Permission.EstablishmentManage]: [Role.Admin],
  [Permission.LegalProfileManage]: [Role.Admin],
  [Permission.StructureRead]: [Role.Admin, Role.Staff],
  [Permission.StructureManage]: [Role.Admin],
  [Permission.TeamManage]: [Role.Admin],
  [Permission.PlatformAdminister]: [Role.Superuser],
  [Permission.SessionRead]: [Role.Admin, Role.Staff, Role.Superuser],
};

/** Il ruolo detiene il permesso secondo il default di fabbrica. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_ROLES[permission].includes(role);
}
