/**
 * Aritmetica di intervallo del carve su BookingCoverage (D-013/D-035, ADR-0046).
 *
 * Scavare un buco nell'occupazione e' l'operazione che sospensione, assenza comunicata e disdetta
 * hanno in comune. Era scritta quattro volte a mano e le copie erano DIVERGENTI: `releaseAbsence`
 * e `terminate` decidevano testa e coda rispetto al FRAMMENTO, `suspend` rispetto allo SPAN DI
 * CONTRATTO — che su coverage frammentata sono cose diverse, e la coda usciva invertita
 * (P1-001/AUD-007). Qui c'e' una sola implementazione, pura e testabile: i chiamanti conservano
 * solo le proprie guardie di dominio e la persistenza.
 */

/** Intervallo di date a estremi INCLUSI, come le colonne @db.Date di BookingCoverage. */
export interface DateSpan {
  startDate: Date;
  endDate: Date;
}

/** Cosa resta di un frammento: 0 span (sparisce), 1 (troncato), 2 (spezzato in due). */
export interface CarveResult<T extends DateSpan> {
  fragment: T;
  remaining: DateSpan[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sottrae l'intervallo `[from, to]` (estremi inclusi; `to === null` = aperto a destra, "da from in
 * poi") dai frammenti dati, RELATIVAMENTE A CIASCUN FRAMMENTO.
 *
 * Restituisce una voce per ogni frammento che interseca l'intervallo — gli altri non vanno toccati.
 * Testa e coda nascono solo da disuguaglianze STRETTE (`fragment.startDate < from`,
 * `to < fragment.endDate`): e' questa la ragione per cui non puo' produrre span vuoti o invertiti,
 * qualunque sia la frammentazione in ingresso.
 *
 * Le date sono mezzanotte UTC (`toDbDate`), quindi l'aritmetica a giorni interi e' esatta.
 */
export function carveInterval<T extends DateSpan>(
  fragments: readonly T[],
  from: Date,
  to: Date | null,
): CarveResult<T>[] {
  const out: CarveResult<T>[] = [];
  for (const fragment of fragments) {
    if (fragment.endDate.getTime() < from.getTime()) continue; // interamente prima del buco
    if (to !== null && to.getTime() < fragment.startDate.getTime()) continue; // interamente dopo

    const remaining: DateSpan[] = [];
    if (fragment.startDate.getTime() < from.getTime()) {
      remaining.push({ startDate: fragment.startDate, endDate: new Date(from.getTime() - DAY_MS) });
    }
    if (to !== null && to.getTime() < fragment.endDate.getTime()) {
      remaining.push({ startDate: new Date(to.getTime() + DAY_MS), endDate: fragment.endDate });
    }
    out.push({ fragment, remaining });
  }
  return out;
}
