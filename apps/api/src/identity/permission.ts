import { Permission, PERMISSION_ROLES, Role } from '@coralyn/contracts';

/**
 * ⚠️ **`Permission` non è più definito qui**: vive in `@coralyn/contracts` da ADR-0063, perché la
 * schermata di amministrazione deve enumerarlo per renderne gli interruttori e il gating del
 * frontend è su permesso. Il re-export tiene stabile il percorso d'import dei ~25 controller —
 * `import { Permission } from '../identity/permission'` — che parlano di autorizzazione, non di
 * contratti FE/BE.
 *
 * ⚠️ **`PERMISSION_ROLES` ha seguito la stessa strada** (ADR-0064), per la stessa ragione portata
 * fino in fondo: il banco di prova di web-staff la ricopiava a mano, e nulla legava la copia
 * all'originale. Il default di fabbrica è ora definito una volta sola.
 *
 * La tabella riproduce **esattamente** la copertura in vigore prima dell'inversione fail-closed,
 * così l'inversione chiude il buco strutturale senza cambiare cosa un operatore può fare: dove il
 * repo dichiarava `@Roles(Role.Admin)` il permesso è admin-only; dove non dichiarava nulla — e
 * quindi lo staff passava — è admin+staff.
 *
 * ⚠️ Il superuser NON compare nei permessi tenant-scoped: non ha un ruolo dentro il lido
 * (ADR-0039 lo dice già esplicitamente). Prima dell'inversione le rotte non annotate gli davano
 * 400 «tenant assente» invece di 403; era un effetto del default permissivo, non una decisione.
 */
export { Permission, PERMISSION_ROLES };

/** Il ruolo detiene il permesso secondo il default di fabbrica. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_ROLES[permission].includes(role);
}
