/** Intervallo di `logicalOrder` da traslare di uno, estremi INCLUSI, dentro una sola fila. */
export interface OrderShift {
  fromOrder: number;
  toOrder: number;
  /** +1 libera la posizione d'arrivo, -1 chiude il buco lasciato dall'ombrellone che avanza. */
  delta: 1 | -1;
}

export type UmbrellaMovePlan =
  | { ok: false; reason: 'OUT_OF_RANGE' }
  /** `write: null` = no-op CALCOLATO: la posizione richiesta è già quella corrente, non si scrive. */
  | { ok: true; write: { shift: OrderShift | null; targetOrder: number } | null };

export interface UmbrellaMoveParams {
  /**
   * `logicalOrder` degli ombrelloni della fila di destinazione, crescente, **escluso quello che si
   * sta spostando**. Precondizione del chiamante: la query ordina per `logicalOrder asc`.
   */
  destOrders: number[];
  /** Indice 0-based **finale** dell'ombrellone nella fila di destinazione. `destOrders.length` = in coda. */
  position: number;
  /** `logicalOrder` attuale se l'ombrellone è già in quella fila; `null` se arriva da un'altra. */
  currentOrder: number | null;
}

/**
 * Traduce «porta l'ombrellone all'indice `position`» in DUE scritture al massimo: una traslazione
 * di intervallo (`updateMany` con `increment`/`decrement`) e un `update` sul solo ombrellone
 * spostato. Il costo è costante nel numero di ombrelloni della fila, e non è un vezzo: `forTenant`
 * non passa `transactionOptions`, quindi N round-trip ricadrebbero nel timeout di default di
 * Prisma — è lo stesso P2028 che costrinse a riscrivere `generate` in una sola insert (ADR-0062).
 *
 * Gli ordini sono densi alla creazione (`nextLogicalOrder` assegna max+1), quindi «assegna un
 * valore in mezzo» non è praticabile: fra due vicini non c'è un intero libero. Dopo uno
 * spostamento fra file restano invece dei buchi nella fila d'origine, e va bene: non esiste alcun
 * indice unico su `logicalOrder`, e nessun consumatore legge il valore assoluto — le tre
 * proiezioni lo scartano e ordinano soltanto.
 *
 * `shift` è sempre confinato alla fila di DESTINAZIONE. La fila d'origine non viene compattata:
 * resta un buco, deliberatamente — chiuderlo sarebbe una terza scrittura per riallineare un valore
 * che nessun consumatore legge.
 */
export function planUmbrellaMove({ destOrders, position, currentOrder }: UmbrellaMoveParams): UmbrellaMovePlan {
  const n = destOrders.length;
  if (!Number.isInteger(position) || position < 0 || position > n) return { ok: false, reason: 'OUT_OF_RANGE' };

  if (currentOrder === null) {
    // Fila diversa: gli altri sono tutti "altri", e l'indice finale coincide con l'indice d'inserimento.
    if (position === n) return { ok: true, write: { shift: null, targetOrder: (n > 0 ? destOrders[n - 1] : 0) + 1 } };
    const target = destOrders[position];
    return { ok: true, write: { shift: { fromOrder: target, toOrder: destOrders[n - 1], delta: 1 }, targetOrder: target } };
  }

  // Stessa fila: `index` è la posizione che l'ombrellone occupa oggi fra gli altri.
  const index = destOrders.filter((o) => o < currentOrder).length;
  if (position === index) return { ok: true, write: null };

  if (position > index) {
    // In avanti: gli scavalcati arretrano di uno e liberano l'estremo alto dell'intervallo.
    const target = destOrders[position - 1];
    return { ok: true, write: { shift: { fromOrder: destOrders[index], toOrder: target, delta: -1 }, targetOrder: target } };
  }
  // Indietro: gli scavalcati avanzano di uno e liberano l'estremo basso.
  const target = destOrders[position];
  return { ok: true, write: { shift: { fromOrder: target, toOrder: destOrders[index - 1], delta: 1 }, targetOrder: target } };
}
