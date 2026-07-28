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
 * ⚠️ **Se nessuna destinazione è accessibile si va allo stato terminale dichiarato**
 * (`NO_ACCESS_PATH`), non si lascia passare.
 *
 * Qui prima si restituiva `true`, motivato con «meglio una vista che mostra il proprio errore di
 * un router che gira a vuoto». Quella premessa **è stata resa falsa da ADR-0064**: da quando ogni
 * query dichiara il permesso del suo endpoint, la query primaria della vista di atterraggio non
 * parte affatto, quindi non c'è né errore né caricamento — la Mappa rendeva mare, battigia e
 * ZERO ombrelloni, in silenzio, subito dopo il login. Lo stato terminale va **detto**, e va detto
 * in un punto solo invece che in dodici viste.
 *
 * ⚠️ `NO_ACCESS_PATH` non dichiara un permesso, quindi rientra dal ramo qui sopra e non può
 * rimbalzare su se stessa.
 */
export const NO_ACCESS_PATH = '/nessun-accesso';

export function resolvePermissionGuard(
  session: PermissionGuardSession,
  to: PermissionGuardTarget,
): true | { path: string } {
  if (!to.permission || session.hasPermission(to.permission)) return true;
  // ⚠️ Provato per mutazione (ADR-0063): sostituire questa ricerca con la rotta fissa `/map` del
  // predecessore fa cadere 4 test, fra cui quello sul redirect infinito.
  const fallback = FALLBACK_NAV.find((item) => session.hasPermission(item.permission));
  if (!fallback) return to.path === NO_ACCESS_PATH ? true : { path: NO_ACCESS_PATH };
  // Il ripiego coincide con la destinazione: l'operatore HA il permesso di questa sezione, ne
  // manca un altro che la rotta dichiara. Si lascia passare — la vista ha i suoi dati.
  if (fallback.to === to.path) return true;
  return { path: fallback.to };
}
