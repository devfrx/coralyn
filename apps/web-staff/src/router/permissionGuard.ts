import type { Permission } from '@coralyn/contracts';
import { FALLBACK_NAV } from '@/app/navigation';

/** Ciò che la guardia ha bisogno di sapere della sessione. Niente Pinia: è una funzione pura. */
export interface PermissionGuardSession {
  hasPermission(p: Permission): boolean;
}

/** La rotta di destinazione, ridotta a ciò che la guardia guarda. */
export interface PermissionGuardTarget {
  path: string;
  permission?: Permission;
}

/**
 * Decide se una navigazione può proseguire, e dove dirottarla altrimenti (ADR-0063).
 *
 * `true` = prosegui. `{ path }` = dirotta lì.
 *
 * ⚠️ **Il ripiego non può essere una rotta fissa.** Il predecessore rimandava sempre a `map`, e
 * con `map.read` diventato configurabile sarebbe un **redirect infinito**: la guardia rimbalzerebbe
 * su `map`, ritroverebbe il permesso mancante e rimbalzerebbe di nuovo. Si cerca invece la prima
 * destinazione che l'operatore può davvero aprire, nello stesso ordine della sidebar.
 *
 * ⚠️ **Se nessuna destinazione è accessibile si lascia passare.** Non è un varco: la protezione è
 * il 403 del backend, e la UI che nasconde non è la UI che protegge. È l'unico stato terminale
 * possibile — meglio una vista che mostra il proprio errore di un router che gira a vuoto.
 */
export function resolvePermissionGuard(
  session: PermissionGuardSession,
  to: PermissionGuardTarget,
): true | { path: string } {
  if (!to.permission || session.hasPermission(to.permission)) return true;
  // ⚠️ Provato per mutazione (ADR-0063): sostituire questa ricerca con la rotta fissa `/map` del
  // predecessore fa cadere 4 test, fra cui quello sul redirect infinito.
  const fallback = FALLBACK_NAV.find((item) => session.hasPermission(item.permission));
  if (!fallback || fallback.to === to.path) return true;
  return { path: fallback.to };
}
